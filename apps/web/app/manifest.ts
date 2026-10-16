import type { MetadataRoute } from "next";

/**
 * Native PWA manifest (App Router `manifest.ts`).
 * `icon.svg` is a simple "M" chip usable as both `any` and `maskable` icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mocter",
    short_name: "Mocter",
    description:
      "Automatiza atención, agendamiento y ventas con IA por WhatsApp (Mocter).",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0e1c",
    theme_color: "#05070f",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
