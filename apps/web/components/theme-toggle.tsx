"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("themeToggle")}
      title={t("themeToggle")}
      className="group relative grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-stroke bg-surface/90 shadow-sm transition-all duration-300 hover:scale-105 hover:border-a1 hover:shadow-[0_0_16px_rgba(47,107,255,0.3)] active:scale-95"
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
      ) : (
        <Moon className="h-5 w-5 text-txt transition-transform duration-300 group-hover:-rotate-12" />
      )}
    </button>
  );
}
