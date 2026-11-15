# SPEC-18 · Diseño Técnico · Central de Promociones y Descuentos Comerciales Automáticos

## 1. Arquitectura de Componentes

```mermaid
flowchart TD
  UI_PROMO["/workspace/promotions\nPromotionsView + PromotionFormModal"] --> API_PROMO["/api/tenant/promotions/*\nRoute Handlers + handle() RFC 9457"]
  UI_PROD["/workspace/products\nProductsView (Indicadores en fila)"] --> API_PROD["/api/tenant/products/*"]
  API_PROMO --> SVC_PROMO["TenantPromotionsService\n(@mocter/domain)"]
  API_PROD --> SVC_PROD["TenantProductsAndMediaService\n(@mocter/domain)"]
  SVC_PROD --> ENGINE["PromotionResolutionEngine\nresolveEffectiveProductPromotion()"]
  SVC_PROMO --> ENGINE
  BOT["Motor de Prompts Bot AI\n(BOT-002 / SPEC-10)"] --> ENGINE
  ORD["Servicio de Pedidos\n(ORD-001 / SPEC-11)"] --> ENGINE
  SVC_PROMO --> DB_CELL[("pg-cell-XX\nadmin.promotions\nadmin.promotion_targets")]
```

---

## 2. Motor Determinístico de Resolución (`PromotionResolutionEngine`)

### 2.1 Entrada y Salida
Para un lote de productos del catálogo (`ProductRow[]`) y el conjunto de promociones vigentes del inquilino (`ActivePromotionWithTargets[]`):

1. **Filtro de elegibilidad temporal y de cupo:**
   Una promoción es elegible si y solo si:
   - `is_active === true`
   - `starts_at <= now`
   - `ends_at === null || ends_at >= now`
   - `max_discounted_units === null || discounted_units_sold < max_discounted_units`

2. **Evaluación de coincidencia por producto (`matchRank`):**
   - `scope_type === 'product'` y `target.product_id === product.id` → `rank = 1` (Máxima especificidad).
   - `scope_type === 'category'` y `normalizeCategory(target.category_name) === normalizeCategory(product.category)` → `rank = 2`.
   - `scope_type === 'all_catalog'` → `rank = 3`.

3. **Cálculo del precio promocional candidato (`candidatePriceCents`):**
   - Si `discount_type === 'percentage'`:
     `candidatePriceCents = Math.max(1, Math.round(product.priceCents * (100 - discountValue) / 100))`
   - Si `discount_type === 'fixed_amount'`:
     `candidatePriceCents = Math.max(1, product.priceCents - discountValue)`
   - Si `discount_type === 'fixed_price'`:
     `candidatePriceCents = discountValue` (válido solo si `discountValue < product.priceCents`).

4. **Selección ganadora sin acumulación (`D-04`):**
   - Se ordenan las promociones coincidentes por:
     1. `rank ASC` (`1` Producto > `2` Categoría > `3` Todo el Catálogo).
     2. `candidatePriceCents ASC` (mayor ahorro para el comprador).
     3. `createdAt DESC` (desempate determinístico).
   - La primera promoción de la lista ordenada es la `activePromotion` del producto.

---

## 3. Contratos DTO (`@mocter/domain`)

```ts
export type PromotionScopeType = "all_catalog" | "category" | "product";
export type PromotionDiscountType = "percentage" | "fixed_amount" | "fixed_price";
export type PromotionLifecycleStatus =
  | "active"
  | "scheduled"
  | "paused"
  | "expired"
  | "depleted";

export interface AppliedProductPromotionDto {
  promotionId: string;
  name: string;
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  originalPriceCents: number;
  effectivePriceCents: number;
  savingsCents: number;
  savingsPct: number;
  startsAt: string;
  endsAt: string | null;
  remainingUnits: number | null;
}
```

En `ProductListItemDto` y `ProductDetailDto` (`SPEC-08`), cuando existe una `AppliedProductPromotionDto` vigente:
- `salePriceCents` refleja automáticamente `effectivePriceCents`.
- `profitability` se recalcula sobre `effectivePriceCents` frente a `costPriceCents`.
- Se adjunta `activePromotion: AppliedProductPromotionDto | null` para renderizar el badge con nombre de campaña, `% OFF` y fecha de vigencia en cada fila de `/workspace/products` y en el prompt dinámico del Bot AI.

---

## 4. Diseño de UI/UX y Cumplimiento de Reglas Transversales

1. **Layout perimetral (`AGENTS.md §4.19`):**
   - `/workspace/promotions` utiliza `<div className="w-full space-y-6 p-4 md:px-8 md:py-6">` como contenedor raíz y `<header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">`.
2. **Botones canónicos (`AGENTS.md §4.19`):**
   - Acción secundaria («Actualizar»): `bg-[var(--dsn-surface)] border-[var(--dsn-border)] hover:border-[var(--dsn-accent)]` con ícono `text-[var(--dsn-accent)]`.
   - Acción primaria («Crear Nueva Promoción»): `bg-[var(--dsn-accent)] text-white`.
3. **Cierre automático de modal (`AGENTS.md §4.19`):**
   - Al guardar una promoción en `PromotionFormModal`, el callback `onSaved` cierra el modal inmediatamente (`setFormOpen(false)`), refresca la grilla y muestra el banner de confirmación.
4. **Higiene y accesibilidad (`AGENTS.md §4.6, §4.8, §4.15, §4.17`):**
   - Diccionarios completos `es` y `en` en `apps/admin/lib/i18n.ts`.
   - Labels en **Title Case** gramatical sin clases `uppercase`.
   - Confirmaciones de pausa/activación y eliminación mediante `ConfirmationModal` (`--dsn-*`).
