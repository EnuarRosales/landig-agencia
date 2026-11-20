"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import type { TenantOnboardingStateDto, WorkspaceBillingDto } from "@mocter/domain";
import { Alert, AlertDescription, Button } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { StepBusiness } from "./steps/step-business";
import { StepPlan } from "./steps/step-plan";
import { StepProduct } from "./steps/step-product";
import {
  StepAssistantPayments,
  type OnboardingPaymentChannelItem,
} from "./steps/step-assistant-payments";
import { StepBilling } from "./steps/step-billing";

export interface TenantOnboardingWizardProps {
  initialState: TenantOnboardingStateDto;
  initialBilling?: WorkspaceBillingDto | null;
  initialLocale?: AdminLocale;
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

/**
 * Asistente unificado de onboarding en 5 pasos (`SPEC-06`).
 */
export function TenantOnboardingWizard({
  initialState,
  initialBilling = null,
  initialLocale = "es",
}: TenantOnboardingWizardProps) {
  const router = useRouter();

  const initialStepNum: 1 | 2 | 3 | 4 | 5 =
    initialState.step === "completed" ? 5 : initialState.step;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(initialStepNum);
  const [locale, setLocale] = useState<AdminLocale>(
    initialState.client?.locale || initialState.draft.business?.locale || initialLocale,
  );
  const [clientId, setClientId] = useState<string>(initialState.client?.id || "");
  const [billingDetails, setBillingDetails] = useState<WorkspaceBillingDto | null>(initialBilling);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dict = getAdminDictionary(locale).onboarding;

  // Paso 1: Negocio
  const [displayName, setDisplayName] = useState(
    initialState.client?.displayName || initialState.draft.business?.displayName || "",
  );
  const [slug, setSlug] = useState(
    initialState.client?.slug || initialState.draft.business?.slug || "",
  );
  const [commercialEmail, setCommercialEmail] = useState(
    initialState.client?.commercialEmail || initialState.draft.business?.commercialEmail || "",
  );
  const [websiteUrl, setWebsiteUrl] = useState(
    initialState.client?.websiteUrl || initialState.draft.business?.websiteUrl || "",
  );
  const [phone, setPhone] = useState(
    initialState.client?.phone || initialState.draft.business?.phone || "",
  );
  const [countryCode, setCountryCode] = useState(
    (initialState.client as { countryCode?: string | null } | null)?.countryCode || "CO",
  );
  const [currency, setCurrency] = useState(
    initialState.client?.currency || initialState.draft.business?.currency || "COP",
  );
  const [timezone, setTimezone] = useState(
    initialState.client?.timezone || initialState.draft.business?.timezone || "America/Bogota",
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    initialState.client?.logoUrl || null,
  );
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Paso 2: Plan
  const defaultPlanCode =
    initialState.draft.plan?.planCode ||
    initialState.client?.planCode ||
    initialState.draft.business?.planCode ||
    initialState.availablePlans[0]?.code ||
    "free";
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>(defaultPlanCode);
  const [cycle, setCycle] = useState<"monthly" | "annual">(
    initialState.draft.plan?.cycle === "annual" ? "annual" : "monthly",
  );

  // Paso 3: Primer Producto
  const [productName, setProductName] = useState(initialState.draft.firstProduct?.name || "");
  const [productDescription, setProductDescription] = useState(
    initialState.draft.firstProduct?.description || "",
  );
  const [costPriceInput, setCostPriceInput] = useState(
    initialState.draft.firstProduct?.costPriceCents != null
      ? String(initialState.draft.firstProduct.costPriceCents / 100)
      : "",
  );
  const [salePriceInput, setSalePriceInput] = useState(() => {
    const cents =
      initialState.draft.firstProduct?.salePriceCents ??
      initialState.draft.firstProduct?.priceCents;
    return cents ? String(cents / 100) : "85000";
  });
  const [productKind, setProductKind] = useState<"physical" | "digital" | "service">(
    initialState.draft.firstProduct?.kind || "physical",
  );
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    initialState.draft.firstProduct?.coverMediaUrl || null,
  );
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Paso 4: Asistente y Canales de Pago
  const [botName, setBotName] = useState(
    initialState.draft.assistantAndPayments?.botName ||
      (initialState.client?.displayName
        ? `Asistente ${initialState.client.displayName}`
        : "Asistente Comercial"),
  );
  const [botObjective, setBotObjective] = useState(
    initialState.draft.assistantAndPayments?.botObjective ||
      initialState.botCatalog.objectives[0]?.labels[locale] ||
      "Vender productos y cerrar pedidos por chat",
  );
  const [botPresetId, setBotPresetId] = useState(
    initialState.draft.assistantAndPayments?.botPresetId ||
      initialState.botCatalog.presets[0]?.id ||
      "",
  );
  const [botToneId, setBotToneId] = useState(
    initialState.draft.assistantAndPayments?.botToneId ||
      initialState.botCatalog.tones[0]?.id ||
      "",
  );
  const [paymentChannels, setPaymentChannels] = useState<OnboardingPaymentChannelItem[]>(() => {
    if (initialState.paymentChannels && initialState.paymentChannels.length > 0) {
      return initialState.paymentChannels.map((c) => ({
        channelCode: c.channelCode,
        displayName: c.displayName,
        accountIdentifier: c.accountIdentifier || "",
        accountHolderName: c.accountHolderName || "",
        instructions: c.instructions || "",
        isActive: c.isActive,
      }));
    }
    return [
      {
        channelCode: "nequi",
        displayName: "Nequi",
        accountIdentifier: "",
        accountHolderName: "",
        instructions: "",
        isActive: true,
      },
      {
        channelCode: "cash_on_delivery",
        displayName: "Pago Contra Entrega",
        accountIdentifier: "",
        accountHolderName: "",
        instructions: "Pago al recibir el pedido",
        isActive: true,
      },
    ];
  });
  const [orderConfirmationMessage, setOrderConfirmationMessage] = useState(
    initialState.draft.assistantAndPayments?.orderConfirmationMessage ||
      "¡Gracias por tu pedido! Nuestro equipo lo está preparando y nos pondremos en contacto contigo de inmediato.",
  );

  const selectedPlan = useMemo(
    () =>
      initialState.availablePlans.find((p) => p.code === selectedPlanCode) ||
      initialState.availablePlans[0] ||
      null,
    [initialState.availablePlans, selectedPlanCode],
  );

  function handleDisplayNameChange(val: string) {
    setDisplayName(val);
    if (!initialState.client?.slug && (!slug || slug === cleanSlug(displayName))) {
      setSlug(cleanSlug(val));
    }
  }

  async function uploadLogoToServer(file: File): Promise<void> {
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/profile/logo", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo subir el logotipo.");
      }
      if (json.data?.logoUrl) {
        setLogoPreviewUrl(json.data.logoUrl);
      }
      setPendingLogoFile(null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleLogoFileSelect(file: File) {
    setError(null);
    if (clientId) {
      try {
        await uploadLogoToServer(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      setLogoPreviewUrl(URL.createObjectURL(file));
    }
    setPendingLogoFile(file);
  }

  async function uploadCoverToServer(file: File): Promise<void> {
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/onboarding/product-cover", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo subir la portada.");
      }
      if (json.data?.coverMediaUrl) {
        setCoverPreviewUrl(json.data.coverMediaUrl);
      }
      setPendingCoverFile(null);
    } finally {
      setUploadingCover(false);
    }
  }

  function handleCoverFileSelect(file: File) {
    setError(null);
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      setCoverPreviewUrl(URL.createObjectURL(file));
    }
    setPendingCoverFile(file);
  }

  async function refreshBillingSnapshot() {
    try {
      const res = await fetch("/api/tenant/billing", { method: "GET" });
      const json = await res.json();
      if (res.ok && json.ok && json.data) {
        setBillingDetails(json.data as WorkspaceBillingDto);
      }
    } catch {
      // Mantiene estado existente si falla silenciosamente
    }
  }

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
          commercialEmail: commercialEmail.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          phone: phone.trim() || null,
          countryCode: countryCode || "CO",
          locale,
          currency,
          timezone,
          planCode: selectedPlanCode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar el Paso 1.");
      }

      if (json.data?.clientId) {
        setClientId(json.data.clientId);
      }
      if (pendingLogoFile) {
        await uploadLogoToServer(pendingLogoFile);
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step2_plan",
          planId: selectedPlan?.id,
          planCode: selectedPlanCode,
          cycle,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar el plan.");
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const saleNum = Number(salePriceInput);
      if (!Number.isFinite(saleNum) || saleNum <= 0) {
        throw new Error("El precio de venta debe ser mayor a cero.");
      }
      const costNum = costPriceInput.trim() === "" ? null : Number(costPriceInput);
      if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) {
        throw new Error("El precio de costo no puede ser negativo.");
      }

      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step3_product",
          name: productName.trim(),
          description: productDescription.trim(),
          costPriceCents: costNum !== null ? Math.round(costNum * 100) : null,
          salePriceCents: Math.round(saleNum * 100),
          currency,
          kind: productKind,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo guardar el producto.");
      }

      if (pendingCoverFile) {
        await uploadCoverToServer(pendingCoverFile);
      }
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep4Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step4_assistant_payments",
          botName: botName.trim(),
          botObjective,
          botPresetId: botPresetId || undefined,
          botToneId: botToneId || undefined,
          paymentChannels,
          orderConfirmationMessage: orderConfirmationMessage.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.detail || json.error || "No se pudo guardar la configuración del asistente.",
        );
      }

      await refreshBillingSnapshot();
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteOnboarding(
    mode: "trial" | "free" | "pending_payment_review" | "paid",
  ) {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tenant/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step5_complete",
          completionMode: mode,
          planCode: selectedPlanCode,
          cycle,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo completar la activación.");
      }

      router.push(json.data?.redirectTo || "/workspace");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const stepsOrder: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  const progressPct = Math.round((step / 5) * 100);

  return (
    <div className="min-h-screen bg-[var(--dsn-bg)] px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Cabecera Oficial Con Medallón Circular De Mocter Centrado (estilo Login) */}
        <header className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-5 py-6 text-center shadow-xs">
          <div className="mb-4 flex justify-center">
            <div className="group relative flex items-center justify-center">
              {/* Halo de luz ambiental con el gradiente de Mocter */}
              <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-[#2f6bff] via-[#22d3ee] to-[#2f6bff] opacity-50 blur-xl transition-all duration-300 group-hover:opacity-80" />

              {/* Medallón circular blanco con borde de contraste y relieve */}
              <div className="relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border-2 border-white/60 bg-white p-3 shadow-[0_10px_35px_rgba(34,211,238,0.35),0_2px_10px_rgba(0,0,0,0.4)] ring-4 ring-white/15">
                <Image
                  src="/images/mocter-logo.png"
                  alt="Mocter Logo"
                  width={64}
                  height={64}
                  className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
                  priority
                />
              </div>
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.headerTitle}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
            {dict.headerSubtitle}
          </p>
        </header>

        {/* Indicador Progresivo De 5 Pasos (Mobile First) */}
        <div className="space-y-2.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--dsn-surface-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--dsn-accent)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <nav
            aria-label={dict.headerTitle}
            className="grid grid-cols-5 gap-1.5 sm:gap-2"
          >
            {stepsOrder.map((num) => {
              const isCurrent = step === num;
              const isDone = step > num;
              return (
                <Button
                  key={num}
                  type="button"
                  size="sm"
                  variant={isCurrent ? "primary" : "outline"}
                  aria-current={isCurrent ? "step" : undefined}
                  disabled={num > step || loading}
                  onClick={() => {
                    if (num < step) {
                      setError(null);
                      setStep(num);
                    }
                  }}
                  className={`justify-center sm:justify-start rounded-xl px-2 py-2 ${
                    isCurrent
                      ? ""
                      : isDone
                        ? "border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/10 text-[var(--dsn-text)]"
                        : "bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] opacity-70"
                  }`}
                >
                  <span className="font-mono">{num}</span>
                  <span className="hidden md:inline truncate">{dict.stepTitles[num]}</span>
                </Button>
              );
            })}
          </nav>
        </div>

        {/* Alerta De Error */}
        {error && (
          <Alert variant="error" role="alert" className="p-4 text-xs sm:text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Renderizado Modular De Pasos 1..5 */}
        {step === 1 && (
          <StepBusiness
            locale={locale}
            displayName={displayName}
            slug={slug}
            isSlugReadOnly={Boolean(initialState.client?.slug)}
            commercialEmail={commercialEmail}
            websiteUrl={websiteUrl}
            phone={phone}
            countryCode={countryCode}
            currency={currency}
            timezone={timezone}
            logoPreviewUrl={logoPreviewUrl}
            uploadingLogo={uploadingLogo}
            loading={loading}
            onDisplayNameChange={handleDisplayNameChange}
            onSlugChange={(val) => setSlug(cleanSlug(val))}
            onCommercialEmailChange={setCommercialEmail}
            onWebsiteUrlChange={setWebsiteUrl}
            onPhoneChange={setPhone}
            onCountryCodeChange={setCountryCode}
            onLocaleChange={(nextLoc) => setLocale(nextLoc)}
            onCurrencyChange={setCurrency}
            onTimezoneChange={setTimezone}
            onLogoFileSelect={handleLogoFileSelect}
            onSubmit={handleStep1Submit}
          />
        )}

        {step === 2 && (
          <StepPlan
            locale={locale}
            currency={currency}
            plans={initialState.availablePlans}
            selectedPlanCode={selectedPlanCode}
            cycle={cycle}
            loading={loading}
            onSelectPlanCode={setSelectedPlanCode}
            onChangeCycle={setCycle}
            onBack={() => {
              setError(null);
              setStep(1);
            }}
            onSubmit={handleStep2Submit}
          />
        )}

        {step === 3 && (
          <StepProduct
            locale={locale}
            currency={currency}
            planName={selectedPlan?.names?.[locale] || selectedPlan?.name}
            catalogLimits={selectedPlan?.catalogLimits || initialState.currentCatalogSummary}
            productName={productName}
            productDescription={productDescription}
            costPriceInput={costPriceInput}
            salePriceInput={salePriceInput}
            productKind={productKind}
            coverPreviewUrl={coverPreviewUrl}
            uploadingCover={uploadingCover}
            loading={loading}
            onProductNameChange={setProductName}
            onProductDescriptionChange={setProductDescription}
            onCostPriceInputChange={setCostPriceInput}
            onSalePriceInputChange={setSalePriceInput}
            onProductKindChange={setProductKind}
            onCoverFileSelect={handleCoverFileSelect}
            onBack={() => {
              setError(null);
              setStep(2);
            }}
            onSubmit={handleStep3Submit}
          />
        )}

        {step === 4 && (
          <StepAssistantPayments
            locale={locale}
            botCatalog={initialState.botCatalog}
            botName={botName}
            botObjective={botObjective}
            botPresetId={botPresetId}
            botToneId={botToneId}
            paymentChannels={paymentChannels}
            orderConfirmationMessage={orderConfirmationMessage}
            loading={loading}
            onBotNameChange={setBotName}
            onBotObjectiveChange={setBotObjective}
            onBotPresetIdChange={setBotPresetId}
            onBotToneIdChange={setBotToneId}
            onPaymentChannelsChange={setPaymentChannels}
            onOrderConfirmationMessageChange={setOrderConfirmationMessage}
            onBack={() => {
              setError(null);
              setStep(3);
            }}
            onSubmit={handleStep4Submit}
          />
        )}

        {step === 5 && (
          <StepBilling
            locale={locale}
            clientId={clientId}
            currency={currency}
            selectedPlan={selectedPlan}
            cycle={cycle}
            billingDetails={billingDetails}
            loading={loading}
            onBack={() => {
              setError(null);
              setStep(4);
            }}
            onCompleteOnboarding={handleCompleteOnboarding}
          />
        )}
      </div>
    </div>
  );
}
