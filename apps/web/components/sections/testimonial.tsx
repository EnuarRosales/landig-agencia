import { useTranslations } from "next-intl";
import { Reveal } from "../reveal";

export function Testimonial() {
  const t = useTranslations("testimonial");

  return (
    <section className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]">
      <Reveal className="mx-auto max-w-[840px]">
        <blockquote className="rounded-[22px] border border-stroke bg-surface px-10 py-12 text-center backdrop-blur-[10px]">
          <div className="mb-5 text-[22px] tracking-[3px] text-[#ffd166]" aria-hidden>
            ★★★★★
          </div>
          <p className="mb-6 font-display text-[clamp(20px,3vw,30px)] font-semibold leading-[1.4]">
            {t("q1")}
            <span className="text-a2">{t("qHi")}</span>
            {t("q2")}
          </p>
          <p className="text-[15px] text-muted">
            <b className="font-semibold text-txt">{t("whoA")}</b>
            {t("whoB")}
          </p>
        </blockquote>
      </Reveal>
    </section>
  );
}
