import type { NewAiAssistField, NewAiAssistPrompt } from "../db/schemas/admin/ai-assist";

/**
 * Catálogo canónico inicial de campos asistidos por AI (AI-001 RF-01.2, T-01).
 * Cubre campos de texto libre (textarea) de configuración del bot, productos, prospectos y etiquetas.
 */
export const INITIAL_AI_ASSIST_FIELDS: Array<
  Omit<NewAiAssistField, "createdAt" | "updatedAt">
> = [
  {
    fieldKey: "bot.objective",
    entity: "tenant_bots",
    columnName: "objective",
    labels: {
      es: "Objetivo Del Bot",
      en: "Bot Objective",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.instructions",
    entity: "tenant_bots",
    columnName: "instructions",
    labels: {
      es: "Instrucciones Operativas Del Bot",
      en: "Bot Operational Instructions",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.persona",
    entity: "tenant_bots",
    columnName: "persona",
    labels: {
      es: "Personalidad Y Perfil Del Bot",
      en: "Bot Persona And Profile",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.greeting",
    entity: "tenant_bots",
    columnName: "greeting_template",
    labels: {
      es: "Mensaje De Saludo Inicial",
      en: "Initial Greeting Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.fallback",
    entity: "tenant_bots",
    columnName: "fallback_message",
    labels: {
      es: "Mensaje De Respaldo (Fallback)",
      en: "Fallback Response Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.allowed_topics",
    entity: "tenant_bots",
    columnName: "allowed_topics",
    labels: {
      es: "Temas Permitidos De Conversación",
      en: "Allowed Conversation Topics",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.excluded_topics",
    entity: "tenant_bots",
    columnName: "excluded_topics",
    labels: {
      es: "Temas Excluidos O Prohibidos",
      en: "Excluded Or Prohibited Topics",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.description",
    entity: "products",
    columnName: "description",
    labels: {
      es: "Descripción Del Producto",
      en: "Product Description",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.prompt",
    entity: "products",
    columnName: "prompt_override",
    labels: {
      es: "Instrucción De Venta Del Producto",
      en: "Product Sales Prompt",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "prospect.notes",
    entity: "contacts",
    columnName: "notes",
    labels: {
      es: "Notas Comerciales Del Prospecto",
      en: "Prospect Commercial Notes",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "label.description",
    entity: "tenant_labels",
    columnName: "description",
    labels: {
      es: "Descripción De La Etiqueta",
      en: "Label Description",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
];

/**
 * Prompts maestros versionados y ejemplos de evaluación canónicos (AI-001 RF-02, T-01).
 */
export const INITIAL_AI_ASSIST_PROMPTS: Array<
  Omit<NewAiAssistPrompt, "id" | "createdAt" | "updatedAt">
> = [
  {
    fieldKey: "bot.objective",
    version: 1,
    status: "active",
    inputHint: "Describe en pocas palabras qué quieres que logre el bot (ej. vender calzado deportivo, agendar citas médicas, dar soporte).",
    masterPrompt: `Eres un arquitecto especialista en diseño conversacional para comercio y atención al cliente en Mocter.
Tu misión es transformar el borrador del inquilino en un objetivo claro, conciso, medible y persuasivo para el bot conversacional.
El objetivo debe delimitar el propósito principal, el tono comercial y el resultado exitoso de la interacción, sin redundancias ni frases vacías.`,
    outputRules: {
      maxLength: 300,
      minLength: 30,
      format: "plain",
      tone: "directo y profesional",
    },
    examples: [
      {
        input: "vender tenis y zapatos de mujer por whatsapp rapido",
        output: "Guiar a clientas interesadas en calzado femenino, resolver dudas de tallas y estilo, y cerrar pedidos directos por WhatsApp con rapidez y cortesía.",
        notes: "Enfocado en comercio conversacional con llamado a la acción claro.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.instructions",
    version: 1,
    status: "active",
    inputHint: "Escribe las reglas principales que debe obedecer el bot (ej. no dar precios sin preguntar la ciudad, pedir siempre método de pago).",
    masterPrompt: `Eres un diseñador de directivas de sistema para agentes de IA conversacionales en Mocter.
Toma los lineamientos del inquilino y organízalos en directivas claras, numeradas y sin ambigüedades.
Asegura que el bot actúe con prudencia, priorice la captura de pedidos y respete las restricciones operativas.`,
    outputRules: {
      maxLength: 600,
      minLength: 40,
      format: "bullet_list",
      tone: "normativo e imperativo",
    },
    examples: [
      {
        input: "siempre confirmar la ciudad antes de cotizar envio y no aceptar cheques",
        output: "1. Solicitar y confirmar siempre la ciudad de destino antes de liquidar o informar tiempos de envío.\n2. Informar de manera transparente que únicamente se aceptan pagos en línea y contra entrega; bajo ninguna circunstancia aceptar cheques.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.description",
    version: 1,
    status: "active",
    inputHint: "Indica las características principales de tu producto, materiales o para qué sirve.",
    masterPrompt: `Eres un redactor publicitario senior especializado en e-commerce y catálogos digitales en Mocter.
Convierte las notas básicas del producto en una descripción atractiva, destacando beneficios clave, materiales o especificaciones relevantes y generando deseo de compra sin caer en exageraciones inverosímiles.`,
    outputRules: {
      maxLength: 400,
      minLength: 30,
      format: "plain",
      tone: "atractivo y orientado a beneficios",
    },
    examples: [
      {
        input: "termo de acero 1 litro frio calor todo el dia",
        output: "Termo ergonómico de acero inoxidable de 1 litro con tecnología de doble pared al vacío. Mantiene tus bebidas frías o calientes durante todo el día, ideal para trabajo, deporte o viajes diarios.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.greeting",
    version: 1,
    status: "active",
    inputHint: "Escribe cómo te gustaría que el bot salude al cliente cuando escribe por primera vez.",
    masterPrompt: `Eres un especialista en experiencia de usuario conversacional.
Crea un saludo cálido, breve y profesional que dé la bienvenida al negocio y motive al cliente a expresar su necesidad de inmediato.`,
    outputRules: {
      maxLength: 150,
      minLength: 15,
      format: "plain",
      tone: "cálido y servicial",
    },
    examples: [
      {
        input: "hola bienvenidos que buscan",
        output: "¡Hola! Te damos la bienvenida a nuestra tienda oficial. ¿Qué producto te gustaría conocer hoy?",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.fallback",
    version: 1,
    status: "active",
    inputHint: "Escribe qué debe decir el bot si no entiende o no puede resolver la duda del cliente.",
    masterPrompt: `Crea un mensaje empático y resolutivo para situaciones donde el bot no comprende o requiere escalar a un asesor humano, transmitiendo seguridad y tranquilidad al usuario.`,
    outputRules: {
      maxLength: 200,
      minLength: 20,
      format: "plain",
      tone: "empático y resolutivo",
    },
    examples: [
      {
        input: "no entiendo te paso un humano",
        output: "No logré comprender del todo tu consulta. Para darte la mejor atención, transferiré esta conversación a uno de nuestros asesores humanos. ¡Un momento, por favor!",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
];

