import { useTranslations } from "next-intl";
import { Reveal } from "../reveal";
import {
  IconBag,
  IconCap,
  IconDumbbell,
  IconHeartPulse,
  IconHome,
  IconPlate,
  IconRocket,
  IconScale,
  IconScissors,
  IconWrench,
} from "../icons";

const SECTORS = [
  { icon: IconHeartPulse, key: "s1" },
  { icon: IconScissors, key: "s2" },
  { icon: IconScale, key: "s3" },
  { icon: IconHome, key: "s4" },
  { icon: IconCap, key: "s5" },
  { icon: IconWrench, key: "s6" },
  { icon: IconBag, key: "s7" },
  { icon: IconRocket, key: "s8" },
  { icon: IconPlate, key: "s9" },
  { icon: IconDumbbell, key: "s10" },
] as const;

export function Sectors() {
  const t = useTranslations("sectors");

  return (
    <section
      id="sectors"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <Reveal>
        <div className="eyebrow">{t("eyebrow")}</div>
        <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
          {t("title")}
        </h2>
        <p className="copy mx-auto mb-14 max-w-[660px] text-center text-[17px] text-muted">
          {t("sub")}
        </p>
      </Reveal>

      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {SECTORS.map(({ icon: Icon, key }) => (
          <Reveal key={key}>
            <div className="group h-full rounded-[18px] border border-stroke bg-surface px-[18px] py-6 text-center transition-all duration-300 hover:-translate-y-1.5 hover:border-a1 hover:bg-[linear-gradient(160deg,rgba(47,107,255,.12),transparent)]">
              <div className="mx-auto mb-3.5 grid h-12 w-12 place-items-center rounded-[14px] border border-stroke bg-[linear-gradient(145deg,rgba(47,107,255,.15),rgba(34,211,238,.08))] dark:bg-[linear-gradient(145deg,rgba(47,107,255,.22),rgba(34,211,238,.1))]">
                <span className="text-a1 dark:text-[#dff0ff] transition-colors group-hover:text-a2">
                  <Icon className="h-[26px] w-[26px]" />
                </span>
              </div>
              <span className="text-[14px] font-medium">{t(`items.${key}`)}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
