import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useThemeStore } from "./theme-store";

const MQ_DARK = "(prefers-color-scheme: dark)";

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const apply = useThemeStore((state) => state.apply);
  const syncSystemChange = useThemeStore((state) => state.syncSystemChange);
  const pref = useThemeStore((state) => state.pref);
  const resolved = useThemeStore((state) => state.resolved);

  // 同步首次 apply，避免首画闪烁 (FOUC)。
  useLayoutEffect(() => {
    apply();
  }, [apply, pref, resolved]);

  // 监听系统主题变化（仅 pref === "system" 时响应）。
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia(MQ_DARK);
    const handler = () => syncSystemChange();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [syncSystemChange]);

  return <>{children}</>;
}
