/**
 * Helpers puros de interfaz para la vista de configuración del Asistente AI y Bot (`/workspace/bot`).
 *
 * Implementa:
 * - Generación auto-hidratada e idempotente del «Prompt General de Operación del Cliente» (Plano 2)
 *   bajo la metodología secuencial `IDEAL` (`[I]`, `[D]`, `[E]`, `[A]`, `[L]`).
 * - Catálogo visual de Etiquetas Funcionales (color orientativo de la conversación en Chatwoot) y
 *   Etiquetas Operativas (acciones automáticas: handoff a humano, pausa de bot, notificación por correo
 *   y registro de pedido) junto con su compilador `IDEAL` para el «Prompt Clasificador de Conversaciones».
 */

export interface ClientGeneralPromptContext {
  /** Identificador del preset de personalidad activo. */
  botPreset?: string;
  /** Nombre legible del preset activo. */
  presetName?: string;
  /** Descripción del tono comercial del preset. */
  presetDescription?: string;
  /** Política de garantías configurada por el inquilino. */
  warrantyPolicy?: string;
  /** Política de cambios y devoluciones configurada por el inquilino. */
  returnsPolicy?: string;
  /** Mensaje de confirmación de pedido configurado por el inquilino. */
  orderMessage?: string;
  /** Cantidad de preguntas frecuentes registradas. */
  faqsCount?: number;
}

export interface ClassifierLabelUiItem {
  code: string;
  title: string;
  category: "functional" | "operational";
  chatwootColor: string;
  criterion: string;
  sideEffectLabels: string[];
}

/**
 * Encabezado canónico que identifica el bloque generado del Prompt General de Operación del Cliente.
 */
export const CLIENT_GENERAL_PROMPT_HEADER =
  "## ESTRUCTURA IDEAL — PROMPT GENERAL DE OPERACIÓN DEL CLIENTE";

/**
 * Encabezado canónico que identifica el bloque generado del Prompt Clasificador de Conversaciones.
 */
export const CLASSIFIER_PROMPT_HEADER =
  "## ESTRUCTURA IDEAL — PROMPT CLASIFICADOR DE CONVERSACIONES";

/**
 * Catálogo base de Etiquetas Funcionales (mutuamente excluyentes: 1 activa por conversación).
 * Determinan la etapa del embudo y el color orientativo de la conversación en Chatwoot.
 */
export const FUNCTIONAL_CLASSIFIER_LABELS_UI: ReadonlyArray<ClassifierLabelUiItem> = [
  {
    code: "lead-frio",
    title: "Lead Frío",
    category: "functional",
    chatwootColor: "#3B82F6",
    criterion: "Saludo inicial, consulta ambigua o curiosidad sin intención comercial clara.",
    sideEffectLabels: ["Color Azul en Chatwoot (#3B82F6)"],
  },
  {
    code: "lead-tibio",
    title: "Lead Tibio",
    category: "functional",
    chatwootColor: "#F59E0B",
    criterion: "Interés explícito en producto, beneficios, garantías o cobertura de envío.",
    sideEffectLabels: ["Color Ámbar en Chatwoot (#F59E0B)"],
  },
  {
    code: "lead-caliente",
    title: "Lead Caliente",
    category: "functional",
    chatwootColor: "#F97316",
    criterion: "Intención de compra directa: consulta precios finales, combos, medios de pago o envío.",
    sideEffectLabels: ["Color Naranja en Chatwoot (#F97316)"],
  },
  {
    code: "compra-realizada",
    title: "Compra Realizada",
    category: "functional",
    chatwootColor: "#10B981",
    criterion: "Datos completos de despacho confirmados o comprobante de pago verificado.",
    sideEffectLabels: ["Color Esmeralda en Chatwoot (#10B981)"],
  },
  {
    code: "devolucion",
    title: "Devolución o Garantía",
    category: "functional",
    chatwootColor: "#EF4444",
    criterion: "Solicitud de retracto, cambio de mercancía, reembolso o reclamo de garantía.",
    sideEffectLabels: ["Color Rojo Alerta en Chatwoot (#EF4444)"],
  },
];

/**
 * Catálogo base de Etiquetas Operativas (acumulables `0..N` por conversación).
 * Disparan efectos secundarios automáticos sobre el enrutamiento del bot, Chatwoot y correo.
 */
export const OPERATIONAL_CLASSIFIER_LABELS_UI: ReadonlyArray<ClassifierLabelUiItem> = [
  {
    code: "nuevo_pedido",
    title: "Nuevo Pedido",
    category: "operational",
    chatwootColor: "#10B981",
    criterion: "El cliente entregó los datos completos de despacho y confirmó su orden.",
    sideEffectLabels: ["Registrar Pedido", "Enviar Correo"],
  },
  {
    code: "pendiente_pago",
    title: "Pendiente de Pago",
    category: "operational",
    chatwootColor: "#F59E0B",
    criterion: "Orden acordada a la espera de transferencia o soporte de pago anticipado.",
    sideEffectLabels: ["Seguimiento de Pago"],
  },
  {
    code: "pagado",
    title: "Pagado",
    category: "operational",
    chatwootColor: "#059669",
    criterion: "El cliente envió comprobante de pago o se verificó recaudo exitoso.",
    sideEffectLabels: ["Enviar Correo"],
  },
  {
    code: "despachado",
    title: "Despachado",
    category: "operational",
    chatwootColor: "#6366F1",
    criterion: "Pedido entregado a transportadora o con guía logística compartida.",
    sideEffectLabels: ["Trazabilidad Logística"],
  },
  {
    code: "soporte_humano",
    title: "Soporte Humano",
    category: "operational",
    chatwootColor: "#EC4899",
    criterion: "El cliente solicita asesor humano, presenta queja crítica o caso fuera de alcance.",
    sideEffectLabels: ["Dirigir a Agente Humano", "Pausar Bot", "Enviar Correo"],
  },
  {
    code: "cliente_recurrente",
    title: "Cliente Recurrente",
    category: "operational",
    chatwootColor: "#8B5CF6",
    criterion: "El comprador manifiesta haber adquirido antes o solicita recompra.",
    sideEffectLabels: ["Prioridad Fidelización"],
  },
];

/**
 * Construye la plantilla recomendada del «Prompt General de Operación del Cliente» (Plano 2)
 * siguiendo la metodología secuencial `IDEAL` y pre-hidratando las políticas del formulario.
 */
export function buildRecommendedClientGeneralPromptTemplate(
  ctx?: ClientGeneralPromptContext,
): string {
  const presetTitle = ctx?.presetName?.trim() || "Ritmo Natural";
  const presetDesc =
    ctx?.presetDescription?.trim() ||
    "Tono cálido, cercano y conversacional que asesora con fluidez comercial.";
  const warrantyText =
    ctx?.warrantyPolicy?.trim() ||
    "Garantía directa por defectos de fabricación según los términos informados al confirmar el pedido.";
  const returnsText =
    ctx?.returnsPolicy?.trim() ||
    "Cambios y devoluciones sujetos a revisión de estado del producto dentro del plazo legal vigente.";
  const orderConfirmText =
    ctx?.orderMessage?.trim() ||
    "¡Gracias por tu compra! Tu pedido quedó registrado y te compartiremos los datos de despacho.";

  return [
    CLIENT_GENERAL_PROMPT_HEADER,
    "",
    "### [I] INTENCIÓN COMERCIAL Y REGLA DE CATÁLOGO",
    "- Actúa como el asistente virtual oficial del comercio con el objetivo de asesorar, generar confianza y cerrar pedidos de forma autónoma.",
    "- Regla de catálogo: si el negocio comercializa un único producto estrella, preséntalo desde el primer contacto sin esperar palabras clave; si opera múltiples productos, identifica primero la necesidad del cliente y aplica únicamente la venta cruzada autorizada en cada ficha de producto.",
    "",
    "### [D] DETALLE OPERATIVO, TIEMPOS DE ENTREGA Y MEDIOS DE PAGO",
    "- Tiempos de entrega y cobertura por zona:",
    "  - Bogotá y Soacha: entrega rápida en 24 horas hábiles con pago contraentrega (Efectivo, Nequi o Daviplata).",
    "  - Resto del país (envío nacional): entrega de 1 a 4 días hábiles por transportadora aliada (Interrapidísimo o Coordinadora), disponible a domicilio o para reclamar en oficina principal.",
    "- Medios de pago autorizados: Pago contraentrega (según cobertura de transportadora), Nequi, Daviplata y transferencia Bancolombia.",
    `- Política de garantías vigente: ${warrantyText}`,
    `- Política de cambios y devoluciones: ${returnsText}`,
    "",
    "### [E] ESTILO DE RESPUESTA, CASOS ESPECIALES Y CIERRE CON REDES",
    `- Personalidad activa (${presetTitle}): ${presetDesc}`,
    "- Tuteo amigable, uso natural de emojis, máximo 4 líneas por burbuja y máximo 2 preguntas por turno.",
    `- Mensaje base al confirmar pedido: "${orderConfirmText}"`,
    "- Casos especiales del negocio:",
    "  - Si el cliente envía comprobante de pago: agradece, confirma recepción para validación y solicita los datos de envío si aún faltan.",
    "  - Si el cliente solicita hablar con una persona o presenta un reclamo crítico de garantía: responde con empatía, toma nota del caso y activa el escalamiento a soporte humano.",
    "",
    "### [A] ACCIÓN Y FLUJO GENERAL DE ATENCIÓN",
    "1. Continúa la conversación con naturalidad sin repetir el saludo automático inicial del canal.",
    "2. Resuelve inquietudes logísticas, de pagos o garantías con las reglas de este plano y apoya la argumentación de producto en el Prompt Maestro de cada artículo (Plano 3).",
    "3. Captura el nombre del cliente cuando responda a tu pregunta y conduce al cierre solicitando los datos de despacho en un solo mensaje (`🏠 Domicilio` o `🏢 Oficina de Transportadora`).",
    "",
    "### [L] LÍMITES GLOBALES DEL COMERCIO",
    "- Prohibido inventar tiempos de entrega, costos de flete, descuentos o cuentas bancarias no declaradas en este documento.",
    "- Prohibido repetir frases robóticas de bienvenida («Qué gusto atenderte») cuando el canal ya saludó automáticamente.",
    "- Prohibido incluir texto o introducciones dentro de las burbujas que contengan marcadores `[[MEDIA:...]]`.",
  ].join("\n");
}

/**
 * Aplica de forma idempotente la estructura recomendada del «Prompt General de Operación del Cliente».
 * Si el campo ya contiene una estructura generada previamente, la reemplaza sin duplicarla jamás.
 */
export function applyRecommendedClientGeneralPromptTemplate(
  currentPrompt: string,
  ctx?: ClientGeneralPromptContext,
): string {
  const nextTemplate = buildRecommendedClientGeneralPromptTemplate(ctx);
  const trimmed = currentPrompt.trim();
  if (!trimmed) {
    return nextTemplate;
  }

  const headerIndex = trimmed.indexOf(CLIENT_GENERAL_PROMPT_HEADER);
  if (headerIndex >= 0) {
    const customPrefix = trimmed.slice(0, headerIndex).trim();
    return customPrefix ? `${customPrefix}\n\n${nextTemplate}` : nextTemplate;
  }

  if (
    trimmed.includes("### [I] INTENCIÓN COMERCIAL Y REGLA DE CATÁLOGO") &&
    trimmed.includes("### [L] LÍMITES GLOBALES DEL COMERCIO")
  ) {
    const startIdx = trimmed.indexOf("### [I] INTENCIÓN COMERCIAL Y REGLA DE CATÁLOGO");
    const customPrefix = trimmed.slice(0, startIdx).trim();
    return customPrefix ? `${customPrefix}\n\n${nextTemplate}` : nextTemplate;
  }

  return `${trimmed}\n\n${nextTemplate}`;
}

/**
 * Construye la plantilla recomendada del «Prompt Clasificador de Conversaciones» bajo la metodología `IDEAL`,
 * integrando las Etiquetas Funcionales (color orientativo en Chatwoot) y las Etiquetas Operativas
 * (acciones automáticas: handoff a humano, pausa del bot, notificación por correo y registro de pedido).
 */
export function buildRecommendedClassifierPromptTemplate(
  customLabels: ReadonlyArray<ClassifierLabelUiItem> = [],
): string {
  const functionalList = [
    ...FUNCTIONAL_CLASSIFIER_LABELS_UI,
    ...customLabels.filter((l) => l.category === "functional"),
  ];
  const operationalList = [
    ...OPERATIONAL_CLASSIFIER_LABELS_UI,
    ...customLabels.filter((l) => l.category === "operational"),
  ];

  const functionalLines = functionalList
    .map(
      (l) =>
        `  - \`${l.code}\` (${l.title}) · Color Chatwoot \`${l.chatwootColor}\`: ${l.criterion}`,
    )
    .join("\n");

  const operationalLines = operationalList
    .map(
      (l) =>
        `  - \`${l.code}\` (${l.title}) · Efectos [${l.sideEffectLabels.join(", ")}]: ${l.criterion}`,
    )
    .join("\n");

  return [
    CLASSIFIER_PROMPT_HEADER,
    "",
    "### [I] INTENCIÓN DE CLASIFICACIÓN MULTIDIMENSIONAL",
    "- Clasifica cada conversación comercial en dos dimensiones complementarias a partir de la ventana reciente de mensajes (5 a 10 turnos):",
    "  1. **Etiqueta Funcional (`functionalLabel`)**: exactamente UNA (1) etiqueta activa que define la etapa del embudo y el color orientativo de la conversación en Chatwoot.",
    "  2. **Etiquetas Operativas (`operationalLabels`)**: entre 0 y N etiquetas acumulables que disparan acciones automáticas de orquestación (dirigir a agente humano, pausar el bot, enviar notificación por correo o registrar pedido).",
    "",
    "### [D] DETALLE DEL CATÁLOGO DE ETIQUETAS DEL INQUILINO",
    "- **Etiquetas Funcionales (mutuamente excluyentes — definen color en Chatwoot)**:",
    functionalLines,
    "- **Etiquetas Operativas (acumulables `0..N` — disparan acciones automáticas)**:",
    operationalLines,
    "",
    "### [E] EJEMPLO DE SALIDA ESTRUCTURADA (JSON ESTRICTO)",
    '{"functionalLabel":"lead-caliente","operationalLabels":["pendiente_pago"],"reason":"Solicita datos de cuenta Nequi para pagar 2 unidades"}',
    '{"functionalLabel":"devolucion","operationalLabels":["soporte_humano"],"reason":"Reclama garantía por producto averiado y pide asesor humano"}',
    "",
    "### [A] ACCIÓN Y REGLAS DE DECISIÓN",
    "1. Evalúa los últimos mensajes priorizando la intención más reciente del comprador.",
    "2. Selecciona una única `functionalLabel` para actualizar el color orientativo de la conversación en Chatwoot.",
    "3. Asigna `operationalLabels` solo cuando exista evidencia explícita en los mensajes (ej. `soporte_humano` para transferir a humano y pausar el bot; `nuevo_pedido` o `pagado` para notificar por correo).",
    "",
    "### [L] LÍMITES Y GUARDARRAÍLES ANTI-FALSOS POSITIVOS",
    "- Prohibido asignar `compra-realizada` o `nuevo_pedido` si el cliente solo preguntó el precio o cómo pagar sin confirmar datos completos de despacho o comprobante de pago.",
    "- Responde exclusivamente con el objeto JSON válido en una sola línea, sin bloques Markdown ni texto adicional.",
  ].join("\n");
}

/**
 * Aplica de forma idempotente la plantilla recomendada del «Prompt Clasificador de Conversaciones».
 */
export function applyRecommendedClassifierPromptTemplate(
  currentPrompt: string,
  customLabels: ReadonlyArray<ClassifierLabelUiItem> = [],
): string {
  const nextTemplate = buildRecommendedClassifierPromptTemplate(customLabels);
  const trimmed = currentPrompt.trim();
  if (!trimmed) {
    return nextTemplate;
  }

  const headerIndex = trimmed.indexOf(CLASSIFIER_PROMPT_HEADER);
  if (headerIndex >= 0) {
    const customPrefix = trimmed.slice(0, headerIndex).trim();
    return customPrefix ? `${customPrefix}\n\n${nextTemplate}` : nextTemplate;
  }

  if (
    trimmed.includes("### [I] INTENCIÓN DE CLASIFICACIÓN MULTIDIMENSIONAL") &&
    trimmed.includes("### [L] LÍMITES Y GUARDARRAÍLES ANTI-FALSOS POSITIVOS")
  ) {
    const startIdx = trimmed.indexOf("### [I] INTENCIÓN DE CLASIFICACIÓN MULTIDIMENSIONAL");
    const customPrefix = trimmed.slice(0, startIdx).trim();
    return customPrefix ? `${customPrefix}\n\n${nextTemplate}` : nextTemplate;
  }

  return `${trimmed}\n\n${nextTemplate}`;
}
