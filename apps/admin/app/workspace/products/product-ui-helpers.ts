import type {
  CatalogListResultDto,
  ProductAvailability,
  ProductCompositionType,
  ProductCondition,
  ProductDetailDto,
  ProductKind,
  ProductListItemDto,
  ProductStatus,
  WorkspaceProductDto,
} from "@mocter/domain";
import { calculateProductProfitability } from "@/lib/pricing-margin";
import type { AdminLocale } from "@/lib/i18n";

export const PRODUCT_BOT_MASTER_PROMPT_MAX_CHARS = 32_000;

/**
 * Contexto vivo del formulario del producto para auto-hidratar el Prompt Maestro bajo metodología IDEAL (SPEC-19 D-02).
 */
export interface ProductPromptTemplateContext {
  productName?: string;
  description?: string;
  category?: string;
  brand?: string;
  kind?: ProductKind;
  compositionType?: ProductCompositionType;
  priceAmount?: string | number;
  currency?: string;
  attributes?: Array<{ key: string; value: string }>;
  comboItems?: Array<{ name?: string; quantity: number }>;
  mediaCounts?: {
    image: number;
    video: number;
    audio: number;
    pdf: number;
  };
  audioItems?: Array<{
    order: number;
    filename: string;
    triggerHint?: string;
  }>;
}

/**
 * Formatea montos enteros en centavos a representación monetaria legible.
 */
export function formatMoneyCents(
  cents: number | null | undefined,
  currency = "COP",
  locale: AdminLocale = "es",
): string {
  const safe = Number(cents ?? 0) / 100;
  const intlLocale = locale === "en" ? "en-US" : "es-CO";
  return `$${safe.toLocaleString(intlLocale, {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Normaliza `WorkspaceProductDto` heredado al DTO rico de listado `ProductListItemDto`.
 */
export function adaptLegacyWorkspaceProduct(p: WorkspaceProductDto): ProductListItemDto {
  const profitability = calculateProductProfitability(0, p.salePriceCents ?? p.priceCents);
  const rawStatus = p.status as string;
  const status: ProductStatus =
    rawStatus === "published" || rawStatus === "active"
      ? "active"
      : rawStatus === "archived" || rawStatus === "inactive"
        ? "inactive"
        : "draft";

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    sku: p.sku ?? null,
    category: p.category ?? null,
    brand: null,
    kind: "physical" satisfies ProductKind,
    compositionType: "simple" satisfies ProductCompositionType,
    condition: "new" satisfies ProductCondition,
    availability: (p.availability || "in_stock") satisfies ProductAvailability,
    status,
    currency: p.currency || "COP",
    costPriceCents: 0,
    priceCents: p.priceCents,
    salePriceCents: p.salePriceCents ?? null,
    profitability,
    stockQuantity: 0,
    minStockThreshold: 0,
    effectiveStock: 0,
    isLowStock: false,
    hasInactiveComboComponent: false,
    coverImageUrl: p.mediaUrls?.[0] ?? null,
    mediaUrls: p.mediaUrls ?? [],
    mediaCounts: {
      image: p.mediaUrls?.length ?? 0,
      video: 0,
      audio: 0,
      pdf: 0,
    },
    attributesCount: 0,
    comboComponentsCount: 0,
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
  };
}

/**
 * Normaliza la lista inicial cuando el llamador aún provee el arreglo plano legado.
 */
export function resolveInitialCatalog(
  initialCatalog: CatalogListResultDto | null | undefined,
  initialProducts: WorkspaceProductDto[] | undefined,
): CatalogListResultDto {
  if (initialCatalog) {
    return initialCatalog;
  }
  const items = (initialProducts ?? []).map(adaptLegacyWorkspaceProduct);
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: 1,
    },
    summary: {
      totalActive: items.filter((item) => item.status === "active").length,
      lowStockCount: items.filter((item) => item.isLowStock).length,
      comboCount: items.filter((item) => item.compositionType === "combo").length,
    },
  };
}

/**
 * Extrae puntos de beneficio en formato WhatsApp a partir de la descripción y atributos del producto.
 */
function buildWhatsappBenefitsList(
  ctx: ProductPromptTemplateContext,
  locale: AdminLocale,
): string[] {
  const rawDesc = ctx.description?.trim() ?? "";
  const segments = rawDesc
    .split(/[\n.;•]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 4);

  const lines: string[] = [];
  for (const seg of segments) {
    lines.push(`✅ ${seg}`);
  }

  const validAttrs = (ctx.attributes ?? []).filter(
    (a) => a.key.trim().length > 0 && a.value.trim().length > 0,
  );
  for (const attr of validAttrs.slice(0, 2)) {
    lines.push(`✨ ${attr.key.trim()}: ${attr.value.trim()}`);
  }

  if (ctx.compositionType === "combo" && (ctx.comboItems?.length ?? 0) > 0) {
    const comboSummary = (ctx.comboItems ?? [])
      .filter((c) => c.name?.trim())
      .map((c) => `${c.quantity}x ${c.name?.trim()}`)
      .join(" + ");
    if (comboSummary) {
      lines.push(
        locale === "en"
          ? `🔥 Bundle includes: ${comboSummary}`
          : `🔥 Incluye en combo: ${comboSummary}`,
      );
    }
  }

  if (lines.length === 0) {
    return locale === "en"
      ? [
          "✅ High-impact primary benefit easy to use from day one",
          "✅ Verified quality and durability for everyday needs",
          "🔥 Fast shipping and cash-on-delivery available according to store rules",
        ]
      : [
          "✅ Beneficio principal de alto impacto y fácil uso desde el primer día",
          "✅ Calidad verificada y excelente relación costo-beneficio",
          "🔥 Envío ágil y pago seguro según las políticas del comercio",
        ];
  }

  return lines;
}

/**
 * Construye una plantilla estructurada de rápida adopción para el Prompt Maestro del producto
 * aplicando rigurosamente la metodología secuencial IDEAL (SPEC-19 D-01, D-02, RF-SPEC-19-04).
 *
 * Regula exclusivamente las condiciones explícitas de comercialización del producto activo,
 * auto-hidratando nombre, término multimedia, palabras clave, beneficios en formato WhatsApp,
 * estrategia de precios/escalones, reglas de disparo de imágenes/videos/audios por orden y
 * manejo de objeciones.
 */
export function buildRecommendedProductPromptTemplate(
  locale: AdminLocale,
  productNameOrContext?: string | ProductPromptTemplateContext,
): string {
  const ctx: ProductPromptTemplateContext =
    typeof productNameOrContext === "string"
      ? { productName: productNameOrContext }
      : (productNameOrContext ?? {});

  const title =
    ctx.productName?.trim() || (locale === "en" ? "this product" : "este producto");
  const currency = ctx.currency?.trim() || "COP";
  const numericPrice = Number(ctx.priceAmount ?? 0);
  const formattedUnitPrice =
    Number.isFinite(numericPrice) && numericPrice > 0
      ? `$${numericPrice.toLocaleString(locale === "en" ? "en-US" : "es-CO")} ${currency}`
      : locale === "en"
        ? `[Catalog Price in ${currency}]`
        : `[Precio de Catálogo en ${currency}]`;

  const keywords = [
    title,
    ctx.category?.trim(),
    ctx.brand?.trim(),
    locale === "en" ? "Price" : "Precio",
    locale === "en" ? "Info" : "Información",
  ]
    .filter((k): k is string => Boolean(k && k.length > 0))
    .join(", ");

  const benefitsLines = buildWhatsappBenefitsList(ctx, locale);
  const validAttrs = (ctx.attributes ?? []).filter((a) => a.key.trim().length > 0);
  const qualificationFields =
    validAttrs.length > 0
      ? validAttrs.map((a) => a.key.trim()).join(", ")
      : locale === "en"
        ? "desired quantity and preferred shipping modality (Home Delivery or Carrier Office)"
        : "cantidad deseada y modalidad de envío (Domicilio u Oficina de Transportadora)";

  const audioCount = ctx.mediaCounts?.audio ?? ctx.audioItems?.length ?? 0;
  const audioRulesEs =
    (ctx.audioItems?.length ?? 0) > 0
      ? ctx.audioItems!
          .map(
            (a) =>
              `  - Audio orden ${a.order} (${a.filename}): usar marcador [[MEDIA:${title}:audio:${a.order}]] en su propia línea ${a.triggerHint || "después de presentar los beneficios o cuando el cliente solicite nota de voz"} (máximo 1 audio por turno; si ese mismo orden ya se envió en la conversación, preguntar antes de reenviar).`,
          )
          .join("\n")
      : audioCount > 0
        ? `  - Este producto cuenta con ${audioCount} audio(s): enviar mediante [[MEDIA:${title}:audio:1]] en su propia línea después de los beneficios o cuando el cliente pida nota de voz (verificar historial por número de orden para no repetir sin confirmación).`
        : `  - Si agregas audios al producto, dispáralos por su orden con [[MEDIA:${title}:audio:1]] en su propia línea bajo demanda o después de los beneficios.`;

  const audioRulesEn =
    (ctx.audioItems?.length ?? 0) > 0
      ? ctx.audioItems!
          .map(
            (a) =>
              `  - Audio order ${a.order} (${a.filename}): use marker [[MEDIA:${title}:audio:${a.order}]] on its own line ${a.triggerHint || "after presenting benefits or when the customer requests a voice note"} (at most 1 audio per turn; do not resend the same order without asking first).`,
          )
          .join("\n")
      : audioCount > 0
        ? `  - This product has ${audioCount} audio file(s): send via [[MEDIA:${title}:audio:1]] on its own line after the benefits or on demand (track order history independently).`
        : `  - If you attach audio files to this product, trigger them by order using [[MEDIA:${title}:audio:1]] on its own line.`;

  if (locale === "en") {
    return [
      `## [I] Commercial Intent & Keywords (${title})`,
      `- Conversion Goal: Advise, build trust, and close the sale of ${title}.`,
      `- Canonical Media Term: [[MEDIA:${title}]]`,
      `- Activation Keywords: ${keywords}`,
      "",
      `## [D] Commercial Detail & Key Benefits (WhatsApp Format)`,
      `Benefits bubble ready to send (at most 4-6 lines):`,
      `"Benefits of our ${title}:`,
      ...benefitsLines,
      `"`,
      "",
      `## [E] Pricing Strategy, Tiers & Presentation`,
      `- First Contact Rule: Present greeting + media + benefits + city question first; reveal price only when requested or in the Price Case.`,
      `- Price Case Bubble (1 single bubble without repeating photos):`,
      `"💰 Options for ${title}:`,
      `✔️ 1 Unit: ${formattedUnitPrice}`,
      `✔️ 2 Units: [Optional Bundle Price ⭐ Most Recommended]`,
      `"`,
      "",
      `## [A] Multimedia Action, Audios & Order Qualification`,
      `- Presentation Media Markers (each on its own line, strictly no caption text before or after):`,
      `[[MEDIA:${title}:imagen]]`,
      `[[MEDIA:${title}:video]]`,
      `- Audio Trigger Rules by Order:`,
      audioRulesEn,
      `- Qualification Before Order Capture: Confirm ${qualificationFields}.`,
      "",
      `## [L] Product Limits & Frequently Asked Objections`,
      `- Address buyer doubts in 2-3 lines highlighting verified benefits, warranty, and safe payment options.`,
      `- Never invent technical specifications, certifications, or prices not declared in this product sheet.`,
    ].join("\n");
  }

  return [
    `## [I] Intención Comercial y Palabras Clave (${title})`,
    `- Objetivo de conversión: Asesorar, generar confianza y cerrar la venta de ${title}.`,
    `- Término multimedia canónico: [[MEDIA:${title}]]`,
    `- Palabras clave de activación: ${keywords}`,
    "",
    `## [D] Detalle Comercial y Beneficios Clave (Formato WhatsApp)`,
    `Burbuja de beneficios lista para enviar (máximo 4-6 líneas):`,
    `"Beneficios de ${title}:`,
    ...benefitsLines,
    `"`,
    "",
    `## [E] Estrategia de Precios, Escalones y Presentación`,
    `- Regla de Primer Contacto: Presenta primero saludo + multimedia + beneficios + pregunta de ciudad o municipio; entrega el precio cuando el cliente lo solicite (Caso Precio).`,
    `- Burbuja de Caso Precio (en 1 sola burbuja sin repetir fotos):`,
    `"💰 Opciones de ${title}:`,
    `✔️ 1 Unidad: ${formattedUnitPrice}`,
    `✔️ 2 Unidades: [Precio Promocional o Escalón Recomendado ⭐]`,
    `"`,
    "",
    `## [A] Acción Multimedia, Audios y Calificación de Pedido`,
    `- Marcadores multimedia de presentación (cada uno en su propia línea, sin texto antes ni después — Regla Anti-Caption):`,
    `[[MEDIA:${title}:imagen]]`,
    `[[MEDIA:${title}:video]]`,
    `- Reglas de disparo de Audios por número de orden:`,
    audioRulesEs,
    `- Calificación previa al cierre: Confirmar ${qualificationFields}.`,
    "",
    `## [L] Límites del Producto y Manejo de Objeciones`,
    `- Resuelve objeciones frecuentes (calidad, modo de uso, respaldo) en máximo 3 líneas destacando garantía y pago seguro del comercio.`,
    `- Prohibido inventar especificaciones, certificaciones o precios fuera de esta ficha comercial.`,
  ].join("\n");
}

const TEMPLATE_SIGNATURE_HEADERS = [
  "## [I] Intención Comercial y Palabras Clave",
  "## [I] Commercial Intent & Keywords",
  "## Beneficios Clave",
  "## Core Value Proposition",
];

const CUSTOM_NOTES_DIVIDER_ES = "## Notas Adicionales del Comercio";
const CUSTOM_NOTES_DIVIDER_EN = "## Additional Store Notes";

/**
 * Aplica o actualiza de forma 100 % idempotente la plantilla recomendada del producto (SPEC-19 RF-SPEC-19-05).
 *
 * - Si el campo está vacío o ya contiene una plantilla recomendada previa (IDEAL o legada),
 *   reemplaza la plantilla por la versión recién hidratada sin duplicar jamás las secciones.
 * - Si el usuario había escrito apuntes libres antes de insertar la plantilla por primera vez,
 *   conserva esos apuntes bajo el divisor `## Notas Adicionales del Comercio` sin duplicarlos
 *   en clics posteriores.
 */
export function applyRecommendedProductPromptTemplate(
  currentPrompt: string,
  newTemplate: string,
  locale: AdminLocale = "es",
): string {
  const trimmed = currentPrompt.trim();
  if (!trimmed) {
    return newTemplate;
  }

  const hasTemplateHeader = TEMPLATE_SIGNATURE_HEADERS.some((header) =>
    trimmed.includes(header),
  );

  if (hasTemplateHeader) {
    // Preservar únicamente notas adicionales si existían debajo del divisor
    const divider =
      trimmed.includes(CUSTOM_NOTES_DIVIDER_ES)
        ? CUSTOM_NOTES_DIVIDER_ES
        : trimmed.includes(CUSTOM_NOTES_DIVIDER_EN)
          ? CUSTOM_NOTES_DIVIDER_EN
          : null;

    if (divider) {
      const idx = trimmed.indexOf(divider);
      const customTail = trimmed.slice(idx).trim();
      return `${newTemplate}\n\n${customTail}`;
    }

    return newTemplate;
  }

  const notesHeader = locale === "en" ? CUSTOM_NOTES_DIVIDER_EN : CUSTOM_NOTES_DIVIDER_ES;
  return `${newTemplate}\n\n${notesHeader}\n${trimmed}`;
}

/**
 * Convierte un registro de detalle `ProductDetailDto` a resumen `ProductListItemDto`.
 */
export function detailToListItem(detail: ProductDetailDto): ProductListItemDto {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    sku: detail.sku,
    category: detail.category,
    brand: detail.brand,
    kind: detail.kind,
    compositionType: detail.compositionType,
    condition: detail.condition,
    availability: detail.availability,
    status: detail.status,
    currency: detail.currency,
    costPriceCents: detail.costPriceCents,
    priceCents: detail.priceCents,
    salePriceCents: detail.salePriceCents,
    profitability: detail.profitability,
    stockQuantity: detail.stockQuantity,
    minStockThreshold: detail.minStockThreshold,
    effectiveStock: detail.effectiveStock,
    isLowStock: detail.isLowStock,
    hasInactiveComboComponent: detail.hasInactiveComboComponent,
    coverImageUrl: detail.coverImageUrl,
    mediaUrls: detail.mediaUrls,
    mediaCounts: detail.mediaCounts,
    attributesCount: detail.attributesCount,
    comboComponentsCount: detail.comboComponentsCount,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}
