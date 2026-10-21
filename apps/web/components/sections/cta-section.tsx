import { useTranslations } from "next-intl";
import { Reveal } from "../reveal";
import { DemoForm } from "../demo-form";
import { IconMail, IconWhatsappFilled } from "../icons";

/*
 * Contact links kept exactly as in the live site:
 * - pre-filled WhatsApp deep link for demo requests
 * - Mocter contact email
 */
const WA_LINK =
  "https://wa.me/573222752524?text=Hola%2C%20estuve%20viendo%20su%20p%C3%A1gina%20web%20y%20me%20interesa%20automatizar%20mi%20negocio%20con%20IA.%20%C2%BFMe%20pueden%20dar%20m%C3%A1s%20informaci%C3%B3n%3F";

export function CtaSection() {
  const t = useTranslations("cta");

  return (
    <section
      id="cta"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <Reveal className="relative mx-auto max-w-[1000px] overflow-hidden rounded-[32px] border border-stroke bg-[linear-gradient(135deg,rgba(47,107,255,.2),rgba(34,211,238,.1))] px-[clamp(28px,7vw,70px)] py-[clamp(40px,7vw,70px)] text-center">
        <div
          className="pointer-events-none absolute -top-[100px] -right-[60px] h-[300px] w-[300px] rounded-full bg-a1 opacity-35 blur-[90px]"
          aria-hidden
        />
        <h2 className="relative mb-4 font-display text-[clamp(28px,4.5vw,44px)] font-extrabold tracking-tight">
          {t("title")}
        </h2>
        <p className="relative mx-auto mb-8 max-w-[540px] text-[18px] text-muted">
          {t("sub")}
        </p>
        <div className="relative mb-12 flex flex-wrap justify-center gap-3.5">
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-wa px-6 py-3 font-semibold text-[15px] text-wa-ink transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(37,211,102,0.5)]"
          >
            <IconWhatsappFilled className="h-[18px] w-[18px]" />
            {t("waButton")}
          </a>
          <a
            href="mailto:info@mocter.co"
            className="inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-6 py-3 font-semibold text-[15px] text-txt transition-all hover:-translate-y-0.5 hover:border-a2"
          >
            <IconMail className="h-[18px] w-[18px]" />
            {t("mailButton")}
          </a>
        </div>

        <div className="relative">
          <p className="mb-4 font-display text-[clamp(20px,2.6vw,26px)] font-bold tracking-tight">
            {t("formTitle")}
          </p>
          <p className="mx-auto mb-6 max-w-[540px] text-muted">{t("formSub")}</p>
          <DemoForm />
        </div>
      </Reveal>
    </section>
  );
}
