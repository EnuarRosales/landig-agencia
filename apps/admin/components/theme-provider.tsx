"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { env } from "@/env";

// Suprimir la advertencia falso-positivo de React 19 provocada por el script inline
// anti-FOUC (Flash of Unstyled Content) que inyecta internamente next-themes.
if (typeof window !== "undefined" && env.NEXT_PUBLIC_NODE_ENV === "development") {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("mocter_custom_design_tokens");
      if (saved) {
        const tokens = JSON.parse(saved) as Record<string, string>;
        const root = document.documentElement;
        Object.entries(tokens).forEach(([key, val]) => {
          if (typeof val === "string") {
            root.style.setProperty(key, val);
          }
        });
      }
    } catch {
      // Ignorar errores de acceso a almacenamiento local
    }
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
