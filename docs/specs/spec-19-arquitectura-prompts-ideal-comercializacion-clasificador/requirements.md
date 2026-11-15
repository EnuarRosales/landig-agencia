# SPEC-19 · Arquitectura de Prompts bajo Metodología IDEAL: Gobernanza SaaS, Prompt General del Cliente, Adopción Rápida por Producto y Clasificador Dinámico Funcional/Operativo

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-19` |
| **Nombre** | Arquitectura de Prompts bajo Metodología IDEAL: Gobernanza SaaS, Prompt General del Cliente, Adopción Rápida por Producto y Clasificador Dinámico Funcional/Operativo |
| **Tipo de intervención** | Evolución arquitectónica de IA conversacional, Biblioteca de Prompts Maestros SaaS y UX de adopción sin fricción para el inquilino |
| **Prioridad** | P0 — Crítica (núcleo de conversión comercial por WhatsApp, escalabilidad multi-producto y clasificación inteligente en Chatwoot) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada · En implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Specs previas relacionadas** | [AI-001](../ai-001-asistente-ai-configuracion/requirements.md), [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md), [BOT-002](../bot-002-motor-atencion-prompts/requirements.md), [CHW-001](../chw-001-inventario-chatwoot/requirements.md), [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md), [NTF-001](../ntf-001-notificaciones-transaccionales/requirements.md) |
| **Specs integradas / dependientes** | [SPEC-02](../spec-02-proveedores-ai-byok-prompts/requirements.md) (Biblioteca de Prompts Maestros y «Mejorar con AI»), [SPEC-08](../spec-08-catalogo-productos-crud-multimedia-combos-stock/requirements.md) (`bot_master_prompt` y multimedia por producto), [SPEC-10](../spec-10-asistente-ai-bot-presets-politicas-mensajes/requirements.md) (Asistente AI, políticas y etiquetas Chatwoot), [SPEC-18](../spec-18-motor-promociones-descuentos-campanas/requirements.md) (Motor de promociones) |
| **Directivas aplicables** | `.agents/AGENTS.md` (§4.4 TSDoc, §4.6 i18n, §4.7 Asistencia AI, §4.8 Title Case, §4.9 Time-to-value, §4.18 Verificación en caliente, §4.19 Layout y botones) |

---

## 3. Problema y Motivación

En la operación real de comercios conversacionales (como el caso de referencia `tiendavirtual4030 V3.1`), los prompts que logran alta conversión en WhatsApp incluyen reglas ricas de identidad, personalidad, secuencias multiburbuja (`[[SPLIT:3000]]`), envío de multimedia y audios específicos por número de orden (`[[MEDIA:termino:audio:5]]`), reglas anti-caption, manejo de primer contacto sin revelar precio prematuramente, precios escalonados recomendados, tiempos de entrega por zona y plantillas de captura de datos en un solo mensaje (Domicilio vs. Oficina de Transportadora).

Sin embargo, el enfoque previo presentaba cuatro problemas críticos:

1. **Acoplamiento monolítico vs. plantilla genérica pasiva**:
   - Un prompt monolítico mezcla la identidad del comercio, la sintaxis técnica del motor y las reglas de un único producto («Resina Dental»), obligando a reescribir todo cuando el negocio agrega más productos.
   - Por otro lado, la plantilla recomendada en `/workspace/products` (`buildRecommendedProductPromptTemplate`) era un esqueleto estático de 4 títulos vacíos que no aprovechaba los datos ya diligenciados por el inquilino en el formulario (descripción, precio, categoría, atributos, componentes de combo, imágenes, videos y audios), volviendo la configuración por producto una tarea manual e impositiva. Además, el botón «Insertar Estructura Recomendada» concatenaba el texto repetidamente al pulsarse más de una vez.
2. **Falta de separación clara entre las 3 capas del prompt**:
   - La **SaaS** debe proveer y gobernar la estructura técnica inmutable (`[[SPLIT]]`, `[[MEDIA:termino:tipo:orden]]`, reglas anti-caption, captura de pedido en un solo mensaje).
   - El **Inquilino** debe contar con un **Prompt General del Cliente** (`bot.client_general_prompt`) para las reglas generales de operación de su negocio y con un **Prompt por Producto** (`product.bot_master_prompt`) exclusivo para las condiciones explícitas de comercialización de cada artículo.
3. **Ausencia de una metodología unificada de co-creación en la Biblioteca de Prompts Maestros (`/admin/ai`)**:
   - Los prompts maestros de «Mejorar con AI» actuaban como correctores de estilo pasivos en lugar de asumir un rol de **co-creador proactivo, creativo y analítico** bajo la metodología secuencial **`IDEAL`** (**I**ntención, **D**etalle, **E**jemplo, **A**cción, **L**ímite).
4. **Clasificador de conversaciones rígido y acoplado**:
   - El clasificador previo solo evaluaba un conjunto fijo de palabras (`frio`, `caliente`, `pedido`, `devolucion` o los 4 slugs `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`), ignorando las etiquetas personalizadas creadas por cada inquilino y sin distinguir entre **Etiquetas Funcionales** (que determinan la etapa del embudo y el color orientativo de la conversación en Chatwoot) y **Etiquetas Operativas** (que disparan acciones como transferir a un agente humano, pausar el bot o enviar una notificación por correo electrónico).

---

## 4. Decisiones de Diseño (`/grill-me`)

### D-01 · Adopción transversal de la Metodología `IDEAL` en todos los Prompts Maestros y Utilitarios
Todos los Prompts Maestros de la Biblioteca SaaS (`/admin/ai` · `admin.ai_assist_prompts`) y los generadores de estructura recomendada del inquilino implementan de forma explícita la metodología secuencial **`IDEAL`**, donde el LLM asume un rol **no pasivo** (altamente propositivo, creativo y analítico, aplicando *Few-Shot*, delimitadores, *Chain of Thought*, asignación de rol y restricciones negativas):
- **`[I] Intención`**: Objetivo principal y qué se quiere lograr a alto nivel.
- **`[D] Detalle`**: Contexto operativo, antecedentes, audiencia y variables clave del negocio o producto.
- **`[E] Ejemplo`**: Formato de salida, tono, estilo, plantillas o referencias visuales/estructurales listas para usar.
- **`[A] Acción`**: Instrucción concreta, verbos de acción y pasos lógicos de ejecución por escenario.
- **`[L] Límite`**: Restricciones negativas, sesgos a evitar, límites de longitud y qué NO debe hacer el modelo.

### D-02 · Arquitectura de Prompts en 3 Planos: Estructura Técnica SaaS + Prompt General del Cliente + Prompt por Producto
1. **Plano 1 — Estructura Técnica de Plataforma (Gobernada por la SaaS en `/admin/ai` · `admin.bot_prompt_blocks`)**:
   - Provee de forma transparente para el inquilino la sintaxis de multiburbuja (`[[SPLIT]]`, `[[SPLIT:2000]]`, `[[SPLIT:2500]]`, `[[SPLIT:3000]]`), el protocolo exclusivo de marcadores multimedia (`[[MEDIA:termino]]`, `[[MEDIA:termino:imagen]]`, `[[MEDIA:termino:video]]`, `[[MEDIA:termino:audio]]`, `[[MEDIA:termino:audio:orden]]`), las **Reglas Anti-Caption** (prohibido texto antes/después del marcador en la misma burbuja, rastreo independiente de cada audio por número de orden) y el flujo de recopilación de datos del pedido en 2 pasos (Paso 1: elegir `🏠 Domicilio` o `🏢 Oficina de Transportadora`; Paso 2: plantilla de datos en un único mensaje).
2. **Plano 2 — Prompt General de Operación del Cliente (`bot.client_general_prompt` en `/workspace/bot`)**:
   - Instruye al bot sobre la identidad del negocio, nombre del asistente, personalidad/tono, tiempos de entrega por zona (ciudad principal vs. resto del país), modalidades de pago (contraentrega, anticipado), políticas de cambios/garantías, enlaces de redes sociales post-compra, atención de casos especiales y regla de catálogo (producto único estrella vs. catálogo multi-producto).
   - Se puede auto-hidratar con un clic mediante la estructura recomendada **IDEAL** leyendo las políticas y configuración del comercio, y enriquecer con «Mejorar con AI» (`fieldKey: "bot.client_general_prompt"`).
3. **Plano 3 — Prompt Maestro por Producto de Rápida Adopción (`product.bot_master_prompt` en `/workspace/products`)**:
   - Regla exclusivamente las condiciones explícitas de comercialización del artículo en foco.
   - El botón **«Insertar Estructura Recomendada»** auto-hidrata los 5 bloques **IDEAL** leyendo en vivo los datos ya cargados en el modal del producto (`name`, `description`, `category`, `brand`, `kind`, `compositionType`, `priceAmount`, `currency`, `attributes`, `comboItems` y conteo/detalle de archivos multimedia e ítems de audio por orden).
   - Es **100 % idempotente**: volver a pulsar «Insertar Estructura Recomendada» actualiza la plantilla con los últimos datos del formulario sin duplicar bloques.

### D-03 · Clasificador Dinámico por Inquilino (`bot.conversation_classifier`): Etiquetas Funcionales vs. Operativas con Efectos en Chatwoot, Bot y Correo
El sistema compila dinámicamente el **Prompt Clasificador** de cada inquilino evaluando sus etiquetas activas (`cell_tenant_labels` sincronizadas con Chatwoot) divididas en dos dimensiones:
1. **Etiquetas Funcionales (`category: "functional"` · Embudo Comercial y Color Orientativo en Chatwoot)**:
   - **Mutuamente excluyentes** (`1` etiqueta funcional activa por conversación).
   - Definen la temperatura/etapa del prospecto y hacen que la conversación en Chatwoot tome un **color orientativo determinado** (`color` hex sincronizado en Chatwoot):
     - `lead-frio` (`#3B82F6` Azul): saludo inicial, consulta general o sin intención clara.
     - `lead-tibio` (`#F59E0B` Ámbar): indaga características, envíos o variantes sin pedir precio de cierre ni confirmar compra.
     - `lead-caliente` (`#F97316` Naranja): preguntó precio, pidió fotos/videos/audio o eligió opción recomendada, pero **aún no ha entregado todos los datos obligatorios de envío** (nombre completo, celular y ciudad/dirección).
     - `compra-realizada` (`#10B981` Esmeralda): suministró los datos completos de envío y confirmó el pedido (requiere evidencia de datos completos o registro de pedido).
     - `devolucion` (`#EF4444` Rojo): solicita devolución, garantía, reporta problema con el producto o no recibió el pedido.
     - Más cualquier etiqueta `functional` creada por el inquilino con su propio color orientativo y criterio de activación.
2. **Etiquetas Operativas (`category: "operational"` · Estado y Automatización de Flujo)**:
   - **Acumulables (`0..N` activas simultáneamente)** sin reemplazar la etiqueta funcional.
   - Pueden disparar **acciones operativas automatizadas (`sideEffects`)**:
     - `handoff_human`: dirigir/asignar la conversación a un agente humano en Chatwoot.
     - `pause_bot`: desactivar/pausar el bot automático en esa conversación.
     - `send_email_notification`: enviar notificación por correo electrónico (`NTF-001`) al comercio.
     - `register_order`: activar el registro/vinculación de orden (`ORD-001`).
   - Incluye las etiquetas operativas base (`nuevo_pedido`, `pendiente_pago`, `pagado`, `despachado`, `soporte_humano`, `cliente_recurrente`) más todas las etiquetas operativas personalizadas del inquilino.

---

## 5. Requisitos Funcionales

| ID | Requisito |
| --- | --- |
| **RF-SPEC-19-01** | Todos los prompts maestros sembrados en `admin.ai_assist_prompts` (`packages/domain/src/services/ai-assist-catalog.seed.ts`) deben estar estructurados bajo los 5 bloques de la metodología **`IDEAL`** (`[I] Intención`, `[D] Detalle`, `[E] Ejemplo`, `[A] Acción`, `[L] Límite`), instruyendo al LLM a actuar como co-creador proactivo y analítico. |
| **RF-SPEC-19-02** | El catálogo `INITIAL_AI_ASSIST_FIELDS` e `INITIAL_AI_ASSIST_PROMPTS` debe incorporar los campos `bot.client_general_prompt` («Prompt General de Operación del Cliente») y `bot.conversation_classifier` («Prompt Clasificador de Conversaciones»), además de actualizar `product.bot_master_prompt` y `label.description` a `version: 2` para que `seedAiAssistCatalog()` actualice entornos existentes sin perder trazabilidad. |
| **RF-SPEC-19-03** | Los bloques técnicos de plataforma (`INITIAL_PROMPT_BLOCKS` en `packages/domain/src/services/prompt-blocks.seed.ts`) deben incorporar las reglas completas de multiburbuja (`[[SPLIT]]`, `[[SPLIT:2000]]`, `[[SPLIT:3000]]`), marcadores multimedia por tipo y orden (`[[MEDIA:termino:imagen]]`, `[[MEDIA:termino:video]]`, `[[MEDIA:termino:audio:orden]]`), reglas anti-caption y el protocolo de recopilación de datos en un solo mensaje para `🏠 Domicilio` vs. `🏢 Oficina de Transportadora`. |
| **RF-SPEC-19-04** | En `/workspace/products` (`product-ui-helpers.ts` y `product-form-modal.tsx`), `buildRecommendedProductPromptTemplate` debe recibir el contexto vivo del producto en edición/creación y generar un Prompt Maestro de Comercialización bajo **`IDEAL`** pre-llenado con nombre, término multimedia, palabras clave, beneficios formateados para WhatsApp, precios/combos, reglas de disparo de imágenes/videos/audios por orden, preguntas de calificación (desde atributos) y manejo de objeciones. |
| **RF-SPEC-19-05** | El botón «Insertar Estructura Recomendada» en `product-form-modal.tsx` debe ser idempotente: si el campo ya contiene una estructura recomendada generada previamente, debe reemplazarla/actualizarla con los datos vigentes del formulario sin duplicar encabezados ni secciones. |
| **RF-SPEC-19-06** | En `/workspace/bot` (`bot-view.tsx`), el inquilino debe disponer de la sección **«Prompt General de Operación del Cliente (Metodología IDEAL)»** con botón de auto-hidratación idempotente («Insertar Estructura IDEAL del Negocio») y asistencia «Mejorar con AI» (`fieldKey: "bot.client_general_prompt"`), además de un panel interactivo de vista previa/configuración del **Prompt Clasificador Dinámico** (`fieldKey: "bot.conversation_classifier"`) que muestra sus Etiquetas Funcionales (con color orientativo en Chatwoot) y Etiquetas Operativas (con disparadores de agente humano, pausa de bot y notificación por correo). |
| **RF-SPEC-19-07** | El motor clasificador (`lead-classifier.ts` y `lead-classifier-orchestrator.ts`) debe soportar tanto el modo legado de 4 slugs como el modo dinámico multidimensional (`functionalLabel` + `operationalLabels`), compilando el prompt clasificador IDEAL por inquilino (`buildTenantClassifierPrompt`), resolviendo colores orientativos en Chatwoot y ejecutando los `sideEffects` (`handoff_human`, `pause_bot`, `send_email_notification`, `register_order`). |

---

## 6. Reglas de Negocio (Invariantes)

- **`RN-SPEC-19-01` (Cero sintaxis técnica impuesta al inquilino):** El inquilino nunca está obligado a memorizar ni escribir manualmente `[[SPLIT]]` o `[[MEDIA:...]]`; el generador de estructura recomendada **IDEAL** y los bloques de plataforma de la SaaS los inyectan y gobiernan automáticamente.
- **`RN-SPEC-19-02` (Idempotencia de inserción de plantillas):** Hacer clic múltiples veces en «Insertar Estructura Recomendada» en `/workspace/products` o `/workspace/bot` nunca duplica el texto de la plantilla.
- **`RN-SPEC-19-03` (Exclusividad de Etiqueta Funcional):** En toda conversación existe a lo sumo `1` etiqueta de categoría `functional` activa simultáneamente; cuando el clasificador asigna una nueva etiqueta funcional válida, esta sustituye a la etiqueta funcional anterior y actualiza el color orientativo de la conversación en Chatwoot.
- **`RN-SPEC-19-04` (Guardrail de `compra-realizada` / `nuevo_pedido`):** Ni la etiqueta funcional `compra-realizada` ni la etiqueta operativa `nuevo_pedido` pueden activarse si no existe evidencia verificada de pedido o datos completos de envío (`hasOrderEvidence === true`). Si el LLM las sugiere sin evidencia, el motor degrada automáticamente la funcional a `lead-caliente` y descarta `nuevo_pedido`.
- **`RN-SPEC-19-05` (Ejecución determinista de `sideEffects` operativos):** Cuando el clasificador activa una etiqueta de categoría `operational` que posee `sideEffects` (`handoff_human`, `pause_bot`, `send_email_notification`), el orquestador ejecuta los puertos correspondientes e informa en el resultado qué acciones fueron disparadas.

---

## 7. Criterios de Aceptación (Gherkin)

```gherkin
Característica: Arquitectura de Prompts IDEAL, Adopción Rápida por Producto y Clasificador Dinámico Funcional/Operativo

  Escenario: Auto-hidratación idempotente del Prompt Maestro del Producto bajo metodología IDEAL
    Dado que el inquilino abre el modal de creación o edición de un producto en "/workspace/products"
    Y ha ingresado el nombre "Hidrolavadora y maquina de vapor todo en uno.", precio "156000" y descripción comercial
    Cuando hace clic en el botón "Insertar Estructura Recomendada" en la pestaña "Prompt del Bot"
    Entonces el textarea se completa con los 5 bloques IDEAL ("[I] Intención Comercial", "[D] Detalle y Beneficios", "[E] Estrategia de Precios", "[A] Acción Multimedia y Cierre", "[L] Límites y Objeciones") pre-hidratados con los datos reales del producto
    Y si vuelve a hacer clic en "Insertar Estructura Recomendada", el contenido se actualiza limpiamente sin duplicar las secciones

  Escenario: Co-creación del Prompt General del Cliente en /workspace/bot bajo metodología IDEAL
    Dado que el inquilino abre "/workspace/bot"
    Cuando pulsa "Insertar Estructura IDEAL del Negocio" en la sección "Prompt General de Operación del Cliente"
    Entonces se genera la guía operativa general del negocio bajo los 5 bloques IDEAL integrando su preset, políticas de garantía, devoluciones y confirmación de pedido
    Y puede refinarla mediante "Mejorar con AI" usando el campo "bot.client_general_prompt"

  Escenario: Clasificación dinámica de conversación con Etiquetas Funcionales (color en Chatwoot) y Operativas (handoff, pausa de bot y correo)
    Dado un inquilino con etiquetas funcionales ("lead-frio", "lead-tibio", "lead-caliente", "compra-realizada", "devolucion") y etiquetas operativas ("nuevo_pedido", "soporte_humano", "mayorista")
    Cuando el clasificador analiza una conversación donde el cliente solicita hablar urgente con una persona por una garantía
    Entonces resuelve la etiqueta funcional correspondiente con su color orientativo para Chatwoot y la etiqueta operativa "soporte_humano"
    Y el orquestador sincroniza las etiquetas en Chatwoot, pausa el bot en la conversación, transfiere a agente humano y dispara la notificación por correo electrónico
```
