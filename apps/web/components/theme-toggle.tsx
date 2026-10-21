"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

function IconSun() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2M12 19.2v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.8 12h2M19.2 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5"
    >
      <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10z" />
    </svg>
  );
}

export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("themeToggle")}
      title={t("themeToggle")}
      className="group relative grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-stroke bg-surface/90 shadow-sm transition-all duration-300 hover:scale-105 hover:border-a1 hover:shadow-[0_0_16px_rgba(47,107,255,0.3)] active:scale-95"
    >
      {/* Sol para modo oscuro (cambiar a claro) con brillo ámbar y rotación */}
      <span className="hidden [.dark_&]:block dark:block text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)] transition-transform duration-300 group-hover:rotate-45">
        <IconSun />
      </span>

      {/* Luna para modo claro (cambiar a oscuro) con azul índigo vibrante y rotación */}
      <span className="block [.dark_&]:hidden dark:hidden text-[#2f6bff] drop-shadow-[0_0_8px_rgba(47,107,255,0.4)] transition-transform duration-300 group-hover:-rotate-12">
        <IconMoon />
      </span>
    </button>
  );
}
