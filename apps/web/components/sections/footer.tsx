import { useTranslations } from "next-intl";
import { Logo } from "../logo";

/*
 * Contact points are production values on purpose (IdenTechnology email,
 * WhatsApp line). Inert "#" links match the original page's placeholders.
 */
export function Footer() {
  const t = useTranslations("footer");

  const product = [
    { href: "#features", key: "features" },
    { href: "#sectors", key: "sectors" },
    { href: "#how", key: "how" },
    { href: "#demo", key: "demo" },
    { href: "#demo-form", key: "cta" },
  ] as const;

  const resources = [
    { href: "#faq", key: "faq" },
    { href: "#", key: "cases" },
    { href: "#", key: "blog" },
  ] as const;

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
            href="mailto:info@identechnology.co"
            className="mb-2 block text-[14px] text-muted transition-colors hover:text-a2"
          >
            info@identechnology.co
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

      <div className="mx-auto max-w-[1180px] border-t border-stroke pt-6 text-center text-[13px] text-muted">
        {t("legal")}
      </div>
    </footer>
  );
}
