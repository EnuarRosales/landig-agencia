import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  aiAssistFields,
  aiAssistPrompts,
  type NewAiAssistField,
  type NewAiAssistPrompt,
} from "../db/schemas/admin/ai-assist";

/**
 * Catálogo canónico completo de campos asistidos por AI (AI-001 RF-01.2, SPEC-02 §5.4).
 * Cubre onboarding, productos, configuración del bot, políticas comerciales, prospectos y etiquetas.
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
    fieldKey: "bot.greeting_message",
    entity: "tenant_bots",
    columnName: "greeting_message",
    labels: {
      es: "Mensaje De Bienvenida Conversacional",
      en: "Conversational Greeting Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.order_confirmation_message",
    entity: "tenant_bots",
    columnName: "order_confirmation_message",
    labels: {
      es: "Mensaje De Confirmación De Pedido",
      en: "Order Confirmation Message",
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
    fieldKey: "product.bot_master_prompt",
    entity: "products",
    columnName: "bot_master_prompt",
    labels: {
      es: "Prompt Maestro De Venta Del Producto",
      en: "Product Sales Master Prompt",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "onboarding.product_description",
    entity: "onboarding_sessions",
    columnName: "product_description",
    labels: {
      es: "Descripción Inicial De Producto En Onboarding",
      en: "Onboarding Product Description",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.returns",
    entity: "tenant_policies",
    columnName: "returns_policy",
    labels: {
      es: "Política De Cambios Y Devoluciones",
      en: "Returns And Exchanges Policy",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.warranty",
    entity: "tenant_policies",
    columnName: "warranty_policy",
    labels: {
      es: "Política De Garantía",
      en: "Warranty Policy",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.shipping",
    entity: "tenant_policies",
    columnName: "shipping_policy",
    labels: {
      es: "Política Y Tiempos De Envío",
      en: "Shipping And Delivery Policy",
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
 * Prompts maestros versionados y ejemplos de evaluación canónicos (AI-001 RF-02, SPEC-02 §5.4).
 */
export const INITIAL_AI_ASSIST_PROMPTS: Array<
  Omit<NewAiAssistPrompt, "id" | "createdAt" | "updatedAt">
> = [
  {
    fieldKey: "bot.objective",
    version: 1,
    status: "active",
    inputHint:
      "Describe en pocas palabras qué quieres que logre el bot (ej. vender calzado deportivo, agendar citas médicas, dar soporte).",
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
        output:
          "Guiar a clientas interesadas en calzado femenino, resolver dudas de tallas y estilo, y cerrar pedidos directos por WhatsApp con rapidez y cortesía.",
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
    inputHint:
      "Escribe las reglas principales que debe obedecer el bot (ej. no dar precios sin preguntar la ciudad, pedir siempre método de pago).",
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
        output:
          "1. Solicitar y confirmar siempre la ciudad de destino antes de liquidar o informar tiempos de envío.\n2. Informar de manera transparente que únicamente se aceptan pagos en línea y contra entrega; bajo ninguna circunstancia aceptar cheques.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.persona",
    version: 1,
    status: "active",
    inputHint:
      "Define la personalidad, cercanía y estilo de comunicación que representará a tu marca.",
    masterPrompt: `Eres un experto en identidad verbal y diseño de personalidad para asistentes comerciales por WhatsApp.
Transforma el borrador del negocio en una definición clara de identidad, trato hacia el cliente, uso equilibrado de emojis y nivel de formalidad sin caer en caricaturas ni promesas irreales.`,
    outputRules: {
      maxLength: 350,
      minLength: 25,
      format: "plain",
      tone: "cercano, confiable y profesional",
    },
    examples: [
      {
        input: "amable joven que tutea y recomienda bien",
        output:
          "Asesor comercial cercano, cordial y resolutivo. Se comunica con tuteo respetuoso, mensajes breves fáciles de leer en celular y recomendaciones honestas orientadas a resolver la necesidad real del cliente.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.greeting",
    version: 1,
    status: "active",
    inputHint:
      "Escribe cómo te gustaría que el bot salude al cliente cuando escribe por primera vez.",
    masterPrompt: `Eres un especialista en experiencia de usuario conversacional.
Crea un saludo cálido, breve y profesional que dé la bienvenida al negocio y motive al cliente a expresar su necesidad de inmediato.`,
    outputRules: {
      maxLength: 180,
      minLength: 15,
      format: "plain",
      tone: "cálido y servicial",
    },
    examples: [
      {
        input: "hola bienvenidos que buscan",
        output:
          "¡Hola! Te damos la bienvenida a nuestra tienda oficial. ¿Qué producto te gustaría conocer hoy?",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.greeting_message",
    version: 1,
    status: "active",
    inputHint:
      "Redacta el mensaje inicial de bienvenida que abrirá cada nueva conversación en tus canales.",
    masterPrompt: `Eres un especialista en UX conversacional para mensajería instantánea y WhatsApp.
Convierte el borrador en un saludo inicial breve, amigable y orientado a la acción, invitando al cliente a indicar qué busca para atenderlo de inmediato.`,
    outputRules: {
      maxLength: 220,
      minLength: 15,
      format: "plain",
      tone: "cálido, claro y directo",
    },
    examples: [
      {
        input: "hola gracias por escribir dime que necesitas",
        output:
          "¡Hola! Gracias por escribirnos. Estoy aquí para ayudarte con catálogo, precios y pedidos. ¿Qué estás buscando hoy?",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.order_confirmation_message",
    version: 1,
    status: "active",
    inputHint:
      "Describe el mensaje final que recibirá el comprador al confirmar su pedido con el bot.",
    masterPrompt: `Eres un especialista en comunicación post-venta y cierre de pedidos por WhatsApp.
Redacta un mensaje de confirmación claro, tranquilizador y ordenado que agradezca la compra, confirme que el pedido quedó registrado e indique los siguientes pasos de despacho o seguimiento.`,
    outputRules: {
      maxLength: 280,
      minLength: 20,
      format: "plain",
      tone: "profesional, claro y tranquilizador",
    },
    examples: [
      {
        input: "listo tu pedido ya quedo guardado pronto te enviamos guia",
        output:
          "¡Tu pedido ha quedado confirmado con éxito! Muchas gracias por tu compra. En breve te compartiremos la confirmación de despacho y número de guía por este mismo chat.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.fallback",
    version: 1,
    status: "active",
    inputHint:
      "Escribe qué debe decir el bot si no entiende o no puede resolver la duda del cliente.",
    masterPrompt: `Crea un mensaje empático y resolutivo para situaciones donde el bot no comprende o requiere escalar a un asesor humano, transmitiendo seguridad y tranquilidad al usuario.`,
    outputRules: {
      maxLength: 220,
      minLength: 20,
      format: "plain",
      tone: "empático y resolutivo",
    },
    examples: [
      {
        input: "no entiendo te paso un humano",
        output:
          "No logré comprender del todo tu consulta. Para darte la mejor atención, transferiré esta conversación a uno de nuestros asesores humanos. ¡Un momento, por favor!",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.allowed_topics",
    version: 1,
    status: "active",
    inputHint:
      "Lista los temas en los que el bot sí tiene autorización para responder o asesorar.",
    masterPrompt: `Eres un arquitecto de guardrails conversacionales.
Organiza el borrador en una lista clara y precisa de temas habilitados para el bot, evitando ambigüedades sobre catálogo, disponibilidad, precios y soporte permitido.`,
    outputRules: {
      maxLength: 400,
      minLength: 20,
      format: "bullet_list",
      tone: "preciso y operativo",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.excluded_topics",
    version: 1,
    status: "active",
    inputHint:
      "Indica qué temas, promesas o asuntos debe evitar o escalar el bot obligatoriamente.",
    masterPrompt: `Eres un especialista en seguridad y cumplimiento conversacional.
Convierte los apuntes del negocio en restricciones explícitas y claras sobre temas que el bot nunca debe responder, negociar o prometer por cuenta propia.`,
    outputRules: {
      maxLength: 400,
      minLength: 20,
      format: "bullet_list",
      tone: "estricto y claro",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.description",
    version: 1,
    status: "active",
    inputHint:
      "Indica las características principales de tu producto, materiales o para qué sirve.",
    masterPrompt: `Eres un redactor publicitario senior especializado en e-commerce y catálogos digitales en Mocter.
Convierte las notas básicas del producto en una descripción atractiva, destacando beneficios clave, materiales o especificaciones relevantes y generando deseo de compra sin caer en exageraciones inverosímiles.`,
    outputRules: {
      maxLength: 450,
      minLength: 25,
      format: "plain",
      tone: "atractivo y orientado a beneficios",
    },
    examples: [
      {
        input: "termo de acero 1 litro frio calor todo el dia",
        output:
          "Termo ergonómico de acero inoxidable de 1 litro con tecnología de doble pared al vacío. Mantiene tus bebidas frías o calientes durante todo el día, ideal para trabajo, deporte o viajes diarios.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.prompt",
    version: 1,
    status: "active",
    inputHint:
      "Indica qué argumentos, preguntas de calificación u objeciones debe manejar el bot al vender este producto.",
    masterPrompt: `Eres un estratega de ventas conversacionales por WhatsApp.
Convierte las notas del vendedor en instrucciones prácticas de venta para que el bot destaque diferenciales, valide variantes o tallas y facilite el cierre del pedido sin presionar de más.`,
    outputRules: {
      maxLength: 500,
      minLength: 25,
      format: "plain",
      tone: "consultivo y orientado a conversión",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "product.bot_master_prompt",
    version: 1,
    status: "active",
    inputHint:
      "Define el guion o instrucción maestra específica para que el agente AI venda este producto con precisión.",
    masterPrompt: `Eres un ingeniero de ventas conversacionales experto en comercio por WhatsApp en Mocter.
Convierte las notas del producto en una instrucción operativa estructurada para el bot: qué beneficio destacar primero, qué dato validar antes de cotizar o cerrar (talla, color, cantidad o ciudad) y cómo responder dudas frecuentes con veracidad.`,
    outputRules: {
      maxLength: 600,
      minLength: 25,
      format: "plain",
      tone: "claro, persuasivo y operativo",
    },
    examples: [
      {
        input: "ofrecer envio gratis desde 2 unidades y preguntar talla antes de cobrar",
        output:
          "Presenta primero el valor diferencial del producto. Antes de confirmar el pedido, valida siempre la talla o variante requerida por el cliente. Si solicita una unidad, menciona de forma natural que desde 2 unidades aplica envío sin costo.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "onboarding.product_description",
    version: 1,
    status: "active",
    inputHint:
      "Describe brevemente tu producto estrella: qué es, para quién sirve y su principal beneficio.",
    masterPrompt: `Eres un redactor comercial experto en ayudar a nuevos negocios a publicar su primer producto estrella en Mocter.
Toma la idea inicial o borrador breve y conviértelo en una descripción clara, atractiva y lista para vender por WhatsApp, resaltando utilidad práctica, calidad percibida y sin inventar certificaciones falsas.`,
    outputRules: {
      maxLength: 400,
      minLength: 20,
      format: "plain",
      tone: "claro, persuasivo y natural",
    },
    examples: [
      {
        input: "camisa polo algodon fresca para hombre varios colores",
        output:
          "Camisa polo confeccionada en algodón transpirable de tacto suave y corte clásico. Ideal para uso diario o casual elegante, disponible en varios colores para combinar con comodidad durante todo el día.",
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.returns",
    version: 1,
    status: "active",
    inputHint:
      "Indica plazos, condiciones del producto y proceso para cambios o devoluciones.",
    masterPrompt: `Eres un especialista en atención al cliente y redacción de políticas comerciales claras para e-commerce.
Transforma el borrador en una política de cambios y devoluciones transparente, amigable, fácil de entender por WhatsApp y libre de tecnicismos legales confusos, manteniendo estrictamente las condiciones indicadas por el comercio.`,
    outputRules: {
      maxLength: 500,
      minLength: 25,
      format: "plain",
      tone: "transparente, cordial y preciso",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.warranty",
    version: 1,
    status: "active",
    inputHint:
      "Especifica qué cubre la garantía, duración y qué requisitos aplica tu comercio.",
    masterPrompt: `Eres un especialista en políticas post-venta y confianza del comprador.
Redacta una política de garantía clara y concisa que explique cobertura, vigencia y canal de solicitud sin prometer plazos o beneficios no declarados en el borrador.`,
    outputRules: {
      maxLength: 450,
      minLength: 20,
      format: "plain",
      tone: "confiable, claro y directo",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "policy.shipping",
    version: 1,
    status: "active",
    inputHint:
      "Describe cobertura geográfica, tiempos estimados de entrega y condiciones de costo o envío gratis.",
    masterPrompt: `Eres un experto en logística comercial para ventas conversacionales.
Organiza el borrador en una política de envíos clara y directa: cobertura, tiempos de despacho estimados y cálculo de tarifas o envío gratuito según lo indicado por el negocio.`,
    outputRules: {
      maxLength: 450,
      minLength: 20,
      format: "plain",
      tone: "informativo y preciso",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "prospect.notes",
    version: 1,
    status: "active",
    inputHint:
      "Anota datos relevantes sobre el interés, objeciones o contexto comercial del prospecto.",
    masterPrompt: `Eres un asistente de CRM comercial.
Resume y estructura las notas del vendedor sobre el prospecto en un párrafo breve, accionable y objetivo que facilite el seguimiento comercial posterior.`,
    outputRules: {
      maxLength: 350,
      minLength: 15,
      format: "plain",
      tone: "ejecutivo y objetivo",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "label.description",
    version: 1,
    status: "active",
    inputHint:
      "Explica cuándo debe asignarse esta etiqueta a un contacto o conversación.",
    masterPrompt: `Eres un especialista en segmentación CRM.
Redacta una definición breve y sin ambigüedades sobre el criterio exacto para aplicar esta etiqueta dentro de la bandeja comercial.`,
    outputRules: {
      maxLength: 220,
      minLength: 15,
      format: "plain",
      tone: "claro y operativo",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
];

/**
 * Siembra de forma idempotente el catálogo maestro de campos asistidos (`ai_assist_fields`)
 * y su versión inicial activa (`ai_assist_prompts` v1) sin sobrescribir versiones más nuevas
 * que el operador SaaS haya editado o promovido en `/admin/ai`.
 *
 * @returns Conteo de campos y prompts verificados/creados en base de datos.
 */
export async function seedAiAssistCatalog(): Promise<{
  fieldsUpserted: number;
  promptsInserted: number;
}> {
  const db = getDb();
  let fieldsUpserted = 0;
  let promptsInserted = 0;

  for (const field of INITIAL_AI_ASSIST_FIELDS) {
    await db
      .insert(aiAssistFields)
      .values(field)
      .onConflictDoUpdate({
        target: aiAssistFields.fieldKey,
        set: {
          labels: field.labels,
          isActive: field.isActive,
          updatedAt: new Date(),
        },
      });
    fieldsUpserted += 1;
  }

  for (const prompt of INITIAL_AI_ASSIST_PROMPTS) {
    const existingActiveOrVersion = await db
      .select({ id: aiAssistPrompts.id })
      .from(aiAssistPrompts)
      .where(
        and(
          eq(aiAssistPrompts.fieldKey, prompt.fieldKey),
          eq(aiAssistPrompts.version, prompt.version ?? 1),
        ),
      )
      .limit(1);

    if (!existingActiveOrVersion[0]) {
      const anyActive = await db
        .select({ id: aiAssistPrompts.id })
        .from(aiAssistPrompts)
        .where(
          and(
            eq(aiAssistPrompts.fieldKey, prompt.fieldKey),
            eq(aiAssistPrompts.status, "active"),
          ),
        )
        .limit(1);

      await db.insert(aiAssistPrompts).values({
        ...prompt,
        status: anyActive[0] ? "retired" : prompt.status,
      });
      promptsInserted += 1;
    }
  }

  return { fieldsUpserted, promptsInserted };
}
