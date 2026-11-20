"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@mocter/ui";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("themeToggle")}
      title={t("themeToggle")}
      className="group relative h-10 w-10 min-h-[40px] rounded-full border-stroke bg-surface/90 shadow-sm hover:scale-105 hover:border-a1 hover:shadow-[0_0_16px_rgba(47,107,255,0.3)]"
    >
      {!mounted ? (
        <span className="h-5 w-5 opacity-0" aria-hidden="true" />
      ) : isDark ? (
        <Sun className="h-5 w-5 text-amber-400 transition-transform duration-300 group-hover:rotate-45" />
      ) : (
        <Moon className="h-5 w-5 text-txt transition-transform duration-300 group-hover:-rotate-12" />
      )}
    </Button>
  );
}
