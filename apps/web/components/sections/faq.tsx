"use client";

import { Accordion } from "radix-ui";
import { useTranslations } from "next-intl";

export function Faq() {
  const t = useTranslations("faq");

  const items = [
    { q: t("items.q1"), a: t("items.a1") },
    { q: t("items.q2"), a: t("items.a2") },
    { q: t("items.q3"), a: t("items.a3") },
    { q: t("items.q4"), a: t("items.a4") },
    { q: t("items.q5"), a: t("items.a5") },
    { q: t("items.q6"), a: t("items.a6") },
  ];

  return (
    <section
      id="faq"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <div className="eyebrow">{t("eyebrow")}</div>
      <h2 className="mx-auto mb-10 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
        {t("title")}
      </h2>

      <Accordion.Root
        type="single"
        collapsible
        className="mx-auto mt-4 max-w-[760px]"
      >
        {items.map((item, i) => (
          <Accordion.Item
            key={i}
            value={`faq-${i}`}
            className="mb-3 overflow-hidden rounded-2xl border border-stroke bg-surface"
          >
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-[17px] font-semibold">
                {item.q}
                <span
                  aria-hidden
                  className="shrink-0 text-[24px] font-light text-a2 transition-transform duration-300 group-data-[state=open]:rotate-45"
                >
                  +
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-6 pb-5 text-muted">
              {item.a}
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}
