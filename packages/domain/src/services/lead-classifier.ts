/** Etiquetas reservadas base del clasificador de leads (BOT-002 §6). */
export const LEAD_LABELS = ["lead-frio", "lead-tibio", "lead-caliente", "compra-realizada"] as const;

export type LeadLabel = (typeof LEAD_LABELS)[number];

/** Categoría semántica de etiqueta en el clasificador dinámico del inquilino (SPEC-19 D-03). */
export type TenantLabelCategory = "functional" | "operational";

/**
 * Efectos secundarios automatizados disparados al activarse una etiqueta operativa (SPEC-19 D-03).
 * - `handoff_human`: asigna/dirige la conversación a un agente humano en Chatwoot.
 * - `pause_bot`: desactiva/pausa la intervención automática del bot en la conversación.
 * - `send_email_notification`: envía notificación por correo electrónico al comercio (NTF-001).
 * - `register_order`: vincula o registra la orden comercial en el módulo de pedidos (ORD-001).
 */
export type OperationalSideEffect =
  | "handoff_human"
  | "pause_bot"
  | "send_email_notification"
  | "register_order";

/**
 * Definición de una etiqueta dentro del catálogo clasificador del inquilino (SPEC-19 D-03).
 */
export interface TenantClassifierLabelDefinition {
  slug: string;
  title: string;
  category: TenantLabelCategory;
  /**
   * Color hexadecimal orientativo en Chatwoot (ej. `#3B82F6`).
   * En etiquetas funcionales determina el color visual de temperatura/etapa de la conversación.
   */
  color: string;
  /** Criterio semántico exacto para asignar esta etiqueta durante el análisis de la conversación. */
  activationRule: string;
  /** Acciones operativas automáticas cuando la etiqueta se activa (aplica a `operational`). */
  sideEffects: OperationalSideEffect[];
  /** Indica si pertenece al catálogo base de plataforma o fue creada por el inquilino. */
  isSystemBase?: boolean;
}

/** Turno de conversación para el clasificador. */
export interface ClassifierTurn {
  role: "user" | "assistant";
  text: string;
}

/** Cantidad de turnos considerados por el clasificador por defecto. */
export const CLASSIFIER_TURN_WINDOW = 10;

/**
 * Catálogo base de Etiquetas Funcionales (mutuamente excluyentes: 1 activa por conversación).
 * Cada etiqueta funcional define el color orientativo de la conversación en Chatwoot (SPEC-19 D-03).
 */
export const DEFAULT_FUNCTIONAL_LABELS: ReadonlyArray<TenantClassifierLabelDefinition> = [
  {
    slug: "lead-frio",
    title: "Lead Frío",
    category: "functional",
    color: "#3B82F6",
    activationRule:
      "Acaba de escribir, saludo inicial, pregunta muy general sin intención de compra clara aún o lleva mucho tiempo sin responder.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "lead-tibio",
    title: "Lead Tibio",
    category: "functional",
    color: "#F59E0B",
    activationRule:
      "Explora características, beneficios, modo de uso, cobertura o variantes del producto, pero aún no pregunta precio de cierre ni confirma compra.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "lead-caliente",
    title: "Lead Caliente",
    category: "functional",
    color: "#F97316",
    activationRule:
      "Preguntó por el producto, pidió precio, fotos, videos o audios, mostró interés claro o eligió una opción recomendada, pero AÚN NO ha suministrado todos sus datos obligatorios de envío (nombre completo, número celular y ciudad o dirección).",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "compra-realizada",
    title: "Compra Realizada",
    category: "functional",
    color: "#10B981",
    activationRule:
      "ÚNICAMENTE cuando en el historial aparezcan explícitamente el nombre completo del cliente, su número celular y su ciudad o dirección (o modalidad oficina) y el pedido haya sido confirmado. Si falta cualquiera de estos datos, clasificar como lead-caliente.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "devolucion",
    title: "Devolución o Garantía",
    category: "functional",
    color: "#EF4444",
    activationRule:
      "Solicitó devolución, cambio o garantía, reportó problema con el producto recibido, no recibió el pedido o expresó insatisfacción post-venta.",
    sideEffects: [],
    isSystemBase: true,
  },
];

/**
 * Catálogo base de Etiquetas Operativas (acumulables 0..N por conversación).
 * Pueden disparar acciones automatizadas como dirigir a humano, pausar el bot o enviar correo (SPEC-19 D-03).
 */
export const DEFAULT_OPERATIONAL_LABELS: ReadonlyArray<TenantClassifierLabelDefinition> = [
  {
    slug: "nuevo_pedido",
    title: "Nuevo Pedido",
    category: "operational",
    color: "#10B981",
    activationRule:
      "El comprador completó todos los datos de envío (Domicilio u Oficina) para registrar un nuevo pedido listo para alistamiento.",
    sideEffects: ["register_order", "send_email_notification"],
    isSystemBase: true,
  },
  {
    slug: "pendiente_pago",
    title: "Pendiente de Pago",
    category: "operational",
    color: "#F59E0B",
    activationRule:
      "El pedido requiere transferencia o pago anticipado y el comprador aún no ha enviado el comprobante verificado.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "pagado",
    title: "Pagado",
    category: "operational",
    color: "#06B6D4",
    activationRule:
      "El cliente envió comprobante de pago o se confirmó la recepción exitosa del dinero.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "despachado",
    title: "Despachado",
    category: "operational",
    color: "#8B5CF6",
    activationRule:
      "El pedido ya fue enviado con transportadora y cuenta con guía de seguimiento informada.",
    sideEffects: [],
    isSystemBase: true,
  },
  {
    slug: "soporte_humano",
    title: "Soporte Humano",
    category: "operational",
    color: "#EF4444",
    activationRule:
      "El cliente solicita hablar con un asesor humano, expresa molestia reiterada, pide una excepción especial o plantea un reclamo que requiere atención personal.",
    sideEffects: ["handoff_human", "pause_bot", "send_email_notification"],
    isSystemBase: true,
  },
  {
    slug: "cliente_recurrente",
    title: "Cliente Recurrente",
    category: "operational",
    color: "#EC4899",
    activationRule:
      "El comprador menciona que ya compró anteriormente en la tienda o solicita repetir un pedido previo.",
    sideEffects: [],
    isSystemBase: true,
  },
];

/**
 * Selecciona los últimos N turnos (10 por defecto) para la llamada de inferencia del clasificador.
 */
export function selectClassifierWindow(
  turns: ClassifierTurn[],
  maxTurns: number = CLASSIFIER_TURN_WINDOW,
): ClassifierTurn[] {
  return turns.slice(-Math.max(1, maxTurns));
}

/**
 * Valida la salida del modelo contra los 4 slugs reservados (modo legado BOT-002).
 *
 * - Una salida fuera de los slugs se descarta y se conserva la etiqueta previa (RF-04.2).
 * - `compra-realizada` solo se acepta con evidencia de registro de pedido.
 *
 * @param rawOutput Texto devuelto por el modelo.
 * @param previous Etiqueta vigente (fallback).
 * @param hasOrderEvidence Verdadero si existe un pedido registrado para la conversación.
 */
export function resolveLeadLabel(
  rawOutput: string,
  previous: LeadLabel | null,
  hasOrderEvidence: boolean,
): { label: LeadLabel | null; changed: boolean; discarded: boolean } {
  const candidate = rawOutput.trim().toLowerCase();
  const match = LEAD_LABELS.find((l) => l === candidate);
  if (!match) return { label: previous, changed: false, discarded: true };
  if (match === "compra-realizada" && !hasOrderEvidence) {
    return { label: previous, changed: false, discarded: true };
  }
  return { label: match, changed: match !== previous, discarded: false };
}

/**
 * Combina de forma idempotente el catálogo base (Funcional + Operativo) con las etiquetas
 * personalizadas creadas por el inquilino (SPEC-19 D-03).
 */
export function mergeTenantClassifierCatalog(
  customLabels: ReadonlyArray<TenantClassifierLabelDefinition> = [],
): TenantClassifierLabelDefinition[] {
  const bySlug = new Map<string, TenantClassifierLabelDefinition>();

  for (const base of [...DEFAULT_FUNCTIONAL_LABELS, ...DEFAULT_OPERATIONAL_LABELS]) {
    bySlug.set(base.slug.toLowerCase(), { ...base, sideEffects: [...base.sideEffects] });
  }

  for (const custom of customLabels) {
    const normalizedSlug = custom.slug.trim().toLowerCase();
    if (!normalizedSlug) continue;
    const existing = bySlug.get(normalizedSlug);
    bySlug.set(normalizedSlug, {
      slug: normalizedSlug,
      title: custom.title.trim() || existing?.title || normalizedSlug,
      category: custom.category ?? existing?.category ?? "operational",
      color: custom.color || existing?.color || "#6366F1",
      activationRule: custom.activationRule.trim() || existing?.activationRule || "",
      sideEffects:
        custom.sideEffects && custom.sideEffects.length > 0
          ? [...new Set(custom.sideEffects)]
          : existing?.sideEffects ?? [],
      isSystemBase: existing?.isSystemBase ?? Boolean(custom.isSystemBase),
    });
  }

  return Array.from(bySlug.values());
}

/**
 * Compila dinámicamente el «Prompt Clasificador de Conversaciones» de un inquilino
 * bajo la metodología secuencial IDEAL (SPEC-19 D-03, RF-SPEC-19-07).
 *
 * Evalúa las etiquetas base de Chatwoot/Mocter junto con las etiquetas personalizadas
 * del comercio divididas en Funcionales (embudo y color orientativo en Chatwoot) y
 * Operativas (estados que pueden dirigir a agente humano, pausar el bot o enviar correo).
 */
export function buildTenantClassifierPrompt(
  customLabels: ReadonlyArray<TenantClassifierLabelDefinition> = [],
  locale: "es" | "en" = "es",
): string {
  const catalog = mergeTenantClassifierCatalog(customLabels);
  const functional = catalog.filter((l) => l.category === "functional");
  const operational = catalog.filter((l) => l.category === "operational");

  const effectLabelsEs: Record<OperationalSideEffect, string> = {
    handoff_human: "dirigir a agente humano",
    pause_bot: "pausar bot automático",
    send_email_notification: "enviar notificación por correo",
    register_order: "registrar orden de pedido",
  };

  const effectLabelsEn: Record<OperationalSideEffect, string> = {
    handoff_human: "assign to human agent",
    pause_bot: "pause automated bot",
    send_email_notification: "send email notification",
    register_order: "register order",
  };

  if (locale === "en") {
    const funcLines = functional.map(
      (f) => `- "${f.slug}" (${f.title} · Chatwoot Color ${f.color}): ${f.activationRule}`,
    );
    const opLines = operational.map((o) => {
      const effects =
        o.sideEffects.length > 0
          ? ` [Triggers: ${o.sideEffects.map((e) => effectLabelsEn[e]).join(", ")}]`
          : "";
      return `- "${o.slug}" (${o.title}): ${o.activationRule}${effects}`;
    });

    return [
      "## [I] Intent (Conversation Classification Engine)",
      "Analyze the conversation history and classify the lead across two independent dimensions: (1) exactly ONE Functional Funnel Label (which sets the conversation's orientation color in Chatwoot) and (2) zero or more Operational State Labels (which trigger automated workflows such as human handoff, pausing the bot, or sending an email alert).",
      "",
      "## [D] Detail (Active Tenant Label Catalog)",
      "### 1. Functional Labels (Mutually Exclusive — choose EXACTLY 1):",
      ...funcLines,
      "",
      "### 2. Operational Labels (Cumulative — choose 0 to N applicable slugs):",
      ...opLines,
      "",
      "## [E] Example (Strict JSON Output Format)",
      'Respond ONLY with a valid JSON object matching this exact structure: {"functionalLabel": "lead-caliente", "operationalLabels": ["soporte_humano"]}',
      "",
      "## [A] Action (Evaluation Steps)",
      "1. Inspect the last customer and assistant turns.",
      "2. Determine the single Functional Label that accurately reflects the buyer's current disposition.",
      "3. Select any Operational Labels whose trigger criteria are explicitly met in the dialogue.",
      "",
      "## [L] Limits & Guardrails",
      '- Assign "compra-realizada" or "nuevo_pedido" ONLY when the customer\'s full name, mobile phone, and city/address explicitly appear in the conversation. If any of those fields is missing, classify functionalLabel as "lead-caliente".',
      "- Never invent slugs outside the catalog listed above. Output raw JSON only, with no Markdown code fences or explanations.",
    ].join("\n");
  }

  const funcLines = functional.map(
    (f) => `- "${f.slug}" (${f.title} · Color orientativo Chatwoot ${f.color}): ${f.activationRule}`,
  );
  const opLines = operational.map((o) => {
    const effects =
      o.sideEffects.length > 0
        ? ` [Efectos operativos: ${o.sideEffects.map((e) => effectLabelsEs[e]).join(", ")}]`
        : "";
    return `- "${o.slug}" (${o.title}): ${o.activationRule}${effects}`;
  });

  return [
    "## [I] Intención (Motor Clasificador de Conversaciones)",
    "Analiza el historial de conversación y clasifica el diálogo en dos dimensiones complementarias: (1) exactamente UNA Etiqueta Funcional de embudo comercial (que define el color orientativo de la conversación en Chatwoot) y (2) cero o más Etiquetas Operativas de flujo (que disparan acciones automáticas como transferir a un agente humano, desactivar el bot o enviar un correo de alerta).",
    "",
    "## [D] Detalle (Catálogo Activo de Etiquetas del Inquilino)",
    "### 1. Etiquetas Funcionales (Mutuamente excluyentes — elige EXACTAMENTE 1):",
    ...funcLines,
    "",
    "### 2. Etiquetas Operativas (Acumulables — elige de 0 a N según aplique):",
    ...opLines,
    "",
    "## [E] Ejemplo (Formato Estricto de Salida JSON)",
    'Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta: {"functionalLabel": "lead-caliente", "operationalLabels": ["soporte_humano"]}',
    "",
    "## [A] Acción (Pasos Lógicos de Evaluación)",
    "1. Analiza los últimos mensajes entre el comprador y el asistente.",
    "2. Selecciona la Etiqueta Funcional exacta según el nivel de interés y disposición de compra.",
    "3. Incluye en operationalLabels todas las etiquetas operativas cuyos criterios se cumplan en la conversación.",
    "",
    "## [L] Límites y Reglas de Frontera",
    '- Asigna "compra-realizada" o "nuevo_pedido" ÚNICAMENTE cuando en el historial aparezcan explícitamente el nombre completo del cliente, su número celular y su ciudad o dirección. Si falta cualquiera de estos datos, clasifica functionalLabel como "lead-caliente".',
    "- Prohibido inventar etiquetas fuera del catálogo listado arriba. Devuelve solo el JSON sin bloques de código ni explicaciones adicionales.",
  ].join("\n");
}

/**
 * Resultado enriquecido de la clasificación multidimensional (Funcional + Operativa) por inquilino.
 */
export interface ResolvedTenantClassification {
  functionalLabel: string | null;
  functionalColor: string | null;
  operationalLabels: string[];
  /** Lista unificada de etiquetas (`[functionalLabel, ...operationalLabels]`) para sincronizar con Chatwoot/CRM. */
  allLabels: string[];
  /** Efectos secundarios operativos consolidados que el orquestador debe ejecutar. */
  triggeredSideEffects: OperationalSideEffect[];
  changed: boolean;
  discarded: boolean;
}

const LEGACY_FUNCTIONAL_ALIASES: Record<string, string> = {
  frio: "lead-frio",
  tibio: "lead-tibio",
  caliente: "lead-caliente",
  pedido: "compra-realizada",
  devolucion: "devolucion",
};

/**
 * Resuelve y valida la respuesta del modelo clasificador contra el catálogo real del inquilino (SPEC-19 D-03).
 *
 * Soporta tanto la salida JSON estructurada `{"functionalLabel": "...", "operationalLabels": [...]}`
 * como respuestas simples de 1 sola palabra (`lead-caliente`, `caliente`, `pedido`, `devolucion`).
 */
export function resolveTenantConversationClassification(params: {
  rawOutput: string;
  customLabels?: ReadonlyArray<TenantClassifierLabelDefinition>;
  previousFunctionalLabel?: string | null;
  previousOperationalLabels?: string[];
  hasOrderEvidence?: boolean;
}): ResolvedTenantClassification {
  const catalog = mergeTenantClassifierCatalog(params.customLabels);
  const functionalBySlug = new Map(
    catalog.filter((l) => l.category === "functional").map((l) => [l.slug, l]),
  );
  const operationalBySlug = new Map(
    catalog.filter((l) => l.category === "operational").map((l) => [l.slug, l]),
  );

  const prevFunc = params.previousFunctionalLabel?.trim().toLowerCase() || null;
  const prevOps = (params.previousOperationalLabels ?? []).map((s) => s.trim().toLowerCase());
  const hasOrderEvidence = Boolean(params.hasOrderEvidence);

  const raw = params.rawOutput.trim();
  let candidateFunctional: string | null = null;
  let candidateOperational: string[] = [];

  // 1. Intentar parsear JSON estructurado (removiendo posibles codeblocks ```json ... ```)
  const cleanedJson = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (cleanedJson.startsWith("{") && cleanedJson.endsWith("}")) {
    try {
      const parsed = JSON.parse(cleanedJson) as {
        functionalLabel?: unknown;
        operationalLabels?: unknown;
      };
      if (typeof parsed.functionalLabel === "string") {
        const norm = parsed.functionalLabel.trim().toLowerCase();
        candidateFunctional = LEGACY_FUNCTIONAL_ALIASES[norm] ?? norm;
      }
      if (Array.isArray(parsed.operationalLabels)) {
        candidateOperational = parsed.operationalLabels
          .filter((item): item is string => typeof item === "string")
          .map((s) => s.trim().toLowerCase());
      }
    } catch {
      // Si el JSON está malformado se evalúa como texto plano abajo
    }
  } else if (cleanedJson.length > 0) {
    const singleToken = cleanedJson.toLowerCase();
    const mapped = LEGACY_FUNCTIONAL_ALIASES[singleToken] ?? singleToken;
    if (functionalBySlug.has(mapped)) {
      candidateFunctional = mapped;
    } else if (operationalBySlug.has(mapped)) {
      candidateFunctional = prevFunc;
      candidateOperational = [mapped];
    }
  }

  // 2. Validar etiqueta funcional y aplicar guardrail RN-SPEC-19-04 (compra-realizada exige evidencia)
  let resolvedFunctional: string | null = prevFunc;
  let discarded = false;

  if (candidateFunctional && functionalBySlug.has(candidateFunctional)) {
    if (candidateFunctional === "compra-realizada" && !hasOrderEvidence) {
      // Si viene de JSON multidimensional degradamos a lead-caliente; si no hay previo, conservamos previo
      resolvedFunctional = prevFunc ?? "lead-caliente";
      discarded = true;
    } else {
      resolvedFunctional = candidateFunctional;
    }
  } else if (candidateFunctional !== null || candidateOperational.length === 0) {
    discarded = true;
  }

  // 3. Validar etiquetas operativas contra el catálogo y guardrail de nuevo_pedido
  const validOperational: string[] = [];
  for (const opSlug of candidateOperational) {
    if (!operationalBySlug.has(opSlug)) continue;
    if (opSlug === "nuevo_pedido" && !hasOrderEvidence) {
      discarded = true;
      continue;
    }
    if (!validOperational.includes(opSlug)) {
      validOperational.push(opSlug);
    }
  }

  const finalOperational =
    validOperational.length > 0 || !discarded ? validOperational : prevOps;

  const funcDef = resolvedFunctional ? functionalBySlug.get(resolvedFunctional) : undefined;
  const functionalColor = funcDef?.color ?? null;

  const sideEffectsSet = new Set<OperationalSideEffect>();
  for (const opSlug of finalOperational) {
    const opDef = operationalBySlug.get(opSlug);
    for (const effect of opDef?.sideEffects ?? []) {
      sideEffectsSet.add(effect);
    }
  }
  if (resolvedFunctional === "devolucion") {
    sideEffectsSet.add("handoff_human");
    sideEffectsSet.add("send_email_notification");
  }

  const allLabels = [
    ...(resolvedFunctional ? [resolvedFunctional] : []),
    ...finalOperational,
  ];

  const prevSet = new Set([...(prevFunc ? [prevFunc] : []), ...prevOps]);
  const changed =
    allLabels.length !== prevSet.size || allLabels.some((lbl) => !prevSet.has(lbl));

  return {
    functionalLabel: resolvedFunctional,
    functionalColor,
    operationalLabels: finalOperational,
    allLabels,
    triggeredSideEffects: Array.from(sideEffectsSet),
    changed,
    discarded,
  };
}
