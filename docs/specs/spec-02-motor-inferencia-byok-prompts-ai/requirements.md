# SPEC-02 · Motor Real de Inferencia AI, BYOK en Inquilinos y Gobernanza de Prompts Maestros

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-02` |
| **Nombre** | Motor Real de Inferencia AI, BYOK en Inquilinos y Gobernanza de Prompts Maestros |
| **Tipo de intervención** | Remediación de defecto crítico + Nuevo desarrollo de integración |
| **Prioridad** | P0 — Crítica (habilitante de Onboarding y asistencia transversal) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
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
| `platform_owner` / `platform_admin` | Leer en texto plano la API Key BYOK de un inquilino | No | La llave se almacena cifrada (AES-256-GCM / KMS); solo visible último 4 dígitos |

---

## 7. Modelo de datos

Se reutilizan las tablas ya existentes en `packages/domain/src/db/schemas/admin/bot-catalog.ts`, `bot-tenancy.ts` y `ai-assist.ts`, con las siguientes precisiones y ajustes normativos:

### 7.1 `admin.tenant_ai_providers` (existente en `bot-tenancy.ts`)
- `id`: `UUID` PK.
- `client_id`: `UUID` FK → `admin.clients.id`, obligatorio (`NOT NULL`), indexado para aislamiento estricto por inquilino.
- `provider_id`: `UUID` FK → `admin.ai_providers.id`, obligatorio.
- `api_key_ciphertext`: `TEXT`, obligatorio. Cifrado autenticado AES-256-GCM usando llave maestra de entorno declarada en `@t3-oss/env-nextjs`.
- `api_key_key_id`: `VARCHAR(64)`, obligatorio. Identificador de versión de llave de cifrado para permitir rotación sin downtime.
- `api_key_last4`: `VARCHAR(8)`, obligatorio. Única representación retornable a UI.
- `status`: `VARCHAR(32)` (`'active' | 'invalid' | 'revoked'`), obligatorio, default `'active'`.
- `last_verified_at`: `TIMESTAMPTZ` (nullable). **[Nuevo campo requerido para registrar última prueba real contra el proveedor]**.
- `last_verification_error`: `TEXT` (nullable). **[Nuevo campo sanitario — sin incluir secretos]**.
- `deleted_at`: `TIMESTAMPTZ` (nullable) para eliminación lógica y preservación de auditoría.
- **Estrategia de eliminación:** Lógica (`deleted_at` + `status = 'revoked'`) conservando trazabilidad en `ai_usage_events`; nunca se retorna en consultas de llaves activas.

### 7.2 `admin.tenant_model_settings` (existente en `bot-tenancy.ts`)
- `client_id`: `UUID` FK → `admin.clients.id`, único por inquilino cuando corresponde a configuración principal (`setting_scope IN ('bot', 'assist')` o default unificado).
- `provider_id`: `UUID` FK → `admin.ai_providers.id`.
- `model_id`: `UUID` FK → `admin.ai_models.id`.
- `temperature`, `max_tokens`, `top_p`: respetan topes máximos definidos en «Parámetros Globales y Guardarraíl» (`/admin/ai`).

### 7.3 `admin.ai_platform_keys` (existente en `bot-tenancy.ts`)
- Almacena cifradas las API Keys operativas de la SaaS para inferencia exclusivamente en `onboarding` o `trial`.
- Columnas mínimas operativas: `id`, `provider_id`, `model_id` (opcional/default de plataforma), `api_key_ciphertext`, `api_key_key_id`, `api_key_last4`, `is_active` (`BOOLEAN`), `monthly_token_cap` (`BIGINT` para proteger cuota de prueba de la SaaS), `updated_at`.
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
- **Response `200 OK`:** Lista de proveedores habilitados en `admin.ai_providers` con sus `ai_models` activos, estado actual BYOK del comercio (`hasByok`, `providerId`, `modelId`, `apiKeyLast4`, `status`, `lastVerifiedAt`), y estado de excepción trial (`isTrialActive`, `trialEndsAt`, `inferenceSource: 'byok' | 'platform_trial' | 'unavailable'`).

### 9.3 `PUT /api/tenant/ai/settings` [Nuevo]
- **Autenticación:** `tenancy_owner`.
- **Request JSON:** `{ "providerId": "uuid", "modelId": "uuid", "apiKey": "sk-...", "verifyImmediately": true }`. (`apiKey` opcional si solo se cambia de modelo dentro del mismo proveedor ya guardado).
- **Comportamiento:** Cifra `apiKey`, persiste en `admin.tenant_ai_providers` + `admin.tenant_model_settings`, ejecuta verificación real si `verifyImmediately = true` (o al pulsar probar), invalida/actualiza caché y registra auditoría en `admin.audit_log`.
- **Errores:** `422 AI_KEY_VERIFICATION_FAILED` si la verificación inmediata falla ante el proveedor.

### 9.4 `POST /api/tenant/ai/settings/verify` y `DELETE /api/tenant/ai/settings` [Nuevos]
- `POST /verify`: Ejecuta prueba en vivo contra el proveedor usando la llave cifrada almacenada del inquilino y actualiza `last_verified_at` / `status`.
- `DELETE`: Revoca lógicamente (`deleted_at = NOW()`, `status = 'revoked'`) la llave BYOK actual tras confirmación mediante modal del sistema de diseño (`--dsn-*`).

### 9.5 Contratos en Backoffice SaaS `/api/admin/ai` (verificación y extensión)
- Confirmar soporte completo de creación/rotación/activación de `admin.ai_platform_keys` (llave de plataforma para periodo de prueba) desde la pestaña «Proveedores y Modelos LLM» en `/admin/ai` (`apps/admin/app/admin/ai/ai-governance-view.tsx`) y alta/edición de los `field_key` requeridos en «Biblioteca de Prompts Maestros».

---

## 10. Especificación de UI/UX

- **Estándar visual y accesibilidad (`AGENTS.md §4.8`, `§4.15`, `§4.17`):**
  - Diseño **Mobile First**, contraste WCAG 2.2 AA, tokens `--dsn-*`.
  - Todos los `label` de formulario en formato **Title Case** sin `uppercase` CSS (ej.: «Proveedor De Inteligencia Artificial», «Modelo De Lenguaje», «Clave API Propia (BYOK)»).
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
  - Formulario con selector de proveedor, selector dependiente de modelos activos, input `type="password"` para la clave (con toggle de visibilidad solo mientras se escribe antes de guardar) y botón «Guardar Y Probar Conexión».
  - Internacionalización completa (`es` por defecto y `en`) mediante diccionarios i18n.

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

---

## 15. Propuestas a Validar (PV-xx)

No existen preguntas abiertas para esta especificación. Las políticas de negocio aplicables quedaron cerradas por confirmación explícita del producto: inferencia SaaS exclusiva durante `onboarding`/`trial`, BYOK obligatorio posterior sin planes con inferencia incluida.

