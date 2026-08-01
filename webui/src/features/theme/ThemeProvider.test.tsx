import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";
import { resetThemeStoreForTesting, useThemeStore } from "./theme-store";

beforeEach(() => {
  resetThemeStoreForTesting("system");
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
});

function renderProvider() {
  return render(<ThemeProvider>CHILD</ThemeProvider>);
}

describe("ThemeProvider", () => {
  it("writes resolved theme to documentElement on mount (system -> light by default jsdom)", () => {
    // jsdom 默认 matchMedia 不存在 / 视为 matches=false -> light
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) =>
      q === "(prefers-color-scheme: dark)"
        ? ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList)
        : ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList),
    );
    renderProvider();
    expect(document.documentElement.dataset.theme).toBe("light");
    vi.restoreAllMocks();
  });

  it("reflects current resolved dark when stored pref=dark before mount", () => {
    useThemeStore.getState().setPref("dark");
    renderProvider();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates data-theme when system OS changes while pref=system", () => {
    // 让 matchMedia 返回带 addEventListener 的真实 stub。
    const listeners: ((e: { matches: boolean }) => void)[] = [];
    let matches = false;
    vi.spyOn(window, "matchMedia").mockImplementation(
      (_q: string) =>
        ({
          matches,
          addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
          removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => {
            const idx = listeners.indexOf(l);
            if (idx >= 0) listeners.splice(idx, 1);
          },
        } as unknown as MediaQueryList),
    );
    resetThemeStoreForTesting("system");
    renderProvider();
    expect(document.documentElement.dataset.theme).toBe("light");

    // 模拟系统切到深色，触发 OS change 回调。
    matches = true;
    for (const listener of listeners) listener({ matches: true });

    expect(useThemeStore.getState().pref).toBe("system");
    expect(useThemeStore.getState().resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.restoreAllMocks();
  });

  it("does not change resolved when pref=light and OS becomes dark", () => {
    const listeners: ((e: { matches: boolean }) => void)[] = [];
    let matches = false;
    vi.spyOn(window, "matchMedia").mockImplementation(
      (_q: string) =>
        ({
          matches,
          addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
          removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => {
            const idx = listeners.indexOf(l);
            if (idx >= 0) listeners.splice(idx, 1);
          },
        } as unknown as MediaQueryList),
    );
    useThemeStore.getState().setPref("light");
    renderProvider();

    matches = true;
    for (const listener of listeners) listener({ matches: true });
    expect(useThemeStore.getState().resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    vi.restoreAllMocks();
  });
});
