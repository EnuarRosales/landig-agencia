import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  aiAssistFields,
  aiAssistPrompts,
  type NewAiAssistField,
  type NewAiAssistPrompt,
} from "../db/schemas/admin/ai-assist";

/**
 * Preámbulo canónico de la Metodología Secuencial IDEAL (SPEC-19 D-01).
 *
 * Orienta al LLM para que asuma un rol activo de co-creador experto en Prompt Engineering,
 * interpretando borradores breves o incompletos del inquilino y enriqueciéndolos con
 * Few-Shot, delimitadores claros, razonamiento estructurado y restricciones negativas.
 */
export const IDEAL_METHODOLOGY_PREAMBLE = `Actúas como co-creador experto en Prompt Engineering y comercio conversacional en Mocter, aplicando rigurosamente la metodología secuencial IDEAL. Asumes un rol NO pasivo: eres altamente propositivo, creativo y analítico. Dado que el usuario puede entregar ideas breves, ambiguas o incompletas, interpretas su objetivo base, lo enriqueces con mejores prácticas (Few-Shot, delimitadores, Chain of Thought, asignación de rol y restricciones negativas) y entregas siempre una propuesta clara, estructurada y lista para producción.`;

/**
 * Catálogo canónico completo de campos asistidos por AI (AI-001 RF-01.2, SPEC-02 §5.4, SPEC-19).
 * Cubre onboarding, productos, configuración del bot, políticas comerciales, prospectos,
 * etiquetas y los prompts de operación general y clasificación dinámica del inquilino.
 *
 * Cumple estrictamente con AGENTS.md §4.8 (Title Case gramatical en labels).
 */
export const INITIAL_AI_ASSIST_FIELDS: Array<
  Omit<NewAiAssistField, "createdAt" | "updatedAt">
> = [
  {
    fieldKey: "bot.objective",
    entity: "tenant_bots",
    columnName: "objective",
    labels: {
      es: "Objetivo del Bot",
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
      es: "Instrucciones Operativas del Bot",
      en: "Bot Operational Instructions",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.client_general_prompt",
    entity: "tenant_bots",
    columnName: "instructions",
    labels: {
      es: "Prompt General de Operación del Cliente",
      en: "Client General Operation Prompt",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.conversation_classifier",
    entity: "tenant_bots",
    columnName: "classifier_prompt",
    labels: {
      es: "Prompt Clasificador de Conversaciones",
      en: "Conversation Classifier Prompt",
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
      es: "Personalidad y Perfil del Bot",
      en: "Bot Persona and Profile",
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
      es: "Mensaje de Saludo Inicial",
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
      es: "Mensaje de Bienvenida Conversacional",
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
      es: "Mensaje de Confirmación de Pedido",
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
      es: "Mensaje de Respaldo (Fallback)",
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
      es: "Temas Permitidos de Conversación",
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
      es: "Temas Excluidos o Prohibidos",
      en: "Excluded or Prohibited Topics",
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
      es: "Descripción del Producto",
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
      es: "Instrucción de Venta del Producto",
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
      es: "Prompt Maestro de Venta del Producto",
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
      es: "Descripción Inicial de Producto en Onboarding",
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
      es: "Política de Cambios y Devoluciones",
      en: "Returns and Exchanges Policy",
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
      es: "Política de Garantía",
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
      es: "Política y Tiempos de Envío",
      en: "Shipping and Delivery Policy",
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
      es: "Notas Comerciales del Prospecto",
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
      es: "Descripción y Regla de la Etiqueta",
      en: "Label Description and Trigger Rule",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_welcome",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje de Bienvenida",
      en: "Welcome Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_order_confirmation",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje de Confirmación de Pedido y Pago",
      en: "Order and Payment Confirmation Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_dispatch_tracking",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje de Despacho y Guía",
      en: "Dispatch and Tracking Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_delivery_issue",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje de Novedad en Entrega",
      en: "Delivery Issue Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_out_of_hours",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje Fuera de Horario",
      en: "Out of Hours Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_handoff",
    entity: "tenant_bots",
    columnName: "default_messages",
    labels: {
      es: "Mensaje de Transferencia a Asesor Humano",
      en: "Human Handoff Message",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.template_body",
    entity: "email_templates",
    columnName: "body_html",
    labels: {
      es: "Cuerpo de Plantilla de Correo",
      en: "Email Template Body",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.layout_header",
    entity: "email_layout_configs",
    columnName: "header_html",
    labels: {
      es: "Encabezado Global de Correos",
      en: "Global Email Header",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.layout_footer",
    entity: "email_layout_configs",
    columnName: "footer_html",
    labels: {
      es: "Pie de Página Global de Correos",
      en: "Global Email Footer",
    },
    isActive: true,
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
];

/**
 * Prompts maestros versionados bajo la metodología secuencial IDEAL (AI-001 RF-02, SPEC-02 §5.4, SPEC-19).
 */
export const INITIAL_AI_ASSIST_PROMPTS: Array<
  Omit<NewAiAssistPrompt, "id" | "createdAt" | "updatedAt">
> = [
  {
    fieldKey: "bot.objective",
    version: 2,
    status: "active",
    inputHint:
      "Describe en pocas palabras qué quieres que logre el bot (ej. asesorar, generar confianza y cerrar la venta de nuestro catálogo por WhatsApp).",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Transformar la idea del inquilino en un objetivo comercial claro, medible y orientado al cierre de pedidos para su asistente virtual.
[D] DETALLE: El objetivo se inyecta en el bloque de identidad del bot para guiar cada turno en WhatsApp y widget web.
[E] EJEMPLO: "Asesorar con calidez a cada comprador, resolver dudas de uso y cobertura de envío, generar confianza en la compra contraentrega y cerrar el pedido completo sin fricción."
[A] ACCIÓN: Analiza el borrador y el contexto del comercio; sintetiza en 1 o 2 oraciones el propósito comercial, el valor al comprador y el resultado esperado (cierre de venta o calificación).
[L] LÍMITE: Máximo 300 caracteres. No uses frases genéricas vacías ni inventes productos no mencionados.`,
    outputRules: {
      maxLength: 300,
      minLength: 30,
      format: "plain",
      tone: "directo, comercial y profesional",
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
    version: 2,
    status: "active",
    inputHint:
      "Escribe las reglas principales que debe obedecer el bot (ej. máximo 4 líneas por burbuja, no dar precio en el primer contacto, confirmar ciudad).",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Estructurar las directivas operativas del asistente virtual en reglas accionables, numeradas y sin ambigüedad.
[D] DETALLE: Estas directivas gobiernan el ritmo conversacional en WhatsApp (longitud de mensajes, preguntas por turno, captura de ciudad y orden de respuesta).
[E] EJEMPLO: "1. Mantener máximo 4 líneas por mensaje y máximo 2 preguntas por turno.\n2. En el primer contacto presentar beneficios y preguntar ciudad antes de revelar precios.\n3. Solicitar todos los datos del pedido en un solo mensaje según domicilio u oficina."
[A] ACCIÓN: Toma los apuntes del inquilino, identifícalos como reglas operativas y redáctalos en una lista imperativa priorizando conversión, claridad y brevedad en móvil.
[L] LÍMITE: Máximo 600 caracteres. Prohibido contradecir las políticas verificadas del comercio ni inventar descuentos.`,
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
    fieldKey: "bot.client_general_prompt",
    version: 1,
    status: "active",
    inputHint:
      "Describe cómo opera tu negocio en general: tono del asistente, tiempos de entrega por zona (ej. Bogotá 24h, nacional 1-4 días), medios de pago, garantías y redes sociales.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Co-crear el «Prompt General de Operación del Cliente» que instruye al bot sobre el funcionamiento transversal del negocio, desacoplado de cualquier producto individual.
[D] DETALLE: El inquilino necesita que su bot conozca la identidad del comercio, personalidad (cercana, máximo 4 líneas por mensaje y 2 preguntas por turno, sin repetir el saludo automático del canal), tiempos de entrega por zona geográfica, modalidades de pago (contraentrega, transferencia), políticas de garantía/devolución, manejo de casos especiales (cliente molesto, pregunta si es un bot, cliente que posterga) y cierre con redes sociales. La sintaxis técnica ([[SPLIT]], [[MEDIA:...]], plantillas de Domicilio vs. Oficina) ya la inyecta la plataforma Mocter.
[E] EJEMPLO: Estructura el resultado exactamente en los 5 bloques IDEAL con encabezados Markdown:
## [I] Intención Comercial y Regla de Catálogo
## [D] Detalle Operativo, Tiempos de Entrega y Medios de Pago
## [E] Estilo de Respuesta, Casos Especiales y Cierre con Redes
## [A] Acción y Flujo General de Atención
## [L] Límites Globales del Comercio
[A] ACCIÓN: Enriquece las notas del inquilino y el contexto del formulario (preset, políticas, mensaje de confirmación) completando los 5 bloques IDEAL con redacción clara, profesional y lista para producción.
[L] LÍMITE: Hasta 4,000 caracteres. NO acoples precios ni beneficios de un producto específico dentro de este prompt general; mantén las reglas aplicables a toda la tienda.`,
    outputRules: {
      maxLength: 4000,
      minLength: 80,
      format: "markdown",
      tone: "estructurado, comercial y operativo",
    },
    examples: [
      {
        input: "somos tienda virtual, entregamos en 24h en bogota y soacha y 1 a 4 dias resto del pais, pago contra entrega, trato amable maximo 4 lineas",
        output: `## [I] Intención Comercial y Regla de Catálogo
- Asesorar con calidez, generar confianza inmediata y guiar al comprador hasta confirmar su pedido completo por WhatsApp.

## [D] Detalle Operativo, Tiempos de Entrega y Medios de Pago
- Tono cálido, cercano y positivo con uso natural de emojis (máximo 4 líneas por burbuja y máximo 2 preguntas por turno).
- Tiempos de entrega: Bogotá y Soacha en 24 horas; resto del país de 1 a 4 días hábiles.
- Pago contra entrega habilitado y envío rápido con transportadoras aliadas.

## [E] Estilo de Respuesta, Casos Especiales y Cierre con Redes
- Si preguntan si eres un bot: responde con transparencia que eres el asistente virtual oficial del comercio listo para ayudar en su compra.
- Si el cliente está molesto: valida su situación con empatía y ofrece solución prioritaria.

## [A] Acción y Flujo General de Atención
- Continúa la conversación de forma natural sin repetir el saludo automático del canal, confirma ciudad o municipio de destino y solicita todos los datos del pedido en un único mensaje según elija Domicilio u Oficina de Transportadora.

## [L] Límites Globales del Comercio
- Prohibido inventar precios, coberturas o tiempos de entrega no declarados. Nunca solicitar datos de pedido uno por uno.`,
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.conversation_classifier",
    version: 1,
    status: "active",
    inputHint:
      "Indica reglas especiales para clasificar tus conversaciones en Etiquetas Funcionales (color en Chatwoot) y Etiquetas Operativas (pasar a humano, pausar bot o enviar correo).",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Optimizar el «Prompt Clasificador de Conversaciones» del inquilino articulando sus Etiquetas Funcionales (embudo comercial mutuamente excluyente que define el color orientativo en Chatwoot) y sus Etiquetas Operativas (estados acumulables que disparan acciones como transferencia a humano, pausa del bot o notificación por correo).
[D] DETALLE: El clasificador evalúa los últimos turnos de la conversación y devuelve un JSON validado {"functionalLabel": "<slug>", "operationalLabels": ["<slug>"]}.
- Funcionales base: lead-frio (azul), lead-tibio (ámbar), lead-caliente (naranja: pidió precio/fotos o quiere comprar pero aún faltan datos de envío), compra-realizada (esmeralda: únicamente cuando entregó nombre completo, celular y ciudad/dirección), devolucion (rojo: garantía o novedad post-venta).
- Operativas base: nuevo_pedido (registra orden y envía email), pendiente_pago, pagado, despachado, soporte_humano (transfiere a agente humano, pausa el bot y envía email), cliente_recurrente, más las etiquetas propias del inquilino.
[E] EJEMPLO: Estructura la instrucción clasificadora con criterios de frontera inequívocos entre lead-caliente y compra-realizada, y disparadores exactos para cada etiqueta operativa.
[A] ACCIÓN: Toma las notas o etiquetas del comercio y redacta criterios de clasificación precisos bajo la estructura IDEAL ([I] Intención, [D] Detalle de Etiquetas Funcionales y Operativas, [E] Ejemplo de Salida JSON, [A] Acción de Evaluación, [L] Límites y Guardrails).
[L] LÍMITE: Máximo 3,000 caracteres. Exige siempre que compra-realizada y nuevo_pedido solo se asignen si están completos nombre, celular y ciudad/dirección.`,
    outputRules: {
      maxLength: 3000,
      minLength: 60,
      format: "markdown",
      tone: "analítico, determinista y estricto",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.persona",
    version: 2,
    status: "active",
    inputHint:
      "Define la personalidad, cercanía y estilo de comunicación que representará a tu marca.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Definir la identidad verbal y personalidad comercial del asistente virtual para generar empatía y confianza en WhatsApp.
[D] DETALLE: El perfil define el trato (tuteo amigable o trato corporativo), uso natural de emojis, energía positiva y ritmo de lectura en pantalla móvil (máximo 4 líneas por mensaje, máximo 2 preguntas por turno).
[E] EJEMPLO: "Asesor comercial cálido, cercano y con energía positiva. Utiliza tuteo amigable y emojis de forma natural, responde en mensajes de máximo 4 líneas con hasta 2 preguntas por turno y acompaña al comprador hasta el cierre sin presionar."
[A] ACCIÓN: Transforma los apuntes del usuario en un perfil de personalidad claro, coherente con el preset elegido y orientado a conversión.
[L] LÍMITE: Máximo 350 caracteres. Evita jerga confusa, caricaturas o promesas que el bot no pueda cumplir.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Escribe cómo te gustaría que el bot salude al cliente cuando escribe por primera vez.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Crear una plantilla de saludo inicial cálida y efectiva que abra la conversación en el primer turno sin fricción.
[D] DETALLE: Es el primer mensaje que ve el comprador en WhatsApp o widget web; debe transmitir cercanía e invitar a continuar.
[E] EJEMPLO: "😊 ¡Hola! Soy {{bot_name}}, la persona encargada de atenderte en {{business_name}}."
[A] ACCIÓN: Redacta un saludo breve y acogedor a partir del borrador del inquilino.
[L] LÍMITE: Máximo 180 caracteres. No incluyas bloques extensos de políticas ni pidas todos los datos de envío en el saludo.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Redacta el mensaje inicial de bienvenida que abrirá cada nueva conversación en tus canales.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Diseñar el mensaje automático de bienvenida del canal para recibir al prospecto e identificar su necesidad o ciudad.
[D] DETALLE: Cuando el canal ya envía este saludo automático, el bot continúa la conversación de forma natural sin volver a presentarse dos veces.
[E] EJEMPLO: "¡Hola! 👋 Gracias por escribirnos. Estoy en línea para asesorarte con beneficios, disponibilidad y envíos a tu ciudad. ¿Desde qué ciudad o municipio nos escribes?"
[A] ACCIÓN: Convierte el borrador en un saludo ágil, cálido y con una pregunta abierta de enganche.
[L] LÍMITE: Máximo 220 caracteres. Máximo 1 pregunta en el saludo.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Describe el mensaje final que recibirá el comprador al confirmar su pedido con el bot.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Redactar un mensaje de cierre y confirmación de pedido entusiasta, claro y tranquilizador tras capturar los datos del comprador.
[D] DETALLE: Se envía inmediatamente después de registrar el pedido completo (Domicilio u Oficina de Transportadora), agradeciendo la confianza e invitando a seguir las redes del comercio si aplica.
[E] EJEMPLO: "MUCHAS GRACIAS POR TU COMPRA 🔥\nTu pedido ha quedado confirmado exitosamente 🤗 En breve te compartiremos los detalles de despacho por este mismo chat."
[A] ACCIÓN: Transforma el borrador del inquilino en un mensaje de cierre memorable que confirme el registro del pedido y transmita respaldo post-venta.
[L] LÍMITE: Máximo 280 caracteres. Prohibido ofrecer otros productos o hacer venta cruzada durante el agradecimiento final.`,
    outputRules: {
      maxLength: 280,
      minLength: 20,
      format: "plain",
      tone: "profesional, entusiasta y tranquilizador",
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
    version: 2,
    status: "active",
    inputHint:
      "Escribe qué debe decir el bot si no entiende o necesita pasar la conversación a un asesor humano.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Proveer una respuesta empática de respaldo o escalamiento cuando una consulta requiere intervención humana.
[D] DETALLE: Se utiliza ante casos fuera de alcance o cuando se activa una etiqueta operativa de soporte humano.
[E] EJEMPLO: "Entiendo tu situación 😊 Para brindarte una solución exacta, voy a comunicar tu caso con un especialista de nuestro equipo. ¡Te responderemos en breve!"
[A] ACCIÓN: Redacta un mensaje breve, cordial y tranquilizador basado en la nota del comercio.
[L] LÍMITE: Máximo 220 caracteres. No culpes al usuario ni expongas errores técnicos internos.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Lista los temas en los que el bot sí tiene autorización para responder o asesorar.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Delimitar con precisión los temas comerciales y operativos que el bot está autorizado a responder autónomamente.
[D] DETALLE: Sirve como guardrail positivo para mantener el foco en catálogo, beneficios, precios, tiempos de entrega y captura de pedidos.
[E] EJEMPLO: "- Beneficios, modo de uso y presentaciones del catálogo activo.\n- Precios, combos recomendados y promociones vigentes.\n- Cobertura de envíos (domicilio u oficina) y pago contraentrega."
[A] ACCIÓN: Organiza las notas del inquilino en una lista de viñetas claras y operativas.
[L] LÍMITE: Máximo 400 caracteres. No incluyas temas médicos, legales o financieros ajenos al giro del negocio.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Indica qué temas, promesas o asuntos debe evitar o escalar el bot obligatoriamente.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Establecer restricciones negativas inquebrantables sobre lo que el bot nunca debe prometer, inventar o negociar.
[D] DETALLE: Protege la reputación y el margen del comercio frente a alucinaciones o solicitudes fuera de política.
[E] EJEMPLO: "- Prohibido inventar precios, descuentos no configurados o tiempos de entrega no verificados.\n- Nunca ofrecer otros productos ni hacer venta cruzada si el cliente ya está cerrando compra.\n- No dar diagnósticos médicos ni prometer resultados garantizados fuera de la ficha oficial."
[A] ACCIÓN: Convierte las advertencias del comercio en prohibiciones directas y verificables.
[L] LÍMITE: Máximo 400 caracteres.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Indica las características principales de tu producto, materiales, rendimiento o para qué sirve.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Transformar apuntes básicos del artículo en una descripción comercial persuasiva, clara y orientada a beneficios reales.
[D] DETALLE: Se muestra en la ficha del producto y nutre automáticamente el contexto del bot comercial en WhatsApp.
[E] EJEMPLO: "Termo ergonómico de acero inoxidable de 1 litro con tecnología de doble pared al vacío. Conserva bebidas frías o calientes todo el día; práctico, resistente y libre de derrames para trabajo, deporte o viaje."
[A] ACCIÓN: Destaca qué problema resuelve, sus beneficios principales, materiales o rendimiento aproximado en un párrafo fluido.
[L] LÍMITE: Máximo 450 caracteres. Prohibido inventar certificaciones, registros sanitarios o garantías no mencionadas en el borrador.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Indica qué argumentos, preguntas de calificación u objeciones debe manejar el bot al vender este producto.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Sintetizar argumentos tácticos de venta y calificación rápida para este artículo en conversaciones de WhatsApp.
[D] DETALLE: Guía al bot sobre cómo presentar el diferencial del producto y qué confirmar antes de tomar el pedido.
[E] EJEMPLO: "Destaca la facilidad de uso desde casa y el rendimiento por unidad. En el primer mensaje presenta beneficios sin precio; cuando consulte el valor, destaca la opción de 2 unidades como la más recomendada."
[A] ACCIÓN: Convierte los apuntes del vendedor en instrucciones directas de argumentación y cierre.
[L] LÍMITE: Máximo 500 caracteres. No inventes precios ni promociones no declaradas.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Escribe notas breves o usa «Insertar Estructura Recomendada» y pulsa «Mejorar con AI» para co-crear el guion completo del producto bajo la metodología IDEAL.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Co-crear el «Prompt Maestro de Comercialización del Producto» bajo la metodología secuencial IDEAL, convirtiendo notas mínimas del inquilino y los metadatos del formulario en un guion de ventas por WhatsApp de alta conversión y rápida adopción.
[D] DETALLE: Este prompt regula EXCLUSIVAMENTE las condiciones de comercialización de este producto (su propuesta de valor, beneficios en formato WhatsApp, presentación de precio/escalones/combos, disparo de fotos/videos y audios por número de orden con marcadores [[MEDIA:...]], preguntas de calificación y manejo de objeciones del artículo). Las reglas generales del negocio (tiempos de envío por ciudad, plantillas de Domicilio vs. Oficina, redes sociales) ya viven en el Prompt General del Cliente y en los bloques técnicos de Mocter, por lo que NO deben repetirse como relleno genérico.
[E] EJEMPLO: Organiza SIEMPRE la salida en las 5 secciones exactas de la metodología IDEAL:
## [I] Intención Comercial y Palabras Clave (<Nombre del Producto>)
- Objetivo de venta, término multimedia [[MEDIA:<Nombre del Producto>]] y palabras clave de activación.

## [D] Detalle Comercial y Beneficios Clave (Formato WhatsApp)
- Lista corta de beneficios de alto impacto con emojis (✅, 🔥) lista para enviar en una burbuja de máximo 4-6 líneas, más especificaciones o componentes del combo.

## [E] Estrategia de Precios, Escalones y Presentación
- Regla de Primer Contacto (presentar primero multimedia + beneficios + pregunta de ciudad sin dar precio salvo que ya esté en el Caso Precio).
- Bloque listo para copiar en CASO PRECIO con opciones por cantidad (destacando con ⭐ la opción recomendada cuando aplique).

## [A] Acción Multimedia, Audios y Calificación de Pedido
- Uso exclusivo de marcadores [[MEDIA:<Nombre del Producto>:imagen]] y [[MEDIA:<Nombre del Producto>:video]] en su propia línea sin texto antes ni después (Regla Anti-Caption).
- Reglas de CASO AUDIO por número de orden ([[MEDIA:<Nombre del Producto>:audio:1]]): cuándo enviarlo (ej. después de los beneficios o bajo demanda) y verificación en el historial para no reenviar el mismo orden sin confirmar primero con el cliente.
- Datos o variantes del producto a confirmar antes del pedido (cantidad, talla, color o presentación).

## [L] Límites del Producto y Manejo de Objeciones
- Respuestas breves de 2-3 líneas a las objeciones más frecuentes del producto y prohibición de inventar usos, precios o garantías no declaradas.

[A] ACCIÓN: Lee el borrador del usuario y el JSON de "CONTEXTO DEL NEGOCIO / FORMULARIO" (productName, description, category, brand, priceAmount, currency, compositionType, attributes, comboItems, mediaCounts, audioItems). Enriquécelo proactivamente y genera el guion completo en las 5 secciones IDEAL anteriores.
[L] LÍMITE: Máximo 4,000 caracteres. Prohibido agregar saludos meta, explicaciones fuera del prompt o duplicar secciones.`,
    outputRules: {
      maxLength: 4000,
      minLength: 80,
      format: "markdown",
      tone: "claro, persuasivo y operativo",
    },
    examples: [
      {
        input: "Resina dental moldeable en casa, rinde 25 dientes aprox, 1 frasco 64900, 2 frascos 75000 recomendada, 3 frascos 89900, enviar audio orden 5 despues de beneficios",
        output: `## [I] Intención Comercial y Palabras Clave (Resina Dental)
- Objetivo: Asesorar, generar confianza inmediata y cerrar la venta de Resina Dental.
- Término multimedia canónico: [[MEDIA:Resina Dental]]
- Palabras clave de activación: Resina Dental, Resina Dental Moldeable, Dientes quebrados, Dientes faltantes, Precio.

## [D] Detalle Comercial y Beneficios Clave (Formato WhatsApp)
Burbuja de beneficios lista para enviar:
"Beneficios de nuestra Resina Dental:
✅ 🏠 ÚSALA DESDE CASA
✅ FÁCIL DE MOLDEAR
✅ ♻️ REUTILIZABLE
✅ 🦷 SONRÍE CON MÁS CONFIANZA
✅ ✨ APARIENCIA MÁS UNIFORME
🔥 EL FRASCO ES PARA 25 DIENTES APROXIMADOS"

## [E] Estrategia de Precios, Escalones y Presentación
- En el PRIMER CONTACTO presenta saludo + multimedia + beneficios + pregunta de ciudad sin mencionar el precio.
- En CASO PRECIO (cuando el cliente consulte el valor tras el primer contacto), responde en 1 sola burbuja:
"💰 Opciones de Resina Dental:
✔️ 1 Frasco: $64.900 COP
✔️ 2 Frascos: $75.000 COP ⭐ (la más recomendada)
✔️ 3 Frascos: $89.900 COP
🚚 Envío gratis a nivel nacional.
💳 Pago contra entrega disponible."

## [A] Acción Multimedia, Audios y Calificación de Pedido
- Multimedia de presentación (en su propia línea, sin texto introductorio ni pies de foto):
[[MEDIA:Resina Dental:imagen]]
[[MEDIA:Resina Dental:video]]
- Regla de Audio por orden:
  - Audio orden 5: usar [[MEDIA:Resina Dental:audio:5]] en su propia línea después de los beneficios o cuando el cliente pida nota de voz, acompañado en la siguiente burbuja por "Ahí tienes la nota de voz 🎧 ¿Te lo aparto o tienes alguna otra pregunta?". Si el orden 5 ya se envió en la conversación, pregunta primero si desea reenviarlo.
- Calificación antes del cierre: confirmar cantidad de frascos deseada (1, 2 o 3) y modalidad de envío (Domicilio u Oficina).

## [L] Límites del Producto y Manejo de Objeciones
- "¿Es difícil de moldear?": Se ablanda fácilmente en agua caliente y se moldea en pocos minutos desde casa, además es reutilizable.
- Prohibido ofrecer otros productos o hacer venta cruzada. Prohibido agregar texto en la misma burbuja de un marcador [[MEDIA:...]].`,
      },
    ],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "onboarding.product_description",
    version: 2,
    status: "active",
    inputHint:
      "Describe brevemente tu producto estrella: qué es, para quién sirve y su principal beneficio.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Ayudar al nuevo comercio durante su onboarding a redactar la descripción de su primer producto estrella lista para vender en minutos.
[D] DETALLE: Es el primer producto con el que el bot iniciará su atención en WhatsApp y widget web.
[E] EJEMPLO: "Hidrolavadora portátil y máquina de vapor todo en uno de alta presión. Remueve grasa difícil y desinfecta superficies en hogar o vehículo ahorrando tiempo y agua."
[A] ACCIÓN: Toma la idea inicial del usuario y conviértela en una descripción comercial atractiva, concreta y creíble.
[L] LÍMITE: Máximo 400 caracteres. No inventes certificaciones ni garantías no mencionadas.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Indica plazos, condiciones del producto y proceso para cambios o devoluciones.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Redactar una política de cambios y devoluciones clara y transparente que el bot pueda explicar en segundos por WhatsApp.
[D] DETALLE: Define plazos en días, estado requerido del producto y canal de atención ante novedades o retracto.
[E] EJEMPLO: "Aceptamos solicitudes de cambio o devolución dentro de los primeros 5 días hábiles tras recibir tu pedido, siempre que el producto conserve su empaque original. Escríbenos por este chat indicando tu número de celular para gestionarlo de inmediato."
[A] ACCIÓN: Estructura las condiciones del comercio en un texto cordial, directo y libre de jerga legal compleja.
[L] LÍMITE: Máximo 500 caracteres. Respeta estrictamente los plazos indicados por el inquilino.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Especifica qué cubre la garantía, duración y qué requisitos aplica tu comercio.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Estructurar una política de garantía sólida que transmita confianza al comprador indeciso y delimite la cobertura real.
[D] DETALLE: El bot consulta esta política cuando el cliente pregunta "¿Tiene garantía?" o reporta un defecto de fábrica.
[E] EJEMPLO: "Todos nuestros productos cuentan con 30 días de garantía directa por defectos de fabricación o novedades en el transporte. Solo debes enviarnos foto o video por este chat y realizamos la reposición sin costo adicional."
[A] ACCIÓN: Convierte el borrador en una declaración clara de vigencia, cobertura y requisito de solicitud.
[L] LÍMITE: Máximo 450 caracteres. No prometas plazos ni coberturas no autorizadas en el borrador.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Describe cobertura geográfica, tiempos estimados de entrega por zona (ej. Bogotá y Soacha 24h, resto del país 1-4 días) y pago contra entrega.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Organizar las reglas logísticas y tiempos de entrega por zona para que el bot informe con exactitud según la ciudad del comprador.
[D] DETALLE: Incluye tiempos diferenciados (ciudades principales vs. resto del país), modalidades de entrega (🏠 Domicilio o 🏢 Oficina de Transportadora), costo de envío y disponibilidad de pago contra entrega.
[E] EJEMPLO: "- Bogotá y Soacha: entrega rápida en 24 horas.\n- Resto del país: 1 a 4 días hábiles según municipio.\n- Modalidades: entrega en domicilio o reclamo en oficina de transportadora aliada.\n- Pago contra entrega y envío gratis nacional en promociones seleccionadas."
[A] ACCIÓN: Toma los apuntes logísticos del comercio y ordénalos por zonas, tiempos y condiciones de cobro.
[L] LÍMITE: Máximo 450 caracteres. No menciones transportadoras ni ciudades no respaldadas por el inquilino.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Anota datos relevantes sobre el interés, objeciones o contexto comercial del prospecto.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Sintetizar los apuntes comerciales sobre un prospecto del CRM en un resumen ejecutivo accionable para el próximo contacto.
[D] DETALLE: Ayuda tanto al agente humano como a la memoria contextual del bot a retomar la conversación con precisión.
[E] EJEMPLO: "Interesado en combo de 2 unidades con envío a Medellín. Consultó disponibilidad de pago contraentrega; pendiente confirmar dirección de domicilio el viernes."
[A] ACCIÓN: Resume interés, producto consultado, ciudad, objeción principal y siguiente paso concreto.
[L] LÍMITE: Máximo 350 caracteres. Solo hechos objetivos del borrador.`,
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
    version: 2,
    status: "active",
    inputHint:
      "Explica cuándo debe asignarse esta etiqueta (Funcional para color en Chatwoot u Operativa para pasar a humano, pausar bot o enviar correo).",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Definir con precisión milimétrica la regla de activación de una etiqueta personalizada del inquilino para que el «Prompt Clasificador» la asigne automáticamente sin falsos positivos.
[D] DETALLE: En Mocter existen dos categorías de etiquetas:
1. Etiquetas Funcionales (embudo comercial mutuamente excluyente: determinan el color orientativo de la conversación en Chatwoot).
2. Etiquetas Operativas (estados acumulables: pueden dirigir la conversación a un agente humano, pausar el bot o disparar una notificación por correo electrónico).
[E] EJEMPLO: "Asignar únicamente cuando el cliente solicite cotización por mayor (más de 12 unidades) o pida hablar con un ejecutivo mayorista. Acción operativa asociada: transferir a agente humano y notificar por correo."
[A] ACCIÓN: Convierte la idea del inquilino en una condición lógica verificable en el historial de mensajes (qué debe haber dicho o hecho el cliente y qué NO debe confundirse).
[L] LÍMITE: Máximo 280 caracteres. Redacción directa, determinista y libre de ambigüedades.`,
    outputRules: {
      maxLength: 280,
      minLength: 15,
      format: "plain",
      tone: "claro, determinista y operativo",
    },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_welcome",
    version: 1,
    status: "active",
    inputHint: "Describe cómo quieres saludar al cliente al abrir conversación.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Redactar el mensaje de bienvenida inicial del comercio para WhatsApp y canales digitales.
[D] DELIMITACIÓN: Conserva marcadores válidos si el usuario los usa ({{customer_name}}, {{business_name}}) sin inventar precios ni promesas falsas.
[E] EJEMPLO: "¡Hola {{customer_name}}! Qué gusto saludarte en {{business_name}}. Cuéntame qué producto buscas hoy para asesorarte."
[A] ACCIÓN: Devuelve un mensaje breve, cálido y orientado a abrir la conversación.
[L] LÍMITE: Máximo 600 caracteres en texto plano apto para WhatsApp.`,
    outputRules: { maxLength: 600, minLength: 15, format: "plain", tone: "cálido y profesional" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_order_confirmation",
    version: 1,
    status: "active",
    inputHint: "Personaliza el mensaje al confirmar pedido e instrucciones de pago.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Confirmar al comprador su pedido registrado con claridad sobre pago y envío.
[D] DELIMITACIÓN: Preserva los marcadores ({{customer_name}}, {{customer_phone}}, {{order_number}}, {{payment_instructions}}, {{shipping_summary}}) sin añadir enlaces falsos.
[E] EJEMPLO: "¡Pedido {{order_number}} confirmado, {{customer_name}}! Validamos tu contacto {{customer_phone}}. {{payment_instructions}} {{shipping_summary}}"
[A] ACCIÓN: Redacta una confirmación tranquilizadora y estructurada en texto plano.
[L] LÍMITE: Máximo 900 caracteres.`,
    outputRules: { maxLength: 900, minLength: 20, format: "plain", tone: "claro y confiable" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_dispatch_tracking",
    version: 1,
    status: "active",
    inputHint: "Personaliza la notificación de despacho con transportadora y guía.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Informar al cliente que su compra ya fue despachada junto con transportadora y número de guía.
[D] DELIMITACIÓN: Conserva {{customer_name}}, {{order_number}}, {{carrier_name}} y {{tracking_code}}.
[E] EJEMPLO: "¡Tu pedido {{order_number}} ya va en camino, {{customer_name}}! Transportadora: {{carrier_name}}. Guía: {{tracking_code}}."
[A] ACCIÓN: Redacta un aviso entusiasta y útil en texto plano.
[L] LÍMITE: Máximo 700 caracteres.`,
    outputRules: { maxLength: 700, minLength: 20, format: "plain", tone: "positivo y claro" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_delivery_issue",
    version: 1,
    status: "active",
    inputHint: "Personaliza el mensaje empático ante una novedad o devolución de entrega.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Contactar al comprador ante una novedad logística sin culparlo, pidiendo referencias o confirmación para reprogramar.
[D] DELIMITACIÓN: Conserva {{customer_name}}, {{order_number}} y {{carrier_name}}.
[E] EJEMPLO: "Hola {{customer_name}}, vimos una novedad en la entrega de tu pedido {{order_number}} con {{carrier_name}}. ¿Nos confirmas una referencia o horario para coordinarlo hoy?"
[A] ACCIÓN: Redacta un mensaje empático y resolutivo en texto plano.
[L] LÍMITE: Máximo 700 caracteres.`,
    outputRules: { maxLength: 700, minLength: 20, format: "plain", tone: "empático y resolutivo" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_out_of_hours",
    version: 1,
    status: "active",
    inputHint: "Personaliza el aviso automático fuera del horario de atención.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Informar amablemente al cliente que escribió fuera del horario comercial e invitarlo a dejar su consulta.
[D] DELIMITACIÓN: Conserva {{customer_name}} y {{business_name}} sin prometer horarios falsos.
[E] EJEMPLO: "¡Hola {{customer_name}}! Gracias por escribir a {{business_name}}. En este momento nuestro equipo no está conectado, pero atenderemos tu mensaje a primera hora."
[A] ACCIÓN: Redacta una respuesta cordial y concisa en texto plano.
[L] LÍMITE: Máximo 500 caracteres.`,
    outputRules: { maxLength: 500, minLength: 15, format: "plain", tone: "cordial y claro" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "bot.msg_handoff",
    version: 1,
    status: "active",
    inputHint: "Personaliza el mensaje cuando el bot transfiere a un asesor humano.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Comunicar con transparencia que un asesor humano continuará atendiendo el caso.
[D] DELIMITACIÓN: Conserva {{customer_name}} y {{business_name}} sin prometer tiempos exactos de espera no garantizados.
[E] EJEMPLO: "Con gusto, {{customer_name}}. Estoy conectando tu conversación con un asesor de {{business_name}} para ayudarte de forma personalizada."
[A] ACCIÓN: Redacta un traspaso sereno y profesional en texto plano.
[L] LÍMITE: Máximo 500 caracteres.`,
    outputRules: { maxLength: 500, minLength: 15, format: "plain", tone: "cercano y profesional" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.template_body",
    version: 1,
    status: "active",
    inputHint: "Redacta o pega el borrador del contenido HTML específico de la notificación (sin encabezado ni pie de página).",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Mejorar la claridad, estructura visual HTML y tono profesional del cuerpo de un correo transaccional de Mocter.
[D] DELIMITACIÓN:
- Conserva EXACTAMENTE todas las variables entre llaves dobles (ej. {{product_name}}, {{tenant_name}}, {{billing_url}}) presentes en el borrador o contexto sin renombrarlas ni inventar variables nuevas.
- Entrega únicamente el fragmento HTML interno (<p>, <strong>, <ul>, <li>, <a href="...">, <h3>) sin incluir etiquetas <html>, <head>, <body>, encabezado institucional ni pie de página (se heredan automáticamente).
- No uses scripts ni atributos peligrosos.
[E] EJEMPLO: "<p>Hola <strong>{{business_name}}</strong>,</p><p>El producto <strong>{{product_name}}</strong> alcanzó el stock mínimo configurado (<strong>{{current_stock}}</strong> unidades).</p><p><a href=\"{{product_admin_url}}\">Revisar Inventario</a></p>"
[A] ACCIÓN: Optimiza la redacción y jerarquía visual manteniendo el idioma objetivo indicado.
[L] LÍMITE: Máximo 2500 caracteres.`,
    outputRules: { maxLength: 2500, minLength: 20, format: "html", tone: "profesional, claro y accionable" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.layout_header",
    version: 1,
    status: "active",
    inputHint: "Personaliza el encabezado HTML institucional heredado por todas las notificaciones del sistema.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Diseñar o refinar un encabezado HTML institucional limpio, moderno y compatible con clientes de correo.
[D] DELIMITACIÓN: Conserva {{brand_name}} si aparece, usa estilos inline compatibles con correo (sin <script> ni clases CSS externas) y mantén altura compacta.
[E] EJEMPLO: "<div style=\"background:#0f172a;color:#ffffff;padding:20px 24px;border-bottom:3px solid #6366f1;\"><h2 style=\"margin:0;font-size:18px;\">{{brand_name}}</h2></div>"
[A] ACCIÓN: Mejora el fragmento HTML del encabezado institucional.
[L] LÍMITE: Máximo 1200 caracteres.`,
    outputRules: { maxLength: 1200, minLength: 15, format: "html", tone: "institucional y sobrio" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
  {
    fieldKey: "email.layout_footer",
    version: 1,
    status: "active",
    inputHint: "Personaliza el pie de página HTML institucional heredado por todas las notificaciones del sistema.",
    masterPrompt: `${IDEAL_METHODOLOGY_PREAMBLE}

[I] INTENCIÓN: Refinar el pie de página HTML institucional para correos transaccionales con tono confiable y legible.
[D] DELIMITACIÓN: Conserva {{brand_name}} y {{year}} si están presentes, usa estilos inline compatibles con email y evita scripts o etiquetas prohibidas.
[E] EJEMPLO: "<div style=\"background:#f8fafc;color:#64748b;padding:16px 24px;font-size:12px;\"><p style=\"margin:0;\">© {{year}} {{brand_name}} · Todos los derechos reservados.</p></div>"
[A] ACCIÓN: Mejora el fragmento HTML del pie de página institucional.
[L] LÍMITE: Máximo 1200 caracteres.`,
    outputRules: { maxLength: 1200, minLength: 15, format: "html", tone: "claro y formal" },
    examples: [],
    createdBy: "system.seed",
    updatedBy: "system.seed",
  },
];

/**
 * Siembra de forma idempotente el catálogo maestro de campos asistidos (`ai_assist_fields`)
 * y sus versiones de prompts (`ai_assist_prompts`) bajo la metodología IDEAL (SPEC-19).
 *
 * Si una versión nueva sembrada por `system.seed` supera a una versión activa previa que también
 * fue creada por `system.seed`, promueve la nueva versión a `active` y retira la anterior,
 * respetando siempre cualquier versión personalizada por un operador humano en `/admin/ai`.
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
    const targetVersion = prompt.version ?? 1;
    const existingExactVersion = await db
      .select({ id: aiAssistPrompts.id })
      .from(aiAssistPrompts)
      .where(
        and(
          eq(aiAssistPrompts.fieldKey, prompt.fieldKey),
          eq(aiAssistPrompts.version, targetVersion),
        ),
      )
      .limit(1);

    if (!existingExactVersion[0]) {
      const currentActives = await db
        .select({
          id: aiAssistPrompts.id,
          version: aiAssistPrompts.version,
          createdBy: aiAssistPrompts.createdBy,
        })
        .from(aiAssistPrompts)
        .where(
          and(
            eq(aiAssistPrompts.fieldKey, prompt.fieldKey),
            eq(aiAssistPrompts.status, "active"),
          ),
        );

      const activeRow = currentActives[0];
      const canPromoteOverSystemSeed =
        !activeRow ||
        (activeRow.createdBy === "system.seed" && activeRow.version < targetVersion);

      if (activeRow && canPromoteOverSystemSeed) {
        await db
          .update(aiAssistPrompts)
          .set({ status: "retired", updatedAt: new Date() })
          .where(eq(aiAssistPrompts.id, activeRow.id));
      }

      await db.insert(aiAssistPrompts).values({
        ...prompt,
        version: targetVersion,
        status: canPromoteOverSystemSeed ? "active" : "retired",
      });
      promptsInserted += 1;
    }
  }

  return { fieldsUpserted, promptsInserted };
}
