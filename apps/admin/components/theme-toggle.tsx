"use client";

import React, { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@mocter/ui";

const emptySubscribe = () => () => {};

/**
 * Conmutador accesible de tema Claro / Oscuro para el Backoffice SaaS (`DSN-001`) sobre `<Button />`.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div
        className="h-10 w-10 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)]"
        aria-hidden="true"
      />
    );
  }

  const isDark = (resolvedTheme || theme) === "dark";

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo Claro" : "Modo Oscuro"}
      className="min-h-[44px] min-w-[44px] active:scale-95"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-indigo-400" aria-hidden="true" />
      )}
    </Button>
  );
}
