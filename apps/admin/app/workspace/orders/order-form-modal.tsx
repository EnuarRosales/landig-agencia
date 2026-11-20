"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  MapPin,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
} from "lucide-react";
import type {
  CrmContactDetailDto,
  CrmContactListItemDto,
  OrderDetailDto,
  ProductDetailDto,
  ProductDynamicAttribute,
  ProductListItemDto,
  RepeatOrderResult,
  TenantPaymentChannelDto,
} from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { GeoAddressFields, type GeoAddressFieldValues } from "@/components/geo-address-fields";
import { PhoneE164Input } from "@/components/phone-e164-input";
import { formatOrderMoneyCents } from "./order-ui-helpers";

interface EditableOrderItem {
  key: string;
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  selectedAttributes: Record<string, string>;
  availableAttributes: ProductDynamicAttribute[];
}

export interface OrderFormModalProps {
  isOpen: boolean;
  mode: "create" | "edit" | "repeat";
  initialOrder?: OrderDetailDto | null;
  repeatPayload?: RepeatOrderResult | null;
  currency: string;
  locale: AdminLocale;
  carriers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (saved: OrderDetailDto) => void;
}

const DEFAULT_GEO: GeoAddressFieldValues = {
  countryCode: "CO",
  country: "Colombia",
  subdivisionCode: "",
  state: "",
  city: "",
  neighborhood: "",
  addressLine: "",
  addressComplement: "",
  postalCode: "",
  referenceNotes: "",
};

function resolveInitialOrderFormState(
  mode: "create" | "edit" | "repeat",
  initialOrder?: OrderDetailDto | null,
  repeatPayload?: RepeatOrderResult | null,
) {
  if (mode === "edit" && initialOrder) {
    return {
      contactId: initialOrder.contactId ?? undefined,
      selectedAddressId: initialOrder.contactAddressId ?? "",
      customerName: initialOrder.customerName,
      customerPhone: initialOrder.customerPhone,
      customerDocument: initialOrder.customerDocument ?? "",
      shippingMethod: (initialOrder.shippingMethod as "home" | "office") || "home",
      geo: {
        countryCode: initialOrder.countryCode || "CO",
        subdivisionCode: initialOrder.subdivisionCode ?? "",
        state: initialOrder.state ?? "",
        city: initialOrder.city ?? "",
        neighborhood: initialOrder.neighborhood ?? "",
        addressLine: initialOrder.addressLine ?? "",
        addressComplement: initialOrder.addressComplement ?? "",
        postalCode: initialOrder.postalCode ?? "",
        referenceNotes: initialOrder.referenceNotes ?? "",
      },
      paymentChannelId: initialOrder.paymentChannelId ?? "",
      paymentMethod: initialOrder.paymentMethod,
      paymentStatus: (initialOrder.paymentStatus === "paid" ? "paid" : "pending") as
        | "pending"
        | "paid",
      initialStatus: "pending_confirmation" as "pending_confirmation" | "confirmed",
      carrierName: initialOrder.carrierName ?? "",
      shippingCop: String(Math.round(initialOrder.shippingCents / 100)),
      discountCop: String(Math.round(initialOrder.discountCents / 100)),
      notes: initialOrder.notes ?? "",
      items: initialOrder.items.map((it, idx) => ({
        key: `${it.id}-${idx}`,
        productId: it.productId ?? undefined,
        productName: it.productName,
        productSku: it.productSku ?? undefined,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        unitCostCents: it.unitCostCents,
        selectedAttributes: it.selectedAttributes ?? {},
        availableAttributes: [],
      })),
    };
  }

  if (mode === "repeat" && repeatPayload) {
    const d = repeatPayload.draft;
    return {
      contactId: d.contactId ?? d.prospectId,
      selectedAddressId: d.shipping.contactAddressId ?? "",
      customerName: d.customer.name,
      customerPhone: d.customer.phone,
      customerDocument: d.customer.document ?? "",
      shippingMethod: (d.shipping.method || "home") as "home" | "office",
      geo: {
        countryCode: d.shipping.countryCode || "CO",
        subdivisionCode: d.shipping.subdivisionCode ?? "",
        state: d.shipping.state ?? "",
        city: d.shipping.city ?? "",
        neighborhood: d.shipping.neighborhood ?? "",
        addressLine: d.shipping.addressLine ?? "",
        addressComplement: d.shipping.addressComplement ?? "",
        postalCode: d.shipping.postalCode ?? "",
        referenceNotes: d.shipping.referenceNotes ?? "",
      },
      paymentChannelId: d.paymentChannelId ?? "",
      paymentMethod: d.paymentMethod || "Contraentrega",
      paymentStatus: "pending" as "pending" | "paid",
      initialStatus: "pending_confirmation" as "pending_confirmation" | "confirmed",
      carrierName: d.shipping.carrierName ?? "",
      shippingCop: String(Math.round((d.shipping.shippingCents ?? 0) / 100)),
      discountCop: "0",
      notes: d.notes ?? "",
      items: d.items.map((it, idx) => ({
        key: `rep-${idx}-${it.productId ?? "m"}`,
        productId: it.productId,
        productName: it.productName,
        productSku: it.productSku,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        unitCostCents: it.unitCostCents ?? 0,
        selectedAttributes: it.selectedAttributes ?? {},
        availableAttributes: [],
      })),
    };
  }

  return {
    contactId: undefined as string | undefined,
    selectedAddressId: "",
    customerName: "",
    customerPhone: "+57",
    customerDocument: "",
    shippingMethod: "home" as "home" | "office",
    geo: DEFAULT_GEO,
    paymentChannelId: "",
    paymentMethod: "Contraentrega",
    paymentStatus: "pending" as "pending" | "paid",
    initialStatus: "pending_confirmation" as "pending_confirmation" | "confirmed",
    carrierName: "",
    shippingCop: "0",
    discountCop: "0",
    notes: "",
    items: [] as EditableOrderItem[],
  };
}

export function OrderFormModal(props: OrderFormModalProps) {
  if (!props.isOpen) return null;
  const instanceKey = `${props.mode}-${props.initialOrder?.id ?? props.repeatPayload?.repeatedFromOrderId ?? "new"}`;
  return <OrderFormModalBody key={instanceKey} {...props} />;
}

function OrderFormModalBody({
  mode,
  initialOrder,
  repeatPayload,
  currency,
  locale,
  carriers,
  onClose,
  onSaved,
}: OrderFormModalProps) {
  const w = getAdminDictionary(locale).workspace;
  const initialState = resolveInitialOrderFormState(mode, initialOrder, repeatPayload);

  const [contactId, setContactId] = useState<string | undefined>(initialState.contactId);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<CrmContactListItemDto[]>([]);
  const [contactAddresses, setContactAddresses] = useState<CrmContactDetailDto["addresses"]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    initialState.selectedAddressId,
  );

  const [customerName, setCustomerName] = useState(initialState.customerName);
  const [customerPhone, setCustomerPhone] = useState(initialState.customerPhone);
  const [customerDocument, setCustomerDocument] = useState(initialState.customerDocument);
  const [shippingMethod, setShippingMethod] = useState<"home" | "office">(
    initialState.shippingMethod,
  );
  const [geo, setGeo] = useState<Partial<GeoAddressFieldValues>>(initialState.geo);

  const [paymentChannels, setPaymentChannels] = useState<TenantPaymentChannelDto[]>([]);
  const [paymentChannelId, setPaymentChannelId] = useState<string>(initialState.paymentChannelId);
  const [paymentMethod, setPaymentMethod] = useState(initialState.paymentMethod);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid">(
    initialState.paymentStatus,
  );
  const [initialStatus, setInitialStatus] = useState<"pending_confirmation" | "confirmed">(
    initialState.initialStatus,
  );
  const [carrierName, setCarrierName] = useState(initialState.carrierName);
  const [shippingCop, setShippingCop] = useState(initialState.shippingCop);
  const [discountCop, setDiscountCop] = useState(initialState.discountCop);
  const [notes, setNotes] = useState(initialState.notes);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductListItemDto[]>([]);
  const [items, setItems] = useState<EditableOrderItem[]>(initialState.items);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    workspaceFetch<TenantPaymentChannelDto[]>("/api/tenant/payment-channels")
      .then((res) => {
        if (res.ok && Array.isArray(res.data)) {
          setPaymentChannels(res.data.filter((c) => c.isActive));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialState.contactId) return;
    workspaceFetch<CrmContactDetailDto>(`/api/tenant/contacts/${initialState.contactId}`)
      .then((res) => {
        if (res.ok && res.data) {
          setContactAddresses(res.data.addresses ?? []);
        }
      })
      .catch(() => {});
  }, [initialState.contactId]);

  useEffect(() => {
    const trimmed = contactQuery.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      workspaceFetch<{ items?: CrmContactListItemDto[] }>(
        `/api/tenant/contacts?q=${encodeURIComponent(trimmed)}&limit=8`,
      )
        .then((res) => {
          if (res.ok && Array.isArray(res.data?.items)) {
            setContactResults(res.data.items);
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [contactQuery]);

  useEffect(() => {
    const trimmed = productQuery.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      workspaceFetch<{ items?: ProductListItemDto[] }>(
        `/api/tenant/products?status=active&q=${encodeURIComponent(trimmed)}&limit=10`,
      )
        .then((res) => {
          if (res.ok && Array.isArray(res.data?.items)) {
            setProductResults(res.data.items);
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery]);

  async function loadContactAddresses(cId: string) {
    try {
      const res = await workspaceFetch<CrmContactDetailDto>(`/api/tenant/contacts/${cId}`);
      if (res.ok && res.data) {
        setContactAddresses(res.data.addresses ?? []);
        return res.data;
      }
    } catch {
      // Silencioso en precarga auxiliar
    }
    return null;
  }

  async function handleSelectContact(c: CrmContactListItemDto) {
    setContactId(c.id);
    setCustomerName(c.fullName);
    if (c.phoneMobile) setCustomerPhone(c.phoneMobile);
    if (c.documentNumber) setCustomerDocument(c.documentNumber);
    setContactQuery("");
    setContactResults([]);

    const detail = await loadContactAddresses(c.id);
    const defaultAddr =
      detail?.addresses.find((a) => a.isDefault) ?? detail?.addresses[0];
    if (defaultAddr) {
      applySavedAddress(defaultAddr);
    }
  }

  function applySavedAddress(addr: CrmContactDetailDto["addresses"][number]) {
    setSelectedAddressId(addr.id);
    setGeo({
      countryCode: addr.countryCode,
      country: addr.country,
      subdivisionCode: addr.subdivisionCode ?? "",
      state: addr.state ?? "",
      city: addr.city,
      neighborhood: addr.neighborhood ?? "",
      addressLine: addr.addressLine,
      addressComplement: addr.addressComplement ?? "",
      postalCode: addr.postalCode ?? "",
      referenceNotes: addr.referenceNotes ?? "",
    });
  }

  async function handleAddCatalogProduct(prod: ProductListItemDto) {
    let attrs: ProductDynamicAttribute[] = [];
    try {
      const res = await workspaceFetch<ProductDetailDto>(`/api/tenant/products/${prod.id}`);
      if (res.ok && res.data) {
        attrs = res.data.attributes ?? [];
      }
    } catch {
      // Fallback sin atributos dinámicos
    }

    const defaultAttrs: Record<string, string> = {};
    for (const a of attrs) {
      if (a.values.length > 0) {
        defaultAttrs[a.name] = a.values[0]!;
      }
    }

    const effectivePrice =
      prod.salePriceCents !== null && prod.salePriceCents > 0
        ? prod.salePriceCents
        : prod.priceCents;

    setItems((prev) => [
      ...prev,
      {
        key: `${prod.id}-${Date.now()}-${Math.random()}`,
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku ?? undefined,
        quantity: 1,
        unitPriceCents: effectivePrice,
        unitCostCents: prod.costPriceCents ?? 0,
        selectedAttributes: defaultAttrs,
        availableAttributes: attrs,
      },
    ]);
    setProductQuery("");
    setProductResults([]);
  }

  function handleAddManualItem() {
    setItems((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${Math.random()}`,
        productName: "",
        quantity: 1,
        unitPriceCents: 0,
        unitCostCents: 0,
        selectedAttributes: {},
        availableAttributes: [],
      },
    ]);
  }

  const totals = useMemo(() => {
    const subtotalCents = items.reduce(
      (acc, it) => acc + Math.max(0, it.quantity) * Math.max(0, it.unitPriceCents),
      0,
    );
    const shippingCents = Math.max(0, Math.round((Number(shippingCop) || 0) * 100));
    const discountCents = Math.max(0, Math.round((Number(discountCop) || 0) * 100));
    const totalCents = Math.max(0, subtotalCents + shippingCents - discountCents);
    return { subtotalCents, shippingCents, discountCents, totalCents };
  }, [items, shippingCop, discountCop]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (items.length === 0) {
      setErrorMsg(
        locale === "en"
          ? "Add at least one item to the order."
          : "Agrega al menos un producto al pedido.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contactId,
        ...(mode !== "edit" ? { initialStatus } : {}),
        paymentMethod,
        paymentChannelId: paymentChannelId || undefined,
        paymentStatus,
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          document: customerDocument.trim() || undefined,
        },
        shipping: {
          method: shippingMethod,
          contactAddressId: selectedAddressId || undefined,
          countryCode: geo.countryCode || "CO",
          subdivisionCode: geo.subdivisionCode || undefined,
          state: geo.state || undefined,
          city: geo.city || undefined,
          addressLine: geo.addressLine || undefined,
          addressComplement: geo.addressComplement || undefined,
          neighborhood: geo.neighborhood || undefined,
          postalCode: geo.postalCode || undefined,
          referenceNotes: geo.referenceNotes || undefined,
          carrierName: carrierName.trim() || undefined,
          shippingCents: totals.shippingCents,
        },
        items: items.map((it) => ({
          ...(it.productId ? { productId: it.productId } : {}),
          productName: it.productName.trim(),
          ...(it.productSku ? { productSku: it.productSku } : {}),
          quantity: it.quantity,
          unitPriceCents: it.unitPriceCents,
          unitCostCents: it.unitCostCents,
          selectedAttributes:
            Object.keys(it.selectedAttributes).length > 0 ? it.selectedAttributes : null,
        })),
        discountCents: totals.discountCents,
        currency,
        notes: notes.trim() || undefined,
        ...(mode === "repeat" && repeatPayload
          ? { repeatedFromOrderId: repeatPayload.repeatedFromOrderId }
          : {}),
      };

      const url =
        mode === "edit" && initialOrder
          ? `/api/tenant/orders/${initialOrder.id}`
          : "/api/tenant/orders";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await workspaceFetch<OrderDetailDto>(url, {
        method,
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.data) {
        setErrorMsg(res.error || "No se pudo guardar el pedido.");
        return;
      }

      onSaved(res.data);
      onClose();
    } catch {
      setErrorMsg("Error de conexión al guardar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "edit"
      ? w.ordersFormEditTitle
      : mode === "repeat"
        ? w.ordersFormRepeatTitle
        : w.ordersFormCreateTitle;

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
        closeAriaLabel={w.ordersDetailClose}
        aria-labelledby="order-form-modal-title"
        disableEscapeKeyDown={saving}
        disableInteractOutside={saving}
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-2.5 space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
          <ShoppingCart className="h-5 w-5 text-[var(--dsn-accent)]" />
          <DialogTitle
            id="order-form-modal-title"
            className="text-base font-bold text-[var(--dsn-text)] sm:text-lg"
          >
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto p-5">
          {mode === "repeat" && repeatPayload && repeatPayload.warnings.length > 0 && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle>{w.ordersFormRepeatWarningsTitle}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-5">
                  {repeatPayload.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <section className="space-y-3 rounded-xl border border-[var(--dsn-border)] p-4">
            <div className="relative">
              <Label htmlFor="order-crm-contact-search" className="mb-1 block text-xs font-semibold">
                {w.ordersFormContactSearchLabel}
              </Label>
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                <Input
                  id="order-crm-contact-search"
                  type="search"
                  value={contactQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setContactQuery(next);
                    if (!next.trim()) setContactResults([]);
                  }}
                  placeholder={w.ordersFormContactSearchPlaceholder}
                  className="pl-9 text-sm"
                />
              </div>
              {contactResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full divide-y divide-[var(--dsn-border)] overflow-y-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-xl">
                  {contactResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectContact(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      <span className="font-semibold text-[var(--dsn-text)]">{c.fullName}</span>
                      <span className="font-mono text-[var(--dsn-text-secondary)]">
                        {c.phoneMobile || c.email || ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {contactId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--dsn-accent)]/10 px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--dsn-accent)]">
                  <UserCheck className="h-3.5 w-3.5" />
                  {customerName}
                </span>
                {contactAddresses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <Select
                      aria-label={w.ordersFormSavedAddressLabel}
                      value={selectedAddressId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedAddressId(id);
                        const found = contactAddresses.find((a) => a.id === id);
                        if (found) applySavedAddress(found);
                      }}
                      className="h-auto w-auto px-2 py-1 text-xs"
                    >
                      <option value="">{w.ordersFormManualAddressOpt}</option>
                      {contactAddresses.map((addr) => (
                        <option key={addr.id} value={addr.id}>
                          {addr.label} · {addr.city} ({addr.addressLine})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="order-customer-name" className="mb-1 block text-xs font-medium">
                  {w.ordersFormCustomerNameLabel}
                </Label>
                <Input
                  id="order-customer-name"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <PhoneE164Input
                  id="order-customer-phone"
                  label={w.ordersFormCustomerPhoneLabel}
                  value={customerPhone}
                  onChange={(val) => setCustomerPhone(val)}
                  defaultCountryCode={geo.countryCode || "CO"}
                  locale={locale}
                  required
                />
              </div>
              <div>
                <Label htmlFor="order-customer-doc" className="mb-1 block text-xs font-medium">
                  {w.ordersFormCustomerDocLabel}
                </Label>
                <Input
                  id="order-customer-doc"
                  value={customerDocument}
                  required={shippingMethod === "office"}
                  onChange={(e) => setCustomerDocument(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="order-shipping-method" className="mb-1 block text-xs font-medium">
                  {w.ordersFormShippingMethodLabel}
                </Label>
                <Select
                  id="order-shipping-method"
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value as "home" | "office")}
                  className="text-sm"
                >
                  <option value="home">{w.ordersFormShippingHome}</option>
                  <option value="office">{w.ordersFormShippingOffice}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="order-carrier-name" className="mb-1 block text-xs font-medium">
                  {w.ordersFormCarrierLabel}
                </Label>
                <Input
                  id="order-carrier-name"
                  list="order-form-carriers-list"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  placeholder="Servientrega, Interrapidísimo..."
                  className="text-sm"
                />
                <datalist id="order-form-carriers-list">
                  {carriers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <GeoAddressFields
              values={geo}
              onChange={(patch) => setGeo((prev) => ({ ...prev, ...patch }))}
              locale={locale}
              idPrefix="order-geo"
            />
          </section>

          <section className="space-y-3 rounded-xl border border-[var(--dsn-border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[var(--dsn-text)]">{w.ordersFormItemsTitle}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddManualItem}
                className="h-7 min-h-0 px-2.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                {w.ordersFormAddManualItem}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-[var(--dsn-text-secondary)]" />
              <Input
                type="search"
                aria-label={w.ordersFormAddProductSearch}
                value={productQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  setProductQuery(next);
                  if (!next.trim()) setProductResults([]);
                }}
                placeholder={w.ordersFormAddProductSearch}
                className="pl-9 text-sm"
              />
              {productResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full divide-y divide-[var(--dsn-border)] overflow-y-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-xl">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddCatalogProduct(p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      <span className="font-semibold text-[var(--dsn-text)]">
                        {p.name}
                        {p.sku ? ` (${p.sku})` : ""}
                      </span>
                      <span className="font-mono text-[var(--dsn-accent)]">
                        {formatOrderMoneyCents(
                          p.salePriceCents && p.salePriceCents > 0 ? p.salePriceCents : p.priceCents,
                          currency,
                          locale,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.key}
                  className="space-y-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3"
                >
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <Input
                        required
                        value={item.productName}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, productName: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Nombre del producto"
                        className="h-8 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        type="number"
                        min={1}
                        required
                        aria-label={w.ordersFormItemQtyLabel}
                        value={item.quantity}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : x,
                            ),
                          )
                        }
                        className="h-8 px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        type="number"
                        min={0}
                        required
                        aria-label={w.ordersFormItemPriceLabel}
                        value={Math.round(item.unitPriceCents / 100)}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    unitPriceCents: Math.max(
                                      0,
                                      Math.round((Number(e.target.value) || 0) * 100),
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                        className="h-8 px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="font-mono text-xs font-semibold text-[var(--dsn-text)]">
                        {formatOrderMoneyCents(
                          item.quantity * item.unitPriceCents,
                          currency,
                          locale,
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-7 w-7 text-rose-500 hover:bg-rose-500/10"
                        aria-label="Eliminar ítem"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {item.availableAttributes.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {item.availableAttributes.map((attr) => (
                        <div key={attr.name} className="flex items-center gap-1.5 text-xs">
                          <span className="font-medium text-[var(--dsn-text-secondary)]">
                            {attr.name}
                            {attr.requiredForOrder ? " *" : ""}:
                          </span>
                          <Select
                            value={item.selectedAttributes[attr.name] ?? ""}
                            required={Boolean(attr.requiredForOrder)}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        selectedAttributes: {
                                          ...x.selectedAttributes,
                                          [attr.name]: e.target.value,
                                        },
                                      }
                                    : x,
                                ),
                              )
                            }
                            className="h-auto w-auto px-2 py-1 text-xs"
                          >
                            {attr.values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-[var(--dsn-border)] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="order-payment-channel" className="mb-1 block text-xs font-medium">
                  {w.ordersFormPaymentChannelLabel}
                </Label>
                <Select
                  id="order-payment-channel"
                  value={paymentChannelId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPaymentChannelId(id);
                    const ch = paymentChannels.find((c) => c.id === id);
                    if (ch) setPaymentMethod(ch.displayName);
                  }}
                  className="text-sm"
                >
                  <option value="">{paymentMethod || "Manual / Contraentrega"}</option>
                  {paymentChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="order-payment-status" className="mb-1 block text-xs font-medium">
                  {w.ordersFormPaymentStatusLabel}
                </Label>
                <Select
                  id="order-payment-status"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as "pending" | "paid")}
                  className="text-sm"
                >
                  <option value="pending">{w.ordersPaymentPending}</option>
                  <option value="paid">{w.ordersPaymentPaid}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="order-shipping-cost" className="mb-1 block text-xs font-medium">
                  {w.ordersFormShippingCostLabel}
                </Label>
                <Input
                  id="order-shipping-cost"
                  type="number"
                  min={0}
                  value={shippingCop}
                  onChange={(e) => setShippingCop(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="order-discount-cost" className="mb-1 block text-xs font-medium">
                  {w.ordersFormDiscountLabel}
                </Label>
                <Input
                  id="order-discount-cost"
                  type="number"
                  min={0}
                  value={discountCop}
                  onChange={(e) => setDiscountCop(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {mode !== "edit" && (
                <div>
                  <Label htmlFor="order-initial-status" className="mb-1 block text-xs font-medium">
                    {w.ordersFormInitialStatusLabel}
                  </Label>
                  <Select
                    id="order-initial-status"
                    value={initialStatus}
                    onChange={(e) =>
                      setInitialStatus(e.target.value as "pending_confirmation" | "confirmed")
                    }
                    className="text-sm"
                  >
                    <option value="pending_confirmation">{w.ordersStatusPendingConfirmation}</option>
                    <option value="confirmed">{w.ordersStatusConfirmed}</option>
                  </Select>
                </div>
              )}
              <div className={mode === "edit" ? "sm:col-span-3" : "sm:col-span-2"}>
                <Label htmlFor="order-notes" className="mb-1 block text-xs font-medium">
                  {w.ordersFormNotesLabel}
                </Label>
                <Input
                  id="order-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-4 border-t border-[var(--dsn-border)] pt-2 text-xs">
              <span className="text-[var(--dsn-text-secondary)]">
                {w.ordersDetailSubtotal}:{" "}
                <strong className="font-mono text-[var(--dsn-text)]">
                  {formatOrderMoneyCents(totals.subtotalCents, currency, locale)}
                </strong>
              </span>
              <span className="text-sm font-bold text-[var(--dsn-text)]">
                {w.ordersDetailTotal}:{" "}
                <span className="font-mono text-[var(--dsn-accent)]">
                  {formatOrderMoneyCents(totals.totalCents, currency, locale)}
                </span>
              </span>
            </div>
          </section>

          {errorMsg && (
            <Alert variant="error">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="border-t border-[var(--dsn-border)] pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {w.crmCancelCta}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              loading={saving}
              loadingText={mode === "edit" ? w.ordersFormSaveEdit : w.ordersFormSaveCreate}
            >
              {mode === "edit" ? w.ordersFormSaveEdit : w.ordersFormSaveCreate}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
