"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  FileText,
  Layers,
  Music,
  Package,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import type {
  CatalogListResultDto,
  ProductAvailability,
  ProductCompositionType,
  ProductCondition,
  ProductDetailDto,
  ProductDynamicAttribute,
  ProductKind,
  ProductListItemDto,
  ProductMediaItemDto,
  ProductStatus,
  WorkspaceBillingDto,
} from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@mocter/ui";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { calculateProductProfitability } from "@/lib/pricing-margin";
import { workspaceFetch } from "@/lib/workspace-client";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { formatStorageBytes } from "@/components/catalog-quota-banner";
import {
  applyRecommendedProductPromptTemplate,
  buildRecommendedProductPromptTemplate,
  formatMoneyCents,
  PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS,
  type ProductPromptTemplateContext,
} from "./product-ui-helpers";

export type ProductFormTab = "general" | "stock" | "attributes" | "media" | "prompt";

interface ComboDraftItem {
  componentProductId: string;
  quantity: number;
  name: string;
  costPriceCents: number;
  priceCents: number;
  stockQuantity: number | null;
  kind: ProductKind;
  status: ProductStatus;
}

export interface ProductFormModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  initialTab?: ProductFormTab;
  initialProduct: ProductDetailDto | null;
  loadingDetail?: boolean;
  currency: string;
  billing?: WorkspaceBillingDto | null;
  locale?: AdminLocale;
  hasInferenceAccess?: boolean;
  onClose: () => void;
  onSaved: (detail: ProductDetailDto, meta: { isCreate: boolean }) => void;
  onProductChanged?: (detail: ProductDetailDto) => void;
}

/**
 * Modal de Creación y Edición de Productos en 5 pestañas (`General`, `Stock`, `Atributos/Combo`, `Multimedia`, `Prompt Maestro`).
 */
export function ProductFormModal(props: ProductFormModalProps) {
  if (!props.isOpen) return null;
  const resetKey = `${props.mode}:${props.initialProduct?.id ?? "new"}:${props.initialTab ?? "general"}:${props.loadingDetail ? "loading" : "ready"}`;
  return <ProductFormModalContent key={resetKey} {...props} />;
}

function ProductFormModalContent({
  mode,
  initialTab = "general",
  initialProduct,
  loadingDetail = false,
  currency,
  billing = null,
  locale = "es",
  hasInferenceAccess = true,
  onClose,
  onSaved,
  onProductChanged,
}: ProductFormModalProps) {
  const dict = getAdminDictionary(locale).workspace;
  const editTarget = mode === "edit" ? initialProduct : null;

  const [activeTab, setActiveTab] = useState<ProductFormTab>(initialTab);
  const [editingDetail, setEditingDetail] = useState<ProductDetailDto | null>(editTarget);

  // Campos generales y precios
  const [name, setName] = useState(editTarget?.name ?? "");
  const [sku, setSku] = useState(editTarget?.sku ?? "");
  const [category, setCategory] = useState(editTarget?.category ?? "");
  const [brand, setBrand] = useState(editTarget?.brand ?? "");
  const [kind, setKind] = useState<ProductKind>(editTarget?.kind ?? "physical");
  const [compositionType, setCompositionType] = useState<ProductCompositionType>(
    editTarget?.compositionType ?? "simple",
  );
  const [condition, setCondition] = useState<ProductCondition>(editTarget?.condition ?? "new");
  const [status, setStatus] = useState<ProductStatus>(editTarget?.status ?? "active");
  const [availability, setAvailability] = useState<ProductAvailability>(
    editTarget?.availability ?? "in_stock",
  );
  const [description, setDescription] = useState(editTarget?.description ?? "");
  const [costAmount, setCostAmount] = useState(
    editTarget ? String(Math.round(editTarget.costPriceCents / 100)) : "0",
  );
  const [priceAmount, setPriceAmount] = useState(
    editTarget ? String(Math.round(editTarget.priceCents / 100)) : "",
  );

  // Inventario físico
  const [stockQuantity, setStockQuantity] = useState(
    editTarget ? String(editTarget.stockQuantity ?? 0) : "0",
  );
  const [minStockThreshold, setMinStockThreshold] = useState(
    editTarget ? String(editTarget.minStockThreshold ?? 0) : "0",
  );

  // Atributos dinámicos
  const [attributes, setAttributes] = useState<ProductDynamicAttribute[]>(
    editTarget?.attributes ?? [],
  );
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrValuesRaw, setNewAttrValuesRaw] = useState("");

  // Combo
  const [comboItems, setComboItems] = useState<ComboDraftItem[]>(
    editTarget
      ? (editTarget.comboComponents ?? []).map((c) => ({
          componentProductId: c.componentProductId,
          quantity: c.quantity,
          name: c.name,
          costPriceCents: c.costPriceCents,
          priceCents: c.priceCents,
          stockQuantity: c.stockQuantity,
          kind: c.kind,
          status: c.status,
        }))
      : [],
  );
  const [simpleOptions, setSimpleOptions] = useState<ProductListItemDto[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState("");

  // Multimedia
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaAltText, setMediaAltText] = useState("");
  const [setAsCover, setSetAsCover] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);

  // Prompt Maestro
  const [botMasterPrompt, setBotMasterPrompt] = useState(editTarget?.botMasterPrompt ?? "");

  // Estado de envío y guarda de cambios sin guardar
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const currentSerialized = useMemo(
    () =>
      JSON.stringify({
        name,
        sku,
        category,
        brand,
        kind,
        compositionType,
        condition,
        status,
        availability,
        description,
        costAmount,
        priceAmount,
        stockQuantity,
        minStockThreshold,
        attributes,
        comboItems,
        botMasterPrompt,
      }),
    [
      name,
      sku,
      category,
      brand,
      kind,
      compositionType,
      condition,
      status,
      availability,
      description,
      costAmount,
      priceAmount,
      stockQuantity,
      minStockThreshold,
      attributes,
      comboItems,
      botMasterPrompt,
    ],
  );
  const [savedSerialized, setSavedSerialized] = useState(() => currentSerialized);

  const isDirty =
    !loadingDetail &&
    (currentSerialized !== savedSerialized ||
      mediaFile !== null ||
      mediaAltText.trim().length > 0);

  const handleAttemptClose = useCallback(() => {
    if (saving) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose, saving]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (discardConfirmOpen) {
        setDiscardConfirmOpen(false);
        return;
      }
      handleAttemptClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [discardConfirmOpen, handleAttemptClose]);

  useEffect(() => {
    if (compositionType !== "combo") return;
    let active = true;
    void (async () => {
      const res = await workspaceFetch<CatalogListResultDto>(
        "/api/tenant/products?compositionType=simple&limit=50",
      );
      if (active && res.ok && res.data) {
        setSimpleOptions(res.data.items.filter((i) => i.id !== editingDetail?.id));
      }
    })();
    return () => {
      active = false;
    };
  }, [compositionType, editingDetail?.id]);

  const costCents = useMemo(() => {
    const num = Number(costAmount);
    return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0;
  }, [costAmount]);

  const saleOrRegularCents = useMemo(() => {
    const base = Number(priceAmount);
    return Number.isFinite(base) && base > 0 ? Math.round(base * 100) : 0;
  }, [priceAmount]);

  const profitability = useMemo(
    () => calculateProductProfitability(costCents, saleOrRegularCents),
    [costCents, saleOrRegularCents],
  );

  const suggestedComboCostCents = useMemo(() => {
    if (compositionType !== "combo" || comboItems.length === 0) return 0;
    return comboItems.reduce((acc, item) => {
      const unitCost = item.costPriceCents > 0 ? item.costPriceCents : item.priceCents;
      return acc + unitCost * item.quantity;
    }, 0);
  }, [compositionType, comboItems]);

  const computedComboStock = useMemo(() => {
    if (compositionType !== "combo") return null;
    const physicals = comboItems.filter((i) => i.kind === "physical");
    if (physicals.length === 0) return null;
    let minUnits = Infinity;
    for (const item of physicals) {
      if (item.status !== "active") return 0;
      const available = Math.floor((item.stockQuantity ?? 0) / Math.max(1, item.quantity));
      if (available < minUnits) minUnits = available;
    }
    return Number.isFinite(minUnits) ? minUnits : 0;
  }, [compositionType, comboItems]);

  const activeProductId = editingDetail?.id ?? null;

  function handleAddAttribute() {
    const cleanName = newAttrName.trim();
    const values = newAttrValuesRaw
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (!cleanName || values.length === 0) return;

    setAttributes((prev) => [
      ...prev.filter((a) => a.name.toLowerCase() !== cleanName.toLowerCase()),
      { name: cleanName, values },
    ]);
    setNewAttrName("");
    setNewAttrValuesRaw("");
  }

  function handleAddComboComponent() {
    if (!selectedComponentId) return;
    const found = simpleOptions.find((o) => o.id === selectedComponentId);
    if (!found) return;
    if (comboItems.some((c) => c.componentProductId === found.id)) return;

    setComboItems((prev) => [
      ...prev,
      {
        componentProductId: found.id,
        quantity: 1,
        name: found.name,
        costPriceCents: found.costPriceCents,
        priceCents: found.priceCents,
        stockQuantity: found.stockQuantity,
        kind: found.kind,
        status: found.status,
      },
    ]);
    setSelectedComponentId("");
  }

  async function submitProduct(stayForMedia = false) {
    setFormError(null);
    const priceNum = Number(priceAmount);
    if (name.trim().length < 2) {
      setFormError("El nombre del producto debe tener al menos 2 caracteres.");
      setActiveTab("general");
      return;
    }
    if (description.trim().length < 5) {
      setFormError("La descripción comercial debe tener al menos 5 caracteres.");
      setActiveTab("general");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setFormError("El precio de venta debe ser mayor a cero.");
      setActiveTab("general");
      return;
    }
    if (compositionType === "combo" && comboItems.length === 0) {
      setFormError("Agrega al menos un producto simple para armar el combo.");
      setActiveTab("attributes");
      return;
    }
    if (botMasterPrompt.length > PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS) {
      setFormError(
        `El Prompt Maestro excede el límite de ${PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS} caracteres.`,
      );
      setActiveTab("prompt");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      sku: sku.trim() || null,
      category: category.trim() || null,
      brand: brand.trim() || null,
      kind,
      compositionType,
      condition,
      availability,
      status,
      currency,
      costPriceCents: costCents,
      priceCents: Math.round(priceNum * 100),
      salePriceCents: editTarget?.salePriceCents ?? null,
      stockQuantity:
        kind === "physical" && compositionType === "simple"
          ? Math.max(0, Math.round(Number(stockQuantity) || 0))
          : null,
      minStockThreshold:
        kind === "physical" && compositionType === "simple"
          ? Math.max(0, Math.round(Number(minStockThreshold) || 0))
          : null,
      attributes,
      ...(compositionType === "combo"
        ? {
            comboItems: comboItems.map((c, idx) => ({
              componentProductId: c.componentProductId,
              quantity: Math.max(1, Math.round(c.quantity)),
              sortOrder: idx,
            })),
          }
        : {}),
      botMasterPrompt,
    };

    setSaving(true);
    try {
      const isCreate = !activeProductId;
      const endpoint = isCreate
        ? "/api/tenant/products"
        : `/api/tenant/products/${activeProductId}`;
      const method = isCreate ? "POST" : "PUT";

      const res = await workspaceFetch<ProductDetailDto>(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.data) {
        setFormError(res.error || "No fue posible guardar el producto.");
        return;
      }

      setEditingDetail(res.data);
      setSavedSerialized(currentSerialized);
      if (stayForMedia) {
        onProductChanged?.(res.data);
        setActiveTab("media");
      } else {
        onSaved(res.data, { isCreate });
      }
    } finally {
      setSaving(false);
    }
  }

  async function refreshEditingDetail(productId: string) {
    const res = await workspaceFetch<ProductDetailDto>(`/api/tenant/products/${productId}`);
    if (res.ok && res.data) {
      setEditingDetail(res.data);
      onProductChanged?.(res.data);
    }
  }

  async function handleUploadMedia(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProductId || !mediaFile) return;

    setUploadingMedia(true);
    setMediaError(null);
    setMediaSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", mediaFile);
      formData.append("productId", activeProductId);
      if (mediaAltText.trim()) formData.append("altText", mediaAltText.trim());
      if (setAsCover) formData.append("setAsCover", "true");

      const res = await fetch("/api/tenant/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: string;
        data?: ProductMediaItemDto;
      };

      if (!res.ok) {
        setMediaError(body.detail || "No fue posible cargar el archivo multimedia.");
        return;
      }

      setMediaFile(null);
      setMediaAltText("");
      setSetAsCover(false);
      setMediaSuccess(
        locale === "en" ? "Media attached successfully." : "Archivo multimedia vinculado.",
      );
      await refreshEditingDetail(activeProductId);
    } catch {
      setMediaError("Error de conexión al cargar el archivo.");
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleSetCover(mediaId: string) {
    if (!activeProductId) return;
    setMediaError(null);
    const res = await workspaceFetch(
      `/api/tenant/products/${activeProductId}/media/${mediaId}/cover`,
      { method: "POST" },
    );
    if (!res.ok) {
      setMediaError(res.error || "No fue posible cambiar la portada.");
      return;
    }
    await refreshEditingDetail(activeProductId);
  }

  async function handleDeleteMedia(mediaId: string) {
    if (!activeProductId) return;
    setMediaError(null);
    const res = await workspaceFetch(
      `/api/tenant/products/${activeProductId}/media/${mediaId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setMediaError(res.error || "No fue posible eliminar el archivo.");
      return;
    }
    await refreshEditingDetail(activeProductId);
  }

  const tabs: Array<{ id: ProductFormTab; label: string }> = [
    { id: "general", label: dict.productsTabGeneral },
    { id: "stock", label: dict.productsTabStock },
    { id: "attributes", label: dict.productsTabAttributes },
    { id: "media", label: dict.productsTabMedia },
    { id: "prompt", label: dict.productsTabPrompt },
  ];

  const images = editingDetail?.media.images ?? [];
  const videos = editingDetail?.media.videos ?? [];
  const audios = editingDetail?.media.audios ?? [];
  const pdfs = editingDetail?.media.pdfs ?? [];

  const productPromptContext = useMemo<ProductPromptTemplateContext>(
    () => ({
      productName: name,
      description,
      category,
      brand,
      kind,
      compositionType,
      priceAmount,
      currency: editTarget?.currency ?? "COP",
      attributes: attributes.map((a) => ({
        key: a.name,
        value: a.values.join(", "),
      })),
      comboItems: comboItems.map((c) => ({
        name: c.name,
        quantity: c.quantity,
      })),
      mediaCounts: {
        image: images.length,
        video: videos.length,
        audio: audios.length,
        pdf: pdfs.length,
      },
      audioItems: audios.map((a, idx) => ({
        order: a.sortOrder && a.sortOrder > 0 ? a.sortOrder : idx + 1,
        filename: a.originalFilename,
        triggerHint: a.altText ?? undefined,
      })),
    }),
    [
      name,
      description,
      category,
      brand,
      kind,
      compositionType,
      priceAmount,
      editTarget?.currency,
      attributes,
      comboItems,
      images.length,
      videos.length,
      audios,
      pdfs.length,
    ],
  );

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) handleAttemptClose();
        }}
      >
        <DialogContent
          className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
          closeAriaLabel={dict.productsCloseModal}
          aria-label={activeProductId ? dict.productsFormEditTitle : dict.productsFormCreateTitle}
          disableInteractOutside={isDirty || saving}
          disableEscapeKeyDown={discardConfirmOpen}
        >
          {/* Encabezado */}
          <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
            <div className="flex items-center gap-2.5">
              <Package className="h-5 w-5 text-[var(--dsn-accent)]" />
              <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                {activeProductId ? dict.productsFormEditTitle : dict.productsFormCreateTitle}
              </DialogTitle>
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ProductFormTab)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {/* Pestañas */}
            <div className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-4 py-2">
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-[var(--dsn-accent)] data-[state=active]:text-white data-[state=active]:shadow-xs"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Contenido */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {loadingDetail && (
                <div className="py-10 text-center text-xs text-[var(--dsn-text-secondary)]">
                  {dict.productsLoadingForm}
                </div>
              )}

              {formError && (
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              {!loadingDetail && activeTab === "general" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor="product-name-input" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldNameLabel} *
                      </Label>
                      <Input
                        id="product-name-input"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={dict.productsFieldNamePlaceholder}
                        className="text-xs"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-sku-input" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldSkuLabel}
                      </Label>
                      <Input
                        id="product-sku-input"
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="CF-001"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <Label htmlFor="product-kind-select" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldKindLabel}
                      </Label>
                      <Select
                        id="product-kind-select"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as ProductKind)}
                        className="text-xs"
                      >
                        <option value="physical">{dict.productsFilterKindPhysical}</option>
                        <option value="digital">{dict.productsFilterKindDigital}</option>
                        <option value="service">{dict.productsFilterKindService}</option>
                      </Select>
                    </div>

                    <div>
                      <Label
                        htmlFor="product-composition-select"
                        className="mb-1 block text-xs font-semibold"
                      >
                        {dict.productsFieldCompositionLabel}
                      </Label>
                      <Select
                        id="product-composition-select"
                        value={compositionType}
                        onChange={(e) => setCompositionType(e.target.value as ProductCompositionType)}
                        className="text-xs"
                      >
                        <option value="simple">{dict.productsFilterCompositionSimple}</option>
                        <option value="combo">{dict.productsFilterCompositionCombo}</option>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="product-status-select" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldStatusLabel}
                      </Label>
                      <Select
                        id="product-status-select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ProductStatus)}
                        className="text-xs"
                      >
                        <option value="active">{dict.productsFilterStatusActive}</option>
                        <option value="draft">{dict.productsFilterStatusDraft}</option>
                        <option value="inactive">{dict.productsFilterStatusInactive}</option>
                      </Select>
                    </div>

                    <div>
                      <Label
                        htmlFor="product-condition-select"
                        className="mb-1 block text-xs font-semibold"
                      >
                        {dict.productsFieldConditionLabel}
                      </Label>
                      <Select
                        id="product-condition-select"
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as ProductCondition)}
                        className="text-xs"
                      >
                        <option value="new">{dict.productsFieldConditionNew}</option>
                        <option value="refurbished">{dict.productsFieldConditionRefurbished}</option>
                        <option value="used">{dict.productsFieldConditionUsed}</option>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label
                        htmlFor="product-category-input"
                        className="mb-1 block text-xs font-semibold"
                      >
                        {dict.productsFieldCategoryLabel}
                      </Label>
                      <Input
                        id="product-category-input"
                        type="text"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="Bebidas"
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-brand-input" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldBrandLabel}
                      </Label>
                      <Input
                        id="product-brand-input"
                        type="text"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        placeholder="Origen Café"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <AiEnhanceTextarea
                    id="product-description-input"
                    fieldKey="product.description"
                    label={dict.productsFieldDescriptionLabel}
                    value={description}
                    onChange={setDescription}
                    context={{ productName: name, category, kind }}
                    placeholder={dict.productsFieldDescriptionPlaceholder}
                    rows={3}
                    required
                    hasInferenceAccess={hasInferenceAccess}
                    locale={locale}
                  />

                  {/* Precios y Rentabilidad en Tiempo Real */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="product-cost-input" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldCostLabel}
                      </Label>
                      <Input
                        id="product-cost-input"
                        type="number"
                        min="0"
                        step="1"
                        value={costAmount}
                        onChange={(e) => setCostAmount(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-price-input" className="mb-1 block text-xs font-semibold">
                        {dict.productsFieldPriceLabel} *
                      </Label>
                      <Input
                        id="product-price-input"
                        type="number"
                        min="1"
                        step="1"
                        value={priceAmount}
                        onChange={(e) => setPriceAmount(e.target.value)}
                        placeholder="35000"
                        className="font-mono text-xs"
                        required
                      />
                    </div>
                  </div>

                  {compositionType === "combo" && suggestedComboCostCents > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-300">
                      <span>
                        {dict.productsComboSuggestedCostHint}:{" "}
                        <strong className="font-mono">
                          {formatMoneyCents(suggestedComboCostCents, currency, locale)}
                        </strong>
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setCostAmount(String(Math.round(suggestedComboCostCents / 100)))}
                        className="border-indigo-400/30 bg-indigo-500/20 text-[11px] hover:bg-indigo-500/30"
                      >
                        {dict.productsComboApplySuggestedCost}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5 text-xs">
                    <p className="font-semibold text-[var(--dsn-text)]">{dict.productsProfitCardTitle}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.productsProfitAmountLabel}
                        </span>
                        <p
                          className={`font-mono font-bold ${
                            profitability.isNegative ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {formatMoneyCents(profitability.profitCents, currency, locale)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.productsProfitMarginLabel}
                        </span>
                        <p className="font-mono font-bold text-[var(--dsn-text)]">
                          {profitability.marginPct}%
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.productsProfitMarkupLabel}
                        </span>
                        <p className="font-mono font-bold text-[var(--dsn-text)]">
                          {profitability.markupPct === null ? "N/A" : `${profitability.markupPct}%`}
                        </p>
                      </div>
                    </div>
                    {profitability.isNegative && (
                      <p className="flex items-center gap-1.5 text-[11px] text-rose-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{dict.productsProfitNegativeWarning}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!loadingDetail && activeTab === "stock" && (
                <div className="space-y-4">
                  {kind !== "physical" ? (
                    <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 text-xs text-[var(--dsn-text-secondary)]">
                      {dict.productsStockNonPhysicalNotice}
                    </div>
                  ) : compositionType === "combo" ? (
                    <div className="space-y-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-xs text-indigo-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <Layers className="h-4 w-4" />
                        <span>{dict.productsStockComboNotice}</span>
                      </div>
                      <p className="font-mono text-sm font-bold">
                        {dict.productsColStock}:{" "}
                        {computedComboStock === null ? dict.productsUnlimitedStock : computedComboStock}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <Label
                          htmlFor="product-stock-qty-input"
                          className="mb-1 block text-xs font-semibold"
                        >
                          {dict.productsFieldStockQtyLabel}
                        </Label>
                        <Input
                          id="product-stock-qty-input"
                          type="number"
                          min="0"
                          step="1"
                          value={stockQuantity}
                          onChange={(e) => setStockQuantity(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="product-min-threshold-input"
                          className="mb-1 block text-xs font-semibold"
                        >
                          {dict.productsFieldMinThresholdLabel}
                        </Label>
                        <Input
                          id="product-min-threshold-input"
                          type="number"
                          min="0"
                          step="1"
                          value={minStockThreshold}
                          onChange={(e) => setMinStockThreshold(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor="product-availability-select"
                          className="mb-1 block text-xs font-semibold"
                        >
                          {dict.productsFieldAvailabilityLabel}
                        </Label>
                        <Select
                          id="product-availability-select"
                          value={availability}
                          onChange={(e) => setAvailability(e.target.value as ProductAvailability)}
                          className="text-xs"
                        >
                          <option value="in_stock">{dict.productsAvailabilityInStock}</option>
                          <option value="out_of_stock">{dict.productsAvailabilityOutOfStock}</option>
                          <option value="preorder">{dict.productsAvailabilityPreorder}</option>
                          <option value="backorder">{dict.productsAvailabilityBackorder}</option>
                        </Select>
                      </div>
                    </div>
                  )}

                  {kind === "physical" && compositionType === "simple" && (
                    <p className="flex items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
                      <Box className="h-4 w-4 shrink-0 text-[var(--dsn-accent)]" />
                      <span>{dict.productsFieldMinThresholdHelp}</span>
                    </p>
                  )}
                </div>
              )}

              {!loadingDetail && activeTab === "attributes" && (
                <div className="space-y-6">
                  {/* Atributos Dinámicos */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-[var(--dsn-text)]">
                      {dict.productsAttributesTitle}
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <Input
                        type="text"
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                        placeholder={dict.productsAttributeNamePlaceholder}
                        className="text-xs sm:col-span-4"
                      />
                      <Input
                        type="text"
                        value={newAttrValuesRaw}
                        onChange={(e) => setNewAttrValuesRaw(e.target.value)}
                        placeholder={dict.productsAttributeValuesPlaceholder}
                        className="text-xs sm:col-span-5"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAddAttribute}
                        className="sm:col-span-3"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{dict.productsAttributesAddGroup}</span>
                      </Button>
                    </div>

                    {attributes.length > 0 && (
                      <div className="space-y-2">
                        {attributes.map((attr) => (
                          <div
                            key={attr.name}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-3 py-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-[var(--dsn-text)]">{attr.name}:</span>
                              {attr.values.map((val) => (
                                <Badge key={val} variant="outline" className="text-[11px]">
                                  {val}
                                </Badge>
                              ))}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setAttributes((prev) => prev.filter((item) => item.name !== attr.name))
                              }
                              className="h-7 w-7 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                              aria-label={`${dict.productsActionDelete} ${attr.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Constructor de Combos */}
                  {compositionType === "combo" && (
                    <div className="space-y-3 border-t border-[var(--dsn-border)] pt-5">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-1.5 text-xs font-bold text-[var(--dsn-text)]">
                          <Layers className="h-4 w-4 text-indigo-400" />
                          <span>{dict.productsComboTitle}</span>
                        </h4>
                      </div>

                      <p className="text-xs text-[var(--dsn-text-secondary)]">
                        {dict.productsComboEmptyHint}
                      </p>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={selectedComponentId}
                          onChange={(e) => setSelectedComponentId(e.target.value)}
                          className="flex-1 text-xs"
                        >
                          <option value="">{dict.productsComboSelectPlaceholder}</option>
                          {simpleOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name} ({formatMoneyCents(opt.priceCents, opt.currency, locale)})
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          onClick={handleAddComboComponent}
                          disabled={!selectedComponentId}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{dict.productsComboAddItem}</span>
                        </Button>
                      </div>

                      {comboItems.length > 0 && (
                        <div className="space-y-2">
                          {comboItems.map((item) => (
                            <div
                              key={item.componentProductId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3 text-xs"
                            >
                              <div>
                                <p className="font-semibold text-[var(--dsn-text)]">{item.name}</p>
                                <p className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                                  {formatMoneyCents(
                                    item.costPriceCents > 0 ? item.costPriceCents : item.priceCents,
                                    currency,
                                    locale,
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-[11px] font-normal text-[var(--dsn-text-secondary)]">
                                  {dict.productsComboQtyLabel}
                                </Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="999"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                                    setComboItems((prev) =>
                                      prev.map((c) =>
                                        c.componentProductId === item.componentProductId
                                          ? { ...c, quantity: q }
                                          : c,
                                      ),
                                    );
                                  }}
                                  className="h-8 w-16 px-2 py-1 text-center font-mono text-xs"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setComboItems((prev) =>
                                      prev.filter(
                                        (c) => c.componentProductId !== item.componentProductId,
                                      ),
                                    )
                                  }
                                  className="h-7 w-7 text-rose-400 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!loadingDetail && activeTab === "media" && (
                <div className="space-y-5">
                  {!activeProductId ? (
                    <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-5 text-center">
                      <UploadCloud className="mx-auto h-8 w-8 text-[var(--dsn-accent)]" />
                      <p className="text-xs text-[var(--dsn-text-secondary)]">
                        {dict.productsMediaSaveFirstHint}
                      </p>
                      <Button
                        type="button"
                        onClick={() => void submitProduct(true)}
                        disabled={saving}
                        loading={saving}
                        loadingText={dict.productsSavingProduct}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{dict.productsSaveProduct}</span>
                      </Button>
                    </div>
                  ) : (
                    <>
                      {billing && (
                        <div className="flex flex-wrap gap-2 text-[11px] text-[var(--dsn-text-secondary)]">
                          <span>
                            {dict.productsMediaImagesHeading}:{" "}
                            {billing.mediaLimits.imagesPerProduct.mode === "UNLIMITED"
                              ? dict.billingUnlimited
                              : `${images.length}/${billing.mediaLimits.imagesPerProduct.value ?? 0}`}
                          </span>
                          <span>·</span>
                          <span>
                            {dict.productsMediaVideosHeading}:{" "}
                            {billing.mediaLimits.videosPerProduct.mode === "UNLIMITED"
                              ? dict.billingUnlimited
                              : `${videos.length}/${billing.mediaLimits.videosPerProduct.value ?? 0}`}
                          </span>
                          <span>·</span>
                          <span>
                            {dict.productsMediaAudiosHeading}:{" "}
                            {billing.mediaLimits.audiosPerProduct.mode === "UNLIMITED"
                              ? dict.billingUnlimited
                              : `${audios.length}/${billing.mediaLimits.audiosPerProduct.value ?? 0}`}
                          </span>
                          <span>·</span>
                          <span>
                            {dict.productsMediaPdfsHeading}:{" "}
                            {billing.mediaLimits.pdfsPerProduct.mode === "UNLIMITED"
                              ? dict.billingUnlimited
                              : `${pdfs.length}/${billing.mediaLimits.pdfsPerProduct.value ?? 0}`}
                          </span>
                        </div>
                      )}

                      {mediaError && (
                        <Alert variant="error">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <AlertDescription>{mediaError}</AlertDescription>
                        </Alert>
                      )}
                      {mediaSuccess && (
                        <Alert variant="success">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <AlertDescription>{mediaSuccess}</AlertDescription>
                        </Alert>
                      )}

                      <form
                        onSubmit={handleUploadMedia}
                        className="space-y-3 rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4"
                      >
                        <p className="text-xs font-semibold text-[var(--dsn-text)]">
                          {dict.productsMediaUploadTitle}
                        </p>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.productsMediaSelectHelp}
                        </p>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/mp4,application/pdf"
                            onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                            className="text-xs text-[var(--dsn-text-secondary)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--dsn-accent)] file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                          />
                          <Input
                            type="text"
                            value={mediaAltText}
                            onChange={(e) => setMediaAltText(e.target.value)}
                            placeholder={dict.productsMediaAltLabel}
                            className="text-xs"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 text-xs text-[var(--dsn-text)]">
                            <Checkbox
                              checked={setAsCover}
                              onCheckedChange={(checked) => setSetAsCover(checked === true)}
                            />
                            <span>{dict.productsMediaSetCoverCheck}</span>
                          </label>

                          <Button
                            type="submit"
                            disabled={uploadingMedia || !mediaFile}
                            loading={uploadingMedia}
                            loadingText={dict.productsMediaUploadingAction}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            <span>{dict.productsMediaUploadAction}</span>
                          </Button>
                        </div>
                      </form>

                      {/* Imágenes y selector de Portada */}
                      {images.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-xs font-semibold text-[var(--dsn-text)]">
                            {dict.productsMediaImagesHeading}
                          </h5>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {images.map((img) => (
                              <div
                                key={img.mediaId}
                                className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30"
                              >
                                <div className="relative aspect-square">
                                  <img
                                    src={img.thumbUrl || img.url}
                                    alt={img.altText || img.originalFilename}
                                    className="h-full w-full object-cover"
                                  />
                                  {img.isCover && (
                                    <Badge
                                      variant="amber"
                                      className="absolute top-1.5 left-1.5 bg-amber-500 text-[10px] text-black"
                                    >
                                      <Star className="h-2.5 w-2.5 fill-black" />
                                      <span>{dict.productsMediaCoverBadge}</span>
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-1 p-2 text-[11px]">
                                  {!img.isCover ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleSetCover(img.mediaId)}
                                      className="h-6 min-h-0 px-2 py-0.5 text-[10px]"
                                    >
                                      {dict.productsMediaMakeCoverAction}
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] font-medium text-amber-400">
                                      {dict.productsMediaCoverBadge}
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void handleDeleteMedia(img.mediaId)}
                                    className="h-7 w-7 text-rose-400 hover:bg-rose-500/10"
                                    title={dict.productsActionDelete}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Videos, Audios, PDFs */}
                      {[...videos, ...audios, ...pdfs].length > 0 && (
                        <div className="space-y-2">
                          {[...videos, ...audios, ...pdfs].map((item) => (
                            <div
                              key={item.mediaId}
                              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-3 py-2 text-xs"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {item.mediaKind === "video" ? (
                                  <Video className="h-4 w-4 shrink-0 text-cyan-400" />
                                ) : item.mediaKind === "audio" ? (
                                  <Music className="h-4 w-4 shrink-0 text-emerald-400" />
                                ) : (
                                  <FileText className="h-4 w-4 shrink-0 text-rose-400" />
                                )}
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate font-medium text-[var(--dsn-text)] hover:underline"
                                >
                                  {item.originalFilename}
                                </a>
                                <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                                  {formatStorageBytes(item.sizeBytes)}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleDeleteMedia(item.mediaId)}
                                className="h-7 w-7 text-rose-400 hover:bg-rose-500/10"
                                title={dict.productsActionDelete}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!loadingDetail && activeTab === "prompt" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.productsPromptHelp}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const tpl = buildRecommendedProductPromptTemplate(
                          locale,
                          productPromptContext,
                        );
                        setBotMasterPrompt((prev) =>
                          applyRecommendedProductPromptTemplate(prev, tpl, locale).slice(
                            0,
                            PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS,
                          ),
                        );
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                      <span>{dict.productsPromptInsertTemplate}</span>
                    </Button>
                  </div>

                  <AiEnhanceTextarea
                    id="product-bot-master-prompt-input"
                    fieldKey="product.bot_master_prompt"
                    label={dict.productsPromptLabel}
                    value={botMasterPrompt}
                    onChange={(nextVal) =>
                      setBotMasterPrompt(nextVal.slice(0, PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS))
                    }
                    fallbackDraft={
                      description ||
                      buildRecommendedProductPromptTemplate(locale, productPromptContext)
                    }
                    context={productPromptContext as Record<string, unknown>}
                    placeholder={buildRecommendedProductPromptTemplate(
                      locale,
                      productPromptContext,
                    )}
                    rows={12}
                    hasInferenceAccess={hasInferenceAccess}
                    locale={locale}
                  />

                  <div className="flex justify-end font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                    {botMasterPrompt.length.toLocaleString()} /{" "}
                    {PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS.toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </Tabs>

          {/* Footer */}
          <DialogFooter className="border-t border-[var(--dsn-border)] px-5 py-3.5">
            <Button type="button" variant="outline" onClick={handleAttemptClose}>
              {dict.productsCancelAction}
            </Button>
            <Button
              type="button"
              onClick={() => void submitProduct(false)}
              disabled={saving || loadingDetail}
              loading={saving}
              loadingText={dict.productsSavingProduct}
            >
              {dict.productsSaveProduct}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
        title={dict.saveBarModalTitle}
        subtitle={dict.saveBarModalSubtitle}
        variant="warning"
        details={[
          {
            label: dict.saveBarModalDetailSection,
            value: activeProductId ? dict.productsFormEditTitle : dict.productsFormCreateTitle,
          },
        ]}
        warningMessage={dict.saveBarModalWarning}
        confirmText={dict.saveBarModalConfirmDiscard}
        cancelText={dict.saveBarModalKeepEditing}
      />
    </>
  );
}
