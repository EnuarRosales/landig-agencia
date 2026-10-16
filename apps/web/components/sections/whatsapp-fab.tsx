import { useTranslations } from "next-intl";
import { IconWhatsappFilled } from "../icons";

const WA_LINK =
  "https://wa.me/573222752524?text=Hola%2C%20estuve%20viendo%20su%20p%C3%A1gina%20web%20y%20me%20interesa%20automatizar%20mi%20negocio%20con%20IA.%20%C2%BFMe%20pueden%20dar%20m%C3%A1s%20informaci%C3%B3n%3F";

export function WhatsappFab() {
  const t = useTranslations("cta");

  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("fabAria")}
      title={t("fabAria")}
      className="fixed bottom-6 right-6 z-[60] grid h-[60px] w-[60px] place-items-center rounded-full bg-wa text-wa-ink shadow-[0_10px_30px_rgba(37,211,102,0.5)]"
      style={{ animation: "pulse-dot 2s infinite" }}
    >
      <IconWhatsappFilled className="h-[30px] w-[30px]" />
    </a>
  );
}
