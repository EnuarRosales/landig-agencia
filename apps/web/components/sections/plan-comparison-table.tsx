"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PublicPlanDto } from "@mocter/domain";
import {
  Package,
  Image as ImageIcon,
  Video,
  FileText,
  Users,
  Inbox,
  Mail,
  Globe,
  HardDrive,
  History,
  Zap,
  Bot,
  BookOpen,
  UserCheck,
  Contact,
  BarChart3,
  Webhook,
  Sparkles,
  Layers,
  Radio,
  Database,
  Cpu,
  Building2,
} from "lucide-react";
import { IconCheck, IconWhatsappFilled } from "../icons";

export interface PlanComparisonTableProps {
  plans: PublicPlanDto[];
  cycle?: "monthly" | "annual";
}

interface FeatureRow {
  icon: React.ReactNode;
  iconBg: string;
  labelKey: string;
  hintEs: string;
  hintEn: string;
  renderValue: (plan: PublicPlanDto, t: (key: string) => string) => React.ReactNode;
}

interface FeatureCategory {
  titleKey: string;
  icon: React.ReactNode;
  rows: FeatureRow[];
}

export function PlanComparisonTable({ plans, cycle = "monthly" }: PlanComparisonTableProps) {
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
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
          <Sparkles className="h-3 w-3" />
          <span>{t("unlimited")}</span>
        </span>
      );
    }
    return (
      <span className="font-mono font-medium text-txt">
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
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
          <Sparkles className="h-3 w-3" />
          <span>{t("unlimited")}</span>
        </span>
      );
    }
    const bytes = item.value ?? 0;
    const mb = Math.round(bytes / (1024 * 1024));
    if (mb >= 1024) {
      const gb = Number((mb / 1024).toFixed(1));
      return (
        <span className="font-mono font-medium text-txt">
          {gb} {t("gb")}
        </span>
      );
    }
    return (
      <span className="font-mono font-medium text-txt">
        {mb} {t("mb")}
      </span>
    );
  };

  const formatBoolean = (val: boolean | undefined): React.ReactNode => {
    if (val) {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 shadow-sm shadow-emerald-500/20">
          <IconCheck className="h-3.5 w-3.5" />
        </span>
      );
    }
    return <span className="text-muted/30 font-mono text-base select-none">—</span>;
  };

  const categories: FeatureCategory[] = [
    {
      titleKey: "categoryCatalog",
      icon: <Layers className="h-4 w-4 text-cyan-400" />,
      rows: [
        {
          icon: <Package className="h-4 w-4 text-cyan-400" />,
          iconBg: "bg-cyan-500/10 border border-cyan-500/20",
          labelKey: "featureProducts",
          hintEs: "Límite de artículos visibles en catálogo",
          hintEn: "Published catalog items limit",
          renderValue: (p, t) => formatLimitNumber(p.limits?.products, t),
        },
        {
          icon: <ImageIcon className="h-4 w-4 text-indigo-400" />,
          iconBg: "bg-indigo-500/10 border border-indigo-500/20",
          labelKey: "featureImages",
          hintEs: "Fotografías por cada producto",
          hintEn: "Images attached per product",
          renderValue: (p, t) => formatLimitNumber(p.limits?.images_per_product, t),
        },
        {
          icon: <Video className="h-4 w-4 text-rose-400" />,
          iconBg: "bg-rose-500/10 border border-rose-500/20",
          labelKey: "featureVideos",
          hintEs: "Clips de video demostrativos",
          hintEn: "Demo video clips per product",
          renderValue: (p, t) => formatLimitNumber(p.limits?.videos_per_product, t),
        },
        {
          icon: <FileText className="h-4 w-4 text-amber-400" />,
          iconBg: "bg-amber-500/10 border border-amber-500/20",
          labelKey: "featurePdfs",
          hintEs: "Fichas técnicas y manuales en PDF",
          hintEn: "Datasheets and PDF manuals",
          renderValue: (p, t) => formatLimitNumber(p.limits?.pdfs_per_product, t),
        },
      ],
    },
    {
      titleKey: "categoryChannels",
      icon: <Radio className="h-4 w-4 text-emerald-400" />,
      rows: [
        {
          icon: <Users className="h-4 w-4 text-blue-400" />,
          iconBg: "bg-blue-500/10 border border-blue-500/20",
          labelKey: "featureAgents",
          hintEs: "Operadores simultáneos de atención",
          hintEn: "Simultaneous support operators",
          renderValue: (p, t) => formatLimitNumber(p.limits?.chatwoot_agents, t),
        },
        {
          icon: <Inbox className="h-4 w-4 text-teal-400" />,
          iconBg: "bg-teal-500/10 border border-teal-500/20",
          labelKey: "featureInboxes",
          hintEs: "Bandejas omnicanal conectadas",
          hintEn: "Connected omnichannel inboxes",
          renderValue: (p, t) => formatLimitNumber(p.limits?.chatwoot_inboxes, t),
        },
        {
          icon: <IconWhatsappFilled className="h-4 w-4 text-emerald-400" />,
          iconBg: "bg-emerald-500/15 border border-emerald-500/30",
          labelKey: "featureWhatsapp",
          hintEs: "Canal oficial WhatsApp Cloud API",
          hintEn: "Official WhatsApp Cloud API channel",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_whatsapp),
        },
        {
          icon: <Mail className="h-4 w-4 text-sky-400" />,
          iconBg: "bg-sky-500/10 border border-sky-500/20",
          labelKey: "featureEmail",
          hintEs: "Recepción y respuesta de correos",
          hintEn: "Inbound and outbound email tickets",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_email),
        },
        {
          icon: <Globe className="h-4 w-4 text-emerald-400" />,
          iconBg: "bg-emerald-500/10 border border-emerald-500/20",
          labelKey: "featureLiveChat",
          hintEs: "Widget de chat en vivo para tu sitio",
          hintEn: "Live chat website embed widget",
          renderValue: (p) => formatBoolean(p.capabilities?.channel_website ?? true),
        },
      ],
    },
    {
      titleKey: "categoryData",
      icon: <Database className="h-4 w-4 text-violet-400" />,
      rows: [
        {
          icon: <HardDrive className="h-4 w-4 text-violet-400" />,
          iconBg: "bg-violet-500/10 border border-violet-500/20",
          labelKey: "featureStorage",
          hintEs: "Almacenamiento total de archivos y medios",
          hintEn: "Total media assets storage quota",
          renderValue: (p, t) => formatStorage(p.limits?.storage_bytes, t),
        },
        {
          icon: <History className="h-4 w-4 text-amber-400" />,
          iconBg: "bg-amber-500/10 border border-amber-500/20",
          labelKey: "featureRetention",
          hintEs: "Historial de mensajes de chat guardados",
          hintEn: "Chat conversation retention window",
          renderValue: (p, t) =>
            formatLimitNumber(p.limits?.chat_retention_days, t, t("days")),
        },
      ],
    },
    {
      titleKey: "categoryAutomation",
      icon: <Cpu className="h-4 w-4 text-yellow-400" />,
      rows: [
        {
          icon: <Zap className="h-4 w-4 text-yellow-400" />,
          iconBg: "bg-yellow-500/10 border border-yellow-500/20",
          labelKey: "featureCannedResponses",
          hintEs: "Plantillas rápidas con atajos de teclado",
          hintEn: "Quick reply macros and shortcuts",
          renderValue: (p) => formatBoolean(p.capabilities?.canned_responses),
        },
        {
          icon: <Bot className="h-4 w-4 text-cyan-400" />,
          iconBg: "bg-cyan-500/10 border border-cyan-500/20",
          labelKey: "featureAutomations",
          hintEs: "Disparadores automáticos de eventos",
          hintEn: "Automated event rules and assignment",
          renderValue: (p) => formatBoolean(p.capabilities?.automations),
        },
        {
          icon: <BookOpen className="h-4 w-4 text-emerald-400" />,
          iconBg: "bg-emerald-500/10 border border-emerald-500/20",
          labelKey: "featureHelpCenter",
          hintEs: "Portal de autoservicio y preguntas frecuentes",
          hintEn: "Public self-service knowledge base",
          renderValue: (p) => formatBoolean(p.capabilities?.help_center),
        },
      ],
    },
    {
      titleKey: "categoryPlatform",
      icon: <Building2 className="h-4 w-4 text-purple-400" />,
      rows: [
        {
          icon: <UserCheck className="h-4 w-4 text-blue-400" />,
          iconBg: "bg-blue-500/10 border border-blue-500/20",
          labelKey: "featureUsers",
          hintEs: "Usuarios con acceso al backoffice de inquilino",
          hintEn: "Tenant admin and supervisor seats",
          renderValue: (p, t) => formatLimitNumber(p.limits?.tenant_users, t),
        },
        {
          icon: <Contact className="h-4 w-4 text-teal-400" />,
          iconBg: "bg-teal-500/10 border border-teal-500/20",
          labelKey: "featureContacts",
          hintEs: "Capacidad de contactos registrados",
          hintEn: "Managed customer contacts quota",
          renderValue: (p, t) => formatLimitNumber(p.limits?.contacts, t),
        },
        {
          icon: <BarChart3 className="h-4 w-4 text-purple-400" />,
          iconBg: "bg-purple-500/10 border border-purple-500/20",
          labelKey: "featureReports",
          hintEs: "Métricas operativas y tiempo de respuesta",
          hintEn: "Operational metrics and response time",
          renderValue: (p) => formatBoolean(p.capabilities?.reports),
        },
        {
          icon: <Webhook className="h-4 w-4 text-rose-400" />,
          iconBg: "bg-rose-500/10 border border-rose-500/20",
          labelKey: "featureApiWebhooks",
          hintEs: "Integración REST y eventos salientes",
          hintEn: "REST API tokens and outbound webhooks",
          renderValue: (p) => formatBoolean(p.capabilities?.api_and_webhooks),
        },
      ],
    },
  ];

  return (
    <div className="mx-auto mt-12 max-w-[1100px] overflow-hidden rounded-3xl border border-stroke/80 bg-[linear-gradient(180deg,rgba(18,18,22,0.92)_0%,rgba(10,10,14,0.98)_100%)] p-4 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/5 backdrop-blur-xl sm:p-6 md:p-8">
      <div className="mb-8 text-center">
        <div className="eyebrow mx-auto mb-2 text-[11px] uppercase tracking-widest text-a1">
          {t("pill")}
        </div>
        <h3 className="font-display text-2xl font-extrabold tracking-tight text-txt md:text-3xl">
          {t("comparisonTitle")}
        </h3>
        <p className="mx-auto mt-2 max-w-[620px] text-xs text-muted sm:text-sm">
          {t("comparisonSubtitle")}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stroke/60 bg-surface/50 scrollbar-thin">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm" role="table">
          <thead>
            <tr className="border-b border-stroke/80 bg-surface2/60">
              {/* Columna 1: Icono */}
              <th
                scope="col"
                className="w-14 py-4 pl-4 text-center text-xs font-semibold text-muted sm:w-16 sm:pl-6"
              >
                <span className="sr-only">Icono</span>
              </th>

              {/* Columna 2: Nombre de la capacidad */}
              <th
                scope="col"
                className="w-[240px] py-4 pr-4 font-semibold text-txt sm:w-[280px]"
              >
                Capacidad O Recurso
              </th>

              {/* Columnas 3...N: Planes */}
              {plans.map((p) => {
                const name = p.name?.[lang] || p.name?.es || p.code;
                const rawPrice =
                  cycle === "annual" && p.priceAnnualCents
                    ? Math.round(p.priceAnnualCents / 12)
                    : p.priceMonthlyCents;
                const formattedPrice =
                  p.currency === "USD"
                    ? `$${Math.round(rawPrice / 100)}`
                    : new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      }).format(Math.round(rawPrice / 100));

                return (
                  <th
                    key={p.id}
                    scope="col"
                    className={`min-w-[160px] px-4 py-4 text-center sm:min-w-[190px] ${
                      p.isPopular ? "relative bg-a1/[0.08]" : ""
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      {p.isPopular && (
                        <span className="rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                          {t("popularBadge")}
                        </span>
                      )}
                      <span className="font-bold text-txt sm:text-base">{name}</span>
                      <div className="text-xs font-semibold text-muted">
                        <span className="text-sm font-extrabold text-txt">{formattedPrice}</span>
                        <span>/{t("perMonth")}</span>
                      </div>
                      <a
                        href={`/${locale}/register?plan_code=${p.code}&cycle=${cycle}`}
                        className={`mt-2 inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                          p.isPopular
                            ? "bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] text-white shadow-md hover:opacity-90"
                            : "border border-stroke bg-surface hover:bg-stroke/40 text-txt"
                        }`}
                      >
                        {t("cta")}
                      </a>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke/40">
            {categories.map((cat, catIdx) => (
              <React.Fragment key={catIdx}>
                {/* Header de categoría */}
                <tr className="border-t border-stroke/80 bg-[linear-gradient(90deg,rgba(34,211,238,0.12)_0%,rgba(47,107,255,0.06)_40%,transparent_100%)]">
                  <th
                    colSpan={plans.length + 2}
                    scope="colgroup"
                    className="py-3 pl-4 pr-4 text-xs font-bold uppercase tracking-wider text-a2 sm:pl-6"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-a2/15 text-a2">
                        {cat.icon}
                      </span>
                      <span>{t(cat.titleKey)}</span>
                    </div>
                  </th>
                </tr>

                {/* Filas de características */}
                {cat.rows.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="transition-colors hover:bg-surface2/50"
                  >
                    {/* Columna 1: Icono con badge */}
                    <td className="w-14 py-3 pl-4 text-center sm:w-16 sm:pl-6">
                      <div
                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ${row.iconBg}`}
                        aria-hidden="true"
                      >
                        {row.icon}
                      </div>
                    </td>

                    {/* Columna 2: Nombre y descripción de la capacidad */}
                    <th
                      scope="row"
                      className="w-[240px] py-3 pr-4 text-left font-medium sm:w-[280px]"
                    >
                      <span className="block text-sm font-semibold text-txt">
                        {t(row.labelKey)}
                      </span>
                      <span className="block text-[11px] text-muted leading-tight mt-0.5">
                        {lang === "en" ? row.hintEn : row.hintEs}
                      </span>
                    </th>

                    {/* Columnas 3...N: Valor por plan */}
                    {plans.map((p) => (
                      <td
                        key={p.id}
                        className={`px-4 py-3 text-center text-xs ${
                          p.isPopular ? "bg-a1/[0.04]" : ""
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
