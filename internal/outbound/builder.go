package outbound

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/sagernet/sing-box/adapter"
	"github.com/sagernet/sing-box/adapter/endpoint"
	"github.com/sagernet/sing-box/adapter/inbound"
	sbOutbound "github.com/sagernet/sing-box/adapter/outbound"
	C "github.com/sagernet/sing-box/constant"
	"github.com/sagernet/sing-box/dns"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/log"
	"github.com/sagernet/sing-box/option"
	"github.com/sagernet/sing-box/route"
	"github.com/sagernet/sing/common"
	"github.com/sagernet/sing/common/json/badjson"
	sJson "github.com/sagernet/sing/common/json"
	"github.com/sagernet/sing/service"
	"github.com/sagernet/sing/service/pause"
)

// OutboundBuilder creates outbound instances from raw node options.
type OutboundBuilder interface {
	Build(rawOptions json.RawMessage) (adapter.Outbound, error)
}

// SingboxBuilderConfig configures SingboxBuilder construction.
type SingboxBuilderConfig struct {
	// DNSUpstreams configures Resin's node DNS chain.
	// Values are DNS upstream URI strings and the slice must not be empty.
	DNSUpstreams []string
}

// ---------------------------------------------------------------------------
// SingboxBuilder — creates real sing-box adapter.Outbound instances.
// ---------------------------------------------------------------------------

// SingboxBuilder builds real sing-box outbound instances from raw JSON options.
// It holds a fully-wired context with DNS services so that domain-based
// outbound servers can be resolved.
type SingboxBuilder struct {
	registry            *sbOutbound.Registry
	ctx                 context.Context
	logFactory          log.Factory
	networkManager      *route.NetworkManager
	endpointManager     *endpoint.Manager
	dnsTransportManager *dns.TransportManager
	dnsRouter           *dns.Router
}

// NewSingboxBuilderWithConfig creates a SingboxBuilder with a complete
// sing-box service graph (registries + DNS). The caller must call Close()
// when done.
func NewSingboxBuilderWithConfig(cfg SingboxBuilderConfig) (*SingboxBuilder, error) {
	ctx := context.Background()
	ctx = include.Context(ctx) // inject protocol registries
	// 注入 pause.Manager。sing-box 在 box.New 里会调 pause.WithDefaultManager，
	// Resin 直接构造 service graph 跳过了 box.New，因此 v1.13 的 NetworkManager
	// 启动期间，InterfaceMonitor 的回调 (notifyInterfaceUpdate) 调到
	// r.pauseManager.NetworkPause() 会 nil panic。这里挂一个默认 manager 即满足。
	ctx = pause.WithDefaultManager(ctx)

	logFactory := log.NewNOPFactory()
	logger := logFactory.NewLogger("resin-outbound")

	dnsRegistry, ok := service.FromContext[adapter.DNSTransportRegistry](ctx).(*dns.TransportRegistry)
	if !ok {
		return nil, fmt.Errorf("singbox builder: unexpected DNS transport registry type %T", service.FromContext[adapter.DNSTransportRegistry](ctx))
	}
	registerSecureDNSTransport(dnsRegistry)

	// --- Service graph (same order as Demos/simple-proxy/main.go) -----------

	// Endpoint Manager
	endpointMgr := endpoint.NewManager(logger, service.FromContext[adapter.EndpointRegistry](ctx))
	service.MustRegister[adapter.EndpointManager](ctx, endpointMgr)

	// Inbound Manager (required dependency even though unused)
	inboundMgr := inbound.NewManager(logger, service.FromContext[adapter.InboundRegistry](ctx), endpointMgr)
	service.MustRegister[adapter.InboundManager](ctx, inboundMgr)

	// Outbound Manager (sing-box's own manager, for detour resolution)
	outboundMgr := sbOutbound.NewManager(logger, service.FromContext[adapter.OutboundRegistry](ctx), endpointMgr, "")
	service.MustRegister[adapter.OutboundManager](ctx, outboundMgr)

	// Network Manager. sing-box v1.13.x 的 dns/transport/local 在 systemd-resolved
	// 运行环境下，会调 service.FromContext[adapter.NetworkManager](ctx).InterfaceMonitor()。
	// v1.12.x 时代这条路径不触发；v1.13.x 起 local transport Start 改为强制探测
	// systemd-resolved，未注册 NetworkManager 会在带 resolver 的 runner 上 nil panic。
	// 注册一个 AutoDetectInterface=true 的最小 NetworkManager 即可让 InterfaceMonitor()
	// 返回有效实例，令 local transport 安全走 dbus 路径（开不了就吞错降级，不 panic）。
	networkMgr, err := route.NewNetworkManager(ctx, logger, option.RouteOptions{
		AutoDetectInterface: true,
	}, option.DNSOptions{})
	if err != nil {
		return nil, fmt.Errorf("singbox builder: create network manager: %w", err)
	}
	service.MustRegister[adapter.NetworkManager](ctx, networkMgr)
	// NetworkManager 的 Start 必须先于 dns transport manager 的 Start，
	// 否则 local transport StartStateInitialize 仍可能拿到未启动的 monitor。
	if err := networkMgr.Start(adapter.StartStateInitialize); err != nil {
		return nil, fmt.Errorf("singbox builder: initialize network manager: %w", err)
	}
	if err := networkMgr.Start(adapter.StartStateStart); err != nil {
		_ = networkMgr.Close()
		return nil, fmt.Errorf("singbox builder: start network manager: %w", err)
	}

	// DNS Transport Manager
	dnsTransportMgr := dns.NewTransportManager(logger, service.FromContext[adapter.DNSTransportRegistry](ctx), outboundMgr, secureDNSFailoverTransportTag)
	service.MustRegister[adapter.DNSTransportManager](ctx, dnsTransportMgr)

	// DNS Router
	dnsRouter := dns.NewRouter(ctx, logFactory, option.DNSOptions{})
	service.MustRegister[adapter.DNSRouter](ctx, dnsRouter)

	dnsTransportSpecs, err := secureDNSTransportSpecsForUpstreams(cfg.DNSUpstreams)
	if err != nil {
		return nil, fmt.Errorf("singbox builder: configure DNS transports: %w", err)
	}
	for _, spec := range dnsTransportSpecs {
		if err := dnsTransportMgr.Create(ctx, logger, spec.tag, spec.transportType, spec.options); err != nil {
			return nil, fmt.Errorf("singbox builder: create DNS transport %s[%s]: %w", spec.transportType, spec.tag, err)
		}
	}

	// Start DNS Transport Manager lifecycle
	if err := dnsTransportMgr.Start(adapter.StartStateInitialize); err != nil {
		return nil, fmt.Errorf("singbox builder: initialize DNS transport manager: %w", err)
	}
	if err := dnsTransportMgr.Start(adapter.StartStateStart); err != nil {
		_ = dnsTransportMgr.Close()
		return nil, fmt.Errorf("singbox builder: start DNS transport manager: %w", err)
	}

	// Start DNS Router lifecycle
	if err := dnsRouter.Initialize(nil); err != nil {
		_ = dnsTransportMgr.Close()
		return nil, fmt.Errorf("singbox builder: initialize DNS router: %w", err)
	}
	if err := dnsRouter.Start(adapter.StartStateStart); err != nil {
		_ = dnsRouter.Close()
		_ = dnsTransportMgr.Close()
		return nil, fmt.Errorf("singbox builder: start DNS router: %w", err)
	}

	registry := service.FromContext[adapter.OutboundRegistry](ctx).(*sbOutbound.Registry)

	return &SingboxBuilder{
		registry:            registry,
		ctx:                 ctx,
		logFactory:          logFactory,
		networkManager:      networkMgr,
		endpointManager:      endpointMgr,
		dnsTransportManager: dnsTransportMgr,
		dnsRouter:           dnsRouter,
	}, nil
}

// Build parses rawOptions (a complete sing-box outbound JSON object with
// type/tag fields) into a real adapter.Outbound and runs it through the
// lifecycle stages.
func (b *SingboxBuilder) Build(rawOptions json.RawMessage) (adapter.Outbound, error) {
	// sing-box v1.13 移除了 wireguard 的 outbound 注册，统一改成 endpoint 类型
	// (option.WireGuardEndpointOptions)。旧 outbound JSON 在 v1.13 走 option.Outbound
	// 解析会立即报 "unknown outbound type: wireguard"，所以必须先 peek 顶层 type，
	// 在进 option.Outbound 解析之前就把 wireguard 改走到 EndpointManager 路径。
	// 下面的 buildWireGuardEndpoint 复刻 option.Outbound.UnmarshalJSONContext 的
	// dispatch，但走 adapter.EndpointRegistry 而非 OutboundOptionsRegistry。
	type outboundHeader struct {
		Type string `json:"type"`
	}
	var header outboundHeader
	if err := sJson.UnmarshalContext(b.ctx, rawOptions, &header); err != nil {
		return nil, fmt.Errorf("parse outbound header: %w", err)
	}
	if header.Type == C.TypeWireGuard {
		return b.buildWireGuardEndpoint(rawOptions)
	}

	// 1. Parse via official option.Outbound path (strips type/tag, creates
	//    typed options via OutboundOptionsRegistry + badjson.UnmarshallExcluded).
	var outboundConfig option.Outbound
	if err := sJson.UnmarshalContext(b.ctx, rawOptions, &outboundConfig); err != nil {
		return nil, fmt.Errorf("parse outbound options: %w", err)
	}

	// 2. Create the outbound instance via the registry.
	logger := b.logFactory.NewLogger("outbound/" + outboundConfig.Type)
	ob, err := b.registry.CreateOutbound(
		b.ctx,
		nil, // router — not needed for simple dialing
		logger,
		outboundConfig.Type,
		outboundConfig.Type,
		outboundConfig.Options,
	)
	if err != nil {
		return nil, fmt.Errorf("create outbound [%s]: %w", outboundConfig.Type, err)
	}

	// 3. Run lifecycle start stages. On failure, close and return error.
	for _, stage := range adapter.ListStartStages {
		if err := adapter.LegacyStart(ob, stage); err != nil {
			_ = common.Close(ob)
			return nil, fmt.Errorf("outbound start %s [%s]: %w", stage, outboundConfig.Type, err)
		}
	}

	return ob, nil
}

// buildWireGuardEndpoint handles the v1.13+ WireGuard endpoint schema by
// registering it through EndpointManager and returning the endpoint as an
// adapter.Outbound (the Endpoint interface embeds Outbound at the type level).
func (b *SingboxBuilder) buildWireGuardEndpoint(rawOptions json.RawMessage) (adapter.Outbound, error) {
	// 1. Dispatch rawOptions to option.WireGuardEndpointOptions via the Endpoint
	// registry, mirroring option.Outbound.UnmarshalJSONContext. We let
	// EndpointRegistry.CreateOptions("wireguard") return a typed options pointer
	// (matching option.WireGuardEndpointOptions), then badjson excludes the
	// header (type/tag) fields and fills the typed options. This must use the
	// sing json path to support Listable[netip.Prefix] (Address/allowed_ips)
	// and badoption.Duration (udp_timeout) custom unmarshalers.
	endpointRegistry := service.FromContext[adapter.EndpointRegistry](b.ctx)
	if endpointRegistry == nil {
		return nil, fmt.Errorf("singbox builder: missing endpoint registry in context")
	}
	options, loaded := endpointRegistry.CreateOptions(C.TypeWireGuard)
	if !loaded {
		return nil, fmt.Errorf("singbox builder: endpoint type %s not registered (build without with_wireguard?)", C.TypeWireGuard)
	}
	wgOpt, ok := options.(*option.WireGuardEndpointOptions)
	if !ok {
		return nil, fmt.Errorf("singbox builder: endpoint options for wireguard: unexpected type %T", options)
	}
	// endpointHeader mirrors option.Outbound's _Outbound: the top-level fields
	// that UnmarshallExcludedContext allows on top of the per-type options.
	type endpointHeader struct {
		Type string `json:"type"`
		Tag  string `json:"tag,omitempty"`
	}
	var header endpointHeader
	if err := sJson.UnmarshalContext(b.ctx, rawOptions, &header); err != nil {
		return nil, fmt.Errorf("parse wireguard endpoint header: %w", err)
	}
	if err := badjson.UnmarshallExcludedContext(b.ctx, rawOptions, &header, wgOpt); err != nil {
		return nil, fmt.Errorf("parse wireguard endpoint options: %w", err)
	}
	tag := strings.TrimSpace(header.Tag)
	if tag == "" {
		return nil, fmt.Errorf("wireguard endpoint: tag is required")
	}

	logger := b.logFactory.NewLogger("endpoint/wireguard")

	// 2. Create via EndpointManager. router=nil: Resin uses these WireGuard
	// endpoints as detour outbounds (.Dial); they don't need a sing-box router
	// for routing decisions — same router=nil stance as the outbound path.
	if err := b.endpointManager.Create(
		b.ctx, nil, logger, tag, C.TypeWireGuard, wgOpt,
	); err != nil {
		return nil, fmt.Errorf("create wireguard endpoint [%s]: %w", tag, err)
	}

	// 3. Get the registered endpoint. It embeds adapter.Outbound at the type
	// level (adapter.Endpoint = Lifecycle + Outbound), so returning it directly
	// as adapter.Outbound is a Go-legal interface upcast.
	ep, ok := b.endpointManager.Get(tag)
	if !ok {
		return nil, fmt.Errorf("wireguard endpoint [%s]: not found after create", tag)
	}

	// 4. Lifecycle start. EndpointManager.Create does not start endpoints when
	// the manager itself is not started; mirror the outbound path and start
	// each stage explicitly (matching what box.applyOutbounds does for endpoints).
	for _, stage := range adapter.ListStartStages {
		if err := adapter.LegacyStart(ep, stage); err != nil {
			_ = common.Close(ep)
			return nil, fmt.Errorf("wireguard endpoint start %s [%s]: %w", stage, tag, err)
		}
	}

	return ep, nil
}

// Close shuts down the builder's internal DNS services.
func (b *SingboxBuilder) Close() error {
	var errs []error
	if b.dnsRouter != nil {
		errs = append(errs, b.dnsRouter.Close())
	}
	if b.dnsTransportManager != nil {
		errs = append(errs, b.dnsTransportManager.Close())
	}
	if b.endpointManager != nil {
		errs = append(errs, b.endpointManager.Close())
	}
	if b.networkManager != nil {
		errs = append(errs, b.networkManager.Close())
	}
	return errors.Join(errs...)
}
