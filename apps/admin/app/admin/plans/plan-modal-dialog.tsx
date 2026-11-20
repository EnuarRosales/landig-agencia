"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Switch,
  Textarea,
} from "@mocter/ui";

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
    title: "Canales y Conexión",
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
    title: "Administración y Colaboración",
    codes: ["agent_management", "inbox_management", "team_management", "assignment_v2"],
  },
  productivity: {
    title: "Productividad y Automatización",
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
    title: "Contactos y Datos",
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
    title: "Correo y Personalización",
    codes: [
      "branded_email_templates",
      "custom_reply_domain",
      "custom_reply_email",
    ],
  },
  reporting: {
    title: "Información y Autoservicio",
    codes: ["reports", "report_rollup", "help_center"],
  },
  special: {
    title: "Opciones con Tratamiento Especial",
    codes: ["captain_classifier", "captain_tasks", "chatwoot_v4"],
  },
};

function computeAnnualDiscount(monthly: number, annual: number): number {
  if (!monthly || monthly <= 0 || !annual || annual <= 0) return 20;
  const full = monthly * 12;
  const pct = Math.round(((full - annual) / full) * 100);
  return pct > 0 && pct < 100 ? pct : 20;
}

function getInitialFormData(plan?: Plan | null) {
  if (!plan) {
    return {
      code: "",
      nameEs: "",
      nameEn: "",
      descriptionEs: "",
      descriptionEn: "",
      currency: "COP",
      priceMonthlyCop: 149000,
      priceAnnualCop: 1430400,
      priceMonthlyUsd: 39,
      priceAnnualUsd: 374,
      annualDiscountPct: 20,
      cycleMonthly: true,
      cycleAnnual: true,
      trialDays: 14,
      isPublic: true,
      isPopular: false,
      status: "active",
      featuresRaw: "Atención con IA, Canal WhatsApp Cloud, Soporte estándar",
      featuresEnRaw: "AI-powered assistance, WhatsApp Cloud channel, Standard support",
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
    descriptionEn: pDesc?.en || "",
    currency: plan.currency || "COP",
    priceMonthlyCop: Math.round(Number(plan.priceMonthlyCents || 0) / 100),
    priceAnnualCop: Math.round(Number(plan.priceAnnualCents || 0) / 100),
    priceMonthlyUsd: Number(Number(plan.priceMonthlyUsdCents || 0) / 100),
    priceAnnualUsd: Number(Number(plan.priceAnnualUsdCents || 0) / 100),
    annualDiscountPct: computeAnnualDiscount(
      Math.round(Number(plan.priceMonthlyCents || 0) / 100),
      Math.round(Number(plan.priceAnnualCents || 0) / 100)
    ),
    cycleMonthly: cycles.includes("monthly"),
    cycleAnnual: cycles.includes("annual"),
    trialDays: plan.trialDays ?? 14,
    isPublic: Boolean(plan.isPublic),
    isPopular: Boolean(plan.isPopular),
    status: plan.status || "active",
    featuresRaw: (pFeat?.es || []).join(", "),
    featuresEnRaw: (pFeat?.en || []).join(", "),
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
    audios_per_product: { mode: "LIMITED", value: 0 },
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
  const [whiteLabelMode, setWhiteLabelMode] = useState<"none" | "paleta" | "completa">("none");
  const [communityFeedEnabled, setCommunityFeedEnabled] = useState(true);
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
                audios_per_product: {
                  mode: data.limits.audios_per_product?.mode || "LIMITED",
                  value: data.limits.audios_per_product?.value ?? 0,
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
            if (data.whiteLabelMode === "paleta" || data.whiteLabelMode === "completa" || data.whiteLabelMode === "none") {
              setWhiteLabelMode(data.whiteLabelMode);
            }
            if (data.chatwootEnabled !== undefined) {
              setChatwootEnabled(Boolean(data.chatwootEnabled));
            }
            if (data.communityFeedEnabled !== undefined) {
              setCommunityFeedEnabled(Boolean(data.communityFeedEnabled));
            }
            if (data.name) {
              const pName = data.name as { es?: string; en?: string } | null;
              const pDesc = data.description as { es?: string; en?: string } | null;
              const pFeat = data.marketingFeatures as { es?: string[]; en?: string[] } | null;
              const monthly = Math.round(Number(data.priceMonthlyCents || 0) / 100);
              const annual = Math.round(Number(data.priceAnnualCents || 0) / 100);
              const monthlyUsd = Number(Number(data.priceMonthlyUsdCents || 0) / 100);
              const annualUsd = Number(Number(data.priceAnnualUsdCents || 0) / 100);
              setFormData((prev) => ({
                ...prev,
                nameEs: pName?.es || prev.nameEs,
                nameEn: pName?.en || prev.nameEn,
                descriptionEs: pDesc?.es || prev.descriptionEs,
                descriptionEn: pDesc?.en || prev.descriptionEn,
                priceMonthlyCop: monthly || prev.priceMonthlyCop,
                priceAnnualCop: annual || prev.priceAnnualCop,
                priceMonthlyUsd: monthlyUsd > 0 ? monthlyUsd : prev.priceMonthlyUsd,
                priceAnnualUsd: annualUsd > 0 ? annualUsd : prev.priceAnnualUsd,
                annualDiscountPct: computeAnnualDiscount(monthly || prev.priceMonthlyCop, annual || prev.priceAnnualCop),
                featuresRaw: pFeat?.es ? pFeat.es.join(", ") : prev.featuresRaw,
                featuresEnRaw: pFeat?.en ? pFeat.en.join(", ") : prev.featuresEnRaw,
              }));
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

      const featuresEn = formData.featuresEnRaw
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
        audios_per_product: {
          mode: catalogLimits.audios_per_product.mode,
          value:
            catalogLimits.audios_per_product.mode === "UNLIMITED"
              ? null
              : Number(catalogLimits.audios_per_product.value),
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
        descriptionEn: formData.descriptionEn || formData.descriptionEs,
        currency: "COP",
        priceMonthlyCop: Number(formData.priceMonthlyCop),
        priceAnnualCop: Number(formData.priceAnnualCop),
        priceMonthlyUsd: Number(formData.priceMonthlyUsd),
        priceAnnualUsd: Number(formData.priceAnnualUsd),
        billingCycles,
        trialDays: Number(formData.trialDays),
        isPublic: formData.isPublic,
        isPopular: formData.isPopular,
        status: formData.status,
        marketingFeaturesEs: features,
        marketingFeaturesEn: featuresEn.length > 0 ? featuresEn : features,
        limits: payloadLimits,
        capabilities,
        chatwootEnabled,
        whiteLabelMode,
        communityFeedEnabled,
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
    <>
      {/* Encabezado */}
      <DialogHeader className="pb-4 border-b border-[var(--dsn-border)] shrink-0 pr-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)]">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-[var(--dsn-text)]">
              {isEdit ? "Editar Plan Comercial" : "Registrar Nuevo Plan Comercial"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
              Configuración integral de condiciones comerciales, cuotas finitas/ilimitadas y capacidades
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {/* Barra de pestañas (S6) */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-[var(--dsn-border)] shrink-0 no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <Button
          type="button"
          variant={activeTab === "commercial" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("commercial")}
          className="shrink-0 whitespace-nowrap"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>1. Información Comercial</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "catalog" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("catalog")}
          className="shrink-0 whitespace-nowrap"
        >
          <Package className="h-3.5 w-3.5" />
          <span>2. Catálogo Y Archivos</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "tenant" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("tenant")}
          className="shrink-0 whitespace-nowrap"
        >
          <Users className="h-3.5 w-3.5" />
          <span>3. Recursos Del Inquilino</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "chatwoot" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("chatwoot")}
          className="shrink-0 whitespace-nowrap"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>4. Atención Y Canales</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "capabilities" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("capabilities")}
          className="shrink-0 whitespace-nowrap"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>5. Capacidades Opcionales</span>
          {selectedCapabilitiesCount > 0 && (
            <Badge variant="outline" className="ml-1 border-white/25 bg-white/20 text-white text-[10px] px-1.5 py-0">
              {selectedCapabilitiesCount}
            </Badge>
          )}
        </Button>

        <Button
          type="button"
          variant={activeTab === "summary" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("summary")}
          className="shrink-0 whitespace-nowrap"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>6. Resumen</span>
        </Button>
      </div>

      {/* Mensajes de error o éxito */}
      {error && (
        <Alert variant="destructive" className="mt-4 shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mt-4 shrink-0">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {isEdit
              ? "Plan comercial y condiciones actualizadas exitosamente."
              : "Plan comercial registrado exitosamente."}
          </AlertDescription>
        </Alert>
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
                  <Label htmlFor="plan-code" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Código Identificador Slug
                  </Label>
                  <div className="relative">
                    <Input
                      id="plan-code"
                      type="text"
                      required
                      disabled={isEdit}
                      placeholder="ej. custom-enterprise-vip"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className={`min-h-[44px] text-xs font-mono ${
                        isEdit ? "opacity-60 cursor-not-allowed pr-8" : ""
                      }`}
                    />
                    {isEdit && <Lock className="absolute right-2.5 top-3.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />}
                  </div>
                </div>

                <div>
                  <Label htmlFor="plan-currency" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Moneda De Facturación
                  </Label>
                  <Select
                    id="plan-currency"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="min-h-[44px] text-xs font-mono"
                  >
                    <option value="COP">COP · Peso Colombiano</option>
                    <option value="USD">USD · Dólar Estadounidense</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-name-es" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Nombre Del Plan (Español)
                  </Label>
                  <Input
                    id="plan-name-es"
                    type="text"
                    required
                    placeholder="ej. Crecimiento"
                    value={formData.nameEs}
                    onChange={(e) => setFormData({ ...formData, nameEs: e.target.value })}
                    className="min-h-[44px] text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="plan-name-en" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Nombre Del Plan (Inglés)
                  </Label>
                  <Input
                    id="plan-name-en"
                    type="text"
                    placeholder="ej. Growth"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    className="min-h-[44px] text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-desc-es" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Descripción Comercial (Español)
                  </Label>
                  <Textarea
                    id="plan-desc-es"
                    rows={2}
                    placeholder="Descripción comercial para la landing page en español..."
                    value={formData.descriptionEs}
                    onChange={(e) => setFormData({ ...formData, descriptionEs: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="plan-desc-en" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Descripción Comercial (Inglés)
                  </Label>
                  <Textarea
                    id="plan-desc-en"
                    rows={2}
                    placeholder="Commercial description for English landing page..."
                    value={formData.descriptionEn}
                    onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 space-y-4">
                <h3 className="text-xs font-semibold text-[var(--dsn-text)]">
                  Precios Colombia (COP) Y Ciclos Habilitados
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="plan-price-monthly" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Precio Ciclo Mensual (COP)
                    </Label>
                    <Input
                      id="plan-price-monthly"
                      type="number"
                      min="0"
                      step="1000"
                      required
                      value={formData.priceMonthlyCop}
                      onChange={(e) => {
                        const monthly = Number(e.target.value);
                        const annual = Math.round(monthly * 12 * (1 - formData.annualDiscountPct / 100));
                        setFormData({ ...formData, priceMonthlyCop: monthly, priceAnnualCop: annual });
                      }}
                      className="min-h-[44px] text-xs font-mono"
                    />
                  </div>

                  <div>
                    <Label htmlFor="plan-annual-discount" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Descuento Anual (%)
                    </Label>
                    <Input
                      id="plan-annual-discount"
                      type="number"
                      min="0"
                      max="99"
                      step="1"
                      required
                      value={formData.annualDiscountPct}
                      onChange={(e) => {
                        const pct = Number(e.target.value);
                        const annual = Math.round(formData.priceMonthlyCop * 12 * (1 - pct / 100));
                        setFormData({ ...formData, annualDiscountPct: pct, priceAnnualCop: annual });
                      }}
                      className="min-h-[44px] text-xs font-mono"
                    />
                  </div>

                  <div>
                    <Label htmlFor="plan-price-annual" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Precio Ciclo Anual (COP)
                    </Label>
                    <Input
                      id="plan-price-annual"
                      type="number"
                      min="0"
                      step="1000"
                      required
                      value={formData.priceAnnualCop}
                      onChange={(e) => {
                        const annual = Number(e.target.value);
                        const pct = computeAnnualDiscount(formData.priceMonthlyCop, annual);
                        setFormData({ ...formData, priceAnnualCop: annual, annualDiscountPct: pct });
                      }}
                      className="min-h-[44px] text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="border-t border-[var(--dsn-border)]/60 pt-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                    Precios Internacional (USD)
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="plan-price-monthly-usd" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Precio Mensual Internacional (USD)
                      </Label>
                      <Input
                        id="plan-price-monthly-usd"
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={formData.priceMonthlyUsd}
                        onChange={(e) => {
                          const monthlyUsd = Number(e.target.value);
                          const annualUsd = Math.round(monthlyUsd * 12 * (1 - formData.annualDiscountPct / 100));
                          setFormData({ ...formData, priceMonthlyUsd: monthlyUsd, priceAnnualUsd: annualUsd });
                        }}
                        className="min-h-[44px] text-xs font-mono"
                      />
                    </div>

                    <div>
                      <Label htmlFor="plan-price-annual-usd" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Precio Anual Internacional (USD)
                      </Label>
                      <Input
                        id="plan-price-annual-usd"
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={formData.priceAnnualUsd}
                        onChange={(e) => {
                          const annualUsd = Number(e.target.value);
                          setFormData({ ...formData, priceAnnualUsd: annualUsd });
                        }}
                        className="min-h-[44px] text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                    <Checkbox
                      checked={formData.cycleMonthly}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, cycleMonthly: checked === true })
                      }
                    />
                    <span>Habilitar Ciclo Mensual</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                    <Checkbox
                      checked={formData.cycleAnnual}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, cycleAnnual: checked === true })
                      }
                    />
                    <span>Habilitar Ciclo Anual</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-trial" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Días De Prueba Gratuita
                  </Label>
                  <Input
                    id="plan-trial"
                    type="number"
                    min="0"
                    value={formData.trialDays}
                    onChange={(e) => setFormData({ ...formData, trialDays: Number(e.target.value) })}
                    className="min-h-[44px] text-xs font-mono"
                  />
                </div>

                <div>
                  <Label htmlFor="plan-status" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Estado Del Plan
                  </Label>
                  <Select
                    id="plan-status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="min-h-[44px] text-xs"
                  >
                    <option value="active">Activo (Disponible Para Asignar)</option>
                    <option value="draft">Borrador (Oculto)</option>
                    <option value="retired">Retirado (Solo Clientes Existentes)</option>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                  <Checkbox
                    checked={formData.isPublic}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isPublic: checked === true })
                    }
                  />
                  <span>Público En Landing Page</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                  <Checkbox
                    checked={formData.isPopular}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isPopular: checked === true })
                    }
                  />
                  <span>Destacar Como Popular</span>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-features" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Características De Marketing (Español)
                  </Label>
                  <Textarea
                    id="plan-features"
                    rows={2}
                    placeholder="Atención con IA, Canal WhatsApp Cloud, Soporte estándar"
                    value={formData.featuresRaw}
                    onChange={(e) => setFormData({ ...formData, featuresRaw: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="plan-features-en" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Características De Marketing (Inglés)
                  </Label>
                  <Textarea
                    id="plan-features-en"
                    rows={2}
                    placeholder="AI-powered assistance, WhatsApp Cloud channel, Standard support"
                    value={formData.featuresEnRaw}
                    onChange={(e) => setFormData({ ...formData, featuresEnRaw: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[var(--dsn-text-secondary)] mt-1">
                Las características de marketing son descriptivas y se presentan como viñetas en las tarjetas de la landing page.
              </p>
            </div>
          )}

            {/* PESTAÑA 2: Catálogo Y Archivos */}
            {activeTab === "catalog" && (
              <div className="space-y-4">
                <Alert variant="info">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Configura cuotas finitas o marca como ilimitado. Cuota 0 prohíbe operaciones del recurso y nunca equivale a ilimitado.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Productos */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Total De Productos</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={catalogLimits.products.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              products: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : catalogLimits.products.value || 500,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.products.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-products" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Cantidad Máxima De Productos
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={catalogLimits.images_per_product.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              images_per_product: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : catalogLimits.images_per_product.value || 10,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.images_per_product.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-images" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Imágenes Asociadas
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={catalogLimits.videos_per_product.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              videos_per_product: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : catalogLimits.videos_per_product.value || 1,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.videos_per_product.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-videos" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Videos (0 = Sin Videos)
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Videos Ilimitados Por Producto
                      </div>
                    )}
                  </div>

                  {/* Pistas de audio por producto */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Pistas De Audio Por Producto</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={catalogLimits.audios_per_product.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              audios_per_product: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : catalogLimits.audios_per_product.value || 1,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.audios_per_product.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-audios" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Pistas De Audio (0 = Sin Audio)
                        </Label>
                        <Input
                          id="limit-audios"
                          type="number"
                          min="0"
                          value={catalogLimits.audios_per_product.value}
                          onChange={(e) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              audios_per_product: {
                                ...catalogLimits.audios_per_product,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
                        />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[var(--dsn-surface)] text-xs text-emerald-600 dark:text-emerald-400 font-medium text-center">
                        Pistas De Audio Ilimitadas Por Producto
                      </div>
                    )}
                  </div>

                  {/* Archivos PDF por producto */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">Archivos PDF Por Producto</span>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <Checkbox
                          checked={catalogLimits.pdfs_per_product.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setCatalogLimits({
                              ...catalogLimits,
                              pdfs_per_product: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : catalogLimits.pdfs_per_product.value || 2,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {catalogLimits.pdfs_per_product.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-pdfs" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Máximo De Documentos PDF
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={tenantLimits.contacts.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setTenantLimits({
                              ...tenantLimits,
                              contacts: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : tenantLimits.contacts.value || 1000,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.contacts.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-contacts" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Contactos Únicos
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={tenantLimits.tenant_users.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setTenantLimits({
                              ...tenantLimits,
                              tenant_users: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : tenantLimits.tenant_users.value || 5,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.tenant_users.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-users" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Miembros Con Acceso
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={tenantLimits.storage_bytes.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setTenantLimits({
                              ...tenantLimits,
                              storage_bytes: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : tenantLimits.storage_bytes.value || 500,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.storage_bytes.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-storage" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Capacidad En MB
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                        <Checkbox
                          checked={tenantLimits.chat_retention_days.mode === "UNLIMITED"}
                          onCheckedChange={(checked) =>
                            setTenantLimits({
                              ...tenantLimits,
                              chat_retention_days: {
                                mode: checked === true ? "UNLIMITED" : "LIMITED",
                                value: checked === true ? 0 : tenantLimits.chat_retention_days.value || 30,
                              },
                            })
                          }
                        />
                        <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                      </label>
                    </div>
                    {tenantLimits.chat_retention_days.mode === "LIMITED" ? (
                      <div>
                        <Label htmlFor="limit-chat-retention" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                          Días De Retención (Mínimo 30)
                        </Label>
                        <Input
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
                          className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-[var(--dsn-text)]">
                      Habilitar Atención Integrada
                    </span>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      Aprovisiona y sincroniza automáticamente una cuenta de atención omnicanal para el inquilino.
                    </p>
                  </div>
                  <Switch
                    checked={chatwootEnabled}
                    onCheckedChange={setChatwootEnabled}
                    aria-label="Habilitar Atención Integrada"
                  />
                </div>

                {chatwootEnabled && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <Alert variant="warning">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Chatwoot Community v4.19.1 no bloquea envíos por cuota de correo saliente ni restringe agentes o bandejas en la edición libre. Los valores se parametrizan en el proveedor como referencia comercial.
                      </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {/* Agentes */}
                      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--dsn-text)]">Agentes De Atención</span>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <Checkbox
                              checked={chatwootLimits.chatwoot_agents.mode === "UNLIMITED"}
                              onCheckedChange={(checked) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_agents: {
                                    mode: checked === true ? "UNLIMITED" : "LIMITED",
                                    value: checked === true ? 0 : chatwootLimits.chatwoot_agents.value || 2,
                                  },
                                })
                              }
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_agents.mode === "LIMITED" ? (
                          <div>
                            <Label htmlFor="limit-agents" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Operadores Humanos
                            </Label>
                            <Input
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
                              className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                            <Checkbox
                              checked={chatwootLimits.chatwoot_inboxes.mode === "UNLIMITED"}
                              onCheckedChange={(checked) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_inboxes: {
                                    mode: checked === true ? "UNLIMITED" : "LIMITED",
                                    value: checked === true ? 0 : chatwootLimits.chatwoot_inboxes.value || 5,
                                  },
                                })
                              }
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_inboxes.mode === "LIMITED" ? (
                          <div>
                            <Label htmlFor="limit-inboxes" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Total De Bandejas
                            </Label>
                            <Input
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
                              className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                            <Checkbox
                              checked={chatwootLimits.chatwoot_outbound_emails.mode === "UNLIMITED"}
                              onCheckedChange={(checked) =>
                                setChatwootLimits({
                                  ...chatwootLimits,
                                  chatwoot_outbound_emails: {
                                    mode: checked === true ? "UNLIMITED" : "LIMITED",
                                    value: checked === true ? 0 : chatwootLimits.chatwoot_outbound_emails.value || 1000,
                                  },
                                })
                              }
                            />
                            <span className="text-[var(--dsn-text-secondary)]">Ilimitado</span>
                          </label>
                        </div>
                        {chatwootLimits.chatwoot_outbound_emails.mode === "LIMITED" ? (
                          <div>
                            <Label htmlFor="limit-emails" className="block text-[11px] text-[var(--dsn-text-secondary)] mb-1">
                              Cuota De Correos
                            </Label>
                            <Input
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
                              className="min-h-[40px] bg-[var(--dsn-surface)] text-xs font-mono"
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
                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label
                        htmlFor="plan-white-label-mode"
                        className="text-xs font-semibold text-[var(--dsn-text)] block"
                      >
                        Nivel de Marca Blanca de Plataforma
                      </Label>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                        Define el alcance de personalización visual habilitado en el Backoffice del comercio.
                      </p>
                    </div>
                    <Select
                      id="plan-white-label-mode"
                      value={whiteLabelMode}
                      onChange={(e) =>
                        setWhiteLabelMode(e.target.value as "none" | "paleta" | "completa")
                      }
                      className="bg-[var(--dsn-surface)] text-xs font-medium min-w-[210px] w-auto"
                    >
                      <option value="none">Sin Marca Blanca (Solo Logo Básico)</option>
                      <option value="paleta">Paleta de Colores (WCAG 2.2 AA)</option>
                      <option value="completa">Marca Blanca Completa (Enterprise)</option>
                    </Select>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label
                        htmlFor="plan-community-feed-enabled"
                        className="text-xs font-semibold text-[var(--dsn-text)] block"
                      >
                        Acceso a Comunidades y Catálogo Compartido
                      </Label>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                        Habilita a los comercios de este plan para unirse a comunidades, clonar productos y colaborar en red.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        id="plan-community-feed-enabled"
                        checked={communityFeedEnabled}
                        onCheckedChange={(checked) => setCommunityFeedEnabled(checked === true)}
                      />
                      <span className="text-xs font-medium text-[var(--dsn-text)]">
                        {communityFeedEnabled ? "Habilitado" : "Deshabilitado"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-2 border-b border-[var(--dsn-border)]">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                    <Input
                      type="text"
                      placeholder="Buscar capacidades por nombre o código..."
                      value={capSearchTerm}
                      onChange={(e) => setCapSearchTerm(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
                    <Select
                      value={capFilter}
                      onChange={(e) => setCapFilter(e.target.value as "all" | "enabled" | "disabled")}
                      className="text-xs w-auto min-h-[36px]"
                    >
                      <option value="all">Todas ({capabilityCatalog.length})</option>
                      <option value="enabled">Habilitadas ({selectedCapabilitiesCount})</option>
                      <option value="disabled">Deshabilitadas ({capabilityCatalog.length - selectedCapabilitiesCount})</option>
                    </Select>
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
                                      <Badge variant="accent" className="px-1.5 py-0 text-[10px]">
                                        Mocter
                                      </Badge>
                                    )}
                                    {isSpecial && (
                                      <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                                        Restringida
                                      </Badge>
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

                                <Checkbox
                                  disabled={isSpecial}
                                  checked={isEnabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={() => !isSpecial && handleToggleCapability(item.code)}
                                  className="mt-0.5 shrink-0"
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
                      <span className="font-mono text-right text-[var(--dsn-text)]">
                        {formData.priceMonthlyCop.toLocaleString()} COP/mes · {formData.priceAnnualCop.toLocaleString()} COP/año
                        <br />
                        US$ {formData.priceMonthlyUsd.toLocaleString()} USD/mes · US$ {formData.priceAnnualUsd.toLocaleString()} USD/año
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
                      <span>Videos / Producto:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {catalogLimits.videos_per_product.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : catalogLimits.videos_per_product.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>Audios / Producto:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {catalogLimits.audios_per_product.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : catalogLimits.audios_per_product.value}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                      <span>PDFs / Producto:</span>
                      <span className="font-medium text-[var(--dsn-text)]">
                        {catalogLimits.pdfs_per_product.mode === "UNLIMITED"
                          ? "Ilimitado"
                          : catalogLimits.pdfs_per_product.value}
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
                  <div className="flex justify-between text-[var(--dsn-text-secondary)]">
                    <span>Comunidades y Catálogo Compartido:</span>
                    <span className="font-medium text-[var(--dsn-text)]">
                      {communityFeedEnabled ? "Habilitado" : "Deshabilitado"}
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
                              <Badge key={code} variant="accent" className="rounded-md px-2 py-0.5 text-[11px]">
                                {cap?.name?.es || code}
                              </Badge>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Botones de navegación y acción */}
            <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t border-[var(--dsn-border)]">
              <div>
                {activeTab !== "commercial" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeTab === "summary") setActiveTab("capabilities");
                      else if (activeTab === "capabilities") setActiveTab("chatwoot");
                      else if (activeTab === "chatwoot") setActiveTab("tenant");
                      else if (activeTab === "tenant") setActiveTab("catalog");
                      else if (activeTab === "catalog") setActiveTab("commercial");
                    }}
                    className="text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {activeTab !== "summary" ? (
                  <Button
                    key="wizard-next-btn"
                    type="button"
                    variant="secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (activeTab === "commercial") setActiveTab("catalog");
                      else if (activeTab === "catalog") setActiveTab("tenant");
                      else if (activeTab === "tenant") setActiveTab("chatwoot");
                      else if (activeTab === "chatwoot") setActiveTab("capabilities");
                      else if (activeTab === "capabilities") setActiveTab("summary");
                    }}
                    className="text-xs font-medium"
                  >
                    <span>Siguiente</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    key="wizard-submit-btn"
                    type="button"
                    variant="primary"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSubmit(e);
                    }}
                    disabled={loading}
                    loading={loading}
                    loadingText="Guardando Plan..."
                    className="text-xs font-medium"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isEdit ? "Actualizar Plan Comercial" : "Guardar Plan Comercial"}</span>
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        )}
    </>
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
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-5xl xl:max-w-6xl p-6 flex flex-col max-h-[90vh]">
        {isOpen && (
          <PlanModalDialogContent
            key={plan?.id ?? "new"}
            onClose={onClose}
            plan={plan}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
