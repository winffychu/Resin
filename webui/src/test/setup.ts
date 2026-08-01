import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// matchMedia polyfill（jsdom 不实现）。
class MatchMediaStub {
  private listeners: ((e: { matches: boolean }) => void)[] = [];
  private matches = false;
  media: string;

  constructor(media: string) {
    this.media = media;
  }

  get Matches(): boolean {
    return this.matches;
  }

  setMatches(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener({ matches });
    }
  }

  addEventListener(_type: string, listener: (e: { matches: boolean }) => void) {
    this.listeners.push(listener);
  }

  removeEventListener(_type: string, listener: (e: { matches: boolean }) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // matchMedia legacy API
  addListener(listener: (e: { matches: boolean }) => void) {
    this.listeners.push(listener);
  }
  removeListener(listener: (e: { matches: boolean }) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  dispatchEvent() {
    return true;
  }

  onchange = null;
}

const stubs = new Map<string, MatchMediaStub>();

if (!window.matchMedia) {
  window.matchMedia = (media: string) => {
    let stub = stubs.get(media);
    if (!stub) {
      stub = new MatchMediaStub(media);
      stubs.set(media, stub);
    }
    return stub as unknown as MediaQueryList;
  };
}

// 暴露给测试驱动系统主题变化（"prefers-color-scheme: dark"）。
export function setSystemColorScheme(prefersDark: boolean) {
  const media = "(prefers-color-scheme: dark)";
  const stub = stubs.get(media);
  if (stub) {
    stub.setMatches(prefersDark);
  }
}

// RTL 自动清理 React 组件。
afterEach(() => {
  cleanup();
});

// 每个测试前重置 localStorage + documentElement，避免 zustand store 跨测试污染。
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
