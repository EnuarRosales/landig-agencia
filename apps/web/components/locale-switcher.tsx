"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggleLocale = (nextLocale: "es" | "en") => {
    if (nextLocale === locale || isPending) return;

    // Persistir preferencia de idioma en cookie estándar de next-intl
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;

    // Reemplazar segmento /[locale] en el pathname actual
    let targetPath = `/${nextLocale}`;
    if (pathname) {
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length > 0 && (segments[0] === "es" || segments[0] === "en")) {
        segments[0] = nextLocale;
        targetPath = `/${segments.join("/")}`;
      } else {
        targetPath = `/${nextLocale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
      }
    }

    startTransition(() => {
      router.push(targetPath);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label="Selector de idioma / Language selector"
      className="flex items-center rounded-full border border-stroke bg-surface p-0.5 text-[13px] font-semibold"
    >
      <button
        type="button"
        onClick={() => toggleLocale("es")}
        disabled={isPending}
        className={`cursor-pointer rounded-full px-2.5 py-1 transition-all ${
          locale === "es"
            ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-sm"
            : "text-muted hover:text-txt"
        }`}
        aria-pressed={locale === "es"}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => toggleLocale("en")}
        disabled={isPending}
        className={`cursor-pointer rounded-full px-2.5 py-1 transition-all ${
          locale === "en"
            ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-sm"
            : "text-muted hover:text-txt"
        }`}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
