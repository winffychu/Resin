import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { resetThemeStoreForTesting, useThemeStore } from "./theme-store";
import { useChartColors, useSeriesPalette, type SeriesSlot } from "./chart-tokens";

beforeEach(() => {
  resetThemeStoreForTesting("system");
});

describe("useChartColors", () => {
  it("returns light palette when resolved=light", () => {
    resetThemeStoreForTesting("light");
    const { result } = renderHook(() => useChartColors());
    expect(result.current.gridStroke).toBe("rgba(65, 87, 121, 0.16)");
    expect(result.current.axisTick).toBe("#657691");
    expect(result.current.dotStroke).toBe("#ffffff");
    expect(result.current.activeBarStroke).toBe("#f2f7ff");
  });

  it("returns dark palette when resolved=dark", () => {
    resetThemeStoreForTesting("dark");
    const { result } = renderHook(() => useChartColors());
    expect(result.current.gridStroke).toBe("rgba(160, 180, 210, 0.14)");
    expect(result.current.axisTick).toBe("#93a0b3");
    expect(result.current.dotStroke).toBe("#1b2129");
    expect(result.current.activeBarStroke).toBe("#0f1419");
  });

  it("updates reactively when theme switches", () => {
    resetThemeStoreForTesting("light");
    const { result } = renderHook(() => useChartColors());
    expect(result.current.dotStroke).toBe("#ffffff");
    act(() => {
      useThemeStore.getState().setPref("dark");
    });
    expect(result.current.dotStroke).toBe("#1b2129");
  });
});

describe("useSeriesPalette", () => {
  it("returns primary slot with expected light/dark colors", () => {
    resetThemeStoreForTesting("light");
    const { result: lightR } = renderHook(() => useSeriesPalette());
    expect(lightR.current("primary").color).toBe("#1076ff");
    expect(lightR.current("primary").fillColor).toBe("rgba(16, 118, 255, 0.14)");

    act(() => {
      useThemeStore.getState().setPref("dark");
    });
    const { result: darkR } = renderHook(() => useSeriesPalette());
    expect(darkR.current("primary").color).toBe("#4d96ff");
    expect(darkR.current("primary").fillColor).toBe("rgba(77, 150, 255, 0.18)");
  });

  it("every slot returns a string color in both themes", () => {
    const slots: SeriesSlot[] = [
      "primary", "secondary", "accentBlue", "accentOrange",
      "accentIndigo", "accentGreen", "accentTeal", "accentViolet", "accentAmber",
    ];
    resetThemeStoreForTesting("light");
    const light = renderHook(() => useSeriesPalette()).result.current;
    act(() => useThemeStore.getState().setPref("dark"));
    const dark = renderHook(() => useSeriesPalette()).result.current;
    for (const slot of slots) {
      expect(typeof light(slot).color, `slot ${slot} light`).toBe("string");
      expect(typeof dark(slot).color, `slot ${slot} dark`).toBe("string");
      expect(light(slot).color, `slot ${slot} differs`).not.toBe(dark(slot).color);
    }
  });

  it("palette function stable across re-renders within same theme", () => {
    resetThemeStoreForTesting("light");
    const { result, rerender } = renderHook(() => useSeriesPalette());
    const first = result.current("secondary").color;
    rerender();
    expect(result.current("secondary").color).toBe(first);
  });
});
