"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Lock,
  Sparkles,
  Package,
  Users,
  MessageSquare,
  FileText,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import type { Plan } from "@mocter/domain";

interface PlanModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: Plan | null;
  onSuccess?: () => void;
}

type PlanFormTab =
  | "commercial"
  | "catalog"
  | "tenant"
  | "chatwoot"
  | "capabilities"
  | "summary";

interface LimitFieldState {
  mode: "LIMITED" | "UNLIMITED";
  value: number;
}

interface CapabilityItem {
  code: string;
  name: { es: string; en: string };
  description?: { es: string; en: string };
  ownership: string;
  commercialStatus: string;
  providerFlagGroup?: string | null;
  requiresRuntimeReview?: boolean;
}

const MIB_IN_BYTES = 1048576;

const CAPABILITY_FUNCTIONAL_GROUPS: Record<string, { title: string; codes: string[] }> = {
  channels: {
    title: "Canales Y Conexión",
    codes: [
      "channel_whatsapp",
      "channel_email",
      "channel_facebook",
      "channel_instagram",
      "channel_tiktok",
      "channel_website",
      "inbound_emails",
      "email_continuity_on_api_channel",
      "whatsapp_embedded_signup_inbox_creation",
      "whatsapp_manual_transfer",
    ],
  },
  management: {
    title: "Administración Y Colaboración",
    codes: ["agent_management", "inbox_management", "team_management", "assignment_v2"],
  },
  productivity: {
    title: "Productividad Y Automatización",
    codes: [
      "agent_bots",
      "automations",
      "delayed_automations",
      "auto_resolve_conversations",
      "canned_responses",
      "macros",
      "campaigns",
      "voice_recorder",
    ],
  },
  contacts: {
    title: "Contactos Y Datos",
    codes: [
      "crm",
      "crm_integration",
      "custom_attributes",
      "data_import",
      "labels",
      "ip_lookup",
      "companies",
    ],
  },
  integrations: {
    title: "Integraciones",
    codes: [
      "api_and_webhooks",
      "integrations",
      "linear_integration",
      "notion_integration",
      "stripe_integration",
    ],
  },
  branding: {
    title: "Correo Y Personalización",
    codes: [
      "branded_email_templates",
      "custom_reply_domain",
      "custom_reply_email",
    ],
  },
  reporting: {
    title: "Información Y Autoservicio",
    codes: ["reports", "report_rollup", "help_center"],
  },
  special: {
    title: "Opciones Con Tratamiento Especial",
    codes: ["captain_classifier", "captain_tasks", "chatwoot_v4"],
  },
};

function getInitialFormData(plan?: Plan | null) {
  if (!plan) {
    return {
      code: "",
      nameEs: "",
      nameEn: "",
      descriptionEs: "",
      currency: "COP",
      priceMonthlyCop: 149000,
      priceAnnualCop: 1490000,
      annualDiscountPct: 20,
      cycleMonthly: true,
      cycleAnnual: true,
      trialDays: 14,
      isPublic: true,
      isPopular: false,
      status: "active",
      featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
    };
  }

  const pName = plan.name as { es?: string; en?: string } | null;
  const pDesc = plan.description as { es?: string; en?: string } | null;
  const pFeat = plan.marketingFeatures as { es?: string[]; en?: string[] } | null;
  const cycles = Array.isArray(plan.billingCycles) ? plan.billingCycles : ["monthly", "annual"];

  return {
    code: plan.code,
    nameEs: pName?.es || "",
    nameEn: pName?.en || "",
    descriptionEs: pDesc?.es || "",
    currency: plan.currency || "COP",
    priceMonthlyCop: Math.round(Number(plan.priceMonthlyCents || 0) / 100),
    priceAnnualCop: Math.round(Number(plan.priceAnnualCents || 0) / 100),
    annualDiscountPct: computeAnnualDiscount(
      Math.round(Number(plan.priceMonthlyCents || 0) / 100),
      Math.round(Number(plan.priceAnnualCents || 0) / 100)
    ) || 20,
    cycleMonthly: cycles.includes("monthly"),
    cycleAnnual: cycles.includes("annual"),
    trialDays: plan.trialDays ?? 14,
    isPublic: Boolean(plan.isPublic),
    isPopular: Boolean(plan.isPopular),
    status: plan.status || "active",
    featuresRaw: (pFeat?.es || []).join(", "),
  };
}

/**
 * Contenido interno del modal de planes con estado autónomo por instancia.
 */
function PlanModalDialogContent({
  onClose,
  plan,
  onSuccess,
}: Omit<PlanModalDialogProps, "isOpen">) {
  const router = useRouter();
  const isEdit = Boolean(plan);

  const [activeTab, setActiveTab] = useState<PlanFormTab>("commercial");
  const [loading, setLoading] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(Boolean(plan?.id));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Pestaña 1: Información comercial
  const [formData, setFormData] = useState(() => getInitialFormData(plan));

  // Pestaña 2: Catálogo y archivos
  const [catalogLimits, setCatalogLimits] = useState<Record<string, LimitFieldState>>({
    products: { mode: "LIMITED", value: 500 },
    images_per_product: { mode: "LIMITED", value: 10 },
    videos_per_product: { mode: "LIMITED", value: 0 },
    pdfs_per_product: { mode: "LIMITED", value: 2 },
  });

  // Pestaña 3: Recursos del inquilino
  const [tenantLimits, setTenantLimits] = useState<Record<string, LimitFieldState>>({
    contacts: { mode: "UNLIMITED", value: 1000 },
    tenant_users: { mode: "LIMITED", value: 5 },
    storage_bytes: { mode: "LIMITED", value: 500 }, // MB
    chat_retention_days: { mode: "LIMITED", value: 30 },
  });

  // Pestaña 4: Atención y canales
  const [chatwootEnabled, setChatwootEnabled] = useState(false);
  const [chatwootLimits, setChatwootLimits] = useState<Record<string, LimitFieldState>>({
    chatwoot_agents: { mode: "LIMITED", value: 2 },
    chatwoot_inboxes: { mode: "LIMITED", value: 5 },
    chatwoot_outbound_emails: { mode: "UNLIMITED", value: 1000 },
  });

  // Pestaña 5: Capacidades opcionales
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [capabilityCatalog, setCapabilityCatalog] = useState<CapabilityItem[]>([]);
  const [capSearchTerm, setCapSearchTerm] = useState("");
  const [capFilter, setCapFilter] = useState<"all" | "enabled" | "disabled">("all");

  useEffect(() => {
    let isCancelled = false;

    // Cargar catálogo de capacidades
    fetch("/api/admin/plans?capabilities=true")
      .then((res) => res.json())
      .then((json) => {
        if (!isCancelled && json.ok && Array.isArray(json.data)) {
          setCapabilityCatalog(json.data);
        }
      })
      .catch(() => {});

    // En modo edición, consultar detalle integral con límites y capacidades
    if (plan?.id) {
      fetch(`/api/admin/plans?id=${plan.id}`)
        .then((res) => res.json())
        .then((json) => {
          if (isCancelled) return;
          if (json.ok && json.data) {
            const data = json.data;
            if (data.limits) {
              setCatalogLimits({
                products: {
                  mode: data.limits.products?.mode || "LIMITED",
                  value: data.limits.products?.value ?? 500,
                },
                images_per_product: {
                  mode: data.limits.images_per_product?.mode || "LIMITED",
                  value: data.limits.images_per_product?.value ?? 10,
                },
                videos_per_product: {
                  mode: data.limits.videos_per_product?.mode || "LIMITED",
                  value: data.limits.videos_per_product?.value ?? 0,
                },
                pdfs_per_product: {
                  mode: data.limits.pdfs_per_product?.mode || "LIMITED",
                  value: data.limits.pdfs_per_product?.value ?? 2,
                },
              });

              setTenantLimits({
                contacts: {
                  mode: data.limits.contacts?.mode || "UNLIMITED",
                  value: data.limits.contacts?.value ?? 1000,
                },
                tenant_users: {
                  mode: data.limits.tenant_users?.mode || "LIMITED",
                  value: data.limits.tenant_users?.value ?? 5,
                },
                storage_bytes: {
                  mode: data.limits.storage_bytes?.mode || "LIMITED",
                  value: Math.round((data.limits.storage_bytes?.value ?? MIB_IN_BYTES * 500) / MIB_IN_BYTES),
                },
                chat_retention_days: {
                  mode: data.limits.chat_retention_days?.mode || "LIMITED",
                  value: data.limits.chat_retention_days?.value ?? 30,
                },
              });

              setChatwootLimits({
                chatwoot_agents: {
                  mode: data.limits.chatwoot_agents?.mode || "LIMITED",
                  value: data.limits.chatwoot_agents?.value ?? 2,
                },
                chatwoot_inboxes: {
                  mode: data.limits.chatwoot_inboxes?.mode || "LIMITED",
                  value: data.limits.chatwoot_inboxes?.value ?? 5,
                },
                chatwoot_outbound_emails: {
                  mode: data.limits.chatwoot_outbound_emails?.mode || "UNLIMITED",
                  value: data.limits.chatwoot_outbound_emails?.value ?? 1000,
                },
              });
            }

            if (data.capabilities) {
              setCapabilities(data.capabilities);
            }
            if (data.chatwootEnabled !== undefined) {
              setChatwootEnabled(Boolean(data.chatwootEnabled));
            }
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setFetchingDetails(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [plan?.id]);

  function handleToggleCapability(code: string) {
    if (code === "captain_classifier" || code === "chatwoot_v4" || code === "captain_tasks") {
      return;
    }
    setCapabilities((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  }

  const selectedCapabilitiesCount = Object.values(capabilities).filter(Boolean).length;

  async function handleSubmit(e?: React.FormEvent | React.MouseEvent) {
    if (e) {
      e.preventDefault();
    }
    // Salvaguarda: el formulario solo puede confirmarse en la pestaña de resumen
    if (activeTab !== "summary") {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const features = formData.featuresRaw
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      const billingCycles = [
        formData.cycleMonthly ? "monthly" : null,
        formData.cycleAnnual ? "annual" : null,
      ].filter(Boolean);

      if (billingCycles.length === 0) {
        throw new Error("Debes habilitar al menos un ciclo de facturación (mensual o anual)");
      }

      const payloadLimits: Record<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }> = {
        products: {
          mode: catalogLimits.products.mode,
          value: catalogLimits.products.mode === "UNLIMITED" ? null : Number(catalogLimits.products.value),
        },
        images_per_product: {
          mode: catalogLimits.images_per_product.mode,
          value:
            catalogLimits.images_per_product.mode === "UNLIMITED"
              ? null
              : Number(catalogLimits.images_per_product.value),
        },
        videos_per_product: {
          mode: catalogLimits.videos_per_product.mode,
          value:
            catalogLimits.videos_per_product.mode === "UNLIMITED"
              ? null
              : Number(catalogLimits.videos_per_product.value),
        },
        pdfs_per_product: {
          mode: catalogLimits.pdfs_per_product.mode,
          value:
            catalogLimits.pdfs_per_product.mode === "UNLIMITED"
              ? null
              : Number(catalogLimits.pdfs_per_product.value),
        },
        contacts: {
          mode: tenantLimits.contacts.mode,
          value: tenantLimits.contacts.mode === "UNLIMITED" ? null : Number(tenantLimits.contacts.value),
        },
        tenant_users: {
          mode: tenantLimits.tenant_users.mode,
          value: tenantLimits.tenant_users.mode === "UNLIMITED" ? null : Number(tenantLimits.tenant_users.value),
        },
        storage_bytes: {
          mode: tenantLimits.storage_bytes.mode,
          value:
            tenantLimits.storage_bytes.mode === "UNLIMITED"
              ? null
              : Number(tenantLimits.storage_bytes.value) * MIB_IN_BYTES,
        },
        chat_retention_days: {
          mode: tenantLimits.chat_retention_days.mode,
          value:
            tenantLimits.chat_retention_days.mode === "UNLIMITED"
              ? null
              : Number(tenantLimits.chat_retention_days.value),
        },
        chatwoot_agents: {
          mode: chatwootLimits.chatwoot_agents.mode,
          value:
            chatwootLimits.chatwoot_agents.mode === "UNLIMITED"
              ? null
              : Number(chatwootLimits.chatwoot_agents.value),
        },
        chatwoot_inboxes: {
          mode: chatwootLimits.chatwoot_inboxes.mode,
          value:
            chatwootLimits.chatwoot_inboxes.mode === "UNLIMITED"
              ? null
              : Number(chatwootLimits.chatwoot_inboxes.value),
        },
        chatwoot_outbound_emails: {
          mode: chatwootLimits.chatwoot_outbound_emails.mode,
          value:
            chatwootLimits.chatwoot_outbound_emails.mode === "UNLIMITED"
              ? null
              : Number(chatwootLimits.chatwoot_outbound_emails.value),
        },
      };

      const payload = {
        id: plan?.id,
        code: formData.code,
        nameEs: formData.nameEs,
        nameEn: formData.nameEn || formData.nameEs,
        descriptionEs: formData.descriptionEs,
        currency: formData.currency,
        priceMonthlyCop: Number(formData.priceMonthlyCop),
        priceAnnualCop: Number(formData.priceAnnualCop),
        billingCycles,
        trialDays: Number(formData.trialDays),
        isPublic: formData.isPublic,
        isPopular: formData.isPopular,
        status: formData.status,
        marketingFeaturesEs: features,
        limits: payloadLimits,
        capabilities,
        chatwootEnabled,
      };

      const method = isEdit ? "PUT" : "POST";
      const res = await fetch("/api/admin/plans", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar la configuración del plan");
      }

      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
        router.refresh();
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const filteredCapabilities = capabilityCatalog.filter((item) => {
    const isSelected = Boolean(capabilities[item.code]);
    if (capFilter === "enabled" && !isSelected) return false;
    if (capFilter === "disabled" && isSelected) return false;

    if (capSearchTerm.trim()) {
      const q = capSearchTerm.toLowerCase();
      const nameMatch = (item.name?.es || "").toLowerCase().includes(q);
      const codeMatch = item.code.toLowerCase().includes(q);
      const descMatch = (item.description?.es || "").toLowerCase().includes(q);
      return nameMatch || codeMatch || descMatch;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl my-8 flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--dsn-text)]">
                {isEdit ? "Editar Plan Comercial" : "Registrar Nuevo Plan Comercial"}
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Configuración integral de condiciones comerciales, cuotas finitas/ilimitadas y capacidades
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de pestañas (S6) */}
        <div className="flex items-center gap-1 overflow-x-auto py-3 border-b border-[var(--dsn-border)] shrink-0 no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("commercial")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "commercial"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>1. Información Comercial</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "catalog"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>2. Catálogo Y Archivos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tenant")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "tenant"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>3. Recursos Del Inquilino</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("chatwoot")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "chatwoot"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>4. Atención Y Canales</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("capabilities")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "capabilities"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>5. Capacidades Opcionales</span>
            {selectedCapabilitiesCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-semibold">
                {selectedCapabilitiesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              activeTab === "summary"
                ? "bg-[var(--dsn-accent)] text-white shadow-sm"
                : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>6. Resumen</span>
          </button>
        </div>

        {/* Mensajes de error o éxito */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-xs text-rose-800 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isEdit
                ? "Plan comercial y condiciones actualizadas exitosamente."
                : "Plan comercial registrado exitosamente."}
            </span>
          </div>
        )}

        {fetchingDetails && (
          <div className="flex items-center justify-center p-8 text-xs text-[var(--dsn-text-secondary)] gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--dsn-accent)]" />
            <span>Cargando detalle del plan comercial...</span>
          </div>
        )}

        {/* Contenedor scrolleable del formulario */}
        {!fetchingDetails && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (activeTab === "summary") {
                handleSubmit(e);
              }
            }}
            className="flex-1 overflow-y-auto py-4 space-y-6"
          >
            {/* PESTAÑA 1: Información Comercial */}
            {activeTab === "commercial" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="plan-code" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Código Identificador Slug
                    </label>
                    <div className="relative">
                      <input
                        id="plan-code"
                        type="text"
                        required
                        disabled={isEdit}
                        placeholder="ej. custom-enterprise-vip"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className={`w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono ${
                          isEdit ? "opacity-60 cursor-not-allowed pr-8" : ""
                        }`}
                      />
                      {isEdit && <Lock className="absolute right-2.5 top-3.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="plan-currency" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Moneda De Facturación
                    </label>
                    <select
                      id="plan-currency"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                    >
                      <option value="COP">COP · Peso Colombiano</option>
                      <option value="USD">USD · Dólar Estadounidense</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="plan-name-es" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Nombre Del Plan (Español)
                    </label>
                    <input
                      id="plan-name-es"
                      type="text"
                      required
                      placeholder="ej. Crecimiento"
                      value={formData.nameEs}
                      onChange={(e) => setFormData({ ...formData, nameEs: e.target.value })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="plan-name-en" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Nombre Del Plan (Inglés)
                    </label>
                    <input
                      id="plan-name-en"
                      type="text"
                      placeholder="ej. Growth"
                      value={formData.nameEn}
                      onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="plan-desc-es" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Descripción Comercial
                  </label>
                  <textarea
                    id="plan-desc-es"
                    rows={2}
                    placeholder="Descripción comercial para la landing page o propuesta..."
                    value={formData.descriptionEs}
                    onChange={(e) => setFormData({ ...formData, descriptionEs: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 space-y-4">
                  <h3 className="text-xs font-semibold text-[var(--dsn-text)]">
                    Precios Y Ciclos Habilitados
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="plan-price-monthly" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Precio Ciclo Mensual ({formData.currency})
                      </label>
                      <input
                        id="plan-price-monthly"
                        type="number"
                        min="0"
                        step="1000"
                        required
                        value={formData.priceMonthlyCop}
                        onChange={(e) => setFormData({ ...formData, priceMonthlyCop: Number(e.target.value) })}
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label htmlFor="plan-price-annual" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Precio Ciclo Anual ({formData.currency})
                      </label>
                      <input
                        id="plan-price-annual"
                        type="number"
                        min="0"
                        step="1000"
                        required
                        value={formData.priceAnnualCop}
                        onChange={(e) => setFormData({ ...formData, priceAnnualCop: Number(e.target.value) })}
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6 pt-2">
                    <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.cycleMonthly}
                        onChange={(e) => setFormData({ ...formData, cycleMonthly: e.target.checked })}
                        className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                      />
                      <span>Habilitar Ciclo Mensual</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.cycleAnnual}
                        onChange={(e) => setFormData({ ...formData, cycleAnnual: e.target.checked })}
                        className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                      />
                      <span>Habilitar Ciclo Anual</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="plan-trial" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Días De Prueba Gratuita
                    </label>
                    <input
                      id="plan-trial"
                      type="number"
                      min="0"
                      value={formData.trialDays}
                      onChange={(e) => setFormData({ ...formData, trialDays: Number(e.target.value) })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="plan-status" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Estado Del Plan
                    </label>
                    <select
                      id="plan-status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    >
                      <option value="active">Activo (Disponible Para Asignar)</option>
                      <option value="draft">Borrador (Oculto)</option>
                      <option value="retired">Retirado (Solo Clientes Existentes)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                      className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                    />
                    <span>Público En Landing Page</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPopular}
                      onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                      className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                    />
                    <span>Destacar Como Popular</span>
                  </label>
                </div>

                <div>
                  <label htmlFor="plan-features" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Características De Marketing (Separadas Por Coma)
                  </label>
                  <textarea
                    id="plan-features"
                    rows={2}
                    value={formData.featuresRaw}
                    onChange={(e) => setFormData({ ...formData, featuresRaw: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                  <p className="text-[10px] text-[var(--dsn-text-secondary)] mt-1">
                    Las características de marketing son descriptivas y no sustituyen los límites estructurados del plan.
                  </p>
                </div>
              </div>
            )}

            {/* PESTAÑA 2: Catálogo Y Archivos */}
            {activeTab === "catalog" && (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Configura cuotas finitas o marca como ilimitado. Cuota 0 prohíbe operaciones del recurso y nunca equivale a ilimitado.
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Productos */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Total De Productos</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catalogLimits.products.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              products: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : catalogLimits.products.value || 500,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.products.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-products" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Cantidad Máxima De Productos
                        </label>
                        <input
                          id="limit-products"
                          type="number"
                          min="0"
                          value={catalogLimits.products.value}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              products: { ...catalogLimits.products, value: Number(e.target.value) },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Sin Límite Comercial De Productos
                      </div>
                    )}
                  </div>

                  {/* Imágenes por producto */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Imágenes Por Producto</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catalogLimits.images_per_product.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              images_per_product: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : catalogLimits.images_per_product.value || 10,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.images_per_product.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-images" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Imágenes Asociadas
                        </label>
                        <input
                          id="limit-images"
                          type="number"
                          min="0"
                          value={catalogLimits.images_per_product.value}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              images_per_product: {
                                ...catalogLimits.images_per_product,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Imágenes Ilimitadas Por Producto
                      </div>
                    )}
                  </div>

                  {/* Videos por producto */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Videos Por Producto</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catalogLimits.videos_per_product.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              videos_per_product: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : catalogLimits.videos_per_product.value || 1,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.videos_per_product.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-videos" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Videos (0 = Sin Videos)
                        </label>
                        <input
                          id="limit-videos"
                          type="number"
                          min="0"
                          value={catalogLimits.videos_per_product.value}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              videos_per_product: {
                                ...catalogLimits.videos_per_product,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Videos Ilimitados Por Producto
                      </div>
                    )}
                  </div>

                  {/* Archivos PDF por producto */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Archivos PDF Por Producto</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catalogLimits.pdfs_per_product.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              pdfs_per_product: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : catalogLimits.pdfs_per_product.value || 2,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.pdfs_per_product.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-pdfs" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Documentos PDF
                        </label>
                        <input
                          id="limit-pdfs"
                          type="number"
                          min="0"
                          value={catalogLimits.pdfs_per_product.value}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              pdfs_per_product: {
                                ...catalogLimits.pdfs_per_product,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Documentos PDF Ilimitados
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: Recursos Del Inquilino */}
            {activeTab === "tenant" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Contactos */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Total De Contactos</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tenantLimits.contacts.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              contacts: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : tenantLimits.contacts.value || 1000,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.contacts.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-contacts" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Contactos Únicos
                        </label>
                        <input
                          id="limit-contacts"
                          type="number"
                          min="0"
                          value={tenantLimits.contacts.value}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              contacts: { ...tenantLimits.contacts, value: Number(e.target.value) },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Contactos Ilimitados
                      </div>
                    )}
                  </div>

                  {/* Usuarios */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Usuarios Del Inquilino</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tenantLimits.tenant_users.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              tenant_users: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : tenantLimits.tenant_users.value || 5,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.tenant_users.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-users" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Miembros Con Acceso
                        </label>
                        <input
                          id="limit-users"
                          type="number"
                          min="1"
                          value={tenantLimits.tenant_users.value}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              tenant_users: {
                                ...tenantLimits.tenant_users,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Usuarios Ilimitados
                      </div>
                    )}
                  </div>

                  {/* Almacenamiento */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Almacenamiento (MB)</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tenantLimits.storage_bytes.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              storage_bytes: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : tenantLimits.storage_bytes.value || 500,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.storage_bytes.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-storage" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Capacidad En MB
                        </label>
                        <input
                          id="limit-storage"
                          type="number"
                          min="1"
                          value={tenantLimits.storage_bytes.value}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              storage_bytes: {
                                ...tenantLimits.storage_bytes,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Almacenamiento Ilimitado
                      </div>
                    )}
                  </div>

                  {/* Retención De Conversaciones */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Retención De Conversaciones (Días)</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tenantLimits.chat_retention_days.mode === "UNLIMITED"}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              chat_retention_days: {
                                mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                value: e.target.checked ? 0 : tenantLimits.chat_retention_days.value || 30,
                              },
                            })
                          }
                          className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.chat_retention_days.mode === "LIMITED" ? (
                      <div>
                        <label htmlFor="limit-chat-retention" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Días De Retención (Mínimo 30)
                        </label>
                        <input
                          id="limit-chat-retention"
                          type="number"
                          min="30"
                          value={tenantLimits.chat_retention_days.value}
                          onChange={(e) =>
                            setTenantLimits({
                              ...tenantLimits,
                              chat_retention_days: {
                                ...tenantLimits.chat_retention_days,
                                value: Math.max(0, Number(e.target.value)),
                              },
                            })
                          }
                          className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                        />
                        <p className="mt-1 text-[10px] text-[var(--dsn-text-muted)]">
                          Normativa legal: mínimo 30 días de conservación de mensajes.
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Retención Ilimitada
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 4: Atención Y Canales */}
            {activeTab === "chatwoot" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[var(--dsn-text)]">
                      Habilitar Atención Integrada
                    </span>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      Aprovisiona y sincroniza automáticamente una cuenta de atención omnicanal para el inquilino.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chatwootEnabled}
                      onChange={(e) => setChatwootEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[var(--dsn-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--dsn-accent)]"></div>
                  </label>
                </div>

                {chatwootEnabled && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Chatwoot Community v4.19.1 no bloquea envíos por cuota de correo saliente ni restringe agentes o bandejas en la edición libre. Los valores se parametrizan en el proveedor como referencia comercial.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {/* Agentes */}
                      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--dsn-text)]">Agentes De Atención</span>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chatwootLimits.chatwoot_agents.mode === "UNLIMITED"}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_agents: {
                                    mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                    value: e.target.checked ? 0 : chatwootLimits.chatwoot_agents.value || 2,
                                  },
                                })
                              }
                              className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_agents.mode === "LIMITED" ? (
                          <div>
                            <label htmlFor="limit-agents" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Operadores Humanos
                            </label>
                            <input
                              id="limit-agents"
                              type="number"
                              min="1"
                              value={chatwootLimits.chatwoot_agents.value}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_agents: {
                                    ...chatwootLimits.chatwoot_agents,
                                    value: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                            />
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                            Agentes Ilimitados
                          </div>
                        )}
                      </div>

                      {/* Bandejas */}
                      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--dsn-text)]">Bandejas De Entrada</span>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chatwootLimits.chatwoot_inboxes.mode === "UNLIMITED"}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_inboxes: {
                                    mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                    value: e.target.checked ? 0 : chatwootLimits.chatwoot_inboxes.value || 5,
                                  },
                                })
                              }
                              className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_inboxes.mode === "LIMITED" ? (
                          <div>
                            <label htmlFor="limit-inboxes" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Total De Bandejas
                            </label>
                            <input
                              id="limit-inboxes"
                              type="number"
                              min="1"
                              value={chatwootLimits.chatwoot_inboxes.value}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_inboxes: {
                                    ...chatwootLimits.chatwoot_inboxes,
                                    value: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                            />
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                            Bandejas Ilimitadas
                          </div>
                        )}
                      </div>

                      {/* Correos Salientes */}
                      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--dsn-text)]">Correos Salientes</span>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chatwootLimits.chatwoot_outbound_emails.mode === "UNLIMITED"}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_outbound_emails: {
                                    mode: e.target.checked ? "UNLIMITED" : "LIMITED",
                                    value: e.target.checked ? 0 : chatwootLimits.chatwoot_outbound_emails.value || 1000,
                                  },
                                })
                              }
                              className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_outbound_emails.mode === "LIMITED" ? (
                          <div>
                            <label htmlFor="limit-emails" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Cuota De Correos
                            </label>
                            <input
                              id="limit-emails"
                              type="number"
                              min="0"
                              value={chatwootLimits.chatwoot_outbound_emails.value}
                              onChange={(e) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_outbound_emails: {
                                    ...chatwootLimits.chatwoot_outbound_emails,
                                    value: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] font-mono"
                            />
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                            Correos Salientes Ilimitados
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 5: Capacidades Opcionales */}
            {activeTab === "capabilities" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-[var(--dsn-border)]">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                    <input
                      type="text"
                      placeholder="Buscar capacidades por nombre o código..."
                      value={capSearchTerm}
                      onChange={(e) => setCapSearchTerm(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
                    <select
                      value={capFilter}
                      onChange={(e) => setCapFilter(e.target.value as "all" | "enabled" | "disabled")}
                      className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:outline-none"
                    >
                      <option value="all">Todas ({capabilityCatalog.length})</option>
                      <option value="enabled">Habilitadas ({selectedCapabilitiesCount})</option>
                      <option value="disabled">Deshabilitadas ({capabilityCatalog.length - selectedCapabilitiesCount})</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-5">
                  {Object.entries(CAPABILITY_FUNCTIONAL_GROUPS).map(([groupKey, group]) => {
                    const groupItems = filteredCapabilities.filter((c) => group.codes.includes(c.code));
                    if (groupItems.length === 0) return null;

                    return (
                      <div key={groupKey} className="space-y-2">
                        <h4 className="text-xs font-semibold text-[var(--dsn-text)] px-1">
                          {group.title}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {groupItems.map((item) => {
                            const isEnabled = Boolean(capabilities[item.code]);
                            const isSpecial =
                              item.code === "captain_classifier" ||
                              item.code === "chatwoot_v4" ||
                              item.code === "captain_tasks";

                            return (
                              <div
                                key={item.code}
                                onClick={() => !isSpecial && handleToggleCapability(item.code)}
                                className={`rounded-xl border p-3 flex items-start justify-between gap-3 transition-colors ${
                                  isSpecial
                                    ? "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 opacity-60 cursor-not-allowed"
                                    : isEnabled
                                    ? "border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/5 cursor-pointer"
                                    : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 hover:border-[var(--dsn-border-hover)] cursor-pointer"
                                }`}
                              >
                                <div className="space-y-1 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-[var(--dsn-text)]">
                                      {item.name?.es || item.code}
                                    </span>
                                    {item.ownership === "mocter" && (
                                      <span className="rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 text-[10px] font-semibold">
                                        Mocter
                                      </span>
                                    )}
                                    {isSpecial && (
                                      <span className="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 text-[10px] font-semibold">
                                        Restringida
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[var(--dsn-text-secondary)] line-clamp-2">
                                    {item.description?.es || item.code}
                                  </p>
                                  {item.code === "captain_classifier" && (
                                    <p className="text-[10px] text-rose-500 font-medium">
                                      No disponible en la edición o versión instalada.
                                    </p>
                                  )}
                                  {item.code === "chatwoot_v4" && (
                                    <p className="text-[10px] text-amber-500 font-medium">
                                      Configuración técnica de instalación, no beneficio comercial.
                                    </p>
                                  )}
                                  {item.code === "captain_tasks" && (
                                    <p className="text-[10px] text-amber-500 font-medium">
                                      Pendiente de validación funcional en Community.
                                    </p>
                                  )}
                                </div>

                                <input
                                  type="checkbox"
                                  disabled={isSpecial}
                                  checked={isEnabled}
                                  onChange={() => {}}
                                  className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] mt-0.5"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PESTAÑA 6: Resumen */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Resumen Comercial */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-2 text-xs">
                    <h4 className="font-semibold text-[var(--dsn-text)] pb-1 border-b border-[var(--dsn-border)]">
                      Condiciones Comerciales
                    </h4>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Slug:</span>
                      <span className="font-mono text-[var(--dsn-text)]">{formData.code || "(Pendiente)"}</span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Nombre:</span>
                      <span className="text-[var(--dsn-text)]">{formData.nameEs || "(Sin nombre)"}</span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Precios:</span>
                      <span className="font-mono text-[var(--dsn-text)]">
                        {formData.priceMonthlyCop.toLocaleString()} {formData.currency} / mes
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Días De Prueba:</span>
                      <span className="text-[var(--dsn-text)]">{formData.trialDays} días</span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Estado:</span>
                      <span className="capitalize text-[var(--dsn-text)]">{formData.status}</span>
                    </div>
                  </div>

                  {/* Resumen Cuotas */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-2 text-xs">
                    <h4 className="font-semibold text-[var(--dsn-text)] pb-1 border-b border-[var(--dsn-border)]">
                      Límites De Catálogo Y Recursos
                    </h4>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Productos:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {catalogLimits.products.mode === "UNLIMITED" ? "Ilimitado" : catalogLimits.products.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Imágenes / Producto:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {catalogLimits.images_per_product.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : catalogLimits.images_per_product.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Contactos:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {tenantLimits.contacts.mode === "UNLIMITED" ? "Ilimitado" : tenantLimits.contacts.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Usuarios:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {tenantLimits.tenant_users.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : tenantLimits.tenant_users.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Almacenamiento:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {tenantLimits.storage_bytes.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : `${tenantLimits.storage_bytes.value} MB`}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Retención de conversaciones:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {tenantLimits.chat_retention_days.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : `${tenantLimits.chat_retention_days.value} Días`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resumen Atención */}
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-2 text-xs">
                  <h4 className="font-semibold text-[var(--dsn-text)] pb-1 border-b border-[var(--dsn-border)]">
                    Atención Integrada Y Capacidades
                  </h4>
                  <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                    <span>Atención Integrada:</span>
                    <span className="font-medium text-[var(--dsn-text)]">
                      {chatwootEnabled ? "Habilitada (Aprovisiona Cuenta)" : "Deshabilitada"}
                    </span>
                  </div>
                  {chatwootEnabled && (
                    <>
                      <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                        <span>Agentes De Atención:</span>
                        <span className="font-medium text-[var(--dsn-text)]">
                          {chatwootLimits.chatwoot_agents.mode === "UNLIMITED"
                            ? "Ilimitado"
                            : chatwootLimits.chatwoot_agents.value}
                        </span>
                      </div>
                      <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                        <span>Bandejas De Entrada:</span>
                        <span className="font-medium text-[var(--dsn-text)]">
                          {chatwootLimits.chatwoot_inboxes.mode === "UNLIMITED"
                            ? "Ilimitado"
                            : chatwootLimits.chatwoot_inboxes.value}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="pt-2">
                    <span className="text-[var(--dsn-text-secondary)] block mb-1.5">
                      Capacidades Opcionales Seleccionadas ({selectedCapabilitiesCount}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCapabilitiesCount === 0 ? (
                        <span className="text-[11px] text-[var(--dsn-text-secondary)] italic">
                          Ninguna capacidad adicional seleccionada (deshabilitadas por defecto).
                        </span>
                      ) : (
                        Object.entries(capabilities)
                          .filter(([, v]) => v)
                          .map(([code]) => {
                            const cap = capabilityCatalog.find((c) => c.code === code);
                            return (
                              <span
                                key={code}
                                className="rounded-md bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] px-2 py-0.5 text-[11px] font-medium"
                              >
                                {cap?.name?.es || code}
                              </span>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Botones de navegación y acción */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--dsn-border)]">
              <div>
                {activeTab !== "commercial" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === "summary") setActiveTab("capabilities");
                      else if (activeTab === "capabilities") setActiveTab("chatwoot");
                      else if (activeTab === "chatwoot") setActiveTab("tenant");
                      else if (activeTab === "tenant") setActiveTab("catalog");
                      else if (activeTab === "catalog") setActiveTab("commercial");
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--dsn-border)] text-xs text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)] transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {activeTab !== "summary" ? (
                  <button
                    key="wizard-next-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (activeTab === "commercial") setActiveTab("catalog");
                      else if (activeTab === "catalog") setActiveTab("tenant");
                      else if (activeTab === "tenant") setActiveTab("chatwoot");
                      else if (activeTab === "chatwoot") setActiveTab("capabilities");
                      else if (activeTab === "capabilities") setActiveTab("summary");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--dsn-surface-secondary)] text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-border)] transition-colors"
                  >
                    <span>Siguiente</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    key="wizard-submit-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmit(e);
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Guardando Plan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isEdit ? "Actualizar Plan Comercial" : "Guardar Plan Comercial"}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Diálogo modal estandarizado para la creación y edición de planes comerciales y VIP (BILL-001, ADM-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8 y §4.15:
 * - Todos los labels y encabezados están en formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 * - Comportamiento modal accesible con overlay, backdrop-blur y gestión de foco.
 */
export function PlanModalDialog({
  isOpen,
  onClose,
  plan,
  onSuccess,
}: PlanModalDialogProps) {
  if (!isOpen) return null;

  return (
    <PlanModalDialogContent
      key={plan?.id ?? "new"}
      onClose={onClose}
      plan={plan}
      onSuccess={onSuccess}
    />
  );
}
