# AI-001 · Requisitos · Asistente AI de configuración

| Atributo | Valor |
|---|---|
| ID | AI-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md) · [ADM-001](../adm-001-mocter-admin/requirements.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` (§4.7) · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Todo atributo de texto que el inquilino deba llenar y que admita asistencia tiene la capacidad **«Mejorar con AI»**: el inquilino escribe un contexto en borrador, y el sistema lo une con un **prompt maestro** diseñado exactamente para ese campo y devuelve una versión mejorada. La inferencia usa el proveedor BYOK del inquilino (día uno) o la inferencia Mocter cuando la propuesta de agregador madure (D-07 de BOT-001). Objetivo: configuración de alta calidad en el menor tiempo posible, sin exigir expertise.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «todos los atributos que deba llenar el inquilino y que puedan ser asistido por AI deben tener dicha capacidad para ayudar a nuevos usuarios a configurar su entorno en el menor tiempo posible pero con la mayor calidad tambien»
- «a nivel de la SaaS debe existir una zona en la que se generen prompt especializados que ayuden a los inquilinos a configurar esas partes del sistema»
- «cuando esta configurando el objetivo del bot, el inquilino con inferencia propia de mocter o con su propio proveedor de inferencia si ya configuro el proveedor de inferencia escribe algo de contexto y luego da clic en mejorar con AI el sistema toma ese texto y lo une con el prompt maestro del sistema diseñado exactamente para ese campo y lo mejora»

## 3. Requisitos funcionales

### RF-01 · Cobertura (regla transversal)

| ID | Requisito |
|---|---|
| RF-01.1 | Todo **campo de texto libre (`textarea`)** que el inquilino redacte debe tener «Mejorar con AI» y estar registrado como campo asistido (`ai_assist_fields`) con su prompt maestro. Los campos de una línea (nombre, precio, slug) quedan fuera salvo que el prompt maestro del campo lo justifique. Un textarea sin prompt maestro es un defecto, no una mejora futura. |
| RF-01.2 | La cobertura inicial prioriza la configuración del bot (objetivo, tono, persona, instrucciones, saludo, fallback, temas permitidos/excluidos), los productos (nombre, descripción, prompt de venta, `price_note`, `alt_text`), las notas de prospectos, las etiquetas del inquilino (`label.title`, `label.description`) y los pasos de recordatorios (`followup_step.message`). |
| RF-01.3 | La plataforma puede agregar campos asistidos sin tocar las pantallas: el botón aparece cuando el campo tiene prompt maestro activo. La cobertura se extiende a **todo `textarea` nuevo** que se agregue al sistema. |
| RF-01.4 | La asistencia AI está disponible en **todos los planes**, sin importar el nivel contratado: no es una capacidad de plan. |

### RF-02 · Biblioteca de prompts maestros (zona de la SaaS)

| ID | Requisito |
|---|---|
| RF-02.1 | Existe una zona de administración de la plataforma con el registro de campos asistidos y sus prompts maestros, con etiquetas en es/en y estado. |
| RF-02.2 | Cada prompt maestro se versiona (`ai_assist_prompts`) y su cambio es auditado; el activo es siempre una versión explícita. |
| RF-02.3 | Cada prompt maestro define qué debe escribir el inquilino (`input_hint`), reglas de salida (`output_rules`: idioma, longitud, formato) y ejemplos de evaluación. |
| RF-02.4 | La plataforma mantiene ejemplos de calidad por campo para evaluar regresiones cuando cambia un prompt o un modelo. |

### RF-03 · Flujo «Mejorar con AI»

| ID | Requisito |
|---|---|
| RF-03.1 | El inquilino escribe su borrador y presiona «Mejorar con AI»; el sistema une el borrador con el prompt maestro del campo y devuelve la sugerencia. |
| RF-03.2 | La sugerencia es **una propuesta, no un guardado**: el inquilino la compara con su borrador, la edita y la acepta o descarta. Nunca se guarda sin aceptación explícita. |
| RF-03.3 | El idioma de la sugerencia respeta `clients.locale` (directiva de i18n). |
| RF-03.4 | El campo conserva sus validaciones (longitud, formato) también para la sugerencia; una sugerencia que no las cumple no se puede aceptar. |

### RF-04 · Inferencia

| ID | Requisito |
|---|---|
| RF-04.1 | El día uno, el asistente usa el proveedor BYOK del inquilino (BOT-001); sin proveedor configurado, el botón se deshabilita con un aviso que explica cómo habilitarlo. |
| RF-04.2 | Cuando la propuesta de agregador madure (BOT-001 D-07), el asistente también usa la inferencia Mocter con el saldo de la billetera; ambos modos conviven. |
| RF-04.3 | El consumo se registra en `ai_usage_events` (BOT-001) con propósito `assist` para métricas y, en modo Mocter, costo. |
| RF-04.4 | Se aplica rate limiting por inquilino para el asistente. |

### RF-05 · Calidad, seguridad y auditoría

| ID | Requisito |
|---|---|
| RF-05.1 | Al prompt maestro solo se le envía el texto del campo; nunca datos personales de prospectos ni de otros inquilinos. |
| RF-05.2 | Un texto aceptado desde una sugerencia queda auditado con origen `ai_suggested` (actor, campo, versión de prompt y modelo usados). |
| RF-05.3 | La plataforma mide la tasa de aceptación por campo para mejorar los prompts maestros. |
| RF-05.4 | Todas las tablas cumplen la auditoría global (DAT-001 RF-10.9). |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | AI-001 es una spec nueva transversal; el motor de prompts y la zona de administración son de plataforma, no del inquilino. | El inquilino nunca ve ni edita los prompts maestros; solo usa el botón. |
| D-02 | Human-in-the-loop obligatorio: la AI propone, el inquilino acepta. | Se evita que un mal prompt maestreo dañe configuraciones en silencio. |
| D-03 | Día uno = BYOK; sin proveedor, el botón se deshabilita. | El asistente no depende de que la propuesta de inferencia Mocter madure. |
| D-04 | La biblioteca es versionada y con ejemplos de evaluación por campo. | Un cambio de prompt o modelo se puede medir antes y después. |
| D-05 | La asistencia AI es **transversal a todos los planes**; no se gatea por plan. | Todos los inquilinos acceden a «Mejorar con AI»; el costo se controla con rate limit, no con el plan. |

## 5. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿El asistente usa el mismo modelo del bot o un modelo propio por defecto (p. ej. el más barato del preset)? | Define costo y calidad; propuesta: modelo propio por defecto, configurable por plataforma. |
| O-02 | ¿El asistente tiene límite de uso mensual por inquilino o es libre? | Define guardrails de costo; propuesta: libre en BYOK, sujeto a la billetera en modo Mocter. |

O-03 quedó resuelta por **D-05**: la asistencia AI es transversal a todos los planes.

## 6. Fuera de alcance

El motor de inferencia y su orquestación (BOT-002). La generación automática sin revisión humana. La redacción de los avisos legales (O-02 de CRM-001). El entrenamiento de modelos.

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| BOT-001 | Consume `tenant_ai_providers`, `tenant_model_settings` y presets para la inferencia del asistente; registra consumo en `ai_usage_events` con propósito `assist`. |
| ADM-001 | Los campos de productos y perfil del inquilino se registran como asistidos. |
| CRM-001 | Las notas de prospectos se registran como campo asistido, sin enviar datos personales al prompt. |
| DAT-001 | Auditoría RF-10.9 y tablas en el Router Global (configuración de plataforma). |
| i18n | UI es/en; sugerencias en el idioma del inquilino. |

## 8. Trazabilidad

- L1 (2026-10-23): «Regla que no hemos tratado, todos los atributos que deba llenar el inquilino y que puedan ser asistido por AI deben tener dicha capacidad para ayudar a nuevos usuarios a configurar su entorno en el menor tiempo posible pero con la mayor calidad tambien. Por ello a nivel de la SaaS debe existir una zona en la que se generen prompt especializados que ayuden a ayudar a los inquilinos a configurar esas partes del sistema por ejemplo cuando esta configurando el objetivo del bot, el inquilino con inferencia propia de mocter o con su propio proveedor de inferencia si ya configuro el proveedor de inferencia escribe algo de contexto y luego da clic en mejorar con AI el sistema toma ese texto y lo une con el prompt maestro del sistema diseñado exactamente para ese campo y lo mejora.»
- L2 (2026-10-23): **AI-001 aprobada.** Quedan abiertas O-01 (modelo por defecto del asistente), O-02 (límite de uso) y O-03 (transversal o por plan) para resolver en la fase 0 de implementación.
- L3 (2026-10-24): **O-03 resuelta:** la asistencia AI es transversal a todos los planes (D-05); no se gatea por plan.
