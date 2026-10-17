"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: t("features") },
    { href: "#sectors", label: t("sectors") },
    { href: "#how", label: t("how") },
    { href: "#demo", label: t("demo") },
  ];

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[clamp(18px,5vw,60px)] py-3.5 backdrop-blur-[14px] transition-colors duration-300 ${
        scrolled
          ? "border-b border-stroke bg-[var(--nav-bg-scrolled)]"
          : "border-b border-transparent bg-[var(--nav-bg)]"
      }`}
    >
      <a href="#" className="flex items-center" aria-label={t("logoAria")}>
        <Logo className="block h-auto w-[132px]" />
      </a>

      <div className="hidden items-center gap-2.5 md:flex">
        <div className="mr-2 flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-muted transition-colors hover:text-txt"
            >
              {link.label}
            </a>
          ))}
        </div>
        <a
          href="#demo-form"
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(47,107,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(47,107,255,0.6)]"
        >
          {t("cta")}
        </a>
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-3 md:hidden">
        <ThemeToggle />
      </div>
    </nav>
  );
}
