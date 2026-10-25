# BOT-002 · Requisitos · Motor de atención y composición dinámica de prompts

| Atributo | Valor |
|---|---|
| ID | BOT-002 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-25 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [AI-001](../ai-001-asistente-ai-configuracion/requirements.md) · [ORD-001](../ord-001-pedidos-fulfillment/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Ejecutar la atención del bot y **componer el prompt de sistema en runtime** desde bloques versionados de plataforma + el contexto del negocio + el producto activo. Agregar o editar un producto no regenera ningún prompt: el motor lo lee de la base en cada conversación. Incluye la clasificación de leads con las etiquetas reservadas y el contrato de captura de pedido.

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «actualmente se tiene el problema de que la construccion de ese prompt por inquilino esta limitado a tener que regenerarlo cuando se agrega un producto»
- «necesito que analices este prompt… he identifica si con lo documentado tenemos lo necesario para crear uno de igual forma que se llene de forma dinamica con los datos de los inquilinos»

## 3. Requisitos funcionales

### RF-01 · Composición en runtime

| ID | Requisito |
|---|---|
| RF-01.1 | El prompt de sistema se compone en cada turno desde: bloques de plataforma (versionados) + contexto del inquilino + bloque del producto activo. **No existe un prompt monolítico por inquilino.** |
| RF-01.2 | Agregar, editar o archivar un producto no dispara regeneración ni publicación de prompt: el siguiente turno compone con los datos vigentes. |
| RF-01.3 | Solo se inyecta el bloque del producto activo (o la pregunta de desambiguación), no el catálogo completo, para acotar tokens y evitar mezclar productos. |
| RF-01.4 | El ensamblado expone una **vista previa** del prompt compuesto por inquilino/producto con conteo de tokens. |

### RF-02 · Bloques de plataforma

| ID | Requisito |
|---|---|
| RF-02.1 | Los bloques de plataforma (`bot_prompt_blocks`) están versionados y los administra Mocter: identidad, personalidad y reglas de formato, reglas de multimedia y burbujas, flujo de captura de pedido, cierre y clasificador de leads. |
| RF-02.2 | Un bloque activo es siempre una versión explícita; el cambio se audita y no altera conversaciones en curso hasta el siguiente turno. |
| RF-02.3 | Los bloques de plataforma están en es/en según la directiva de i18n; el contenido del inquilino se inyecta en su idioma. |

### RF-03 · Bloques del inquilino

| ID | Requisito |
|---|---|
| RF-03.1 | El motor lee el contexto del inquilino desde ADM-001: `clients`, `client_business_info`, `shipping_carriers`, `delivery_groups`, `delivery_rules`, `product_price_tiers` y `product_faqs`. |
| RF-03.2 | El bloque de producto se arma con `name`, `description`, `benefits`, `price_tiers`, `media_term`, `keywords`, `faqs` y `delivery_group`. |
| RF-03.3 | Los datos del cliente en la conversación (ciudad, nombre, producto activo, cantidad, etapa) **no viven en el prompt**: son estado del motor y se inyectan como variables cuando el bloque lo requiere. |

### RF-04 · Clasificación de leads

| ID | Requisito |
|---|---|
| RF-04.1 | El clasificador usa el bloque de plataforma y devuelve exactamente uno de los slugs reservados: `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`. |
| RF-04.2 | La salida se valida contra los cuatro slugs; cualquier otra respuesta se descarta y se conserva la etiqueta anterior. |
| RF-04.3 | La etiqueta se aplica al prospecto y a la conversación en Chatwoot (`tenant_labels` de ADM-001). |
| RF-04.4 | El clasificador corre sobre los últimos N turnos (10 por defecto) y no consume el presupuesto de tokens de la respuesta al cliente. |

### RF-05 · Captura de pedido y cierre

| ID | Requisito |
|---|---|
| RF-05.1 | El flujo de pedido pide primero el método de envío y luego todos los datos en un solo mensaje, con la plantilla del método elegido. |
| RF-05.2 | El contrato de la herramienta `registrar_pedido` recibe producto, cantidad, total, datos del cliente y método de envío; es idempotente por conversación. |
| RF-05.3 | Al registrar el pedido, el motor aplica la etiqueta `compra-realizada` y envía el mensaje de cierre configurado por el inquilino. |

### RF-06 · Caché, versiones y gobernanza

| ID | Requisito |
|---|---|
| RF-06.1 | La composición se cachea por `(client_id, bot_id, configuración, producto y revisión, versión de políticas, locale)` y se invalida cuando cambia cualquiera de esas versiones. |
| RF-06.2 | Toda conversación registra la versión de los bloques y del producto usada en cada turno (auditoría y depuración). |
| RF-06.3 | El motor cumple la auditoría global (DAT-001 RF-10.9) y no registra datos personales en logs. |

### RF-07 · Separadores y tiempos de burbuja

| ID | Requisito |
|---|---|
| RF-07.1 | La mecánica de burbujas y separadores es de plataforma: el inquilino **no configura milisegundos**. |
| RF-07.2 | **Perfiles por canal:** WhatsApp usa burbujas con pausas; el widget web usa streaming o mensaje único; el email va en un solo bloque. Los perfiles los gestiona la plataforma. |
| RF-07.3 | **Tiempo adaptativo:** la pausa se calcula por longitud del texto (~35 ms/carácter), acotada entre **800 ms y 5.000 ms**, con máximo de 4 burbujas por turno. |
| RF-07.4 | El inquilino elige solo un **preset de ritmo**: `natural` (default), `rápido` o `pausado`, dentro de los mismos topes. |
| RF-07.5 | El orden multimedia → beneficios → ubicación y la regla anti-caption son fijos de plataforma; no se configuran. |
| RF-07.6 | Un fallo en una burbuja no bloquea las siguientes; se audita el envío y se mide abandono, respuesta al primer mensaje y conversión para el tuning central con A/B. |

## 4. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Latencia de composición | P95 ≤ 100 ms sin llamada al LLM; cache hit P95 ≤ 20 ms. |
| RNF-02 | Consistencia | La misma entrada + las mismas versiones producen el mismo hash de prompt; 100% en pruebas. |
| RNF-03 | Concurrencia | 100 turnos concurrentes por instancia sin errores ni crecimiento de memoria no acotado; aislamiento por `client_id`. |
| RNF-04 | Presupuesto de contexto | El prompt compuesto ocupa ≤ 80% de la ventana del modelo; alerta al 50% y degradación de bloques opcionales al 80% (D-07). |
| RNF-05 | Timeout y degradación | La llamada al LLM tiene timeout de 10 s; al exceder, handoff a humano y evento auditado, sin bloquear el turno. |
| RNF-06 | Seguridad y PII | Cero PII en logs; la vista previa solo para roles autorizados; auditoría de versiones y hash. |
| RNF-07 | i18n | Bloques de plataforma es/en; contenido del inquilino en `clients.locale`; cero strings hardcodeados en la UI. |
| RNF-08 | Disponibilidad | 99.9% para la composición de prompts en Fase 4. |

## 5. Criterios de Aceptación (BDD)

### CA-BOT2-01 · Composición dinámica sin regeneración
- **Dado** un bot con producto activo A y prompt compuesto,
- **Cuando** el inquilino edita A o agrega el producto B,
- **Entonces** el siguiente turno compone con los datos vigentes sin regenerar ni publicar un prompt monolítico.

### CA-BOT2-02 · Solo producto activo
- **Dado** un catálogo con 20 productos,
- **Cuando** el bot atiende una conversación sobre el producto A,
- **Entonces** el prompt incluye solo el bloque de A (o la desambiguación), no el catálogo completo.

### CA-BOT2-03 · Clasificador con slugs reservados
- **Dado** una conversación con intención de compra,
- **Cuando** el clasificador responde,
- **Entonces** solo se acepta uno de `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`; una salida inválida se descarta y conserva la etiqueta anterior.

### CA-BOT2-04 · Pedido idempotente por conversación
- **Dado** un pedido ya registrado para una conversación activa,
- **Cuando** BOT-002 reintenta `registrar_pedido`,
- **Entonces** recibe el mismo pedido y no se crea un duplicado.

### CA-BOT2-05 · Caché y versiones
- **Dado** un prompt cacheado,
- **Cuando** cambia la versión de un bloque, la configuración o el producto,
- **Entonces** la caché se invalida, el hash cambia y la conversación registra la versión usada.

### CA-BOT2-06 · i18n y timeout
- **Dado** un inquilino con locale `es` y un bloque de plataforma en es/en,
- **Cuando** se compone el prompt,
- **Entonces** el bloque usa `es` y el contenido del inquilino respeta su idioma; si el LLM supera 10 s, se deriva a humano sin duplicar el mensaje.

## 6. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | Composición en runtime, no prompt monolítico. | Agregar productos no regenera nada; el problema actual desaparece. |
| D-02 | Solo producto activo + contexto del negocio. | Menos tokens, sin mezclar productos, mejor foco. |
| D-03 | Estado de conversación fuera del prompt. | El prompt no crece con la conversación; la memoria se inyecta como variables. |
| D-04 | Etiquetas reservadas fijas y salida validada. | El clasificador no inventa slugs y el reporting es consistente. |
| D-05 | Bloques de plataforma versionados en DB. | Cambiar reglas o el clasificador no exige desplegar código. |
| D-06 | La **receta de composición** es canónica y versionada con el motor (código/config), no editable por el inquilino; el inquilino solo habilita bloques opcionales (desambiguación, FAQs, garantía). | Determinista, testeable y optimizable; sin riesgo de recetas rotas por configuración humana. |
| D-07 | **Sin límite explícito de tokens:** el techo técnico es la ventana del modelo menos la reserva de salida; alerta suave al 50 % y degradación de bloques opcionales al 80 %. | Costo controlado sin bloquear la configuración. |
| D-08 | Los **pedidos** viven en una spec nueva (`ORD-001`); BOT-002 define solo el contrato de `registrar_pedido`. | Separación de dominios y evolución independiente del motor. |
| D-09 | **Separadores y tiempos (O-02):** la mecánica es de plataforma con **perfiles por canal** (E), **tiempo adaptativo por longitud** (D) y **presets de ritmo acotados** (C). El inquilino elige «natural / rápido / pausado», nunca milisegundos; el orden multimedia → beneficios → ubicación y la regla anti-caption son fijos. | UX consistente y humana, sin configuración rota; el tuning se hace central con A/B. |

## 7. Decisiones abiertas

No quedan decisiones abiertas.

Resueltas: O-01 → spec `ORD-001` (D-08); O-02 → **D-09** (recomendación E+D+C aprobada por el usuario); O-03 → receta canónica en código/config (D-06); O-04 → sin límite explícito, techo técnico del modelo (D-07).

## 8. Fuera de alcance

El catálogo de proveedores y BYOK (BOT-001), la UI de configuración del bot (BOT-001), la sincronización de canales (ADM-001/CHW-001) y la facturación de inferencia (propuesta BOT-001).

## 9. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Consume `client_business_info`, `shipping_carriers`, `delivery_rules`, `product_price_tiers`, `product_faqs`, `tenant_labels` y los nuevos campos del producto. |
| BOT-001 | Usa el catálogo, BYOK y `ai_usage_events` (`purpose`). |
| CRM-001 | Aplica etiquetas al prospecto y consulta consentimiento antes de pasos comerciales. |
| CHW-001 | Envía mensajes y aplica etiquetas por la API de Chatwoot. |
| AI-001 | Comparte la biblioteca de prompts de plataforma como referencia de gobernanza. |
| ORD-001 | Modela pedidos, estados y fulfillment; BOT-002 invoca `registrar_pedido`. |

## 10. Trazabilidad

- L1 (2026-10-23): «actuamente se tiene el problema de que la construccion de ese prompt por inquilino esta limitado a tener que regenerarlo cuando se agrega un producto… identifica si con lo documentado tenemos lo necesario para crear uno de igual forma que se llene de forma dinamica con los datos de los inquilinos.»
- L2 (2026-10-23): «En los datos del negocio tenemos un aparte donde el inquilino puede establecer informacion como metodos de pago, infomacion de devoluciones, tiempos de entrega, transportadoras y esos datos que puedan ser usado por el bot para dar contexto en sus atenciones… es necesarios predefinir por defecto estas opciones "lead-frio lead-tibio lead-caliente compra-realizada".»
- L3 (2026-10-23): decisiones del usuario sobre BOT-002: pedidos en una **spec nueva** (`ORD-001`); receta de bloques en código/config canónica por ser «lo más práctico, menos propenso a errores humanos y altamente estandarizable y optimizable»; **sin límite explícito de tokens** salvo el techo técnico del modelo. Los separadores/tiempos de burbuja quedan a la espera de la lluvia de ideas (O-02).
- L4 (2026-10-23): el usuario aprueba la recomendación para O-02: **perfiles por canal + tiempo adaptativo + presets de ritmo acotados** (D-09). Se fijan los topes 800–5.000 ms, 4 burbujas por turno y presets natural/rápido/pausado.
- L5 (2026-10-25): **BOT-002 aprobada (1.0).** Se agregan RNF medibles, criterios BDD, anexo i18n y el contrato `registrar_pedido` como unidad con ORD-001.

## 11. Anexo i18n · Catálogo de Cadenas

| Clave | Español | Inglés |
|---|---|---|
| `bot.prompt.preview.title` | Vista previa del prompt | Prompt preview |
| `bot.prompt.preview.tokens` | Tokens estimados | Estimated tokens |
| `bot.classifier.label.lead_frio` | Lead frío | Cold lead |
| `bot.classifier.label.lead_tibio` | Lead tibio | Warm lead |
| `bot.classifier.label.lead_caliente` | Lead caliente | Hot lead |
| `bot.classifier.label.compra_realizada` | Compra realizada | Purchase completed |
| `bot.order.capture.title` | Datos del pedido | Order details |
| `bot.order.confirm` | Confirmar pedido | Confirm order |
| `bot.bubble.preset.natural` | Natural | Natural |
| `bot.bubble.preset.fast` | Rápido | Fast |
| `bot.bubble.preset.slow` | Pausado | Slow |
| `bot.error.timeout.handoff` | Te derivo con un agente | Connecting you with an agent |
