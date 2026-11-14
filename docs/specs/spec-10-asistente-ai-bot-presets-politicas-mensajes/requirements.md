# SPEC-10 · Asistente AI y Bot: Objetivo, Presets Reales, Políticas Completas, 6 Mensajes Clave y Etiquetas Chatwoot

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-10` |
| **Nombre** | Asistente AI y Bot: Objetivo, Presets Reales, Políticas Comerciales, 6 Mensajes Clave y Etiquetas Chatwoot |
| **Tipo de intervención** | Unificación arquitectónica + Remediación funcional de Onboarding/Backoffice |
| **Prioridad** | P0 — Crítica (núcleo de automatización comercial y sincronización Onboarding ↔ Backoffice) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `AIB-01`, `AIB-02`, `AIB-03`, `ONB-11` |
| **Specs previas relacionadas** | `BOT-001`, `BOT-002`, `AI-001`, `CHW-002`, `TNT-001` |
| **Specs integradas / dependientes** | `SPEC-02` (motor real BYOK/Trial y «Mejorar con AI» para políticas y 6 mensajes), `SPEC-05` (idioma por defecto y canales de pago informados al bot), `SPEC-06` (Paso 4 de Onboarding parametriza este mismo bot e inicializa etiquetas Chatwoot), `SPEC-08` (`bot_master_prompt` de cada producto), `SPEC-17` (`AIB-04` botón de guardado en pie de página / estado dirty) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

El examen del esquema (`admin.tenant_bots`, `admin.bot_presets`, `admin.bot_tones`, `cell_client_business_info`) y de la implementación UI/API (`apps/admin/app/workspace/bot/bot-view.tsx`, `apps/admin/app/api/tenant/bot/route.ts`) demuestra una fractura severa entre el modelo diseñado y lo que opera en el Backoffice y el Onboarding:

1. **Catálogos de Personalidad/Tono hardcodeados y desconexión con `admin.tenant_bots` (`AIB-01`, `ONB-11`):**
   - `bot-view.tsx` (líneas 12–33) define un arreglo estático `PRESETS` en el componente cliente y `apps/admin/app/api/tenant/bot/route.ts` únicamente lee y actualiza `cell_client_business_info.bot_preset`, ignorando por completo las tablas reales **`admin.tenant_bots`** (`objective`, `presetId`, `toneId`, `persona`, `instructions`, `allowedTopics`, `excludedTopics`, `handoffTriggers`, `responseLanguage`, `answerPolicy`, `maxMessagesPerContact`), **`admin.bot_presets`** y **`admin.bot_tones`**.
   - Asimismo, falta la parametrización rápida de **Objetivo del Bot** y **Preset de Personalidad y Tono** sincronizada bidireccionalmente entre el **Paso 4 del Onboarding (`ONB-11`)** y `/workspace/bot`.
2. **Etiquetas predeterminadas de Chatwoot sin inicialización automática (`ONB-11`):**
   - Aunque existe `cell_tenant_labels`, el alta/onboarding de un comercio no garantiza de oficio la creación y sincronización idempotente del juego estándar de etiquetas operativas en Chatwoot y la celda.
3. **Políticas comerciales incompletas (`AIB-02`):**
   - `PUT /api/tenant/bot` y `bot-view.tsx` aceptan `returnsPolicy` y `warrantyPolicy`, pero **omiten `shippingPolicy` (política de envíos)** aunque la columna existe en `cell_client_business_info.shipping_policy`. Tampoco ofrecen asistencia AI homogénea en todas las políticas y FAQs.
4. **Mensajes operativos limitados a un único campo plano (`AIB-03`, `PV-03` aprobada):**
   - Solo existe `orderMessage` como texto simple; faltan los **6 mensajes clave predeterminados asistidos por AI**:
     1. Mensaje de Bienvenida (`welcome_message`)
     2. Confirmación de Pedido e Instrucciones de Pago (`order_confirmation_message`)
     3. Notificación de Despacho y Guía (`dispatch_tracking_message`)
     4. Novedad en Entrega (`delivery_issue_message`)
     5. Fuera de Horario / Ausencia (`out_of_hours_message`)
     6. Transferencia a Asesor Humano / Handoff (`handoff_message`)

---

## 4. Objetivo y valor de negocio

Consolidar una **única fuente de verdad operativa del Asistente AI** entre Onboarding Paso 4, `/workspace/bot` y el motor conversacional en runtime (`BotEngine` / `PromptComposer`):
- Exponer catálogo dinámico real de **Objetivos, Presets de Personalidad y Tonos** administrados en el sistema (`admin.bot_presets` / `admin.bot_tones`), editables desde Onboarding Paso 4 y `/workspace/bot`.
- Completar las políticas comerciales (Devoluciones, Garantía, **Envíos** y FAQs).
- Gestionar los **6 mensajes predeterminados clave** con variables dinámicas interpolables, previsualización y botón real «Mejorar Con AI» (`SPEC-02`).
- Garantizar desde Onboarding (e idempotencia en `/workspace/bot`) las **etiquetas predeterminadas de Chatwoot** listas para segmentación automática.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Unificación de `BotService` + `TenantWorkspaceService` sobre `admin.tenant_bots` + `cell_client_business_info` + `admin.tenant_bot_messages` (o estructura `JSONB` tipada `default_messages` en `admin.tenant_bots` / tabla dedicada `admin.tenant_bot_templates`).
- Soporte completo en `GET / PUT /api/tenant/bot` de:
  - Configuración core (`admin.tenant_bots`): `name`, `objective`, `presetId`, `toneId`, `persona`, `instructions`, `allowedTopics`, `excludedTopics`, `handoffTriggers`, `responseLanguage`, `answerPolicy`, `maxTurns`, `maxMessagesPerContact`, `isActive`.
  - **6 mensajes clave** con texto i18n/editable, estado activo/inactivo y marcadores (`{{customer_name}}`, `{{order_number}}`, `{{payment_instructions}}`, `{{carrier_name}}`, `{{tracking_code}}`, `{{business_name}}`).
  - **Políticas y FAQs** (`cell_client_business_info`): `returnsPolicy`, `warrantyPolicy`, **`shippingPolicy`**, `faqs[]` y horarios de atención (`businessHours`) para el disparador del mensaje fuera de horario.
- Creación de servicio idempotente `ensureDefaultChatwootLabels(clientId)` ejecutado al guardar Onboarding Paso 4 (`SPEC-06`) y consultable en `/workspace/bot`.
- Rediseño limpio de `apps/admin/app/workspace/bot/bot-view.tsx` reemplazando `PRESETS` hardcoded por catálogo real retornado desde la API, añadiendo la pestaña/bloque de **Políticas De Devolución, Garantía Y Envíos**, y los **6 Mensajes Clave** cada uno conectado a `<AiEnhanceTextarea />` (`SPEC-02`).

### Fuera de alcance
- Configuración de claves API BYOK del proveedor LLM (vive en `SPEC-02` `/workspace/ai`, aunque `/workspace/bot` muestra el estado del motor con link directo).
- Lógica del iframe operativo de Chatwoot (vive en `SPEC-13`).
- El diseño de botones de guardado en parte superior/inferior y alertas de cambios sin guardar (pertenece transversalmente a `SPEC-17` `AIB-04`, cuyo contrato adopta esta vista).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Consultar y modificar objetivo, preset, tono, guardarraíles, políticas, FAQs, horarios y 6 mensajes clave | Sí | Solo de su `client_id` |
| `tenancy_users` (`tenant_agent`) | Consultar configuración del bot para conocer sus reglas y mensajes | Sí | Solo lectura en UI (`GET /api/tenant/bot`) |
| `tenancy_users` (`tenant_agent`) | Modificar comportamiento del bot, políticas o mensajes | No | Bloqueado (`403 Forbidden`) |
| `platform_owner` / `platform_admin` | Administrar el catálogo global `admin.bot_presets`, `admin.bot_tones` y defaults | Sí | Backoffice SaaS |

---

## 7. Modelo de datos

### 7.1 `admin.tenant_bots` (extensión en `packages/domain/src/db/schemas/admin/bot-tenancy.ts`)
- Reutiliza columnas existentes: `id`, `clientId`, `name`, `objective`, `toneId`, `presetId`, `status` (`'active' | 'paused'`), `revision`, `persona`, `instructions`, `allowedTopics`, `excludedTopics`, `handoffTriggers`, `maxTurns`, `greetingMessage` (mapeado o sincronizado con `welcome_message`), `fallbackMessage`, `responseLanguage`, `answerPolicy`, `maxMessagesPerContact`.
- Agregar columnas estructuradas con comentarios SQL:
  - `default_messages`: `JSONB` `TenantBotDefaultMessages` tipado con las 6 claves obligatorias (`welcome`, `order_confirmation`, `dispatch_tracking`, `delivery_issue`, `out_of_hours`, `handoff`), cada una con `{ body: string; enabled: boolean; updatedAt: string }`.
  - `business_hours`: `JSONB` `{ timezone: string; enabled: boolean; schedule: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', { open: string; close: string; closed: boolean }> }` para evaluar cuándo aplicar `out_of_hours`.
- Incremento automático de `revision` al actualizar configuración para trazabilidad de prompts compuestos.

### 7.2 `cell_client_business_info` (en `pg-cell-XX` — `tenancy-catalog.ts`)
- Garantizar exposición y actualización de `returns_policy`, `warranty_policy`, **`shipping_policy`**, `faqs` (`Array<{ question: string; answer: string }>`), `order_message` (sincronizado con `default_messages.order_confirmation.body`) y `bot_preset` (código sincronizado con `preset_id`).

### 7.3 `cell_tenant_labels` (etiquetas predeterminadas Chatwoot `ONB-11`)
- Set estándar creado automáticamente por `ensureDefaultChatwootLabels(clientId)` (si no existen ya para el comercio):
  1. `nuevo_pedido` («Nuevo Pedido», `#2563EB`)
  2. `pendiente_pago` («Pendiente De Pago», `#D97706`)
  3. `pagado` («Pagado», `#16A34A`)
  4. `despachado` («Despachado», `#0EA5E9`)
  5. `soporte_humano` («Requiere Asesor», `#DC2626`)
  6. `cliente_recurrente` («Cliente Recurrente», `#7C3AED`)
- Sincronización asíncrona con la API de la cuenta Chatwoot vinculada (`admin.chatwoot_accounts`) mediante `after()` sin poner en riesgo ni alterar la provisión administrativa (`GEN-04`).

---

## 8. Reglas de negocio

- **RN-SPEC-10-01 (Fuente única de verdad Onboarding Paso 4 ↔ `/workspace/bot`):** Tanto el Paso 4 del Onboarding (`SPEC-06`) como `/workspace/bot` consumen los catálogos activos de `admin.bot_presets` y `admin.bot_tones` y persisten en la misma fila de `admin.tenant_bots` (`objective`, `presetId`, `toneId`, `defaultMessages.order_confirmation`). Queda prohibido definir presets hardcoded en archivos React.
- **RN-SPEC-10-02 (Catálogo obligatorio de 6 mensajes clave asistidos por AI `AIB-03`):** Todo comercio inicia (tras semillas de onboarding/alta) con los 6 mensajes clave inicializados en su idioma activo (`clients.locale`) redactados de forma profesional. Cada uno puede personalizarse libremente y mejorarse con «Mejorar Con AI» (`SPEC-02`), validando variables permitidas y longitud (`<= 2,000` chars).
- **RN-SPEC-10-03 (Políticas comerciales íntegras `AIB-02`):** El bloque de políticas expone obligatoriamente **Devoluciones Y Cambios**, **Garantía**, **Envíos Y Tiempos De Entrega** y **Preguntas Frecuentes (FAQs)**, permitiendo redactarlas o mejorarlas con AI sin exigir que todas sean obligatorias en el día 1 (`AGENTS.md §4.9`), pero inyectándose automáticamente en el contexto del bot cuando existan.
- **RN-SPEC-10-04 (Etiquetas predeterminadas de Chatwoot desde Onboarding `ONB-11`):** Al completar el Paso 4 de Onboarding (o si un comercio antiguo abre por primera vez `/workspace/bot` sin etiquetas), el sistema crea de forma idempotente las 6 etiquetas predeterminadas en `cell_tenant_labels` y programa su creación en Chatwoot (`after()`) cuando la cuenta Chatwoot esté provisionada.
- **RN-SPEC-10-05 (Seguridad y guardarraíles del bot `AIB-01`):** El comercio puede definir `allowedTopics`, `excludedTopics` (temas prohibidos sobre los cuales el bot nunca debe opinar ni prometer) y `handoffTriggers` (condiciones en que escala a un asesor humano y dispara el mensaje `handoff`), además de `responseLanguage` (`auto_by_client` | `'es'` | `'en'`) y `maxMessagesPerContact`.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/bot` (Refactorización real)
- **Autenticación:** `tenancy_owner` o `tenant_agent` (lectura).
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "bot": {
        "id": "uuid",
        "name": "Asistente Tienda Andes",
        "status": "active",
        "revision": 3,
        "objective": "sales_and_order_capture",
        "presetId": "uuid",
        "toneId": "uuid",
        "persona": "...",
        "instructions": "...",
        "allowedTopics": ["catálogo", "envíos"],
        "excludedTopics": ["política", "competencia"],
        "handoffTriggers": ["reclamo grave", "solicitud factura electrónica"],
        "responseLanguage": "es",
        "maxMessagesPerContact": 30,
        "defaultMessages": {
          "welcome": { "body": "...", "enabled": true },
          "order_confirmation": { "body": "...", "enabled": true },
          "dispatch_tracking": { "body": "...", "enabled": true },
          "delivery_issue": { "body": "...", "enabled": true },
          "out_of_hours": { "body": "...", "enabled": true },
          "handoff": { "body": "...", "enabled": true }
        },
        "businessHours": { "enabled": false, "timezone": "America/Bogota", "schedule": {} }
      },
      "policies": {
        "returnsPolicy": "...",
        "warrantyPolicy": "...",
        "shippingPolicy": "...",
        "faqs": [{ "question": "...", "answer": "..." }]
      },
      "catalog": {
        "objectives": [ { "code": "sales_and_order_capture", "label": { "es": "Vender Y Capturar Pedidos", "en": "Sell And Capture Orders" } } ],
        "presets": [ ... ],
        "tones": [ ... ]
      },
      "defaultLabelsInitialized": true
    }
  }
  ```

### 9.2 `PUT /api/tenant/bot`
- **Autenticación:** Exclusivo `tenancy_owner` (`403` para `tenant_agent`).
- **Validación:** Zod integral, `handle()` RFC 9457 (prohibido exponer `error.message` crudo como `detail`), incremento de `revision` en `admin.tenant_bots`, actualización sincronizada en `cell_client_business_info`, registro de auditoría en `admin.audit_log`.

---

## 10. Especificación de UI/UX

- **Vista `/workspace/bot` (`apps/admin/app/workspace/bot/bot-view.tsx`):**
  - Organización por pestañas o acordeones claros Mobile First:
    1. **Identidad Y Objetivo (`AIB-01`):** Nombre Del Asistente, Estado (`Activo` / `Pausado`), Objetivo Principal, Selector Visual De Preset De Personalidad (cards dinámicas desde BD), Selector De Tono, Personalidad Libre + Instrucciones (con `<AiEnhanceTextarea />`), Temas Permitidos / Excluidos y Disparadores De Transferencia A Humano.
    2. **Políticas Y Preguntas Frecuentes (`AIB-02`):** Política De Devoluciones, Política De Garantía, **Política De Envíos**, y lista dinámica Agregar/Editar/Eliminar FAQs (confirmación de borrado si aplica mediante modal `--dsn-*`), cada textarea con «Mejorar Con AI».
    3. **Mensajes Clave Automáticos (`AIB-03`):** Tarjetas para los **6 mensajes predeterminados** con interruptor activar/pausar, chips clickeables de variables insertables (`{{nombre_cliente}}`, `{{numero_pedido}}`, etc.), editor `<AiEnhanceTextarea />` conectado al prompt maestro del mensaje (`SPEC-02`) y horario comercial para `Fuera de Horario`.
  - Labels estrictos en Title Case (corrigiendo e internacionalizando todos los textos en `es`/`en`).
  - Acciones de guardado alineadas con `SPEC-17` (`AIB-04` barra sticky/pie + superior cuando hay cambios pendientes).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Configuración unificada del Asistente AI, políticas y 6 mensajes clave

  Escenario: Propietario configura objetivo, preset desde BD, política de envíos y los 6 mensajes clave
    Dado que el propietario autenticado abre "/workspace/bot"
    Y el catálogo real de BD contiene el preset "Vendedor Consultivo" y tono "Cercano Profesional"
    Cuando selecciona dicho objetivo, preset y tono, redacta la política de envíos y mejora con AI el mensaje de "Notificación De Despacho Y Guía"
    Y guarda la configuración mediante PUT "/api/tenant/bot"
    Entonces el sistema actualiza "admin.tenant_bots" incrementando "revision" y sincroniza "cell_client_business_info.shipping_policy"
    Y al recargar "/workspace/bot" persisten todos los cambios sin valores hardcoded

  Escenario: Inicialización idempotente de etiquetas predeterminadas de Chatwoot al completar Onboarding
    Dado que un comercio nuevo finaliza el Paso 4 de Onboarding configurando su objetivo y preset de bot
    Cuando se consulta "cell_tenant_labels" de su celda
    Entonces existen exactamente las 6 etiquetas predeterminadas ("nuevo_pedido", "pendiente_pago", "pagado", "despachado", "soporte_humano", "cliente_recurrente") sin duplicados si se reejecuta
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de preset o tono inexistente o mensaje superior a longitud permitida
    Dado que se envía PUT "/api/tenant/bot" con un "presetId" inválido o un mensaje de bienvenida mayor a 2.000 caracteres
    Cuando el servidor valida el payload
    Entonces responde HTTP 400 Problem Details sin revelar detalles internos de excepción
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Intento de guardar FAQ con pregunta o respuesta vacía
    Dado que el propietario agrega una fila de FAQ dejando vacía la respuesta
    Cuando intenta guardar cambios en "/workspace/bot"
    Entonces el backend rechaza la solicitud con HTTP 400 o 422 indicando qué pregunta frecuente está incompleta
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Agente del comercio puede consultar las reglas del bot pero no modificarlas
    Dado que un usuario "tenant_agent" realiza GET "/api/tenant/bot" y luego intenta PUT "/api/tenant/bot"
    Cuando el backend verifica permisos
    Entonces GET responde HTTP 200 (solo lectura) y PUT responde HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Migración limpia de comercios existentes que solo tenían order_message plano previo
    Dado que un comercio preexistente tenía texto en "cell_client_business_info.order_message" pero "admin.tenant_bots.default_messages" nulo
    Cuando abre "/workspace/bot" o invoca GET "/api/tenant/bot"
    Entonces el sistema hidrata "default_messages.order_confirmation" con su texto previo e inicializa los 5 mensajes restantes con plantillas predeterminadas en su idioma sin pérdida de datos
```

---

## 12. Requisitos no funcionales

- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.bot.config_updated`, `tenant.chatwoot.labels_bootstrapped` con `requestId`, `clientId`, `revision`.
- **Seguridad (`AGENTS.md §4.14`):** Wrapper `handle()` con respuestas Problem Details limpias (reemplazando la filtración `detail: msg` de las líneas 40 y 83 de `apps/admin/app/api/tenant/bot/route.ts`).
- **Tolerancia a fallos en sincronía Chatwoot:** Si la API externa de Chatwoot está temporalmente lenta, el envío de etiquetas ocurre de forma no bloqueante en `after()` conservando el registro en `cell_tenant_labels` para reintento seguro.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-02` (AI enhance y prompts maestros por cada mensaje/política), `SPEC-05` (idioma y canales de pago), `SPEC-06` (Paso 4 de Onboarding), `SPEC-17` (botón de guardado al final `AIB-04`).
- **Riesgos:**
  - *Desfase entre `cell_client_business_info` y `admin.tenant_bots`:* Mitigado haciendo de `BotService` el único servicio escritor coordinado de ambos destinos en la transacción/hook de guardado.

---

## 14. Definition of Done

- [ ] Eliminado arreglo `PRESETS` hardcoded en `bot-view.tsx`; conectado a catálogo dinámico de `admin.bot_presets`, `admin.bot_tones` y `admin.tenant_bots`.
- [ ] `shippingPolicy`, FAQs, 6 mensajes clave con AI real, horario de fuera de horario y `ensureDefaultChatwootLabels` implementados y sincronizados con Onboarding Paso 4.
- [ ] Reemplazado error handling inseguro en `apps/admin/app/api/tenant/bot/route.ts` por `handle()` RFC 9457.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todas las definiciones (`PV-03`: 6 mensajes clave predeterminados asistidos por AI; `ONB-11`: sincronía Paso 4 + etiquetas Chatwoot) fueron aprobadas. Sin preguntas pendientes.

