import { create } from "zustand";

const THEME_KEY = "resin.webui.theme";
const MQ_DARK = "(prefers-color-scheme: dark)";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREF_ORDER: readonly ThemePref[] = ["light", "dark", "system"];

function loadInitialPref(): ThemePref {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(THEME_KEY);
  return normalizePref(stored);
}

function normalizePref(value: string | null): ThemePref {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(MQ_DARK).matches;
}

export function resolvePref(pref: ThemePref): ResolvedTheme {
  if (pref === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return pref;
}

function persistPref(pref: ThemePref): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, pref);
  }
}

function applyResolvedToDOM(resolved: ResolvedTheme): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = resolved;
  }
}

type ThemeState = {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  cyclePref: () => ThemePref;
  apply: () => void;
  syncSystemChange: () => void;
};

const initialPref = loadInitialPref();

export const useThemeStore = create<ThemeState>((set, get) => ({
  pref: initialPref,
  resolved: resolvePref(initialPref),
  setPref: (pref) => {
    persistPref(pref);
    const next = resolvePref(pref);
    set({ pref, resolved: next });
    applyResolvedToDOM(next);
  },
  cyclePref: () => {
    const current = get().pref;
    const order = THEME_PREF_ORDER;
    const next = order[(order.indexOf(current) + 1) % order.length];
    get().setPref(next);
    return next;
  },
  apply: () => {
    applyResolvedToDOM(get().resolved);
  },
  syncSystemChange: () => {
    if (get().pref !== "system") {
      return;
    }
    const next = systemPrefersDark() ? "dark" : "light";
    if (next !== get().resolved) {
      set({ resolved: next });
      applyResolvedToDOM(next);
    }
  },
}));

export function getResolvedTheme(): ResolvedTheme {
  return useThemeStore.getState().resolved;
}

export function getThemePref(): ThemePref {
  return useThemeStore.getState().pref;
}

/**
 * 测试辅助：在 beforeEach 中重置到给定 pref（含 resolved + DOM 同步）。
 * 非测试代码不应调用，生产中 pref 应通过 setPref 改变。
 *
 * @internal 仅供单元测试使用；不在稳定 API 契约中。
 */
export function resetThemeStoreForTesting(pref: ThemePref = "system") {
  const resolved = resolvePref(pref);
  useThemeStore.setState({ pref, resolved });
  applyResolvedToDOM(resolved);
}
