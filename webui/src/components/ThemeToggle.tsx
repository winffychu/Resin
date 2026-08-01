import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import { useI18n } from "../i18n";
import { THEME_PREF_ORDER, type ThemePref, useThemeStore } from "../features/theme/theme-store";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

const PREF_ICON: Record<ThemePref, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const PREF_LABEL_ZH: Record<ThemePref, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { t } = useI18n();
  const pref = useThemeStore((state) => state.pref);
  const cyclePref = useThemeStore((state) => state.cyclePref);
  const setPref = useThemeStore((state) => state.setPref);

  const ariaLabel = t("切换主题");
  const CurrentIcon = PREF_ICON[pref];

  if (compact) {
    return (
      <button
        type="button"
        className={cn("theme-toggle-compact", className)}
        onClick={() => cyclePref()}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <CurrentIcon size={14} />
        <span>{t(PREF_LABEL_ZH[pref])}</span>
      </button>
    );
  }

  return (
    <div className={cn("theme-toggle", className)} role="group" aria-label={ariaLabel}>
      {THEME_PREF_ORDER.map((p) => {
        const Icon = PREF_ICON[p];
        return (
          <button
            key={p}
            type="button"
            className={cn("theme-toggle-btn", pref === p && "theme-toggle-btn-active")}
            onClick={() => setPref(p)}
            title={t(PREF_LABEL_ZH[p])}
            aria-label={t(PREF_LABEL_ZH[p])}
          >
            <Icon size={14} />
            <span>{t(PREF_LABEL_ZH[p])}</span>
          </button>
        );
      })}
    </div>
  );
}
