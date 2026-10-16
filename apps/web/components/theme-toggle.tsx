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

  // The icons are switched through the `.dark` class that next-themes writes
  // on <html> (via its blocking pre-hydration script), so the button is
  // correct on first paint and there is never a hydration mismatch.
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("themeToggle")}
      className="grid h-10 w-10 place-items-center rounded-full border border-stroke bg-surface text-muted transition-colors hover:border-a2 hover:text-txt"
    >
      <span className="hidden dark:block">
        <IconSun />
      </span>
      <span className="block dark:hidden">
        <IconMoon />
      </span>
    </button>
  );
}
