import { useLocale, useTranslations } from "next-intl";
import { Logo } from "../logo";

export function Footer() {
  const t = useTranslations("footer");
  const locale = useLocale();

  const product = [
    { href: `/${locale}#features`, key: "features" },
    { href: `/${locale}#sectors`, key: "sectors" },
    { href: `/${locale}#how`, key: "how" },
    { href: `/${locale}#demo`, key: "demo" },
    { href: `/${locale}#demo-form`, key: "cta" },
  ] as const;

  const resources = [
    { href: `/${locale}#faq`, key: "faq" },
    { href: "#", key: "cases" },
    { href: "#", key: "blog" },
  ] as const;

  const legal = [
    { href: `/${locale}/privacidad`, label: t("privacy") },
    { href: `/${locale}/terminos`, label: t("terms") },
    { href: `/${locale}/cookies`, label: t("cookies") },
  ];

  return (
    <footer className="border-t border-stroke bg-bg2 px-[clamp(18px,5vw,60px)] pb-10 pt-[60px]">
      <div className="mx-auto mb-7 flex max-w-[1180px] flex-wrap justify-between gap-8">
        <div className="max-w-[300px]">
          <Logo className="block h-auto w-[132px]" />
          <p className="copy mt-3.5 text-[14px] text-muted">{t("tagline")}</p>
        </div>

        <div>
          <h4 className="mb-3.5 text-[14px] font-semibold">{t("product")}</h4>
          {product.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
            >
              {t(`productLinks.${link.key}`)}
            </a>
          ))}
        </div>

        <div>
          <h4 className="mb-3.5 text-[14px] font-semibold">{t("legalTitle")}</h4>
          {legal.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
            >
              {item.label}
            </a>
          ))}
        </div>

        <div>
          <h4 className="mb-3.5 text-[14px] font-semibold">{t("resources")}</h4>
          {resources.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
            >
              {t(`resourcesLinks.${link.key}`)}
            </a>
          ))}
        </div>

        <div>
          <h4 className="mb-3.5 text-[14px] font-semibold">{t("contact")}</h4>
          <a
            href="mailto:info@mocter.co"
            className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
          >
            info@mocter.co
          </a>
          <a
            href="https://wa.me/573222752524"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
          >
            WhatsApp
          </a>
          <span className="mb-2 block text-[14px] text-muted">Colombia</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-3 border-t border-stroke pt-6 text-[13px] text-muted md:flex-row">
        <span>{t("legal")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/${locale}/privacidad`} className="transition-colors hover:text-a2">
            {t("privacy")}
          </a>
          <span>·</span>
          <a href={`/${locale}/terminos`} className="transition-colors hover:text-a2">
            {t("terms")}
          </a>
          <span>·</span>
          <a href={`/${locale}/cookies`} className="transition-colors hover:text-a2">
            {t("cookies")}
          </a>
        </div>
      </div>
    </footer>
  );
}
