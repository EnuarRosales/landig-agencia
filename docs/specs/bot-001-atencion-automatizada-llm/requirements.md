# BOT-001 · Requisitos · Bot de atención automatizada con LLM e inferencia como servicio

| Atributo | Valor |
|---|---|
| ID | BOT-001 |
| Versión | 0.3 (Aprobada — decisiones O-01 a O-07 cerradas) |
| Fecha | 2026-10-24 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [OPS-001](../ops-001-operacion-continuidad-observabilidad/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Configurar y gobernar el bot de atención automatizada de cada inquilino: objetivo, tono, canales habilitados y proveedor de inferencia. **El día uno sale con BYOK** (cada inquilino registra su proveedor); la spec sienta las fundaciones (catálogo con precios, billetera y spread) para que Mocter madure como **agregador de inferencia**, una línea de negocio documentada como propuesta para el equipo. La facilidad de configuración es la premisa: lo que puede ser global o por defecto, lo es.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «se requiere agregar un nuevo objeto de negocio en la cual se indique el objetivo del bot, tono con el que responderá el bot»
- «se debe permitir que los inquilinos puedan definir que proveedor de inferencia quieren usar para su bot, el requerimiento incluye ofrecer un listado de proveedores OpenAI, Anthropic, Google, DeepSeek, Openrouter, Together AI»
- «estos proveedores admisibles deben existir como un objeto que se puede parametrizar de forma tal que se cree el proveedor y sus modelos con una recomendación para su uso que los inquilinos puedan usar para decidir cual usar»
- «El inquilino debe poder configurar para su ecosistema más de un proveedor de inferencia para ello se le debe permitir registrar su respectiva API Key, definir por cada modelo la temperatura del bot y máximo de token»
- «dentro de los planes también se quiere incluir el servicio de inferencia, con la finalidad de generar ingresos para el negocio también por este servicio con un spread de cobro adicional»
- «el límite pienso que debería ser por tokens»
- «el inquilino que tenga su proveedor pero quiera adquirir inferencia desde mocter, también se le debe habilitar que este recargue saldo a su billetera y de esta se le provisione inferencia solo para ser usada en las capacidades de la plataforma»
- «la facilidad de configuración debe ser la premisa, mucha información por configurar para un inquilino le genera fricción»
- «Los "canales" son los que soporta Chatwoot… estas integraciones admisibles las debe gestionar el inquilino desde Mocter y el sistema configura Chatwoot»
- «documentémoslo de una vez como propuesta de negocio para el equipo para ser madurada en el tiempo, por defecto para el día uno salimos con la capacidad de que cada inquilino registre su proveedor de inferencia y sentamos las bases para convertir como línea de negocio convierte a Mocter en agregador de inferencia»

## 3. Requisitos funcionales

### RF-01 · Catálogo de proveedores y modelos (plataforma)

| ID | Requisito |
|---|---|
| RF-01.1 | Existe un catálogo de proveedores admisibles parametrizable: OpenAI, Anthropic, Google, DeepSeek, OpenRouter y Together AI. Cada proveedor es un objeto con código, nombre, estado y documentación. |
| RF-01.2 | Por proveedor se registran modelos con recomendación de uso, ventana de contexto, máximo de salida, capacidades (tools/vision/json), temperatura y tokens por defecto. |
| RF-01.3 | El catálogo lo administra la plataforma (`platform_admin`/`platform_owner`); el inquilino no crea proveedores ni modelos. |
| RF-01.4 | Un proveedor o modelo deshabilitado no puede usarse en configuraciones nuevas y pausa las vigentes con aviso. |
| RF-01.5 | La SaaS administra desde su backoffice el registro de múltiples proveedores, su activación/desactivación y la habilitación de modelos por proveedor. Los cambios se auditan. |

### RF-02 · Configuración del bot (inquilino)

| ID | Requisito |
|---|---|
| RF-02.1 | El bot tiene **objetivo** y **tono** obligatorios; el tono se elige de un catálogo de tonos definido por la plataforma. |
| RF-02.2 | El inquilino habilita el bot por canal (integraciones de Chatwoot que administra desde Mocter). |
| RF-02.3 | El bot se asigna a un **preset** (modelo + temperatura + max tokens recomendados) o, si el inquilino lo prefiere, a un proveedor y modelo propios. |
| RF-02.4 | La temperatura y el máximo de tokens por modelo se heredan del catálogo; el inquilino los sobrescribe por modelo solo si quiere (`tenant_model_settings`). |
| RF-02.5 | Los textos y comportamientos opcionales (persona, instrucciones, saludo, fallback, derivación, límites, temas) tienen valores por defecto de plataforma; el inquilino no está obligado a configurarlos. |
| RF-02.6 | El idioma de respuesta por defecto es el del inquilino (`clients.locale`), sobreescribible por bot. |

### RF-03 · Simplicidad (premisa)

| ID | Requisito |
|---|---|
| RF-03.1 | El alta mínima es: nombre, objetivo, tono, preset (o modelo) y canales. Todo lo demás es opcional con valores por defecto. |
| RF-03.2 | Los presets están curados por la plataforma e incluyen recomendación de uso («recomendado para…»). |
| RF-03.3 | Los valores por defecto globales son versionados por la plataforma; un cambio no altera configuraciones existentes hasta que el inquilino lo acepta. |
| RF-03.4 | El alta del bot se completa sin que el inquilino tenga que leer documentación: las etiquetas del catálogo explican cada opción (i18n es/en). |

### RF-04 · BYOK (trae tu propia llave) — alcance del día uno

| ID | Requisito |
|---|---|
| RF-04.1 | El inquilino registra una API Key por proveedor y puede tener más de un proveedor configurado. |
| RF-04.2 | La clave se guarda cifrada (AES-256-GCM), solo se muestra enmascarada (últimos 4) y nunca aparece en logs ni en respuestas de API. |
| RF-04.3 | El inquilino rota y desactiva sus claves. |
| RF-04.4 | El modo BYOK no consume saldo de la billetera; el inquilino le paga directo a su proveedor. |

### RF-05 · Inferencia como servicio (Mocter) — fundaciones aprobadas, activación por fases

| ID | Requisito |
|---|---|
| RF-05.1 | Mocter ofrece inferencia provisionada con claves de plataforma por proveedor. |
| RF-05.2 | El precio minorista por modelo es costo del proveedor + spread, publicado en el catálogo por 1M de tokens de entrada y de salida, en centavos de USD. El spread por defecto es **30%** y puede configurarse por modelo. |
| RF-05.3 | El spread se administra por modelo desde el backoffice SaaS; su cambio es auditado y aplica solo a consumos futuros, nunca al saldo ya recargado. |
| RF-05.4 | Un inquilino con BYOK también puede comprar inferencia Mocter; ambos modos conviven por proveedor. |
| RF-05.5 | La inferencia Mocter cubre el bot de atención y el asistente AI de configuración (AI-001); no es una API abierta al inquilino. Embeddings y resúmenes quedan para una fase futura. |

### RF-06 · Billetera y consumo — fundaciones aprobadas, activación por fases

| ID | Requisito |
|---|---|
| RF-06.1 | Cada inquilino tiene una billetera con saldo interno en centavos de USD (enteros, sin flotantes). El checkout muestra y cobra en la moneda del inquilino (`clients.currency`): COP por Wompi y USD por Stripe, con tipo de cambio y redondeo controlados. |
| RF-06.2 | La recarga se hace con **Wompi + Stripe**, reusando la integración, webhooks e idempotencia de BILL-001. |
| RF-06.3 | El consumo debita saldo por tokens usados al precio minorista del modelo. |
| RF-06.4 | **Prepago estricto:** el saldo nunca es negativo. Sin saldo suficiente, el bot usa un proveedor BYOK habilitado del inquilino; si no hay, responde el fallback configurado y pausa el modo Mocter. |
| RF-06.5 | El inquilino ve el historial de su billetera: recargas, consumos (con tokens y costo) y ajustes. |
| RF-06.6 | La billetera cubre el bot y el asistente AI de configuración; el modo BYOK no consume saldo. Embeddings y resúmenes quedan para una fase futura. |

### RF-07 · Límites

| ID | Requisito |
|---|---|
| RF-07.1 | El límite del modo Mocter es el saldo prepago por tokens; no existe saldo negativo ni período de gracia. |
| RF-07.2 | **No se usa `ai_tokens_monthly` por plan en v1.** El saldo es el único guardrail; si el negocio lo incorpora después, se reabre ADM-001 `plan_limits`. |

### RF-08 · Canales e integraciones admisibles

| ID | Requisito |
|---|---|
| RF-08.1 | Los canales admisibles son los que soporta Chatwoot; la plataforma publica un catálogo de tipos de canal (`chatwoot_channel_types`) con qué se puede y qué no se puede aprovisionar por API. |
| RF-08.2 | El inquilino gestiona sus integraciones de canal desde Mocter: las crea, conecta y desactiva en su panel, y el sistema configura Chatwoot por detrás (API donde existe, OAuth mediado donde el proveedor lo exige). |
| RF-08.3 | El bot se habilita por canal ya aprovisionado (`tenant_bot_channels`). |
| RF-08.4 | La viabilidad de aprovisionamiento por tipo de canal está documentada y se valida en laboratorio contra Chatwoot 4.19 antes de producción. |

### RF-09 · Gobernanza, seguridad y auditoría

| ID | Requisito |
|---|---|
| RF-09.1 | Las claves de plataforma (fase futura) se cifran con la misma maquinaria que los secretos TOTP (AUTH-D-04). |
| RF-09.2 | El uso se registra en un ledger append-only: `client_id`, proveedor, modelo, modo, tokens de entrada/salida y costo. |
| RF-09.3 | Se audita en `audit_log`: cambios de catálogo y precios, registro/rotación de claves, recargas y ajustes de saldo. Nunca la clave ni datos de pago. |
| RF-09.4 | Todas las tablas cumplen la auditoría global (DAT-001 RF-10.9) y la UI de configuración cumple la directiva de i18n. |

### RF-10 · Roles

| ID | Requisito |
|---|---|
| RF-10.1 | `platform_admin`/`platform_owner` administran catálogo, presets, tonos, canales admisibles, precios y spread. |
| RF-10.2 | El `tenant_owner` gestiona bots, claves BYOK y sus integraciones de canal; el `tenant_agent` solo consulta. |
| RF-10.3 | `platform_sales` lee consumo y recaudación por inquilino, sin ver claves ni saldos ajenos a su operación comercial. |

### RF-11 · Recordatorios y seguimientos (configuración global del inquilino)

| ID | Requisito |
|---|---|
| RF-11.1 | El inquilino configura sus **recordatorios personalizados**: define libremente sus secuencias con los textos que quiera, en los intervalos y el orden que decida, por los canales que tenga habilitados para el bot (`tenant_bot_channels`). No hay flujos fijos: cada secuencia es una configuración propia del inquilino. |
| RF-11.2 | Cada secuencia tiene disparador de inicio configurable (inactividad del prospecto), pasos ordenados con su texto y su espera (minutos/horas/días), y reglas de parada — todo editable por el inquilino. |
| RF-11.3 | El recordatorio viaja por el canal de la conversación activa con el prospecto; un prospecto tiene como máximo una secuencia activa a la vez. |
| RF-11.4 | Reglas de parada: el prospecto responde, un agente toma la conversación, se revoca el consentimiento comercial, o el bot se pausa → los pasos pendientes se cancelan de inmediato. |
| RF-11.5 | Los textos de los pasos son campos asistidos por AI (AI-001, `followup_step.message`) y respetan el idioma del inquilino. |
| RF-11.6 | Cumplimiento: los recordatorios comerciales consultan `prospect_consents` (CRM-001) antes de enviar; en WhatsApp, los mensajes iniciados por el negocio fuera de la ventana de 24 horas exigen plantillas aprobadas (se valida en laboratorio contra 4.19, CHW-001). |
| RF-11.7 | Límites y auditoría: máximo de pasos por secuencia (10 por defecto), rate limit por inquilino, y todo envío queda registrado con actor `bot` y el estado en `bot_followup_runs`. |
| RF-11.8 | La plataforma ofrece una **inicialización por defecto editable**: secuencias de ejemplo sembradas por inquilino con `origin = platform_default`, que el inquilino adopta, modifica, archiva o ignora. Las suyas son `origin = tenant_custom`. |

### RF-12 · Trial de inferencia para onboarding

| ID | Requisito |
|---|---|
| RF-12.1 | Todo inquilino nuevo recibe un **trial de inferencia de plataforma de 5 días** desde la activación del bot, sin renovación automática, mientras configura su proveedor de inferencia. |
| RF-12.2 | El trial se comunica con claridad en el onboarding y en el panel: qué incluye, cuánto dura y qué pasa al vencer (conectar BYOK o comprar saldo). |
| RF-12.3 | `platform_admin` puede desactivarlo manualmente por inquilino desde la zona admin de Mocter; el vencimiento y la desactivación son inmediatos. |
| RF-12.4 | El consumo del trial se registra en `ai_usage_events` con `purpose = 'trial'` y no genera deuda ni saldo negativo. |
| RF-12.5 | Al vencer o desactivarse, el bot deja de operar en modo trial y muestra al inquilino el CTA para conectar su proveedor o comprar inferencia Mocter. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | BOT-001 es una spec nueva; el motor de runtime (orquestación, memoria, tool use, webhook de Chatwoot) queda para BOT-002. | BOT-001 define configuración, catálogo, claves y billetera que el motor consumirá por API. |
| D-02 | Todas las tablas de BOT-001 viven en el Router Global (schema `admin`), como `chatwoot_accounts`: son configuración e integración, no datos de negocio de celda, y referencian el catálogo por FK. | Cumple DAT-001 RF-10.8 (sin FK entre planos). |
| D-03 | Dinero en enteros (`*_usd_cents`); precios por 1M de tokens de entrada/salida. | Evita errores de punto flotante en saldos y consumos. |
| D-04 | Fricción mínima: presets curados + defaults de plataforma; solo nombre, objetivo, tono, preset/modelo y canales son obligatorios. | El inquilino configura lo mínimo; la plataforma mantiene el criterio experto. |
| D-05 | Dos modos por proveedor: BYOK y Mocter; ante saldo insuficiente el bot falla a un proveedor BYOK habilitado. | El inquilino nunca queda sin bot por quedarse sin saldo si tiene una llave propia. |
| D-06 | El catálogo es una whitelist: el inquilino solo puede registrar proveedores y modelos admisibles. | La plataforma gobierna qué entra a su ecosistema. |
| D-07 | **Fases del negocio:** el día uno sale BYOK (cada inquilino registra su proveedor); la billetera, el spread y la inferencia Mocter quedan diseñados como fundaciones y se activan cuando el equipo madure la propuesta de agregador de inferencia. | El modelo de datos y los contratos ya existen; la activación no bloquea el lanzamiento. |
| D-08 | **Trial de inferencia de onboarding:** 5 días por inquilino, informado explícitamente, desactivable manualmente desde la zona admin de Mocter; al vencer, se exige BYOK o saldo. | Permite operar sin fricción en el alta mientras el inquilino configura su proveedor, con un costo acotado y controlable. |
| D-09 | Las instancias de canal las aprovisiona ADM-001 (ya documentado en CHW-001); BOT-001 aporta el catálogo de admisibles y la habilitación del bot por canal. La gestión del inquilino ocurre en Mocter. | No se duplica el aprovisionamiento de Chatwoot entre specs. |

## 5. Decisiones de la propuesta de negocio (cerradas)

Las decisiones **O-01 a O-07 quedaron cerradas el 2026-10-24**. La billetera, el spread y la inferencia Mocter siguen diseñados como fundaciones; su activación operativa puede ser posterior, sin bloquear el día uno BYOK.

| ID | Decisión | Consecuencia |
|---|---|---|
| O-01 | **Wompi + Stripe**, reusando la integración de BILL-001. | Misma pasarela, webhooks e idempotencia; COP local y USD internacional. |
| O-02 | **Spread por defecto 30%**, configurable por modelo desde el backoffice SaaS. | La SaaS registra múltiples proveedores, los activa/desactiva y habilita modelos por proveedor. |
| O-03 | **Seed inicial + edición en backoffice** de los precios de costo por modelo, con auditoría y versión. | No se requiere redesplegar cuando cambie el proveedor. |
| O-04 | **Solo saldo prepago**; sin `ai_tokens_monthly` por plan en v1. | No se reabre ADM-001 `plan_limits`; el saldo es el guardrail. |
| O-05 | **Prepago estricto + fallback BYOK**; sin saldo negativo. | Si no hay BYOK, el bot se pausa con aviso. |
| O-06 | La billetera cubre **bot + asistente AI**; embeddings y resúmenes quedan para una fase futura. | `ai_usage_events.purpose` distingue `bot` y `assist`. |
| O-07 | **USD interno + cobro en moneda del inquilino**: COP por Wompi, USD por Stripe, con FX y redondeo controlados. | Saldo y costos en centavos de USD; el checkout es local. |

**O-08** quedó resuelta por **D-08**: trial de inferencia de 5 días, informado y desactivable desde la zona admin.

La propuesta de valor para el equipo: Mocter como agregador de inferencia — el inquilino técnico trae su llave (BYOK, sin costo para Mocter) y el inquilino sin fricción compra tokens prepagos con spread; ingreso por uso, sin riesgo crediticio, diferenciado de la competencia.

## 6. Fuera de alcance

El motor de inferencia en sí (orquestación de la conversación, memoria, herramientas, conexión webhook con Chatwoot) → BOT-002. La pasarela de pago ya está decidida (Wompi + Stripe, reusando BILL-001). El fine-tuning de modelos. La interfaz de Chatwoot. Los contactos finales (dueño: `mocter-core`). La billetera y el spread pueden activarse por fases (D-07); no están fuera de diseño.

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Las instancias de canal las aprovisiona ADM-001 (inboxes, CHW-001); BOT-001 consume el listado. No se reabre T-10: no se usa `ai_tokens_monthly` en v1; el saldo prepago es el guardrail. |
| DAT-001 | Se cumplen RF-10.8 y RF-10.9; `ai_usage_events` es append-only con partición mensual futura. |
| AUTH-001 | Reutiliza la maquinaria de claves de AUTH-D-04 para las API keys BYOK y las claves de plataforma. |
| CHW-001 | La viabilidad de aprovisionamiento de canales por tipo se valida en laboratorio contra Chatwoot 4.19. |
| OPS-001 | Las claves cifradas entran al respaldo; la clave maestra no. Monitoreo de consumo y costo por proveedor. |
| i18n | UI es/en; el catálogo (tonos, presets, recomendaciones, canales) guarda etiquetas en ambos idiomas. |

## 8. Trazabilidad

- L1 (2026-10-23): «para el tema de gestion de atencion automatiza de los inquilinos se requieren una parametrizacion que permita capturar los datos que daran contexto a los LLM que se vinculen al sistema por ello se requiere agregar un nuevo objeto de negocio en la cual se indique el objetivo del bot, tono con el que respondera el bot, y requiero que sugieras cualquier otro atributu util para moderar el comportamiento general del bot en los canales que el inquilino habilite. Tambien se debe permitir que los inquilinos puedan definir que proveedor de inferencia quieren usar para su bot, el requierimiento incluye ofrecer un listado de proveedores OpenAI, Anthropic, Google, DeepSeek, Openrouter, Together AI, estos proveedores admisibles deben existir como una objeto que se puede parametrizar de forma tal que se cree el proveedor y sus modelos con una recomendación para su uso que los inquilinos puedan usar para decidir cual usar. El inquilino debe poder configurar para su ecosistema mas de un proveedor de inferencia para ello se le debe permitir registrar su respectiva API Key, definir por cada modelo la temperatura del bot y maximo de token. Analiza el anterior contexto y propon lo ajustes a realizar en el planeamiento actual»
- L2 (2026-10-23): «dentro de los planes tambien se quiere incluir el servicio de inferencia, con la finalidad de generar ingresos para el negocio tambien por este servicio con un spred de cobro adicional, con ello damos la libertad al inquilino de trabajar con el proveedor de AI que le guste pero tambien ofrecemos quitar fricción para aquellos inquilinos que no gustan de incribirse en sitio y poner tarjetes de credito, en general enredarse con los temas operativos de mantener un plan de AI activo, el limite pienso que deberia ser por tokens, igualmente el inquilino que tenga su proveedor pero quiera adquirir inferencia desde mocter, tambien se le debe habilitar que este recargue saldo a su billetera y de esta se le provisiones inferencia solo para ser usada en las capacidades de la plataforma.»
- L3 (2026-10-23): «De los Atributos sugeridos sugeridos algunos deberian ser mas de parametrizacion y configuracion global, recuerda que la facilidad de configuracion debe ser la premisa, mucha inforamcion por configurar para un inquilino de genera friccion.»
- L4 (2026-10-23): «Los "canales" son los que soporta Chatwoot?, si es asi para tenerlo en cuenta esta integraciones admisibles las debe gestionar el inquilino desde Mocter y el sistemas configura Chatwoot… En cuanto al tema de Decisiones abiertas documentemolo de una vez como propuesta de negocio para el equipo para ser madurada en el tiempo, por defecto para el dia uno salimos con la capacidad de que cada inquilino registre su proveedor de inferencia y sentamos las bases para convertir como linea de negocio convierte a Mocter en agregador de inferencia.»
- L5 (2026-10-23): **BOT-001 aprobada** con alcance de día uno (catálogo, bot, canales desde Mocter y BYOK) y la propuesta de agregador de inferencia documentada como fundaciones por madurar (D-07). El planeamiento no inicia implementación ni RDD.
- L6 (2026-10-23): AI-001 consumirá la configuración de inferencia (BYOK y, al madurar la propuesta, Mocter) para el asistente de configuración; `ai_usage_events` gana la columna `purpose` (`bot` o `assist`).
- L7 (2026-10-23): se agrega RF-11 por decisión del usuario: el bot configura secuencias de recordatorios globales (textos en intervalos de tiempo y en orden) para atender prospectos por los canales habilitados. Incluye reglas de parada, consentimiento (CRM-001) y la restricción de plantillas de WhatsApp fuera de la ventana de 24 h.
- L8 (2026-10-23): se agrega O-08 a la propuesta de negocio: **trial de inferencia** acotado para el onboarding, porque BYOK es el único bloqueo real del time-to-value de 5 minutos. El resto del alta queda cubierto por defaults (ADM-001 RF-14.8 a RF-14.10).
- L9 (2026-10-23): **O-08 resuelta por D-08:** trial de inferencia de **60 minutos** por inquilino, informado explícitamente, desactivable manualmente desde la zona admin de Mocter; al vencer, el inquilino conecta BYOK o compra saldo. Consumo en `ai_usage_events` con `purpose = 'trial'`, sin deuda.
- L10 (2026-10-24): corrección del usuario: el trial pasa de 60 minutos a **5 días** de inferencia mientras el inquilino configura su proveedor. D-08 y RF-12.1 actualizados; el resto de las reglas (informado, desactivable, sin deuda) se mantiene.
- L8 (2026-10-23): corrección del usuario — «No estoy de acuerdo con el planteamiento, en cuanto a que no son flujos fijos, la imagen era un ejemplo no debe tomarse literal, debemos es generar el objeto y sus atributos para que el inquilino pueda configurar su recordatorios personalizados, podemos es ofrecer una inicializacion por defecto.» RF-11.1/11.2 se reformulan como motor personalizable y se agrega RF-11.8 (inicialización por defecto editable con `origin = platform_default`).
- L11 (2026-10-24): O-01 a O-07 cerradas — O-01 Wompi + Stripe reusando BILL-001; O-02 spread 30% configurable por modelo y registro de proveedores/modelos desde backoffice; O-03 seed + edición en backoffice; O-04 solo saldo prepago, sin `ai_tokens_monthly`; O-05 prepago estricto + fallback BYOK; O-06 billetera para bot + asistente AI; O-07 USD interno y cobro en moneda del inquilino.
