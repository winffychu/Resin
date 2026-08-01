import { useThemeStore } from "./theme-store";

/**
 * 图表色 token（JS 侧）。
 *
 * recharts 的 stroke/fill/tick 是 React prop，被写入 SVG presentation attribute，
 * 浏览器不会在 attribute 上下文解析 CSS var() —— 因此图表色不能用
 * theme.css 的 CSS 变量直接翻转。这里维护 JS 侧两套色组，按当前 resolved
 * 主题返回，recharts 随 React 重渲染拿到对应色，从而正确适配深浅主题。
 */

export type ChartColors = {
  gridStroke: string;
  axisTick: string;
  tooltipCursorStroke: string;
  tooltipCursorFill: string;
  dotStroke: string;
  barTop: string;
  barBottom: string;
  activeBarFill: string;
  activeBarStroke: string;
  barFill: string;
};

const LIGHT_CHART: ChartColors = {
  gridStroke: "rgba(65, 87, 121, 0.16)",
  axisTick: "#657691",
  tooltipCursorStroke: "rgba(15, 94, 216, 0.34)",
  tooltipCursorFill: "rgba(15, 94, 216, 0.08)",
  dotStroke: "#ffffff",
  barTop: "#2388ff",
  barBottom: "#0f5ed8",
  activeBarFill: "#0d63dd",
  activeBarStroke: "#f2f7ff",
  barFill: "rgba(16, 118, 255, 0.86)",
};

const DARK_CHART: ChartColors = {
  gridStroke: "rgba(160, 180, 210, 0.14)",
  axisTick: "#93a0b3",
  tooltipCursorStroke: "rgba(77, 150, 255, 0.5)",
  tooltipCursorFill: "rgba(77, 150, 255, 0.16)",
  dotStroke: "#1b2129",
  barTop: "#2f74ff",
  barBottom: "#1a4fd0",
  activeBarFill: "#4d96ff",
  activeBarStroke: "#0f1419",
  barFill: "rgba(77, 150, 255, 0.86)",
};

/**
 * 返回当前主题下的图表结构色（网格、坐标轴、Tooltip、柱条）。
 * 主题切换时 zustand resolved 变化触发 React 重渲染，recharts 自动重画。
 */
export function useChartColors(): ChartColors {
  const resolved = useThemeStore((state) => state.resolved);
  return resolved === "dark" ? DARK_CHART : LIGHT_CHART;
}

export type SeriesColor = {
  color: string;
  fillColor?: string;
};

/** 语义角色槽位，业务页按槽位取色，主题切换时槽位不变、值随主题切换。 */
const LIGHT_SERIES: Record<string, SeriesColor> = {
  primary: { color: "#1076ff", fillColor: "rgba(16, 118, 255, 0.14)" },
  secondary: { color: "#00a17f" },
  accentBlue: { color: "#2467e4", fillColor: "rgba(36, 103, 228, 0.12)" },
  accentOrange: { color: "#f18f01" },
  accentIndigo: { color: "#2d63d8", fillColor: "rgba(45, 99, 216, 0.11)" },
  accentGreen: { color: "#0c9f68" },
  accentTeal: { color: "#0f9d8b" },
  accentViolet: { color: "#2068f6", fillColor: "rgba(32, 104, 246, 0.12)" },
  accentAmber: { color: "#e26a2c", fillColor: "rgba(226, 106, 44, 0.16)" },
};

const DARK_SERIES: Record<string, SeriesColor> = {
  primary: { color: "#4d96ff", fillColor: "rgba(77, 150, 255, 0.18)" },
  secondary: { color: "#3fd4a8" },
  accentBlue: { color: "#6ba8ff", fillColor: "rgba(107, 168, 255, 0.16)" },
  accentOrange: { color: "#ffb547" },
  accentIndigo: { color: "#8aa9ff", fillColor: "rgba(138, 169, 255, 0.15)" },
  accentGreen: { color: "#5fd49a" },
  accentTeal: { color: "#4fe0c2" },
  accentViolet: { color: "#7aa8ff", fillColor: "rgba(122, 168, 255, 0.16)" },
  accentAmber: { color: "#ff9a5c", fillColor: "rgba(255, 154, 92, 0.2)" },
};

export type SeriesSlot = keyof typeof LIGHT_SERIES;

/**
 * 返回当前主题下按槽位取色的函数。组件用 const series = useSeriesPalette();
 * series("primary") -> { color, fillColor? }。
 * 槽位命名稳定，确保主题切换不引起图例—线条对应关系错乱。
 */
export function useSeriesPalette() {
  const resolved = useThemeStore((state) => state.resolved);
  const palette = resolved === "dark" ? DARK_SERIES : LIGHT_SERIES;
  return (slot: SeriesSlot): SeriesColor => palette[slot];
}
