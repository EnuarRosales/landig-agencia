import { useTranslations } from "next-intl";
import { FeatureCard } from "./feature-card";
import {
  IconBot,
  IconCalendar,
  IconCart,
  IconCheck,
  IconMedia,
  IconTarget,
} from "../icons";

export function Features() {
  const t = useTranslations("features");
  const c = useTranslations("features.cards");
  const check = <IconCheck className="h-3.5 w-3.5" />;

  return (
    <section id="features" className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]">
      <div className="eyebrow">{t("eyebrow")}</div>
      <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
        {t("title")}
      </h2>
      <p className="copy mx-auto mb-14 max-w-[660px] text-center text-[17px] text-muted">
        {t("sub")}
      </p>

      <div className="mx-auto max-w-[1200px]">
        <div className="mb-[22px] grid grid-cols-1 gap-[22px] lg:grid-cols-[1.1fr_1fr]">
          <FeatureCard
            featured
            icon={<IconCalendar className="h-[30px] w-[30px]" />}
            title={c("c1title")}
            text={t.rich("cards.c1text", {
              b: (chunks) => <b>{chunks}</b>,
            })}
            tag={<span className="contents">{check}{c("c1tag")}</span>}
          />
          <FeatureCard
            icon={<IconBot className="h-[30px] w-[30px]" />}
            title={c("c2title")}
            text={<>{c("c2text")}</>}
            tag={<span className="contents">{check}{c("c2tag")}</span>}
          />
        </div>

        <div className="grid grid-cols-1 gap-[22px] md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<IconCart className="h-[30px] w-[30px]" />}
            title={c("c3title")}
            text={<>{c("c3text")}</>}
          />
          <FeatureCard
            icon={<IconMedia className="h-[30px] w-[30px]" />}
            title={c("c4title")}
            text={<>{c("c4text")}</>}
          />
          <FeatureCard
            icon={<IconTarget className="h-[30px] w-[30px]" />}
            title={c("c5title")}
            text={<>{c("c5text")}</>}
          />
        </div>
      </div>
    </section>
  );
}
