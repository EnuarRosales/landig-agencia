"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { IconLink, IconRocket, IconSpark } from "../icons";

/**
 * Interactive 3-step walkthrough (auto-rotates every 3.2s; clicking a step
 * selects it and restarts the timer, as in the original landing).
 */
export function HowItWorks() {
  const t = useTranslations("how");
  const [current, setCurrent] = useState(0);

  const steps = [
    { title: t("steps.s1title"), text: t("steps.s1text") },
    { title: t("steps.s2title"), text: t("steps.s2text") },
    { title: t("steps.s3title"), text: t("steps.s3text") },
  ];

  const visuals = [
    {
      icon: <IconLink className="h-12 w-12" />,
      title: t("visual.v1title"),
      text: t("visual.v1text"),
    },
    {
      icon: <IconSpark className="h-12 w-12" />,
      title: t("visual.v2title"),
      text: t("visual.v2text"),
    },
    {
      icon: <IconRocket className="h-12 w-12" />,
      title: t("visual.v3title"),
      text: t("visual.v3text"),
    },
  ];

  // Rotates automatically every 3.2s. `timerRestart` re-creates the interval
  // after a manual click so the rotation restarts from the fresh selection.
  const [timerRestart, setTimerRestart] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % 3);
    }, 3200);
    return () => clearInterval(timer);
  }, [timerRestart]);

  const select = useCallback((index: number) => {
    setCurrent(index);
    setTimerRestart((n) => n + 1);
  }, []);

  return (
    <section
      id="how"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <div className="eyebrow">{t("eyebrow")}</div>
      <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
        {t("title")}
      </h2>
      <p className="copy mx-auto mb-14 max-w-[660px] text-center text-[17px] text-muted">
        {t("sub")}
      </p>

      <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          {steps.map((step, i) => (
            <button
              key={i}
              type="button"
              onClick={() => select(i)}
              className={`relative flex cursor-pointer items-start gap-4 overflow-hidden rounded-[18px] border px-6 py-[22px] text-left transition-all duration-300 ${
                i === current
                  ? "border-a1 bg-[linear-gradient(120deg,rgba(47,107,255,.16),rgba(34,211,238,.05))] shadow-[0_10px_40px_rgba(47,107,255,0.15)]"
                  : "border-stroke bg-surface2 hover:border-[rgba(47,107,255,0.4)]"
              }`}
            >
              <span
                className="absolute inset-y-0 left-0 w-[3px] bg-[linear-gradient(var(--color-a1),var(--color-a2))] transition-transform duration-300 [transform-origin:top]"
                style={{ transform: i === current ? "scaleY(1)" : "scaleY(0)" }}
              />
              <span
                className={`grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl font-display text-[20px] font-extrabold text-white transition-all duration-300 ${
                  i === current
                    ? "scale-[1.05] bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] shadow-[0_0_60px_rgba(47,107,255,0.4)]"
                    : "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))]"
                }`}
              >
                {i + 1}
              </span>
              <span>
                <h3 className="mb-1 font-display text-[18px] tracking-tight">
                  {step.title}
                </h3>
                <div
                  className="overflow-hidden text-[14.5px] text-muted transition-all duration-[400ms]"
                  style={{
                    maxHeight: i === current ? 80 : 0,
                    opacity: i === current ? 1 : 0,
                    paddingTop: i === current ? 4 : 0,
                  }}
                >
                  {step.text}
                </div>
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-3xl border border-stroke bg-surface p-8 backdrop-blur-[10px] lg:min-h-[340px]">
          {visuals.map((visual, i) => (
            <div
              key={i}
              className={`pointer-events-auto absolute inset-8 flex flex-col items-center justify-center text-center transition-all duration-[450ms] ${
                i === current
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-3.5 scale-[0.98] opacity-0"
              }`}
            >
              <div className="anim-bob mb-[22px] grid h-[96px] w-[96px] place-items-center rounded-[26px] border border-stroke bg-[linear-gradient(145deg,rgba(47,107,255,.15),rgba(34,211,238,.08))] dark:bg-[linear-gradient(145deg,rgba(47,107,255,.3),rgba(34,211,238,.14))] text-a1 dark:text-[#dff0ff]">
                {visual.icon}
              </div>
              <h4 className="mb-2 font-display text-[22px] tracking-tight">
                {visual.title}
              </h4>
              <p className="copy max-w-[320px] text-[15px] text-muted">
                {visual.text}
              </p>
            </div>
          ))}

          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
            {visuals.map((_, i) => (
              <span
                key={i}
                className={`transition-all duration-300 ${
                  i === current
                    ? "h-2 w-[22px] rounded-md bg-a1"
                    : "h-2 w-2 rounded-full bg-stroke"
                }`}
                aria-hidden
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
