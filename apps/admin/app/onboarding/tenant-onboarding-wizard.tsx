"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Package,
  Bot,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Truck,
  HelpCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { TenantOnboardingStateDto } from "@mocter/domain";

export interface TenantOnboardingWizardProps {
  initialState: TenantOnboardingStateDto;
}

/**
 * Asistente unificado de onboarding en 3 pasos (ADM-001 D-36, TNT-001 RF-03).
 *
 * Directivas de diseño:
 * - Mobile First (DSN-001).
 * - Etiquetas de formulario exclusivamente en Tipo Título (Title Case, Regla 4.8).
 * - Asistencia AI en campo de texto libre con «Mejorar Con AI» (AI-001, Regla 4.7).
 * - Cero diálogos nativos del navegador (Regla 4.17).
 * - Cero códigos de especificaciones en vistas visibles (Regla 4.15).
 */
export function TenantOnboardingWizard({ initialState }: TenantOnboardingWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(
    initialState.step === "completed" ? 3 : (initialState.step as 1 | 2 | 3),
  );
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del Paso 1: Negocio y Plan
  const [displayName, setDisplayName] = useState(
    initialState.client?.displayName || initialState.draft.business?.displayName || "",
  );
  const [slug, setSlug] = useState(
    initialState.client?.slug || initialState.draft.business?.slug || "",
  );
  const [currency, setCurrency] = useState(
    initialState.client?.currency || initialState.draft.business?.currency || "COP",
  );
  const [timezone, setTimezone] = useState(
    initialState.client?.timezone || initialState.draft.business?.timezone || "America/Bogota",
  );
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    initialState.client?.planCode || initialState.draft.business?.planCode || "free",
  );

  // Estado del Paso 2: Primer Producto
  const [productName, setProductName] = useState(
    initialState.draft.firstProduct?.name || "",
  );
  const [productDescription, setProductDescription] = useState(
    initialState.draft.firstProduct?.description || "",
  );
  const [productPrice, setProductPrice] = useState<number | string>(
    initialState.draft.firstProduct?.priceCents
      ? initialState.draft.firstProduct.priceCents / 100
      : 85000,
  );
  const [productKind, setProductKind] = useState<"physical" | "digital" | "service">(
    initialState.draft.firstProduct?.kind || "physical",
  );

  // Estado del Paso 3: Asistente Virtual y Activación
  const [botPreset, setBotPreset] = useState(
    initialState.draft.botConfig?.botPreset || "friendly_sales",
  );
  const [paymentMethods, setPaymentMethods] = useState<string[]>(
    initialState.draft.botConfig?.paymentMethods || ["Nequi", "Daviplata", "Bancolombia", "Contraentrega"],
  );
  const [orderMessage, setOrderMessage] = useState(
    "¡Gracias por tu pedido! Nuestro equipo lo está preparando y nos pondremos en contacto contigo de inmediato.",
  );

  // Auto-generación de slug a partir del nombre comercial
  function handleDisplayNameChange(val: string) {
    setDisplayName(val);
    if (!initialState.client?.slug && (!slug || slug === cleanSlug(displayName))) {
      setSlug(cleanSlug(val));
    }
  }

  function cleanSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }

  function togglePaymentMethod(method: string) {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  }

  // Ejecución de «Mejorar Con AI» en la descripción del producto (AI-001)
  async function handleAiEnhance() {
    if (!productDescription.trim() && !productName.trim()) {
      setError("Ingresa al menos el nombre o un borrador del producto para mejorarlo con inteligencia artificial.");
      return;
    }

    setAiLoading(true);
    setError(null);

    try {
      const promptDraft = productDescription.trim() || productName.trim();
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: initialState.client?.id || "00000000-0000-0000-0000-000000000000",
          fieldKey: "product_description",
          draft: promptDraft,
          locale: "es",
          hasByokConfigured: false,
          walletBalanceCents: 10000, // Cortesía de onboarding para trial gratuito
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.enhancedText) {
          setProductDescription(json.enhancedText);
          return;
        }
      }

      // Fallback algorítmico de redacción comercial si la inferencia en vivo no está enlazada
      const fallbackSuggestion = `${productName.trim() || "Producto de alta calidad"} diseñado con materiales premium y acabados de precisión. Ideal para uso diario, con garantía directa de fábrica y despacho rápido a todo el país.`;
      setProductDescription(fallbackSuggestion);
    } catch {
      const fallbackSuggestion = `${productName.trim() || "Producto de alta calidad"} diseñado con materiales premium y acabados de precisión. Ideal para uso diario, con garantía directa de fábrica y despacho rápido a todo el país.`;
      setProductDescription(fallbackSuggestion);
    } finally {
      setAiLoading(false);
    }
  }

  // Envío del Paso 1
  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step1_business",
          displayName: displayName.trim(),
          slug: slug.trim(),
          currency,
          timezone,
          planCode: selectedPlanCode,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar la información del negocio.");
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Envío del Paso 2
  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const priceVal = Number(productPrice);
      if (priceVal <= 0) {
        throw new Error("El precio de venta debe ser un número mayor a cero.");
      }

      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step2_product",
          name: productName.trim(),
          description: productDescription.trim(),
          priceCents: Math.round(priceVal * 100),
          currency,
          kind: productKind,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo registrar el primer producto.");
      }

      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Envío del Paso 3
  async function handleStep3Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step3_activate",
          botPreset,
          paymentMethods,
          orderMessage: orderMessage.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo activar el comercio.");
      }

      // Redirección determinística al espacio de trabajo operativo
      router.push("/workspace");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 p-4 md:px-8 md:py-10">
      {/* Encabezado con estética HUD */}
      <header className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/10 px-3 py-1 text-xs font-mono font-semibold text-[var(--dsn-accent)]">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Configuración Inicial Del Comercio</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--dsn-text)]">
          Bienvenido a Mocter
        </h1>
        <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] max-w-lg mx-auto">
          Completa estos tres pasos guiados para dejar tu catálogo y asistente listos para operar en minutos.
        </p>
      </header>

      {/* Stepper HUD Mobile First */}
      <nav aria-label="Progreso del asistente de onboarding" className="grid grid-cols-3 gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => step > 1 && setStep(1)}
          disabled={step === 1}
          className={`flex flex-col sm:flex-row items-center gap-2 p-3 rounded-xl border text-left transition-all ${
            step === 1
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-surface)] shadow-md"
              : step > 1
              ? "border-emerald-500/40 bg-[var(--dsn-surface)]/60 text-emerald-400 cursor-pointer"
              : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 opacity-50 cursor-not-allowed"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              step === 1
                ? "bg-[var(--dsn-accent)] text-white"
                : step > 1
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
          </div>
          <div className="hidden sm:block truncate">
            <p className="text-xs font-bold text-[var(--dsn-text)] truncate">Tu Negocio</p>
            <p className="text-[10px] text-[var(--dsn-text-secondary)] truncate">Nombre y Moneda</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => step > 2 && setStep(2)}
          disabled={step < 2}
          className={`flex flex-col sm:flex-row items-center gap-2 p-3 rounded-xl border text-left transition-all ${
            step === 2
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-surface)] shadow-md"
              : step > 2
              ? "border-emerald-500/40 bg-[var(--dsn-surface)]/60 text-emerald-400 cursor-pointer"
              : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 opacity-50 cursor-not-allowed"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              step === 2
                ? "bg-[var(--dsn-accent)] text-white"
                : step > 2
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            {step > 2 ? <CheckCircle2 className="h-4 w-4" /> : "2"}
          </div>
          <div className="hidden sm:block truncate">
            <p className="text-xs font-bold text-[var(--dsn-text)] truncate">Primer Producto</p>
            <p className="text-[10px] text-[var(--dsn-text-secondary)] truncate">Catálogo Inicial</p>
          </div>
        </button>

        <button
          type="button"
          disabled={step < 3}
          className={`flex flex-col sm:flex-row items-center gap-2 p-3 rounded-xl border text-left transition-all ${
            step === 3
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-surface)] shadow-md"
              : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 opacity-50 cursor-not-allowed"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
              step === 3
                ? "bg-[var(--dsn-accent)] text-white"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)]"
            }`}
          >
            3
          </div>
          <div className="hidden sm:block truncate">
            <p className="text-xs font-bold text-[var(--dsn-text)] truncate">Asistente y Pagos</p>
            <p className="text-[10px] text-[var(--dsn-text-secondary)] truncate">Activación Final</p>
          </div>
        </button>
      </nav>

      {/* Banner de error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 animate-in fade-in"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Revisa los datos ingresados:</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 1: INFORMACIÓN DEL NEGOCIO Y PLAN
         ───────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <form
          onSubmit={handleStep1Submit}
          className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 md:p-8 shadow-xl space-y-6"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--dsn-border)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                Identidad y Moneda Del Comercio
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Define cómo verán tus clientes tu tienda virtual y el identificador web único.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="displayName"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                Nombre Comercial Del Negocio
              </label>
              <input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
                placeholder="Ejemplo: Synergia Market"
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 text-xs text-[var(--dsn-text)] placeholder-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="slug"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                Identificador De La Tienda (Slug Web)
              </label>
              <div className="flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 focus-within:border-[var(--dsn-accent)] focus-within:ring-1 focus-within:ring-[var(--dsn-accent)]">
                <span className="text-xs font-mono text-[var(--dsn-text-secondary)] select-none">
                  mocter.co/
                </span>
                <input
                  id="slug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="synergia-market"
                  className="w-full min-h-[44px] bg-transparent pl-1 text-xs font-mono text-[var(--dsn-text)] placeholder-[var(--dsn-text-secondary)]/50 focus:outline-hidden"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                Solo letras minúsculas, números y guiones. Será el enlace público de tu catálogo.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="currency"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  Moneda Principal De Operación
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
                >
                  <option value="COP">COP · Peso Colombiano</option>
                  <option value="USD">USD · Dólar Estadounidense</option>
                  <option value="EUR">EUR · Euro</option>
                  <option value="MXN">MXN · Peso Mexicano</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="timezone"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  Zona Horaria Comercial
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
                >
                  <option value="America/Bogota">América / Bogotá (GMT-5)</option>
                  <option value="America/Mexico_City">América / Ciudad de México (GMT-6)</option>
                  <option value="America/New_York">América / Nueva York (GMT-5)</option>
                  <option value="America/Lima">América / Lima (GMT-5)</option>
                </select>
              </div>
            </div>

            {/* Selector de Plan */}
            {initialState.availablePlans.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-2">
                  Plan Comercial Seleccionado
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {initialState.availablePlans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlanCode(p.code)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        selectedPlanCode === p.code
                          ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 ring-1 ring-[var(--dsn-accent)]"
                          : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] hover:border-[var(--dsn-border-strong)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--dsn-text)]">{p.name}</span>
                        {selectedPlanCode === p.code && (
                          <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)]" />
                        )}
                      </div>
                      <p className="mt-1 font-mono text-sm font-extrabold text-[var(--dsn-text)]">
                        {p.priceMonthlyCents === 0
                          ? "Gratuito"
                          : `$${(p.priceMonthlyCents / 100).toLocaleString("es-CO")}/mes`}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--dsn-text-secondary)] line-clamp-2">
                        {p.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[var(--dsn-border)] flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando Información...</span>
                </>
              ) : (
                <>
                  <span>Guardar y Continuar Al Paso 2</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 2: PRIMER PRODUCTO DEL CATÁLOGO
         ───────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <form
          onSubmit={handleStep2Submit}
          className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 md:p-8 shadow-xl space-y-6"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--dsn-border)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                Publica Tu Primer Producto
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Agrega un artículo inicial para que tu catálogo quede activo de inmediato.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="productName"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  Nombre Del Producto
                </label>
                <input
                  id="productName"
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ejemplo: Camisa Oxford Premium"
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 text-xs text-[var(--dsn-text)] placeholder-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor="productPrice"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  Precio De Venta ({currency})
                </label>
                <input
                  id="productPrice"
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="productKind"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                Tipo De Producto
              </label>
              <select
                id="productKind"
                value={productKind}
                onChange={(e) => setProductKind(e.target.value as any)}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
              >
                <option value="physical">Producto Físico (Con Inventario y Despacho)</option>
                <option value="service">Servicio o Asesoría Profesional</option>
                <option value="digital">Contenido o Producto Digital</option>
              </select>
            </div>

            {/* Textarea con «Mejorar Con AI» (AI-001) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="productDescription"
                  className="block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  Descripción Detallada Del Producto
                </label>
                <button
                  type="button"
                  onClick={handleAiEnhance}
                  disabled={aiLoading}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-accent)] transition-colors hover:bg-[var(--dsn-accent)]/25 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Mejorando Con AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Mejorar Con AI</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                id="productDescription"
                required
                rows={4}
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Describe los beneficios, materiales y características principales de tu producto..."
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 text-xs text-[var(--dsn-text)] placeholder-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)] leading-relaxed"
              />
              <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                Usa «Mejorar Con AI» para redactar un texto persuasivo orientado a la conversión comercial.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--dsn-border)] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            >
              Volver Al Paso 1
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[var(--dsn-accent-hover)] active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Publicando Producto...</span>
                </>
              ) : (
                <>
                  <span>Crear Producto y Continuar Al Paso 3</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 3: ASISTENTE VIRTUAL Y ACTIVACIÓN
         ───────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <form
          onSubmit={handleStep3Submit}
          className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 md:p-8 shadow-xl space-y-6"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--dsn-border)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                Configura Tu Asistente y Métodos De Pago
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Define el tono de atención automática para responder preguntas y cerrar pedidos.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-2">
                Preset Del Asistente Virtual
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    key: "friendly_sales",
                    title: "Asesor Comercial Amigable",
                    desc: "Tono cálido, persuasivo y enfocado en cerrar ventas y resolver dudas con entusiasmo.",
                  },
                  {
                    key: "technical_expert",
                    title: "Soporte Técnico y Resolutivo",
                    desc: "Respuestas precisas, analíticas y detalladas sobre especificaciones y garantías.",
                  },
                  {
                    key: "formal_corporate",
                    title: "Atención Corporativa y Formal",
                    desc: "Estilo sobrio, institucional y protocolario ideal para servicios B2B.",
                  },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setBotPreset(preset.key)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      botPreset === preset.key
                        ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 ring-1 ring-[var(--dsn-accent)]"
                        : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] hover:border-[var(--dsn-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[var(--dsn-text)]">{preset.title}</span>
                      {botPreset === preset.key && (
                        <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)]" />
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--dsn-text-secondary)] leading-relaxed">
                      {preset.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-2">
                Métodos De Pago Habilitados
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {["Nequi", "Daviplata", "Bancolombia", "Contraentrega", "Tarjeta Débito", "Tarjeta Crédito", "Transferencia PSE", "Efecty"].map(
                  (method) => {
                    const active = paymentMethods.includes(method);
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => togglePaymentMethod(method)}
                        className={`flex items-center justify-between rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                          active
                            ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
                            : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
                        }`}
                      >
                        <span>{method}</span>
                        {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="orderMessage"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                Mensaje De Confirmación De Pedidos
              </label>
              <textarea
                id="orderMessage"
                rows={2}
                value={orderMessage}
                onChange={(e) => setOrderMessage(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden focus:ring-1 focus:ring-[var(--dsn-accent)]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--dsn-border)] flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs font-semibold text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            >
              Volver Al Paso 2
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Activando Comercio...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Activar Comercio e Ir Al Espacio De Trabajo</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

