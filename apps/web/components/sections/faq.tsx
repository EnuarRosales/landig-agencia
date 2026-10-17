"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

export function Faq() {
  const t = useTranslations("faq");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items = [
    { q: t("items.q1"), a: t("items.a1") },
    { q: t("items.q2"), a: t("items.a2") },
    { q: t("items.q3"), a: t("items.a3") },
    { q: t("items.q4"), a: t("items.a4") },
    { q: t("items.q5"), a: t("items.a5") },
    { q: t("items.q6"), a: t("items.a6") },
  ];

  const toggle = (i: number) => {
    setOpenIndex((prev) => (prev === i ? null : i));
  };

  return (
    <section
      id="faq"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <div className="eyebrow">{t("eyebrow")}</div>
      <h2 className="mx-auto mb-10 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
        {t("title")}
      </h2>

      <div className="mx-auto mt-4 max-w-[760px]">
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="mb-3 overflow-hidden rounded-2xl border border-stroke bg-surface transition-colors"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-[17px] font-semibold text-txt"
              >
                <span>{item.q}</span>
                <span
                  aria-hidden
                  className={`shrink-0 text-[24px] font-light text-a2 transition-transform duration-300 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-6 pb-5 text-[15px] leading-relaxed text-muted">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
