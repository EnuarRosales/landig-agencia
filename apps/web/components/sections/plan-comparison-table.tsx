"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PublicPlanDto } from "@mocter/domain";
import { IconCheck } from "../icons";

export interface PlanComparisonTableProps {
  plans: PublicPlanDto[];
}

interface FeatureRow {
  labelKey: string;
  renderValue: (plan: PublicPlanDto, t: (key: string) => string) => React.ReactNode;
}

interface FeatureCategory {
  titleKey: string;
  rows: FeatureRow[];
}

export function PlanComparisonTable({ plans }: PlanComparisonTableProps) {
  const t = useTranslations("pricing");
  const locale = useLocale() as "es" | "en";
  const lang = locale === "en" ? "en" : "es";

  if (!plans || plans.length === 0) return null;

  const formatLimitNumber = (
    item: { mode: "LIMITED" | "UNLIMITED"; value: number | null } | undefined,
    t: (key: string) => string,
    suffix: string = "",
  ): React.ReactNode => {
    if (!item) return <span className="text-muted/40 font-mono">—</span>;
    if (item.mode === "UNLIMITED") {
      return <span className="font-semibold text-emerald-400">{t("unlimited")}</span>;
    }
    return (
      <span className="font-mono text-txt">
        {item.value} {suffix}
      </span>
    );
  };

  const formatStorage = (
    item: { mode: "LIMITED" | "UNLIMITED"; value: number | null } | undefined,
    t: (key: string) => string,
  ): React.ReactNode => {
    if (!item) return <span className="text-muted/40 font-mono">—</span>;
    if (item.mode === "UNLIMITED") {
      return <span className="font-semibold text-emerald-400">{t("unlimited")}</span>;
    }
    const bytes = item.value ?? 0;
    const mb = Math.round(bytes / (1024 * 1024));
    if (mb >= 1024) {
      const gb = Number((mb / 1024).toFixed(1));
      return (
        <span className="font-mono text-txt">
          {gb} {t("gb")}
        </span>
      );
    }
    return (
      <span className="font-mono text-txt">
        {mb} {t("mb")}
      </span>
    );
  };

  const formatBoolean = (val: boolean | undefined): React.ReactNode => {
    if (val) {
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <IconCheck className="h-3.5 w-3.5" />
        </span>
      );
    }
    return <span className="text-muted/40 font-mono">—</span>;
  };

  const categories: FeatureCategory[] = [
    {
      titleKey: "categoryCatalog",
      rows: [
        {
          labelKey: "featureProducts",
          renderValue: (p, t) => formatLimitNumber(p.limits?.products, t),
        },
        {
          labelKey: "featureImages",
          renderValue: (p, t) => formatLimitNumber(p.limits?.images_per_product, t),
        },
        {
          labelKey: "featureVideos",
          renderValue: (p, t) => formatLimitNumber(p.limits?.videos_per_product, t),
        },
        {
          labelKey: "featurePdfs",
          renderValue: (p, t) => formatLimitNumber(p.limits?.pdfs_per_product, t),
        },
      ],
    },
    {
      titleKey: "categoryChannels",
      rows: [
        {
          labelKey: "featureAgents",
          renderValue: (p, t) => formatLimitNumber(p.limits?.chatwoot_agents, t),
        },
        {
          labelKey: "featureInboxes",
          renderValue: (p, t) => formatLimitNumber(p.limits?.chatwoot_inboxes, t),
        },
        {
          labelKey: "featureWhatsapp",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_whatsapp),
        },
        {
          labelKey: "featureEmail",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_email),
        },
        {
          labelKey: "featureLiveChat",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_website ?? true),
        },
      ],
    },
    {
      titleKey: "categoryData",
      rows: [
        {
          labelKey: "featureStorage",
          renderValue: (p, t) => formatStorage(p.limits?.storage_bytes, t),
        },
        {
          labelKey: "featureRetention",
          renderValue: (p, t) =>
            formatLimitNumber(p.limits?.chat_retention_days, t, t("days")),
        },
      ],
    },
    {
      titleKey: "categoryAutomation",
      rows: [
        {
          labelKey: "featureCannedResponses",
          renderValue: (p) => formatBoolean(p.capabilities?.canned_responses),
        },
        {
          labelKey: "featureAutomations",
          renderValue: (p) => formatBoolean(p.capabilities?.automations),
        },
        {
          labelKey: "featureHelpCenter",
          renderValue: (p) => formatBoolean(p.capabilities?.help_center),
        },
      ],
    },
    {
      titleKey: "categoryPlatform",
      rows: [
        {
          labelKey: "featureUsers",
          renderValue: (p, t) => formatLimitNumber(p.limits?.tenant_users, t),
        },
        {
          labelKey: "featureContacts",
          renderValue: (p, t) => formatLimitNumber(p.limits?.contacts, t),
        },
        {
          labelKey: "featureReports",
          renderValue: (p) => formatBoolean(p.capabilities?.reports),
        },
        {
          labelKey: "featureApiWebhooks",
          renderValue: (p) => formatBoolean(p.capabilities?.api_and_webhooks),
        },
      ],
    },
  ];

  return (
    <div className="mt-12 overflow-hidden rounded-2xl border border-stroke bg-surface/80 p-4 shadow-xl backdrop-blur-md md:p-8">
      <div className="mb-6 text-center">
        <h3 className="font-display text-xl font-bold tracking-tight text-txt md:text-2xl">
          {t("comparisonTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted">{t("comparisonSubtitle")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm" role="table">
          <thead>
            <tr className="border-b border-stroke">
              <th scope="col" className="sticky left-0 bg-surface/90 py-4 pr-4 font-semibold text-txt backdrop-blur-md">
                Capacidades Y Recursos
              </th>
              {plans.map((p) => {
                const name = p.name?.[lang] || p.name?.es || p.code;
                return (
                  <th
                    key={p.id}
                    scope="col"
                    className={`px-4 py-4 text-center font-bold ${
                      p.isPopular ? "text-a1" : "text-txt"
                    }`}
                  >
                    <div className="inline-flex flex-col items-center gap-1">
                      <span>{name}</span>
                      {p.isPopular && (
                        <span className="rounded-full bg-a1/20 px-2 py-0.5 text-[10px] font-bold uppercase text-a1">
                          {t("popularBadge")}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke/60">
            {categories.map((cat, catIdx) => (
              <React.Fragment key={catIdx}>
                <tr className="bg-surface2/60">
                  <th
                    colSpan={plans.length + 1}
                    scope="colgroup"
                    className="py-2.5 pl-3 text-xs font-bold uppercase tracking-wider text-a2"
                  >
                    {t(cat.titleKey)}
                  </th>
                </tr>
                {cat.rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="transition-colors hover:bg-surface2/40"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 bg-surface/90 py-3 pr-4 font-medium text-txt/90 backdrop-blur-md"
                    >
                      {t(row.labelKey)}
                    </th>
                    {plans.map((p) => (
                      <td
                        key={p.id}
                        className={`px-4 py-3 text-center text-xs ${
                          p.isPopular ? "bg-a1/[0.03]" : ""
                        }`}
                      >
                        {row.renderValue(p, t)}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
