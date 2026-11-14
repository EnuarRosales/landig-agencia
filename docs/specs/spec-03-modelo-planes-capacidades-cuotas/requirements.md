# SPEC-03 · Homologación del Modelo de Planes, Capacidades Chatwoot, Cuotas Multimedia y Visibilidad en Comercio

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-03` |
| **Nombre** | Homologación del Modelo de Planes, Capacidades Chatwoot, Cuotas Multimedia y Visibilidad en Comercio |
| **Tipo de intervención** | Remediación arquitectónica de brechas en cálculo de cuotas y extensión del modelo de planes |
| **Prioridad** | P0 — Crítica (impacta alta de productos, multimedia, canales Chatwoot y límites del equipo) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `PLN-01`, `ONB-09`, `EQU-03`, `EQU-04` (y componente de configuración de planes solicitado en `PRD-03` para `audios_per_product`) |
| **Specs previas relacionadas** | `ADM-001`, `CEL-001`, `TNT-001`, `BILL-001` |
| **Specs dependientes** | `SPEC-04` (suscripción, trial, pago Bre-B y upgrade consume este catálogo de planes y capacidades), `SPEC-06` (Paso 2 y Paso 3 de Onboarding informan límites de productos y multimedia por plan), `SPEC-08` (validación obligatoria de cuotas por tipo incluyendo audios), `SPEC-12` (límites de usuarios y agentes Chatwoot), `SPEC-13` (visibilidad de bandejas y canales habilitados) |
| **Wave de ejecución sugerida** | Wave 1 — Base de Dominio y Contratos de Cuota |

---

## 3. Problema / Situación actual

La auditoría del código fuente actual en `packages/domain` y `apps/admin` revela cuatro defectos críticos e inconsistencias entre lo que el Backoffice de la SaaS configura en `/admin/plans` y lo que efectivamente recibe y valida el Backoffice del Inquilino:

1. **Omisión de la dimensión obligatoria `audios_per_product` (`PRD-03`):**
   - En `packages/domain/src/db/schemas/admin/plan-catalogs.ts`, `PLAN_DIMENSION_KEYS` declara `products`, `images_per_product`, `videos_per_product` y `pdfs_per_product`, pero **omite `audios_per_product`**.
   - En `apps/admin/app/admin/plans/plan-modal-dialog.tsx` (líneas 261–278), el formulario de catálogo de planes permite configurar imágenes, videos y PDFs por producto, **omitiendo por completo la cantidad admisible de pistas de audio por producto**.
2. **Desconexión total entre `/admin/plans` y el resumen de plan del inquilino (`PLN-01`, `EQU-03`, `EQU-04`):**
   - `TenantWorkspaceService.getWorkspaceBilling()` (`packages/domain/src/services/tenant-workspace.service.ts`, líneas 1175–1229) únicamente consulta `planFeatureValues` y **no lee `planLimits` ni `planCapabilityValues`** (ni los overrides por comercio `clientPlanOverrides` / `clientFeatureOverrides` / `clientCapabilityOverrides`).
   - Por ello, el tablero de plan/facturación del comercio (`apps/admin/app/workspace/billing/billing-view.tsx`) no refleja las cuotas reales configuradas en el plan (incluyendo agentes Chatwoot, canales/bandejas Chatwoot, usuarios del equipo, retención, storage, productos y multimedia por tipo) ni el **consumo actual vs límite** (`EQU-04`).
3. **Defectos en runtime y consultas rotas de cuotas en dominio (`PLN-01`, `PRD-03`):**
   - `TenantCapabilityGateService.getTenantCapabilities()` (`packages/domain/src/services/tenant-capability-gate.service.ts`, líneas 105–106) pasa objetos `Date` crudos dentro de plantillas Drizzle `sql\`...\`` al consultar vigencia temporal de `clientFeatureOverrides`, generando errores SQL en tiempo de ejecución cuando existen overrides.
   - `TenantProductsAndMediaService.getPlanQuota()` (`packages/domain/src/services/tenant-products-and-media.service.ts`, líneas 275–323) presenta dos fallos adicionales: (a) pasa `now` (`Date`) crudo a `sql\`...\`` en líneas 288–289 y (b) lee `limitRow.limitMode` en las líneas 320–321 cuando la columna real en `admin.plan_limits` se llama `mode`. Además, `countProductMediaByKind` (líneas 335–350) no filtra por tipo de medio (`image`/`video`/`audio`/`pdf`), sumando erróneamente todos los archivos juntos.
4. **Falta de exposición clara de límites durante el Onboarding (`ONB-09`):**
   - Durante la creación del primer producto en Onboarding, el comercio desconoce cuántos productos y cuántos archivos de imagen, video, audio y PDF permite el plan seleccionado en el paso previo.

---

## 4. Objetivo y valor de negocio

Establecer una **única fuente de verdad (`TenantEntitlementsService` / `TenantCapabilityGateService`)** que sincronice al 100% los atributos comerciales, cuotas numéricas (incluyendo `audios_per_product`), almacenamiento y capacidades Chatwoot configuradas en `/admin/plans` con:
1. La validación estricta en tiempo real al crear recursos (productos, archivos multimedia por tipo, usuarios del equipo, agentes e inboxes Chatwoot).
2. La visualización transparente en el Backoffice del Inquilino (`/workspace/billing` o pestaña «Mi Plan Y Límites») mostrando qué incluye el plan, el consumo utilizado vs. disponible y las capacidades habilitadas/bloqueadas (`EQU-03`, `EQU-04`, `PLN-01`).
3. La exposición temprana de cuotas de catálogo durante el Paso 3 de Onboarding (`ONB-09`).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Inclusión de `audios_per_product` como dimensión obligatoria en `PLAN_DIMENSION_KEYS`, semilla de dimensiones (`admin.plan_dimensions`), UI de creación/edición de planes (`/admin/plans` → `plan-modal-dialog.tsx`), API `/api/admin/plans` y validadores Zod.
- Reparación de `TenantCapabilityGateService` y eliminación de `Date` crudo en `sql\`...\`` (`toISOString()` / `lte`/`gte` nativos de Drizzle), así como corrección de `limitRow.mode` y conteo segmentado por `mediaKind`.
- Creación/consolidación de método unificado `getTenantEntitlementsSummary(clientId)` consumido por `/api/tenant/billing`, `/api/tenant/onboarding` y `/api/tenant/team`.
- Rediseño informativo de la sección «Tu Plan Y Capacidades» en `apps/admin/app/workspace/billing/billing-view.tsx` mostrando:
  - Límites de Catálogo (Productos, Imágenes/producto, Videos/producto, **Audios/producto**, PDFs/producto, Almacenamiento MiB/GiB) con barra o indicador `Usado / Límite` (o «Ilimitado»).
  - Límites de Equipo y Atención (Usuarios del comercio, Contactos CRM, Agentes Chatwoot, Bandejas/Canales Chatwoot, Retención de historial).
  - Matriz legible de Capacidades y Canales Chatwoot habilitados/no incluidos (ej. WhatsApp, Instagram, Messenger, TikTok, Widget Web, Automatizaciones, Macros, Campañas, Reportes) sin siglas ni códigos internos.
- Exposición de `planSummary` (límites de productos y multimedia por tipo) en la respuesta de catálogo/selección de plan y creación de producto en Onboarding (`ONB-09`).

### Fuera de alcance
- Flujos de checkout, pago con Wompi/Stripe/Bre-B, periodo de prueba, renovación o cambio/upgrade de plan (cubierto íntegramente por `SPEC-04`).
- Lógica de invitación/desactivación de usuarios de equipo (cubierto por `SPEC-12`).
- Carga física y optimización multimedia hacia SeaweedFS/imgproxy (`SPEC-00` y `SPEC-08`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `platform_owner` / `platform_admin` | Crear o editar planes, sus dimensiones obligatorias (incluyendo `audios_per_product`) y capacidades Chatwoot en `/admin/plans` | Sí | Auditoría de cambios; incremento automático de versión lógica si aplica |
| `platform_owner` / `platform_admin` | Configurar overrides excepcionales de límites o capacidades para un inquilino específico | Sí | Con fecha de vigencia opcional |
| `tenancy_owner` | Consultar su plan actual, límites totales, consumo en vivo y capacidades Chatwoot habilitadas | Sí | Solo de su `client_id` |
| `tenancy_users` (`tenant_agent`) | Consultar límites de catálogo visibles durante carga de producto (sin acciones de cobro) | Sí | Lectura no sensible de cuotas operativas; sin acceso a facturas ni métodos de pago |

---

## 7. Modelo de datos

### 7.1 Extensión de `PLAN_DIMENSION_KEYS` (`packages/domain/src/db/schemas/admin/plan-catalogs.ts`)
Se adiciona la constante y dimensión obligatoria:
- **`audios_per_product`**:
  - Tipo en `admin.plan_limits`: fila obligatoria para todo plan activo (`mode: 'LIMITED' | 'UNLIMITED'`, `limit_value: BIGINT >= 0`, default sugerido `0` o `2` según plan, obligatorio en formulario `/admin/plans`).
  - Comentario SQL actualizado en tabla `plan_dimensions`.

### 7.2 Entidades fuente de entitlements (existentes en `packages/domain/src/db/schemas/admin/`)
- `admin.plans`: `id`, `code`, `name` (i18n), `description` (i18n), `trial_days`, `grace_days`, `currency`, `price_monthly_cents`, `price_annual_cents`, `status`.
- `admin.plan_dimensions` + `admin.plan_limits` (`plan_id`, `dimension_key`, `mode`, `limit_value`).
- `admin.client_plan_overrides` (`client_id`, `dimension_key`, `mode`, `limit_value`, `valid_from`, `valid_to`).
- `admin.capabilities` / `admin.plan_capabilities` / `admin.client_capability_overrides` (o `plan_features` / `plan_feature_values` / `client_feature_overrides` según tabla canónica en `plan-catalogs.ts`).
- **Consumo en vivo (fuentes reales por `client_id`):**
  - `cell_client_usage.storage_used_bytes` y conteos directos en celda (`pg-cell-XX`): total de productos no eliminados, total de archivos por `product_id` agrupados por `media_kind` (`image`, `video`, `audio`, `pdf`), total de `cell_contacts`, total de `cell_tenant_users` activos.
  - Consumo Chatwoot (`agents`, `inboxes`): derivado de la sincronización/conteo real registrado en `admin.chatwoot_accounts` y usuarios/canales activos.

### 7.3 Migración backfilling obligatoria
- La migración SQL o script de sincronización asociado debe insertar un registro por defecto para `audios_per_product` (`mode = 'LIMITED'`, `limit_value = 0` si el plan existente no lo poseía, o valor configurable por el administrador) en todos los registros ya existentes de `admin.plan_limits` que carezcan de esta dimensión, garantizando que ningún plan existente quede inconsistente al editar o validar cuotas.

---

## 8. Reglas de negocio

- **RN-SPEC-03-01 (Dimensión `audios_per_product` obligatoria en todo plan):** Ningún plan puede crearse ni guardarse en `/admin/plans` sin definir expresamente las cinco dimensiones de catálogo: `products`, `images_per_product`, `videos_per_product`, **`audios_per_product`** y `pdfs_per_product`, cada una con `mode` (`LIMITED` o `UNLIMITED`) y valor numérico entero `>= 0` cuando es `LIMITED`.
- **RN-SPEC-03-02 (Resolución unificada Plan + Overrides):** Para cualquier dimensión $d$ o capacidad $c$ de un inquilino, el valor efectivo se calcula en tiempo real evaluando: (1) Override vigente para `client_id` (`valid_from <= NOW()` y (`valid_to IS NULL` o `valid_to > NOW()`)); (2) Si no hay override vigente, el límite o valor asignado al `plan_id` activo del inquilino (`admin.clients.plan_id` / suscripción vigente).
- **RN-SPEC-03-03 (Semántica de límite cero vs ilimitado):** Un límite en modo `LIMITED` con `limit_value = 0` significa capacidad/tipo de medio **no permitido** en el plan (ej. `videos_per_product = 0` o `audios_per_product = 0` impide subir ese formato y la UI lo muestra como «No incluido en tu plan»); el valor `UNLIMITED` desactiva el tope numérico sin mostrar `0` ni números ficticios.
- **RN-SPEC-03-04 (Conteo segmentado estricto de multimedia):** La validación de cuota multimedia por producto compara el conteo **exclusivo del tipo de medio específico** (`image`, `video`, `audio` o `pdf`) contra la dimensión correspondiente (`images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`), además de verificar la cuota global de almacenamiento (`storage_bytes`). Nunca se mezclan tipos entre sí.
- **RN-SPEC-03-05 (Sincronía absoluta con capacidad operativa de Chatwoot y Equipo):** Los topes visibles en «Mi Plan Y Límites» para usuarios del comercio (`tenant_users`), agentes (`chatwoot_agents`), bandejas/canales (`chatwoot_inboxes`) y canales habilitados (WhatsApp, Web Widget, Instagram, etc.) provienen del mismo servicio consultado por los endpoints de creación de equipo, provisión de canales y portal embebido. Queda prohibido duplicar mapas estáticos en componentes React.
- **RN-SPEC-03-06 (Prohibición de fechas crudas en interpolación SQL Drizzle):** Toda consulta Drizzle sobre columnas `timestamp` debe usar constructores nativos (`gte`, `lte`, `gt`, `isNull`) o parámetros ISO tipados; jamás objetos `Date` crudos dentro de template tags `sql\`...\``.
- **RN-SPEC-03-07 (Transparencia de cuotas en Onboarding y Catálogo):** En el Paso 2 (selección de plan) y Paso 3 (creación de producto) de Onboarding (`ONB-09`), y al abrir el formulario de creación/edición de producto (`PRD-03`), el inquilino ve explícitamente cuántos productos tiene creados vs permitidos y el límite exacto de imágenes, videos, pistas de audio y PDFs admitidos por producto según su plan.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/billing` (Extensión de contrato existente)
Devuelve el objeto normalizado de entitlements además de los datos comerciales del plan:
```json
{
  "ok": true,
  "data": {
    "plan": {
      "id": "uuid",
      "code": "pro",
      "name": { "es": "Plan Pro", "en": "Pro Plan" },
      "status": "trialing",
      "trialEndsAt": "2026-11-27T00:00:00Z"
    },
    "quotas": {
      "products": { "mode": "LIMITED", "limit": 500, "used": 12 },
      "images_per_product": { "mode": "LIMITED", "limit": 10 },
      "videos_per_product": { "mode": "LIMITED", "limit": 2 },
      "audios_per_product": { "mode": "LIMITED", "limit": 3 },
      "pdfs_per_product": { "mode": "LIMITED", "limit": 2 },
      "storage_bytes": { "mode": "LIMITED", "limit": 524288000, "used": 10485760 },
      "contacts": { "mode": "UNLIMITED", "limit": null, "used": 45 },
      "tenant_users": { "mode": "LIMITED", "limit": 5, "used": 2 },
      "chatwoot_agents": { "mode": "LIMITED", "limit": 3, "used": 1 },
      "chatwoot_inboxes": { "mode": "LIMITED", "limit": 4, "used": 1 },
      "chat_retention_days": { "mode": "LIMITED", "limit": 90 }
    },
    "capabilities": [
      {
        "code": "channel_whatsapp",
        "group": "channels",
        "label": { "es": "Canal De WhatsApp", "en": "WhatsApp Channel" },
        "enabled": true
      }
    ]
  }
}
```

### 9.2 `GET /api/admin/plans` y `POST/PATCH /api/admin/plans` (Actualización de contrato existente)
- El payload de `limits` exige `audios_per_product: { mode: 'LIMITED' | 'UNLIMITED', value: number }`.
- Respuesta `400 Bad Request` RFC 9457 si falta `audios_per_product` o su valor es negativo.

### 9.3 `GET /api/tenant/onboarding` (o respuesta de catálogo de planes público)
- Incluye `catalogSummary` por cada plan disponible (`products`, `images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`, `storageMb`) para renderizarse en Paso 2 y Paso 3 (`ONB-09`).

---

## 10. Especificación de UI/UX

- **Backoffice SaaS (`/admin/plans` → `PlanModalDialog`):**
  - Pestaña «Catálogo Y Productos» incorpora el campo numérico con selector `Limitado / Ilimitado` y etiqueta en Title Case: **«Pistas De Audio Por Producto»** (en inglés: *«Audio Tracks Per Product»*), junto a imágenes, videos y PDFs.
  - En la pestaña «Resumen», se incluye la línea informativa de audios permitidos por producto.
- **Backoffice del Inquilino (`/workspace/billing`):**
  - Sección **«Tu Plan Y Capacidades»** dividida en tarjetas Mobile First claras y sin tecnicismos:
    1. **Resumen De Catálogo Y Almacenamiento:** Barras de progreso visuales para Productos (`used / limit`), Almacenamiento (`MB / MB`), e indicadores claros de multimedia por producto (Imágenes, Videos, Audios, PDFs).
    2. **Equipo Y Atención Omnicanal:** Indicadores de Usuarios del Comercio (`used / limit`), Contactos CRM, Agentes De Atención Activos y Canales Conectables.
    3. **Funcionalidades Y Canales Incluidos:** Lista agrupada por función (Canales de Atención, Automatización y Bot, CRM y Datos, Reportes) con ícono de estado (`Incluido` vs `No Incluido En Este Plan`), filtrando etiquetas con nombres amigables humanos en idioma activo (`es`/`en`).
- **Vista de Onboarding (Paso 3) y Modal de Producto (`/workspace/products`):**
  - Banner o chip informativo compacto encima del formulario/zona de carga: *«Tu plan actual permite hasta X productos (llevas Y) y por cada producto hasta: A imágenes, B videos, C audios y D documentos PDF.»* (cuando algún tipo es `0`, indicar *«No incluido»*).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Homologación de planes, cuota de audios, capacidades y consumo visible

  Escenario: Administrador SaaS configura plan con límite explícito de pistas de audio por producto
    Dado que un "platform_admin" abre el diálogo de creación o edición de plan en "/admin/plans"
    Cuando define en la pestaña de catálogo "10" imágenes, "1" video, "3" pistas de audio y "2" PDFs por producto y guarda el plan
    Entonces el backend valida y persiste la dimensión "audios_per_product = 3" en "admin.plan_limits"
    Y al reabrir el plan en edición muestra exactamente "3" en el campo "Pistas De Audio Por Producto"

  Escenario: Backoffice del inquilino refleja fielmente límites, consumo real y capacidades Chatwoot del plan
    Dado que el comercio "Café Andes" tiene un plan con 100 productos, 3 audios por producto, 5 usuarios, 4 canales Chatwoot y canal WhatsApp habilitado
    Y actualmente tiene 8 productos, 2 usuarios activos y un override temporal vigente de +2 canales Chatwoot
    Cuando el propietario consulta "/workspace/billing" (GET "/api/tenant/billing")
    Entonces visualiza "Productos: 8 / 100", "Audios Por Producto: 3", "Usuarios Del Equipo: 2 / 5", "Canales De Atención: 6"
    Y visualiza el canal WhatsApp marcado como "Incluido"

  Escenario: Inquilino en Onboarding visualiza los límites de productos y multimedia de su plan elegido
    Dado que el comercio seleccionó el plan "Emprendedor" en el paso 2 del onboarding
    Cuando avanza al paso 3 "Primer Producto"
    Entonces la pantalla muestra claramente cuántos productos permite su plan y el máximo de imágenes, videos, audios y PDFs por producto
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de plan sin definición válida de pistas de audio por producto
    Dado que un "platform_admin" envía POST o PATCH a "/api/admin/plans" omitiendo "audios_per_product" o enviando valor "-1"
    Cuando el servidor ejecuta la validación del esquema
    Entonces responde HTTP 400 Problem Details indicando que "audios_per_product" es obligatorio y debe ser mayor o igual a cero
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Validación diferenciada impide subir video si el límite de video es 0 aunque haya cupo de imágenes
    Dado que un producto ya tiene 2 imágenes y el plan permite 10 imágenes pero 0 videos por producto
    Cuando el comercio intenta adjuntar un archivo de video al producto
    Entonces el servicio rechaza la operación con error de regla de negocio "MEDIA_TYPE_NOT_ALLOWED_IN_PLAN" (HTTP 422)
    Y no consume ni bloquea el cupo restante de imágenes o audios
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Conteo de uso estricto por tenant sin fuga de consumo entre inquilinos
    Dado que el inquilino A tiene 45 productos y el inquilino B en la misma celda tiene 2 productos
    Cuando el inquilino B consulta su resumen de cuotas y límites en GET "/api/tenant/billing"
    Entonces el campo "products.used" reporta exactamente "2" para el inquilino B sin sumar registros del inquilino A
```

### (e) Escenarios de borde

```gherkin
  Escenario: Consulta de capacidades cuando existen overrides temporales vencidos y vigentes
    Dado que el comercio tiene un override vencido ayer y un override vigente hasta el próximo mes en "admin.client_plan_overrides"
    Cuando el backend ejecuta "TenantCapabilityGateService" o "getPlanQuota"
    Entonces las consultas SQL se ejecutan sin errores de formato de fecha en Drizzle
    Y únicamente se aplica el override vigente ignorando el vencido
```

---

## 12. Requisitos no funcionales

- **Integridad y consistencia de datos:** Transacción única al crear/actualizar un plan y su conjunto completo de dimensiones en `admin.plan_limits`, asegurando atomicidad (`db.transaction`).
- **Rendimiento:** Resolución de entitlements y conteos de consumo del comercio en `< 150 ms` P95 mediante consulta agregada consolidada en celda (`COUNT` agrupado por `media_kind`) en lugar de N+1 consultas por archivo.
- **Observabilidad (`AGENTS.md §4.13`):** Log estructurado Pino cuando un inquilino alcance `>= 90%` de una cuota o sea bloqueado por límite de plan, incluyendo `requestId`, `clientId`, `dimensionKey`, `used`, `limit`.

---

## 13. Dependencias y riesgos

- **Dependencias:** Migración en plano de control para incorporar `audios_per_product` en todos los planes existentes; servicio de consulta a celda operativa (`CellDatabasePoolManager`).
- **Riesgos:**
  - *Planes existentes en producción sin `audios_per_product`:* Mitigado con script idempotente/migración SQL backfill asignando valor por defecto explícito (`0` o `2` según definición comercial) y advertencia en `/admin/plans`.

---

## 14. Definition of Done

- [ ] `audios_per_product` incorporado en `PLAN_DIMENSION_KEYS`, migración SQL con backfill ejecutada, semillas y `/admin/plans` UI completa.
- [ ] Corregidos todos los pasos de `Date` crudo en `sql\`...\`` en `tenant-capability-gate.service.ts` y `tenant-products-and-media.service.ts`, así como `limitRow.mode` y filtrado por `mediaKind`.
- [ ] `getWorkspaceBilling` y `/api/tenant/billing` unificados con `TenantCapabilityGateService` y `cell_client_usage` real.
- [ ] UI `/workspace/billing` y Paso 3 de Onboarding mostrando cuotas reales en `es`/`en` sin códigos internos ni tecnicismos.
- [ ] Suite completa `pnpm test`, `pnpm lint` y `pnpm --filter @mocter/domain exec drizzle-kit check` en verde.
- [ ] Protocolo de compilación, reinicio de servicios y verificación HTTP 200 ejecutado (`AGENTS.md §4.18`).

---

## 15. Propuestas a Validar (PV-xx)

Todas las precisiones fueron confirmadas por el usuario (inclusión obligatoria de `audios_per_product` en la lógica de negocio y visualización de planes del Backoffice de la SaaS). Sin dudas abiertas.

