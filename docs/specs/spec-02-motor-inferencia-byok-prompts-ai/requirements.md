# SPEC-02 · Motor Real de Inferencia AI, BYOK en Inquilinos y Gobernanza de Prompts Maestros

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-02` |
| **Nombre** | Motor Real de Inferencia AI, BYOK en Inquilinos y Gobernanza de Prompts Maestros |
| **Tipo de intervención** | Remediación de defecto crítico + Nuevo desarrollo de integración |
| **Prioridad** | P0 — Crítica (habilitante de Onboarding y asistencia transversal) |
| **Versión** | 1.1.0 |
| **Estado** | En revisión / Planeamiento de alcance extendido (Fase 2: Catálogo Dinámico, Logos, Modelos Por Defecto y Failover Primario/Secundario) |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-02`, `ONB-10`, `TRV-03` |
| **Specs previas relacionadas** | `AI-001`, `BOT-001`, `ADM-001`, `TNT-001` |
| **Specs dependientes** | `SPEC-06` (Onboarding Paso 3 usa «Mejorar con AI»), `SPEC-08` (descripción y prompt maestro de producto), `SPEC-10` (asistente AI, presets y 6 mensajes del bot), `SPEC-17` (cobertura transversal de `textarea` en Backoffice del Inquilino) |
| **Wave de ejecución sugerida** | Wave 1 — Base de Dominio e Infraestructura Funcional |

---

## 3. Problema / Situación actual

La revisión del código fuente actual evidencia tres brechas graves que impiden cumplir la restricción de negocio de BYOK con excepción de periodo de prueba y rompen el botón «Mejorar con AI» tanto en Onboarding como en el Backoffice del Inquilino:

1. **Inyección vacía en el endpoint real de asistencia (`ONB-10`, `TRV-03`):**
   - `apps/admin/app/api/ai/enhance/route.ts` (línea 114) exporta `export const POST = createEnhanceRouteHandler({} as any);`. Al invocar `POST /api/ai/enhance`, cualquier solicitud falla en tiempo de ejecución porque el servicio recibe un objeto vacío sin métodos (`enhanceField`, `checkRateLimit`, repositorio ni cliente LLM real).
2. **Simulación falsa en el cliente de productos (`ONB-10`, `TRV-03`):**
   - `apps/admin/app/workspace/products/products-view.tsx` (líneas 50–61) y flujos equivalentes utilizan `setTimeout(..., 600)` para fabricar textos estáticos en el navegador sin consultar ningún prompt maestro ni llamar a un modelo LLM vía API.
3. **Regla errónea de bloqueo por billetera en `trial` y falta de autogestión BYOK del inquilino (`GEN-02`):**
   - `apps/admin/app/api/ai/enhance/route.ts` (línea 48) y `AiAssistService` (`packages/domain/src/services/ai-assist.service.ts`) rechazan la inferencia cuando `!hasByokConfigured && walletBalanceCents <= 0`, ignorando la condición activa de **periodo de prueba (`trial`)** o **onboarding**, donde la SaaS debe proveer inferencia temporal con la API Key de plataforma almacenada en `admin.ai_platform_keys` (gestionada desde `/admin/ai`).
   - El catálogo de prompts maestros (`admin.ai_assist_fields` / `admin.ai_assist_prompts`) y el catálogo de proveedores/modelos (`admin.ai_providers` / `admin.ai_models`) ya existen en esquema y gobierno SaaS (`/admin/ai`), pero el Backoffice del Inquilino carece de una interfaz completa para que el `tenancy_owner` registre, pruebe, rote y seleccione su propia API Key (BYOK) ni de un `IAiAssistModelClient` real acoplado a SDK/HTTP por proveedor.
4. **Acoplamiento estático de proveedores y ausencia de identidad visual (Logo):**
   - `admin.ai_providers` mantiene una restricción `CHECK` cerrada a 6 códigos (`openai`, `anthropic`, `google`, `deepseek`, `openrouter`, `together_ai`) sin almacenar protocolo/dialecto HTTP ni `base_url` configurables, y `LlmHttpProviderClient` resuelve endpoints mediante un mapa estático en código. Además, `/admin/ai` carece de operaciones para crear, editar o eliminar proveedores LLM y no permite cargar su logo corporativo.
5. **Ausencia de CRUD completo de Modelos y de selección de «Modelo Por Defecto» (`is_default`):**
   - `/admin/ai` únicamente permite ajustar `spreadPercent` y `isActive` de modelos presembrados. No existe capacidad para crear nuevos modelos bajo un proveedor, editar sus parámetros técnicos y de costos, inactivar/reactivar o eliminar modelos obsoletos, ni designar cuál modelo es el **Modelo Por Defecto** de cada proveedor (actualmente proveedores semilla como `openrouter` y `together_ai` muestran `0 modelos`).
6. **Ausencia de enrutamiento Primario (Predeterminado) y Secundario (Respaldo ante indisponibilidad) y omisión de parámetros de generación en SaaS:**
   - Al guardar una credencial en `/admin/ai` se retiran todas las anteriores, impidiendo mantener simultáneamente un par Proveedor + Modelo **Primario (Predeterminado del sistema)** y un **Secundario (Respaldo / Failover)** ante indisponibilidad o saturación (timeout, red, `429`, `5xx`), tanto a nivel global de la SaaS como en la configuración BYOK del comercio (`/workspace/ai`).
   - Asimismo, el formulario de «Llave De Prueba De Plataforma» en `/admin/ai` y `admin.ai_platform_keys` omitieron los atributos **«Temperatura De Respuesta (0.0 – 2.0)»** y **«Límite Máximo De Tokens»**, los cuales sí existen en el formulario BYOK del comercio (`/workspace/ai`).

---

## 4. Objetivo y valor de negocio

Establecer un **único motor real de inferencia LLM** en `@mocter/domain` que:
- Resuelva de forma determinista el origen de la credencial (BYOK del inquilino activo vs API Key de plataforma de la SaaS únicamente durante onboarding o `trial` vigente), cumpliendo estrictamente la restricción inicial de que **la SaaS no incluye inferencia en planes pagos**.
- Conecte todos los botones «Mejorar con AI» (`ONB-10`, `TRV-03`) a `POST /api/ai/enhance` respaldado por `AiAssistService`, un cliente LLM multi-proveedor real, y la **Biblioteca de Prompts Maestros** de `/admin/ai`.
- Permita al `tenancy_owner` administrar de forma segura (cifrada en reposo, enmascarada al leer, verificable en vivo) su proveedor, modelo preferido y API Key propia desde el Backoffice del Inquilino.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Implementación del resolvedor de credenciales y política BYOK/Trial (`AiCredentialResolverService` / extensión de `AiAssistService`).
- Implementación del adaptador multi-proveedor `IAiAssistModelClient` real vía HTTP/API para los proveedores soportados en `admin.ai_providers` (`openai`, `anthropic`, `google`, `deepseek`, `openrouter`, `together_ai`), leyendo secretos cifrados de `admin.tenant_ai_providers` o `admin.ai_platform_keys`.
- Reemplazo del stub `{}` en `apps/admin/app/api/ai/enhance/route.ts` por la composición real con repositorios Drizzle, auditoría en `admin.ai_usage_events` (`mode: 'byok' | 'mocter'`, `purpose: 'assist' | 'trial'`) y respuestas RFC 9457.
- Eliminación de todo `setTimeout` simulado en «Mejorar con AI» (`products-view.tsx` y wizard de onboarding).
- Exposición y aseguramiento del catálogo mínimo de `ai_assist_fields` y `ai_assist_prompts` activos para cada `textarea` cubierto (`product.description`, `product.bot_master_prompt`, `onboarding.product_description`, mensajes de confirmación/bot y políticas).
- Endpoints y UI en el Backoffice del Inquilino (`/workspace/ai` o pestaña dedicada dentro de `/workspace/bot` vinculada al menú de configuración del comercio) para registrar, validar conectividad («Probar Conexión»), activar, rotar y revocar la API Key propia (BYOK) y seleccionar modelo.
- Verificación y sincronización con `/admin/ai` («Proveedores y Modelos LLM», «Biblioteca de Prompts Maestros», «Parámetros Globales y Guardarraíl»).
- **(Fase 2) CRUD completo de Proveedores LLM desacoplados en `/admin/ai`:** Alta, edición, activación/inactivación y eliminación híbrida segura de proveedores basados en protocolo/dialecto (`openai_compatible`, `anthropic`, `google_gemini`), `base_url` y `verify_path` configurables en BD, eliminando el `CHECK` cerrado de códigos en PostgreSQL y el mapa cerrado en `LlmHttpProviderClient`.
- **(Fase 2) Identidad visual de proveedores mediante cargue de logo:** Subida de logo (`PNG`, `JPEG`, `WebP`, `AVIF` hasta 2 MB validada por magic bytes) al crear o editar cualquier proveedor en `/admin/ai`, almacenado en SeaweedFS y servido con firma HMAC-SHA256 de `imgproxy` tanto en `/admin/ai` como en `/workspace/ai` (con fallback a monograma de 2 letras).
- **(Fase 2) CRUD completo de Modelos LLM y «Modelo Por Defecto» (`is_default`):** Crear, actualizar (ficha técnica, capacidades, temperatura/tokens por defecto, costos y spread), activar/inactivar, marcar como modelo por defecto único del proveedor (`is_default`) y eliminar modelos desde `/admin/ai`, incluyendo semilla inicial para todos los proveedores base (`openrouter` y `together_ai` inclusive).
- **(Fase 2) Enrutamiento Primario (Predeterminado) y Secundario (Failover automático):** Soporte para designar una configuración Proveedor + Modelo **Primaria** y una **Secundaria (Respaldo)** tanto en credenciales de plataforma (`/admin/ai`) como en BYOK del comercio (`/workspace/ai`), con failover automático en caliente ante indisponibilidad operativa del primario.
- **(Fase 2) Eliminación híbrida segura (`ConfirmationModal` `--dsn-*`):** Bloqueo `409 Conflict` cuando un proveedor o modelo está en uso activo (llaves, bots o presets activos), borrado lógico (`deleted_at`) cuando conserva historial en `ai_usage_events` o llaves retiradas, y borrado físico cuando carece de referencias.

### Fuera de alcance
- Venta, recarga o facturación de créditos de inferencia SaaS pagados (la plataforma no vende tokens ni incluye inferencia en planes pagos).
- Entrenamiento o fine-tuning de modelos propios.
- Configuración de la personalidad, tono y 6 mensajes del bot comercial (pertenece a `SPEC-10`).
- Inserción visual del botón en campos específicos fuera de `SPEC-02` que corresponden a otros módulos ya modelados (`SPEC-08`, `SPEC-10`, `SPEC-17`), los cuales reutilizan el componente `<AiEnhanceTextarea />` conectado a este motor.

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Registrar / actualizar / rotar / probar / revocar API Key BYOK del comercio | Sí | Solo de su `client_id` activo |
| `tenancy_owner` | Seleccionar proveedor y modelo LLM activo para su comercio | Sí | Modelo activo en `admin.ai_models` |
| `tenancy_owner` | Invocar «Mejorar con AI» en `textarea` de configuración u onboarding | Sí | BYOK activo, o estado `onboarding` / `trial` vigente |
| `tenancy_users` (`tenant_agent`) | Ver credenciales o editar API Key BYOK | No | Denegado (`403 Forbidden`); nunca ve `api_key_last4` ni formularios de llave |
| `tenancy_users` (`tenant_agent`) | Invocar «Mejorar con AI» al redactar fichas de productos | Sí | Solo cuando BYOK o `trial` del inquilino estén habilitados |
| `platform_owner` / `platform_admin` | Administrar `admin.ai_providers`, `admin.ai_models`, `admin.ai_platform_keys`, `admin.ai_assist_prompts` y guardarraíles globales en `/admin/ai` | Sí | Auditoría obligatoria |
| `platform_owner` / `platform_admin` | Crear, editar, subir logo, inactivar y eliminar Proveedores LLM y Modelos (incluyendo designar `is_default`) | Sí | Eliminación sujeta a validación de uso activo / historial |
| `platform_owner` / `platform_admin` | Designar configuración Proveedor + Modelo `primary` (Predeterminada) y `secondary` (Respaldo) de la SaaS | Sí | Máximo 1 `primary` y 1 `secondary` activas |
| `tenancy_owner` | Designar configuración BYOK `primary` y `secondary` entre sus proveedores/modelos activos | Sí | Solo dentro de su `client_id` activo |
| `platform_owner` / `platform_admin` | Leer en texto plano la API Key BYOK de un inquilino | No | La llave se almacena cifrada (AES-256-GCM / KMS); solo visible último 4 dígitos |

---

## 7. Modelo de datos

Se reutilizan y extienden las tablas en `packages/domain/src/db/schemas/admin/bot-catalog.ts`, `bot-tenancy.ts` y `ai-assist.ts`, con las siguientes precisiones y ajustes normativos:

### 7.0 `admin.ai_providers` y `admin.ai_models` (extensión en `bot-catalog.ts` — Fase 2)
- **`admin.ai_providers`:**
  - Reemplazar la restricción cerrada `ai_providers_code_check` por un `CHECK` de formato slug canónico (`code ~ '^[a-z0-9_-]{2,40}$'`) e índice único parcial sobre `code` donde `deleted_at IS NULL`, permitiendo dar de alta nuevos proveedores dinámicamente.
  - `api_dialect`: `TEXT`, obligatorio, default `'openai_compatible'` (`CHECK (api_dialect IN ('openai_compatible', 'anthropic', 'google_gemini'))`). Define el protocolo HTTP de comunicación del adaptador sin depender del slug `code`.
  - `base_url`: `TEXT`, obligatorio. Endpoint base del proveedor (ej. `https://api.openai.com/v1`, `https://api.anthropic.com/v1`, `https://generativelanguage.googleapis.com/v1beta`, `https://api.groq.com/openai/v1`).
  - `verify_path`: `TEXT`, obligatorio, default `'/models'`. Ruta relativa empleada para validación activa de credenciales (ej. `'/models'`, `'/auth/key'`).
  - `logo_storage_key`: `TEXT` (nullable). Clave del objeto en SeaweedFS S3 (`media`), firmada en tiempo de lectura vía `imgproxy`.
  - `deleted_at` (`TIMESTAMPTZ`, nullable) y `deleted_by` (`TEXT`, nullable) para soportar borrado lógico cuando existan registros históricos en `ai_usage_events`.
- **`admin.ai_models`:**
  - `is_default`: `BOOLEAN`, obligatorio, default `false`. Indica si el modelo es la selección predeterminada del proveedor al configurar llaves en `/admin/ai` y `/workspace/ai`.
  - **Unicidad de modelo por defecto:** Índice único parcial `ai_models_provider_default_unique` sobre `(provider_id)` donde `is_default = true AND deleted_at IS NULL`, garantizando máximo un modelo por defecto por proveedor (con relevo automático en transacción).
  - `deleted_at` (`TIMESTAMPTZ`, nullable) y `deleted_by` (`TEXT`, nullable) para la estrategia de eliminación híbrida.

### 7.1 `admin.tenant_ai_providers` (existente en `bot-tenancy.ts`)
- `id`: `UUID` PK.
- `client_id`: `UUID` FK → `admin.clients.id`, obligatorio (`NOT NULL`), indexado para aislamiento estricto por inquilino.
- `provider_id`: `UUID` FK → `admin.ai_providers.id`, obligatorio.
- `api_key_ciphertext`: `TEXT`, obligatorio. Cifrado autenticado AES-256-GCM usando llave maestra de entorno declarada en `@t3-oss/env-nextjs`.
- `api_key_key_id`: `VARCHAR(64)`, obligatorio. Identificador de versión de llave de cifrado para permitir rotación sin downtime.
- `api_key_last4`: `VARCHAR(8)`, obligatorio. Única representación retornable a UI.
- `status`: `VARCHAR(32)` (`'active' | 'invalid' | 'revoked'`), obligatorio, default `'active'`.
- `priority_role`: `TEXT`, obligatorio, default `'primary'` (`CHECK (priority_role IN ('primary', 'secondary', 'standby'))`). **[Fase 2]** Permite designar una credencial BYOK primaria y una secundaria de respaldo por inquilino con índice único parcial `(client_id, priority_role)` donde `priority_role IN ('primary', 'secondary') AND deleted_at IS NULL AND status = 'active'`.
- `last_verified_at`: `TIMESTAMPTZ` (nullable). **[Nuevo campo requerido para registrar última prueba real contra el proveedor]**.
- `last_verification_error`: `TEXT` (nullable). **[Nuevo campo sanitario — sin incluir secretos]**.
- `deleted_at`: `TIMESTAMPTZ` (nullable) para eliminación lógica y preservación de auditoría.
- **Estrategia de eliminación:** Lógica (`deleted_at` + `status = 'revoked'`) conservando trazabilidad en `ai_usage_events`; nunca se retorna en consultas de llaves activas.

### 7.2 `admin.tenant_model_settings` (existente en `bot-tenancy.ts`)
- `client_id`: `UUID` FK → `admin.clients.id`, único por `(client_id, provider_id, model_id)` donde `deleted_at IS NULL`, permitiendo conservar el modelo seleccionado para cada proveedor BYOK (`primary` y `secondary`) del comercio.
- `provider_id`: `UUID` FK → `admin.ai_providers.id`.
- `model_id`: `UUID` FK → `admin.ai_models.id`.
- `temperature`, `max_tokens`, `top_p`: respetan topes máximos definidos en «Parámetros Globales y Guardarraíl» (`/admin/ai`).

### 7.3 `admin.ai_platform_keys` (existente en `bot-tenancy.ts`)
- Almacena cifradas las API Keys operativas de la SaaS para inferencia exclusivamente en `onboarding` o `trial`.
- Columnas mínimas operativas: `id`, `provider_id`, `default_model_id` (FK → `admin.ai_models.id`), `api_key_ciphertext`, `api_key_key_id`, `api_key_last4`, `status` (`'active' | 'retired'`), `priority_role` (`'primary' | 'secondary' | 'standby'`, default `'primary'`), `temperature` (`TEXT`, obligatorio, default `'0.7'`), `max_tokens` (`INTEGER`, obligatorio, default `1000`, `CHECK (max_tokens >= 64 AND max_tokens <= 8192)`), `monthly_token_cap` (`BIGINT` para proteger cuota de prueba de la SaaS), `updated_at`.
- **Sincronización con modelo por defecto:** Al elegir o cambiar el modelo en la UI de plataforma, `temperature` y `max_tokens` se pre-rellenan con `default_temperature` y `default_max_tokens` del modelo (`admin.ai_models`), permitiendo al operador sobrescribirlos para esa llave.
- **Unicidad Primario/Secundario (Fase 2):** Permite mantener simultáneamente una credencial activa con `priority_role = 'primary'` (configuración predeterminada del sistema) y una activa con `priority_role = 'secondary'` (respaldo por indisponibilidad) mediante índice único parcial sobre `(purpose, priority_role)` donde `priority_role IN ('primary', 'secondary') AND status = 'active'`.
- **Aislamiento:** Tabla exclusiva del esquema `admin`, jamás expuesta en respuestas al cliente del inquilino.

### 7.4 `admin.ai_assist_fields` y `admin.ai_assist_prompts` (existentes en `ai-assist.ts`)
- `field_key`: `VARCHAR(120)` único (ej. `product.description`, `product.bot_master_prompt`, `onboarding.product_description`, `bot.persona`, `bot.greeting_message`, `bot.order_confirmation_message`, `policy.returns`, `policy.warranty`, `policy.shipping`).
- `master_prompt`: `TEXT`, obligatorio (tamaño suficiente hasta `32,000` caracteres).
- `input_hint`: `TEXT`, obligatorio.
- `output_rules`: `JSONB` (`maxLength`, `minLength`, `format`, `tone`, `disallowedTerms`).
- `status`: `'draft' | 'active' | 'archived'`, máximo 1 versión `active` por `field_key` mediante índice único parcial.

### 7.5 `admin.ai_usage_events` (existente en `bot-tenancy.ts`)
- Registra toda ejecución real: `client_id`, `provider_id`, `model_id`, `mode` (`'byok' | 'mocter'`), `purpose` (`'assist' | 'trial' | 'bot'`), `field_key` **[Nuevo campo opcional para métrica de asistencia]**, `input_tokens`, `output_tokens`, `latency_ms`, `status` (`'success' | 'provider_error' | 'rate_limited'`), `request_id` (`x-request-id`), `created_at`.

### 7.6 Migraciones y RLS
- Ninguna tabla de credenciales se almacena en la celda del inquilino (`pg-cell-XX`): permanecen en el plano de control (`admin`) bajo aislamiento lógico estricto por `client_id = session.clientId`.
- Toda nueva columna o índice debe acompañarse de `.comment(...)` en Drizzle y migración versionada SQL en `packages/domain/drizzle/`.

---

## 8. Reglas de negocio

- **RN-SPEC-02-01 (Cero inferencia simulada):** Queda estrictamente prohibido generar texto sintético mediante `setTimeout`, plantillas locales estáticas o mocks en producción/desarrollo dentro de «Mejorar con AI». Toda invocación debe ejecutar una petición HTTP autenticada a `POST /api/ai/enhance` y consumir un modelo LLM real vía API usando el prompt maestro activo del `field_key`.
- **RN-SPEC-02-02 (Precedencia estricta BYOK sobre llave de prueba):** Al resolver credenciales para inferencia (`assist` o `bot`), el motor evalúa en orden: (1) Si el inquilino tiene un registro `active` no eliminado en `admin.tenant_ai_providers` junto con un modelo habilitado, utiliza obligatoriamente la API Key BYOK del inquilino (`mode = 'byok'`); (2) Solo si no existe BYOK activo, verifica si el inquilino se encuentra en estado de suscripción `trial` vigente (`subscriptions.status = 'trialing'` y `trial_ends_at > NOW()`) o en sesión activa de onboarding inicial (`onboarding_sessions.completed_at IS NULL`); únicamente bajo esa excepción utiliza la API Key activa de `admin.ai_platform_keys` (`mode = 'mocter'`, `purpose = 'trial'`).
- **RN-SPEC-02-03 (Bloqueo explícito sin BYOK fuera de prueba):** Si el inquilino tiene un plan activo/vencido/pausado fuera de periodo de prueba y no ha registrado una API Key BYOK activa en su Backoffice, el motor rechaza la inferencia con código de negocio `AI_BYOK_REQUIRED` (`402` o `422` Problem Details) e instruye en lenguaje natural dónde registrar su clave propia, sin descontar ni simular billetera incluida.
- **RN-SPEC-02-04 (Gobierno centralizado en `/admin/ai`):** Los proveedores permitidos, modelos visibles para selección BYOK, prompts maestros por `field_key` y guardarraíles globales (`max_tokens`, temperatura máxima, términos prohibidos, límite por minuto) se gobiernan exclusivamente desde el Backoffice de la SaaS (`/admin/ai`). Si un `field_key` carece de prompt maestro `active`, el servicio falla de forma controlada con `AI_MASTER_PROMPT_MISSING` y registra alerta en logs estructurados.
- **RN-SPEC-02-05 (La AI propone, el humano confirma — `AGENTS.md §4.7`):** La respuesta de «Mejorar con AI» nunca sobreescribe ni persiste automáticamente el campo del formulario. Debe mostrarse en una vista previa editable donde el usuario explícitamente elige **Aceptar Sugerencia**, **Reintentar** o **Descartar**.
- **RN-SPEC-02-06 (Protección criptográfica de API Keys):** Ninguna API Key BYOK ni de plataforma puede almacenarse en texto plano, registrarse en logs Pino, incluirse en respuestas HTTP ni devolverse al frontend después de guardarse. Toda lectura retorna únicamente `providerCode`, `modelCode`, `apiKeyLast4` (ej. `••••7a2f`), `status` y `lastVerifiedAt`.
- **RN-SPEC-02-07 (Verificación real de conectividad BYOK):** Al guardar o pulsar «Probar Conexión» sobre una clave BYOK, el servidor ejecuta una llamada liviana real de verificación contra el endpoint del proveedor seleccionado (con timeout acotado ≤ 8s). Una llave sintácticamente válida pero rechazada por el proveedor (`401`/`403`/`quota`) se marca con `status = 'invalid'` y expone mensaje accionable sin romper la plataforma.
- **RN-SPEC-02-08 (Guardarraíl de consumo y rate limiting en trial):** Durante la excepción de periodo de prueba (`mode = 'mocter'`), el inquilino queda sujeto al tope de peticiones por minuto configurado en guardarraíles globales (`/admin/ai`) y al tope diario/trial de tokens definido en la configuración global de plataforma para prevenir abuso.
- **RN-SPEC-02-09 (Correlación y variables de entorno):** Las claves maestras de cifrado (`AI_ENCRYPTION_KEY` / `KMS_*`) y parámetros de timeout se validan exclusivamente mediante `@t3-oss/env-nextjs` (`env.ts`) y se documentan en `.env.example`, prohibiendo accesos directos a `process.env`.
- **RN-SPEC-02-10 (Proveedores desacoplados por dialecto e identidad visual):** Cualquier proveedor LLM registrado en `admin.ai_providers` define su protocolo (`api_dialect`: `'openai_compatible' | 'anthropic' | 'google_gemini'`), `base_url` y `verify_path`. El adaptador HTTP ejecuta inferencia y verificación leyendo estos metadatos desde BD sin listas cerradas de códigos en código fuente. El logo del proveedor (para proveedores nuevos o semilla existentes) se valida por magic bytes (`PNG`, `JPEG`, `WebP`, `AVIF`, tamaño ≤ 2 MB, rechazando SVG/GIF/ejecutables), se almacena en SeaweedFS y se sirve firmado por `imgproxy` (o monograma de 2 letras como fallback si no posee logo).
- **RN-SPEC-02-11 (CRUD de modelos y «Modelo Por Defecto» único por proveedor):** El operador SaaS puede crear, actualizar ficha técnica/costos/spread, activar/inactivar y eliminar modelos por proveedor en `/admin/ai`. A lo sumo un modelo no eliminado por proveedor puede tener `is_default = true`; al marcar un nuevo modelo como defecto, el anterior del mismo proveedor pasa automáticamente a `is_default = false` en la misma transacción. Todos los proveedores iniciales semilla cuentan con al menos un modelo por defecto activo.
- **RN-SPEC-02-12 (Enrutamiento Primario/Secundario y Failover automático por indisponibilidad):** Tanto en la plataforma (`/admin/ai`) como en BYOK del inquilino (`/workspace/ai`) se puede designar una configuración Proveedor + Modelo **Primaria (Predeterminada)** y una **Secundaria (Respaldo)**. Si durante una petición la configuración Primaria falla por indisponibilidad operativa (timeout `AbortSignal`, error de red/DNS, HTTP `429` rate limit o HTTP `5xx` del proveedor), el motor conmuta automáticamente en la misma petición hacia la configuración Secundaria activa del mismo ámbito y registra trazabilidad de ambos intentos (`failoverUsed: true`) en logs Pino y `admin.ai_usage_events`.
- **RN-SPEC-02-13 (Integridad referencial en eliminación de proveedores y modelos):** Todo intento de eliminar un proveedor o modelo desde `/admin/ai` exige confirmación mediante modal `--dsn-*`. Si el recurso tiene referencias activas (llaves de plataforma activas, credenciales BYOK activas de comercios, bots activos o presets activos), se bloquea con `409 Conflict` (`AI_RESOURCE_IN_ACTIVE_USE`). Si solo registra historial en `admin.ai_usage_events` o llaves retiradas/revocadas, se ejecuta borrado lógico (`deleted_at = NOW()`, `is_active = false`). Si carece de toda referencia, se ejecuta `DELETE` físico.

---

## 9. Contratos de interfaz

### 9.1 `POST /api/ai/enhance` (Remediación de endpoint existente)
- **Autenticación:** Sesión válida de usuario del inquilino (`tenancy_owner` o `tenancy_users`) o sesión autenticada de onboarding.
- **Request JSON:**
```json
{
  "fieldKey": "product.description",
  "draft": "Camiseta oversize algodón 240g",
  "locale": "es",
  "context": {
    "productName": "Camiseta Oversize",
    "productKind": "physical",
    "attributesSummary": "Tallas S-XL, colores Negro y Blanco"
  }
}
```
- **Response `200 OK`:**
```json
{
  "ok": true,
  "data": {
    "fieldKey": "product.description",
    "promptVersion": 2,
    "suggestion": "...",
    "mode": "trial",
    "providerCode": "openai",
    "modelUsed": "gpt-4o-mini",
    "inputTokens": 142,
    "outputTokens": 118
  }
}
```
- **Errores RFC 9457 (`application/problem+json`):**
  - `400 Bad Request`: `validation_error` (`fieldKey` vacío, `draft` excede longitud máxima o es vacío si el campo lo exige).
  - `401 Unauthorized`: sesión ausente o expirada.
  - `422 Unprocessable Entity`: `AI_BYOK_REQUIRED` (periodo de prueba finalizado y sin BYOK configurado) | `AI_MASTER_PROMPT_MISSING` | `AI_KEY_INVALID` (BYOK marcada inválida por el proveedor).
  - `429 Too Many Requests`: `AI_RATE_LIMIT_EXCEEDED` con cabecera `Retry-After`.
  - `502 Bad Gateway`: `AI_UPSTREAM_ERROR` (timeout o fallo del proveedor LLM externo; nunca filtra `stack` ni headers de autorización).

### 9.2 `GET /api/tenant/ai/settings` [Nuevo / o subrecurso de configuración AI del inquilino]
- **Autenticación:** `tenancy_owner` (solo lectura de catálogo activo + estado BYOK; `tenancy_users` recibe `403`).
- **Response `200 OK`:** Lista de proveedores habilitados en `admin.ai_providers` (con `logoUrl` firmada vía `imgproxy`, `apiDialect` y modelos activos indicando cuál tiene `isDefault = true`), estado de credenciales BYOK configuradas del comercio (`priorityRole: 'primary' | 'secondary' | 'standby'`, `providerId`, `providerCode`, `selectedModelId`, `apiKeyLast4`, `status`, `lastVerifiedAt`), y estado de excepción trial (`isTrialActive`, `trialEndsAt`, `inferenceSource: 'byok' | 'platform_trial' | 'unavailable'`).

### 9.3 `PUT /api/tenant/ai/settings` [Nuevo]
- **Autenticación:** `tenancy_owner`.
- **Request JSON:** `{ "providerCode": "openai", "modelId": "uuid", "apiKey": "sk-...", "priorityRole": "primary", "verifyImmediately": true }`. (`apiKey` opcional si solo se cambia de modelo o `priorityRole` sobre un proveedor ya guardado).
- **Comportamiento:** Cifra `apiKey`, persiste en `admin.tenant_ai_providers` + `admin.tenant_model_settings`, gestiona el relevo de `priorityRole` (`primary` o `secondary`) garantizando unicidad activa por comercio, ejecuta verificación real si `verifyImmediately = true`, invalida/actualiza caché y registra auditoría en `admin.audit_log`.
- **Errores:** `422 AI_KEY_VERIFICATION_FAILED` si la verificación inmediata falla ante el proveedor.

### 9.4 `POST /api/tenant/ai/settings/verify` y `DELETE /api/tenant/ai/settings` [Nuevos]
- `POST /verify`: Ejecuta prueba en vivo contra el proveedor usando la llave cifrada almacenada del inquilino y actualiza `last_verified_at` / `status`.
- `DELETE`: Revoca lógicamente (`deleted_at = NOW()`, `status = 'revoked'`) la llave BYOK seleccionada tras confirmación mediante modal del sistema de diseño (`--dsn-*`).

### 9.5 Contratos en Backoffice SaaS `/api/admin/ai` (verificación y extensión Fase 2)
- **Llaves de plataforma y prioridad (`admin.ai_platform_keys`):**
  - `save_platform_key` con `priorityRole: 'primary' | 'secondary' | 'standby'`, `temperature` (`0.0` – `2.0`, default desde modelo o `'0.7'`) y `maxTokens` (`64` – `8192`, default desde modelo o `1000`), además de `update_platform_key_settings` (para ajustar `temperature`, `maxTokens`, `monthlyTokenCap` o `defaultModelId` sobre llave activa sin reingresar la clave), `set_platform_key_priority` (relevo atómico entre llaves activas) y `retire_platform_key`. El DTO `AdminAiPlatformKeyDto` incluye `temperature` y `maxTokens`.
- **CRUD de Proveedores LLM (`admin.ai_providers`):**
  - `create_provider`: `{ code, name, apiDialect, baseUrl, verifyPath, docsUrl, isActive, supportedModes, sortOrder, logoStorageKey? }` (valida slug único, URL válida `https://` y dialecto).
  - `update_provider`: actualiza nombre, dialecto, `baseUrl`, `verifyPath`, `docsUrl`, `isActive`, `supportedModes`, `sortOrder`, `logoStorageKey`.
  - `delete_provider`: aplica estrategia híbrida (`409 AI_RESOURCE_IN_ACTIVE_USE` si hay uso activo; soft-delete `deleted_at` si hay historial en `ai_usage_events`; `DELETE` físico si no hay referencias).
  - **Subida de logo del proveedor (`POST /api/admin/ai/providers/logo`):** Recibe `multipart/form-data` (`file` + opcional `providerId`), valida tamaño ≤ 2 MB y magic bytes (`PNG`, `JPEG`, `WebP`, `AVIF`, rechazando SVG/GIF/ejecutables), sube a SeaweedFS (`S3StorageService`) y devuelve `{ logoStorageKey, logoUrl }`.
- **CRUD de Modelos LLM (`admin.ai_models`):**
  - `create_model`: `{ providerId, modelId, displayName, contextWindow, maxOutputTokens, defaultTemperature, defaultMaxTokens, costInputMtokUsdCents, costOutputMtokUsdCents, spreadPercent, capabilities, recommendedUse, isDefault, isActive }` (validando `defaultTemperature` en `0.0..2.0` y `defaultMaxTokens` en `64..8192`). Si `isDefault = true`, desmarca cualquier otro modelo por defecto del mismo `providerId` en transacción.
  - `update_model` (reemplaza y extiende a `update_model_spread`): permite editar cualquier campo del modelo (incluidos `defaultTemperature` y `defaultMaxTokens`), activar/inactivar (`isActive`), ajustar margen comercial (`spreadPercent`) o marcarlo/desmarcarlo como `isDefault`.
  - `delete_model`: aplica la misma estrategia híbrida (`409` si está en uso activo en bots, presets o llaves activas; soft-delete con historial; `DELETE` físico sin referencias).
- **Prompts maestros y guardarraíles:** Alta/edición/promoción de `field_key` en «Biblioteca de Prompts Maestros» y configuración global de bots.

---

## 10. Especificación de UI/UX

- **Estándar visual y accesibilidad (`AGENTS.md §4.8`, `§4.15`, `§4.17`):**
  - Diseño **Mobile First**, contraste WCAG 2.2 AA, tokens `--dsn-*`.
  - Todos los `label` de formulario en formato **Title Case** sin `uppercase` CSS (ej.: «Proveedor De Inteligencia Artificial», «Modelo De Lenguaje», «Clave API Propia (BYOK)», «Temperatura De Respuesta (0.0 – 2.0)», «Límite Máximo De Tokens»).
  - Cero códigos técnicos (`GEN-02`, `ONB-10`, `AI-001`) ni jerga de arquitectura en la UI visible.
  - Diálogos de revocación de llave implementados con modal `--dsn-*` (`role="dialog"`, `aria-modal="true"`), prohibido `window.confirm`.
- **Componente reutilizable `<AiEnhanceTextarea />`:**
  - Botón «Mejorar con AI» en barra superior o pie del campo `textarea`, acompañado de estado de carga claro («Generando sugerencia...»).
  - Panel de previsualización inline o modal ligero con diff/vista previa del borrador sugerido y acciones en Title Case: «Aplicar Sugerencia», «Generar Otra Opción», «Descartar».
  - Cuando el estado sea `unavailable` (trial vencido y sin BYOK), el tooltip/alerta muestra enlace directo a «Configurar Clave API» sin bloquear el guardado manual del campo.
- **Sección «Motor De Inteligencia Artificial (BYOK)» en el Backoffice del Inquilino:**
  - Tarjeta de estado de inferencia actual:
    - En prueba con SaaS: badge neutro «Modo De Prueba Activo» + fecha de finalización + nota clara de que tras finalizar la prueba se requiere clave propia.
    - Con BYOK conectado: badge verde «Conectado Con Tu Clave Propia» + proveedor + modelo + últimos 4 dígitos (`••••1234`) + botón «Probar Conexión» + botón «Revocar Clave».
    - Sin clave y fuera de prueba: banner de advertencia con llamado directo a configurar clave propia.
  - Formulario con selector de proveedor (mostrando logo firmado `imgproxy` o monograma fallback), selector dependiente de modelos activos (preseleccionando el marcado como `isDefault`), selector de Rol De Prioridad («Predeterminado (Primario)» vs «Respaldo (Secundario)»), input `type="password"` para la clave y botón «Guardar Y Probar Conexión».
  - Internacionalización completa (`es` por defecto y `en`) mediante diccionarios i18n.
- **(Fase 2) Consola `/admin/ai` — Catálogo Dinámico y Prioridad de Sistema:**
  - Tarjetas de Proveedores LLM con botón «Agregar Proveedor LLM», acciones de «Editar» (con subida/reemplazo de logo), activar/inactivar y «Eliminar» (con `ConfirmationModal --dsn-*`), mostrando la imagen del logo cargada vía `imgproxy`.
  - Tabla y Modal de Modelos LLM con botón «Agregar Modelo», badge «Por Defecto» cuando `isDefault = true`, campos **«Temperatura De Respuesta (0.0 – 2.0)»** (`type="number"`, `step="0.1"`, `min="0"`, `max="2"`) y **«Límite Máximo De Tokens»** (`type="number"`, `min="64"`, `max="8192"`), y acciones completas para editar ficha/spread, activar/inactivar, establecer como «Modelo Por Defecto» y eliminar con `ConfirmationModal --dsn-*`. La tabla «Catálogo De Modelos LLM y Spread Comercial» incluye:
    - **Barra de filtros client-side:** búsqueda por nombre o identificador del modelo, filtro por Proveedor LLM, filtro por Estado (`Todos`, `Activos`, `Inactivos`), toggle «Solo Por Defecto» y botón «Limpiar Filtros».
    - **Ordenamiento por columnas:** clic en cabeceras `Modelo`, `Proveedor`, `Ventana Contexto`, `Spread Comercial`, `Precio Al Inquilino` y `Estado`, con orden inicial por Proveedor y Modelo Por Defecto.
    - **Paginación y densidad:** tamaño por defecto de `10` filas con selector (`5`, `10`, `25`, `50`), contador «Mostrando X–Y de Z modelos» y navegación Anterior/Siguiente con ajuste automático al filtrar o eliminar.
    - **Mobile First:** en pantallas `< md` las filas se muestran como tarjetas apiladas legibles sin scroll horizontal y pasan a tabla completa en `md+`.
  - Sección de Llaves De Prueba De Plataforma con selector de Rol De Prioridad («Predeterminado Del Sistema (Primario)» vs «Secundario De Respaldo»), los inputs **«Temperatura De Respuesta (0.0 – 2.0)»** y **«Límite Máximo De Tokens»** (pre-cargados automáticamente al cambiar de modelo), y tarjetas de credenciales registradas mostrando sus parámetros activos, permitiendo mantener ambas credenciales activas simultáneamente.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Motor real de inferencia AI, BYOK y «Mejorar con AI»

  Escenario: Inquilino en periodo de prueba usa «Mejorar con AI» con llave de plataforma real
    Dado que el comercio "Tienda Norte" está en onboarding o tiene suscripción con estado "trialing" vigente
    Y no ha configurado una API Key propia (BYOK)
    Y el administrador SaaS tiene configurada una llave activa para pruebas y un prompt maestro activo para "product.description"
    Cuando el propietario escribe "Zapatos cuero negro casual" y pulsa "Mejorar con AI"
    Entonces el sistema ejecuta POST "/api/ai/enhance" usando el prompt maestro activo y la llave de plataforma
    Y registra el evento en "ai_usage_events" con mode "mocter" y purpose "trial"
    Y muestra la sugerencia generada sin modificar el valor del campo hasta que el usuario pulse "Aplicar Sugerencia"

  Escenario: Inquilino registra, verifica y usa su propia API Key BYOK
    Dado que un propietario autenticado ingresa a la configuración de motor AI de su comercio
    Cuando selecciona el proveedor "OpenAI", el modelo "gpt-4o-mini", ingresa su clave válida y pulsa "Guardar Y Probar Conexión"
    Entonces el backend verifica la clave contra la API del proveedor y obtiene respuesta exitosa
    Y almacena la clave cifrada con AES-256-GCM en "admin.tenant_ai_providers" conservando solo "api_key_last4"
    Y al invocar "Mejorar con AI" posteriormente utiliza obligatoriamente su clave BYOK registrando mode "byok" y purpose "assist"

  Escenario: La AI propone y el usuario descarta la sugerencia sin alterar su borrador
    Dado que el usuario recibió una sugerencia de "Mejorar con AI" para la descripción del producto
    Cuando pulsa "Descartar"
    Entonces el contenido original redactado en el textarea permanece intacto y no se ejecuta ningún guardado automático
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de solicitud de mejora con campo vacío o key no permitida
    Dado que un usuario autenticado invoca POST "/api/ai/enhance" con "fieldKey" inexistente o "draft" vacío mayormente de espacios
    Cuando el backend valida el payload con Zod
    Entonces responde con código HTTP 400 y estructura RFC 9457 "application/problem+json" indicando el campo inválido
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo controlado cuando el periodo de prueba expiró y no existe BYOK
    Dado que el comercio "Tienda Sur" tiene plan pago activo sin API Key BYOK registrada y su trial ya expiró
    Cuando el usuario pulsa "Mejorar con AI" en cualquier formulario
    Entonces el servidor responde HTTP 422 con código "AI_BYOK_REQUIRED"
    Y la interfaz muestra un mensaje claro indicando que el plan no incluye inferencia y ofrece un enlace directo para registrar su clave API propia

  Escenario: Llave BYOK ingresada es rechazada por el proveedor externo
    Dado que un propietario intenta guardar una API Key con formato válido pero revocada ante Anthropic
    Cuando el sistema ejecuta la verificación en tiempo real contra el proveedor
    Entonces responde HTTP 422 con código "AI_KEY_VERIFICATION_FAILED"
    Y no habilita la credencial como activa
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Un colaborador (tenancy_users) no puede leer ni modificar llaves BYOK de la empresa
    Dado que un usuario con rol "tenant_agent" está autenticado en el Backoffice del comercio
    Cuando intenta acceder a GET "/api/tenant/ai/settings" o PUT "/api/tenant/ai/settings"
    Entonces el backend responde HTTP 403 Forbidden sin exponer "api_key_last4" ni configuración de credenciales

  Escenario: Aislamiento estricto de credenciales y logs sin filtración de secretos
    Dado que un inquilino A guarda su API Key BYOK "sk-secret-value-9999"
    Cuando se inspeccionan los logs Pino generados y los registros devueltos por la API para el inquilino A o el inquilino B
    Entonces la cadena secreta completa jamás aparece en logs ni en payloads JSON de respuesta
    Y el inquilino B nunca puede resolver ni usar la credencial del inquilino A
```

### (e) Escenarios de borde

```gherkin
  Escenario: Control de tasa (rate limiting) en modo trial ante múltiples clics consecutivos
    Dado que un inquilino en periodo de prueba excede el límite por minuto configurado en guardarraíles globales
    Cuando invoca nuevamente POST "/api/ai/enhance"
    Entonces recibe HTTP 429 Too Many Requests con cabecera "Retry-After"
    Y no envía la petición al proveedor LLM externo

  Escenario: Alta de nuevo proveedor LLM compatible con logo y modelo por defecto desde /admin/ai
    Dado que un "platform_admin" accede a "/admin/ai" → "Proveedores Y Modelos LLM"
    Cuando carga un logo PNG válido, crea el proveedor "groq" con dialecto "openai_compatible" y baseUrl "https://api.groq.com/openai/v1"
    Y registra el modelo "llama-3.3-70b-versatile" marcado como "isDefault = true"
    Entonces el logo se almacena en SeaweedFS y se sirve firmado por imgproxy
    Y el nuevo proveedor y su modelo por defecto quedan disponibles en los selectores de plataforma y BYOK sin cambios en código

  Escenario: Failover automático de configuración Primaria a Secundaria ante indisponibilidad
    Dado que existen una configuración "primary" (OpenAI) y una configuración "secondary" (Google AI) activas
    Cuando una llamada a POST "/api/ai/enhance" falla en el proveedor primario por timeout o HTTP 503/429
    Entonces el motor conmuta automáticamente en la misma petición al proveedor secundario activo
    Y responde HTTP 200 al usuario auditando ambos intentos y "failoverUsed: true"

  Escenario: Bloqueo de eliminación de proveedor o modelo con referencias activas
    Dado que el proveedor "openai" posee una credencial BYOK o llave de plataforma activa asociada
    Cuando el operador intenta eliminar el proveedor desde "/admin/ai" y confirma en el modal
    Entonces el backend responde HTTP 409 Conflict con código "AI_RESOURCE_IN_ACTIVE_USE" sin borrar registros activos
```

---

## 12. Requisitos no funcionales

- **Observabilidad (`AGENTS.md §4.13`):** Logs JSON con Pino correlacionados por `requestId` (`x-request-id`), redacción automática de campos `apiKey`, `authorization`, `x-api-key`, `apiKeyCiphertext`. Auditoría asíncrona no bloqueante mediante `after()`.
- **Rendimiento:** Timeout estricto de `15s` para generación `/api/ai/enhance` y `8s` para `/verify`; soporte de `AbortController` ante cancelación del cliente.
- **Seguridad:** Cifrado autenticado AES-256-GCM con IV único de 12 bytes y tag de autenticación por registro; clave maestra inyectada exclusivamente vía `env.ts` (`@t3-oss/env-nextjs`).
- **Tolerancia a fallos:** Excepciones controladas mediante patrón `Result<T, DomainError>` en `@mocter/domain` y `handle()` RFC 9457 en Route Handlers (`AGENTS.md §4.14`).

---

## 13. Dependencias y riesgos

- **Dependencias:** `AI-001` (esquema `ai_assist_*`), `env.ts` para `AI_ENCRYPTION_KEY`, disponibilidad de al menos una API Key de plataforma activa registrada por el administrador SaaS en `/admin/ai` para habilitar pruebas de onboarding/trial.
- **Riesgos:**
  - *Abuso de cuota gratuita en `trial`:* Mitigado con `rateLimitMaxPerMinute`, límite máximo de `outputTokens` en guardarraíles globales y tope por comercio/día en `ai_usage_events`.
  - *Cambios de API de proveedores externos:* Mitigado encapsulando el adaptador HTTP por proveedor bajo `IAiAssistModelClient` y `ILlmProviderAdapter`.

---

## 14. Definition of Done

- [ ] Eliminado `export const POST = createEnhanceRouteHandler({} as any)` y conectado al contenedor/fábrica real con repositorio Drizzle, cifrador y cliente LLM multi-proveedor.
- [ ] Eliminados todos los `setTimeout` simulados de «Mejorar con AI» en `apps/admin`.
- [ ] Creada/validada la UI BYOK en el Backoffice del Inquilino (en `es` y `en`, Mobile First, Title Case en labels, modales `--dsn-*`).
- [ ] Verificada en `/admin/ai` la configuración real de llave de plataforma para trial y biblioteca de prompts maestros.
- [ ] Pruebas unitarias y de integración (`vitest`) pasando: precedencia BYOK vs Trial vs Bloqueo, cifrado/descifrado, RFC 9457 y RBAC (`tenant_agent` → `403`).
- [ ] `pnpm lint`, `pnpm test` y `pnpm --filter @mocter/domain exec drizzle-kit check` en verde.
- [ ] Protocolo obligatorio de compilación, reinicio Docker y healthcheck HTTP 200 ejecutado (`AGENTS.md §4.18`).
- [ ] **(Fase 2)** Eliminado `CHECK` estático de códigos en `admin.ai_providers` y habilitado `LlmHttpProviderClient` dinámico por `(apiDialect, baseUrl, verifyPath)`.
- [ ] **(Fase 2)** CRUD completo de Proveedores LLM en `/admin/ai` con cargue/reemplazo de logo en SeaweedFS + `imgproxy` visible en `/admin/ai` y `/workspace/ai`.
- [ ] **(Fase 2)** CRUD completo de Modelos LLM en `/admin/ai` con unicidad `is_default` por proveedor y semilla completa para todos los proveedores base (`openrouter` y `together_ai` incluidos).
- [ ] **(Fase 2)** Soporte de par **Primario (Predeterminado)** y **Secundario (Respaldo)** con failover automático tanto en plataforma (`/admin/ai`) como en BYOK (`/workspace/ai`).
- [ ] **(Fase 2)** Eliminación híbrida (`409` en uso activo / soft-delete con historial / hard-delete sin referencias) mediante `ConfirmationModal` `--dsn-*`.
- [x] **(Fase 2)** Tabla «Catálogo De Modelos LLM y Spread Comercial» en `/admin/ai` con búsqueda, filtros por proveedor/estado/por defecto, ordenamiento por columnas, paginación y presentación Mobile First (`T-17`).

---

## 15. Propuestas a Validar (PV-xx)

No existen preguntas abiertas para esta especificación. Las políticas de negocio aplicables quedaron cerradas por confirmación explícita del producto: inferencia SaaS exclusiva durante `onboarding`/`trial`, BYOK obligatorio posterior sin planes con inferencia incluida.

