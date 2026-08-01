import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { resetThemeStoreForTesting, useThemeStore } from "../features/theme/theme-store";

// 让 i18n t() 透传原文，免初始化 i18next。
vi.mock("../i18n", () => ({
  useI18n: () => ({ t: (text: string) => text, locale: "zh-CN", setLocale: () => {} }),
}));

beforeEach(() => {
  resetThemeStoreForTesting("light");
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle — compact", () => {
  it("renders current pref label + icon", () => {
    resetThemeStoreForTesting("light");
    render(<ThemeToggle compact />);
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByText("浅色")).toBeInTheDocument();
  });

  it("cycles pref on click: light → dark → system → light", async () => {
    resetThemeStoreForTesting("light");
    const user = userEvent.setup();
    render(<ThemeToggle compact />);

    await user.click(screen.getByRole("button", { name: "切换主题" }));
    expect(useThemeStore.getState().pref).toBe("dark");
    expect(window.localStorage.getItem("resin.webui.theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "切换主题" }));
    expect(useThemeStore.getState().pref).toBe("system");

    await user.click(screen.getByRole("button", { name: "切换主题" }));
    expect(useThemeStore.getState().pref).toBe("light");
  });

  it("applies className on wrapper", () => {
    render(<ThemeToggle compact className="my-extra" />);
    expect(screen.getByRole("button", { name: "切换主题" })).toHaveClass("my-extra");
  });
});

describe("ThemeToggle — full", () => {
  it("renders three buttons", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跟随系统" })).toBeInTheDocument();
  });

  it("marks active pref with active class", () => {
    resetThemeStoreForTesting("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "深色" })).toHaveClass("theme-toggle-btn-active");
    expect(screen.getByRole("button", { name: "浅色" })).not.toHaveClass("theme-toggle-btn-active");
  });

  it("sets pref on click", async () => {
    resetThemeStoreForTesting("light");
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "深色" }));
    expect(useThemeStore.getState().pref).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("group has aria-label", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("group", { name: "切换主题" })).toBeInTheDocument();
  });
});
