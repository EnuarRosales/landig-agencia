"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
