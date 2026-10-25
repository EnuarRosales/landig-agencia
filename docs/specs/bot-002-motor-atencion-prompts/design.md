# BOT-002 · Diseño · Motor de atención y composición dinámica de prompts

| Atributo | Valor |
|---|---|
| ID | BOT-002 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [BOT-001](../bot-001-atencion-automatizada-llm/design.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Componer, no regenerar.** El prompt se arma por turno; los productos viven en la base y se leen al vuelo.
2. **Solo lo necesario en contexto.** Producto activo + políticas del negocio + reglas de plataforma; nada de catálogo completo.
3. **La conversación no infla el prompt.** Ciudad, nombre, producto, cantidad y etapa son estado, no texto.
4. **Bloques versionados.** Plataforma y contenido del inquilino se versionan y se auditan.
5. **Salida clasificada y validada.** Cuatro slugs reservados; lo demás se descarta.

## 2. Arquitectura

```text
Chatwoot (webhook) ──► Motor BOT-002
                         │
                         ├─ Estado de conversación (prospecto, ciudad, nombre,
                         │  producto activo, cantidad, etapa, último turno)
                         ├─ Compositor
                         │   ├─ bloques de plataforma (bot_prompt_blocks, versionados)
                         │   ├─ contexto del negocio (client_business_info,
                         │   │  shipping_carriers, delivery_rules, FAQs)
                         │   └─ bloque del producto activo (products,
                         │      price_tiers, benefits, media_term, faqs)
                         ├─ Inferencia (BOT-001: BYOK; Mocter cuando madure)
                         ├─ Salida en burbujas ([[SPLIT]]) + media markers
                         ├─ Clasificador de leads (4 etiquetas reservadas)
                         └─ Captura de pedido (registrar_pedido)
```

## 3. Bloques de plataforma (`bot_prompt_blocks`, Router)

| Atributo | Regla |
|---|---|
| `block_key` | `core.identity`, `core.personality`, `core.greeting`, `core.media`, `core.splits`, `core.order_flow`, `core.closing`, `core.classifier`, `core.format` |
| `version` | Único `(block_key, version)`; solo una `active` por bloque |
| `content` JSONB `{es,en}` | Texto del bloque en ambos idiomas |
| `status` | `draft` / `active` / `retired` |
| Auditoría | Columnas de la directiva (RF-10.9) |

La **receta** de composición (orden y variables) es canónica y versionada con el motor (D-06): identidad → personalidad/reglas → saludo (solo primer turno) → multimedia/burbujas → contexto del negocio → producto activo → flujo de pedido → formato. El inquilino solo habilita bloques opcionales; no reordena la receta. El clasificador es un bloque separado que corre sobre los últimos 10 turnos.

### 3.1 Separadores y tiempos de burbuja (D-09)

La mecánica es de plataforma; el inquilino solo elige un preset de ritmo.

| Canal | Comportamiento | Pausa |
|---|---|---|
| WhatsApp | Burbujas separadas por `[[SPLIT]]`, orden multimedia → beneficios → ubicación | Adaptativa, 800–5.000 ms; máx. 4 burbujas por turno |
| Widget web | Streaming o mensaje único | Sin splits |
| Email | Un solo bloque | Sin splits |
| Otros | Perfil por defecto con burbujas | Adaptativa, mismos topes |

- **Fórmula:** `pausa = clamp(800, 5000, 35 ms × caracteres)`, multiplicada por el preset: `natural` ×1.0 (default), `rápido` ×0.7, `pausado` ×1.3, siempre dentro del rango.
- **Fijos de plataforma:** el orden multimedia → beneficios → ubicación, la regla anti-caption y el máximo de burbujas. No se configuran.
- **Resiliencia:** si una burbuja falla, el resto del turno continúa y se audita el envío.
- **Optimización central:** se miden abandono tras la primera burbuja, respuesta al primer mensaje y conversión a pedido; los ajustes se validan con A/B para todos los inquilinos.

## 4. Datos del inquilino y del producto

| Fuente | Uso en el prompt |
|---|---|
| `clients` (`display_name`, `locale`, `social_links`) | Identidad y cierre |
| `tenant_bots` (objetivo, tono, persona, saludo, fallback) | Personalidad y saludo |
| `client_business_info` | Métodos de pago, devoluciones, garantía, FAQs generales, cierre |
| `shipping_carriers` | Transportadoras admitidas; nunca mencionar otras |
| `delivery_groups` + `delivery_rules` | Tiempos por ciudad; nulo = resto del país |
| `products` + `product_price_tiers` | Nombre, beneficios, escalones de precio y recomendado |
| `products.media_term` + `media_count` | Marcador `[[MEDIA:term]]` y cantidad |
| `products.keywords` | Detección del producto activo |
| `product_faqs` | Casos especiales (garantía, colores, duración, resistencia) |

## 5. Estado de conversación

`conversation_state`: `client_id`, `chatwoot_conversation_id`, `prospect_id`, `product_id` activo, `quantity`, `city`, `customer_name`, `shipping_method`, `stage`, `last_label`, `last_turn_at`, versión usada. No se envía completo al modelo: el compositor inyecta solo las variables que el bloque necesita.

## 6. Clasificador de leads

- Entrada: últimos 10 turnos.
- Bloque `core.classifier` con los criterios de frío/tibio/caliente/compra-realizada.
- Salida esperada: exactamente `lead-frio`, `lead-tibio`, `lead-caliente` o `compra-realizada`.
- Validación: si la respuesta no coincide con ninguno, se descarta y se mantiene la etiqueta anterior (RF-04.2).
- Aplicación: `tenant_labels` (ADM-001) en Chatwoot y en el prospecto (CRM-001).
- Costo: llamada de inferencia separada del turno del cliente (RF-04.4).

## 7. Captura de pedido

1. El flujo pregunta método de envío (domicilio u oficina de transportadora).
2. Pide todos los datos en un solo mensaje con la plantilla del método.
3. Al completar, invoca `registrar_pedido` (idempotente por conversación) con producto, cantidad, total, datos y método.
4. Aplica `compra-realizada` y envía el cierre configurado (incluye redes sociales del inquilino).
5. La entidad de pedidos vive en `ORD-001` (D-08); hasta su definición, el contrato de la herramienta es el límite estable.

## 8. Caché e invalidación

Clave: `(client_id, bot_id, config_version, product_id, product_revision, policies_version, locale)`. Se invalida al cambiar el bot, el producto, las políticas o los bloques activos. TTL corto de respaldo (5 min). La versión usada se registra por turno (RF-06.2).

## 9. Vista previa

`GET /admin/bots/:id/preview?product_id=…` devuelve el prompt compuesto, sus bloques y el conteo de tokens. El inquilino y soporte pueden verlo sin regenerar nada persistente.

## 10. Verificación

| Control | Prueba |
|---|---|
| Sin regeneración | Agregar un producto y abrir una conversación nueva: el prompt lo incluye sin job de regeneración |
| Foco de producto | Una conversación sobre un producto no recibe beneficios/precios de otro |
| Estado | Cambiar de producto conserva ciudad y nombre; el prompt no crece con el historial |
| Clasificador | Devuelve solo los 4 slugs; una salida inválida no cambia la etiqueta |
| Pedido | `registrar_pedido` es idempotente; el cierre y la etiqueta se aplican una sola vez |
| Caché | Cambiar un producto invalida su entrada y el siguiente turno usa la versión nueva |
| Burbujas | WhatsApp respeta el orden y las pausas dentro de 800–5.000 ms; el widget no usa splits; el preset cambia el ritmo sin salir del rango; un fallo de una burbuja no bloquea el resto |

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Prompt compuesto demasiado grande | Solo producto activo + contexto; límite de tokens (O-04) |
| Clasificador ruidoso | Validación estricta + últimos 10 turnos + etiqueta anterior como fallback |
| Deriva entre bloques | Versiones auditadas y preview |
| Pedido duplicado | Idempotencia por conversación |
| Ritmo mal calibrado | Topes 800–5.000 ms, presets acotados, métricas y A/B central |
| Datos sensibles en logs | Redacción; estado fuera de logs |

## 12. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | Contexto del negocio, productos, precios por escalón, FAQs y etiquetas |
| BOT-001 | Catálogo de proveedores, BYOK, `ai_usage_events` |
| CRM-001 | Prospecto, consentimiento y etiquetas |
| CHW-001 | Envío de mensajes y etiquetas por API |
| AI-001 | Gobernanza de prompts versionados como referencia |
