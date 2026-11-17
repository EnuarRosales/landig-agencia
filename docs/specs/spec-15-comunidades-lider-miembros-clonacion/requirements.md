# SPEC-15 · Comunidades de Comercios: Red Colaborativa Multi-Comunidad, Líder/Miembros y Clonación Inteligente de Catálogo

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-15` |
| **Nombre** | Comunidades de Comercios: Red Colaborativa Multi-Comunidad, Líder/Miembros y Clonación Inteligente de Catálogo |
| **Tipo de intervención** | Evolución de esquema + Habilitación integral de dominio, APIs REST y UI (`/workspace/community`, `/admin/communities`, `/admin/plans`) |
| **Prioridad** | P1 — Crítica / Diferencial competitivo central del sistema |
| **Versión** | 2.0.0 |
| **Estado** | Aprobada para implementación (alineada mediante entrevista `/grill-me`) |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-03`, `PV-05` (líder y miembros son inquilinos SaaS activos) |
| **Specs previas relacionadas** | `ADM-001` (`RF-06`, `RF-08`, `D-13`..`D-23`, `D-30`..`D-31`), `TNT-001`, `ORD-001` |
| **Specs integradas / dependientes** | `SPEC-00` (copia segura e independiente en SeaweedFS + URLs firmadas `imgproxy`), `SPEC-03` (capacidad `community_feed` en planes y cuotas `products` + multimedia + `storage_bytes`), `SPEC-08` (estructura completa de producto simple y combo, `bot_master_prompt`, atributos dinámicos y `is_cover`), `SPEC-11` (atribución de ventas por producto clonado), `SPEC-14` (notificaciones in-app y correo transaccional), `SPEC-17` (i18n `es`/`en` y tablas estándar), `SPEC-19` (kit conversacional AI por producto) |
| **Wave de ejecución** | Wave 4 — Expansión de Valor Diferencial |

---

## 3. Problema / Situación actual

Aunque `packages/domain` contiene tablas iniciales de `ADM-001` (`organizations`, `organization_members`, `organization_invitations`, `organization_join_requests`, `organization_promotions`, `client_sharing_profiles`, `product_shares`, `product_share_versions`, `product_adoptions`, `clone_sync_policies`, `sync_runs`, `feed_posts`, `feed_moderation_events`) y servicios base aislados sin repositorio Drizzle completo:

1. **Restricciones obsoletas en el modelo de datos:**
   - `organizations` posee `organizations_originator_unique` (impide que un comercio lidere más de una comunidad o marca/línea) y carece de `slug`, `description`, `category`, `visibility`, `share_policy`, `require_share_approval`, `invite_code` y `status`.
   - `organization_members` posee `organization_members_one_active_per_client` (impide que un comercio pertenezca simultáneamente a múltiples comunidades de distintos proveedores).
   - `media_catalog` y el flujo de borrado multimedia (`deleteProductMediaAndPromote`) eliminan el archivo físico en SeaweedFS cuando el propietario original lo desvincula si no existe copia independiente en el prefijo del adoptante.
2. **Brechas en gobierno por plataforma y planes:**
   - La capacidad `community_feed` no está sembrada en `admin.plan_features` ni es configurable en `/admin/plans` (`PlanModalDialog`).
   - No existe mecanismo para que un comercio solicite habilitación como Líder ni consola en `/admin/communities` para que `platform_admin` apruebe solicitudes, otorgue cupo de comunidades o supervise redes.
3. **Ausencia operativa en Backoffice y APIs:**
   - `apps/admin/app/workspace/community/page.tsx` muestra un placeholder estático.
   - No existen Route Handlers bajo `/api/tenant/community/*` ni `/api/admin/communities/*`.
   - Los servicios actuales no soportan **combos (`SPEC-08`)**, detección de cambios pendientes entre el producto vivo y la última versión compartida, diff visual `vN → vN+1`, atribución estricta de métricas por comunidad ni integración con `NotificationDispatcherService` (`SPEC-14`).

---

## 4. Objetivo y valor de negocio ("La Joya del Sistema")

Convertir `/workspace/community` en el **ecosistema B2B diferencial de Mocter** frente a competidores de comercio conversacional y dropshipping:

1. **Comunidades Multi-Red Sin Fricción (Red Mayorista + Modo Colaborativo Opcional):**
   - Un comercio puede liderar múltiples comunidades (sujeto a habilitación aprobada por `platform_admin`) y simultáneamente ser miembro de múltiples comunidades de distintos proveedores o marcas para construir un catálogo multimarca.
2. **Clonación de "Kits Comerciales AI" en 1 Clic (Simples y Combos):**
   - No se clona solo una foto y un texto: se clona el **kit de ventas completo** (`name`, `description`, `bot_master_prompt` optimizado de hasta 32k caracteres para el agente AI, atributos dinámicos para variantes, galería multimodal compatible con el plan del miembro mediante copia independiente en SeaweedFS, y componentes atómicos si el producto es un **Combo**).
   - Incluye calculadora instantánea de margen comercial al adoptar (`costo mayorista` vs `precio sugerido` vs `precio de venta propio`), referencia de precio mínimo sugerido y stock referencial del proveedor.
3. **Versionamiento Controlado con Detector de Cambios y Diff Visual (`v1` → `v2`):**
   - El líder edita libremente sus productos en `/workspace/products` sin spamear a su red; `/workspace/community` detecta diferencias pendientes por publicar y permite liberar `v2` con `changelog` opcional.
   - Cada miembro recibe notificación (`SPEC-14`), inspecciona el **diff visual campo a campo** y decide libremente qué actualizar (manualmente o activando políticas `auto_sync` en atributos seguros), con protección inviolable sobre su precio de venta y stock locales.
4. **Muro de Novedades Moderado + Directorio + Invitaciones por WhatsApp:**
   - Muro comunitario (`feed_posts`) para lanzamientos, reposiciones y tips comerciales con moderación `pre` / `post` / `none`, respetando el **Perfil de Privacidad** (`client_sharing_profiles`).
   - Directorio descubrible (`request_to_join`) y enlaces/códigos de invitación compartibles por WhatsApp además de invitación directa por correo o slug.
5. **Radar de Impacto con Atribución Estricta por Comunidad:**
   - Métricas reales para el Líder (adopciones activas, unidades vendidas, revenue generado, top productos y top adoptantes) calculadas **exclusivamente** sobre los productos clonados de esa comunidad — garantizando privacidad comercial frente a otras comunidades del mismo miembro y cero acceso a chats o clientes finales.

---

## 5. Decisiones Cerradas (Alineación `/grill-me`)

| Código | Decisión Aprobada |
| --- | --- |
| **SPEC-15-D01** | **Multi-comunidad total:** Un comercio puede crear y liderar múltiples comunidades (según cupo otorgado por plataforma) y pertenecer simultáneamente como miembro activo a múltiples comunidades distintas. |
| **SPEC-15-D02** | **Acceso por plan + Liderazgo aprobado por Plataforma:** Todos los planes activos arrancan con `community_feed = true` por defecto (configurable luego por plan en `/admin/plans` y por comercio vía `client_feature_overrides`). Cualquier comercio con acceso puede unirse a comunidades y clonar; crear comunidades como Líder requiere solicitud o habilitación explícita por `platform_admin` / `platform_owner`. |
| **SPEC-15-D03** | **Flujo completo Solicitud ↔ Consola `/admin/communities`:** El comercio solicita habilitación de Líder desde `/workspace/community` (con propuesta de marca/nicho); `platform_admin` aprueba, rechaza, revoca o habilita directamente definiendo `max_owned_communities` (`null` = ilimitado) y supervisa las comunidades desde `/admin/communities`. |
| **SPEC-15-D04** | **Política de compartición configurable por comunidad:** Por defecto toda comunidad nace en modo **Red Mayorista** (`leaders_only`: solo `originator` y `co_leader` comparten productos); el `originator` puede habilitar el modo **Colaborativo** (`collaborative`, con moderación previa opcional `require_share_approval`) para que miembros activos también propongan productos. |
| **SPEC-15-D05** | **Experiencia integral unificada:** `/workspace/community` integra Catálogo Compartido + Clonación, Mis Clones y Versiones, Muro de Novedades (`feed_posts`), Directorio e Invitaciones (código/enlace + correo/slug), Co-líderes (`organization_promotions`), Perfil de Privacidad (`client_sharing_profiles`) y Radar de Liderazgo. |
| **SPEC-15-D06** | **Soporte completo para Productos Simples y Combos (`SPEC-08`):** Si se comparte un Combo, el snapshot empaqueta sus componentes simples completos; al clonarlo en la celda del miembro, se valida la cuota total de `products` (combo + componentes nuevos requeridos) y se crean o reutilizan atómicamente los componentes simples junto con `product_bundle_items`. |
| **SPEC-15-D07** | **Publicación explícita de versiones con detector de cambios:** Editar un producto en `/workspace/products` no crea versiones ni dispara alertas automáticamente; el sistema detecta cambios frente al último snapshot publicado y permite al líder revisarlos y publicar `vN+1` con `changelog` opcional. |
| **SPEC-15-D08** | **Diff visual + política mixta por atributo con protección de precio/stock:** Al clonar, todos los atributos nacen con `auto_sync = false` (decisión voluntaria del miembro tras revisar el diff `v1 → v2`); el miembro puede habilitar `auto_sync` en atributos no destructivos (`description`, `botMasterPrompt`, `attributes`, `category`, `brand`, `media`), pero su `price_cents` de venta y `stock_quantity` local nunca se sobreescriben automáticamente. |
| **SPEC-15-D09** | **Atribución estricta en métricas de liderazgo:** `CommunityLeadershipMetricsService` consulta únicamente clones vinculados a `shares` de esa comunidad (`source_share_id`), sin sumar productos propios ni clones de otras comunidades del miembro, y sin exponer chats ni clientes finales. |
| **SPEC-15-D10** | **Copia independiente de medios en SeaweedFS (`SPEC-00`):** Al clonar medios compatibles con las cuotas del adoptante (`SPEC-03`), los binarios se copian en S3 bajo el prefijo `tenants/{adopterClientId}/products/{cloneProductId}/...` con registro en `media_catalog` bajo `storage_pool_id = "tenant:{adopterClientId}"`, garantizando que ni líder ni miembro puedan borrar archivos ajenos. |

---

## 6. Alcance y Fuera de alcance

### Dentro del alcance
- **Migración Drizzle versionada en Router Global (`packages/domain/drizzle/`):**
  - Eliminación de índices únicos restrictivos `organizations_originator_unique` y `organization_members_one_active_per_client`, creando índice único compuesto `(organization_id, client_id) WHERE status = 'active'`.
  - Extensión de `admin.organizations` (`slug`, `description`, `category`, `visibility`, `share_policy`, `require_share_approval`, `invite_code`, `status`).
  - Extensión de `admin.product_shares` (`moderation_status`, `moderated_by_user_id`, `moderated_at`, `rejection_reason`) y `admin.product_share_versions` (`changelog`).
  - Nueva tabla `admin.community_leader_authorizations` (estado de solicitud/aprobación de líder por `client_id`, cuota `max_owned_communities`, propuesta comercial, auditoría).
  - Siembra de capacidad `community_feed` en `admin.plan_features` + habilitación inicial por defecto (`enabled = true`) en todos los planes activos existentes, más nuevos eventos de notificación en `admin.email_events` (`community.leader_status`, `community.invited`, `community.product_version_published`).
- **Actualización de servicios e implementaciones Drizzle reales (`packages/domain`):**
  - `CommunitiesGovernanceService` + `DrizzleCommunitiesGovernanceRepository` (solicitudes/aprobaciones de líder, CRUD comunidades multi-comunidad, directorio público, invitaciones por email/slug y por código compartible, solicitudes de ingreso, promociones a co-líder, salida segura).
  - `ProductCloningAndCommunitiesService` + `DrizzleProductCloningRepository` (publicación de simples y combos, detección de cambios pendientes, moderación en modo colaborativo, adopción atómica con cuotas `SPEC-03` y copia S3 independiente `SPEC-00`, diff visual `vA → vB`, sync selectivo manual/auto, políticas por atributo, desvinculación segura).
  - `CommunityFeedService` + `DrizzleCommunityFeedRepository` (muro de novedades con moderación `pre`/`post`/`none` y `client_sharing_profiles`).
  - `CommunityLeadershipMetricsService` + `DrizzleLeadershipMetricsRepository` (atribución estricta por comunidad a través de `CellDatabasePoolManager`).
  - Integración de `community_feed` en `PlanModalDialog` (`/admin/plans`) y `admin-dashboard.service.ts`.
  - Integración de `NotificationDispatcherService` (`SPEC-14`) mediante tareas no bloqueantes.
- **Endpoints REST (`apps/admin/app/api/tenant/community/**` y `apps/admin/app/api/admin/communities/**`)** con Zod, RBAC y `handle()` RFC 9457.
- **Interfaces completas Mobile First (`es`/`en`, Title Case, `--dsn-*`, `<WorkspaceDataTable />`, `ConfirmationModal`):**
  - `/workspace/community` (con pestañas de Explorar Catálogo, Mis Clones y Versiones, Muro de Novedades, Mis Comunidades y Directorio, Gestión de Líder y Radar de Impacto, más modal de Solicitud de Líder).
  - Indicador discreto de origen comunitario / actualización disponible en `/workspace/products` (bloqueando re-compartición en cadena).
  - `/admin/communities` en el Backoffice SaaS (`AdminShell.tsx`) y toggle `community_feed` en `/admin/plans`.

### Fuera de alcance
- Liquidación financiera o cobro automático de pedidos mayoristas entre inquilino líder e inquilino miembro dentro de Mocter.
- Descuento o reserva automática de inventario físico en la celda del líder al momento de una venta en la celda del miembro (el stock del líder se consulta de manera informativa al compartir/actualizar versión; cada comercio gestiona su inventario local).
- Clonación directa sin membresía activa en la comunidad que aloja el producto compartido.

---

## 7. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `platform_owner` / `platform_admin` | Aprobar/rechazar solicitudes de Líder, habilitar/revocar cupo de comunidades por inquilino, suspender/reactivar comunidades, activar `community_feed` por plan | Sí | Sesión `scope = 'platform'` |
| `tenant_owner` (Habilitado como Líder / `originator`) | Crear comunidad (dentro de su cuota), configurar visibilidad/política/moderación, invitar comercios, generar código de invitación, aprobar solicitudes de ingreso, promover a `co_leader`, publicar/versionar productos, moderar productos propuestos y feed, ver Radar de Liderazgo | Sí | `community_feed = true`, autorización `approved` vigente y rol `originator` en esa comunidad |
| `tenant_owner` (`co_leader`) | Compartir y versionar productos propios en la comunidad, moderar publicaciones del muro (y productos propuestos si está habilitado), ver Radar de Liderazgo | Sí | Aceptación expresa previa de promoción a `co_leader`; no admite miembros ni promueve otros co-líderes ni cambia modo de moderación |
| `tenant_owner` (`member`) | Explorar directorio y solicitar ingreso, aceptar invitaciones o unirse por código, clonar productos simples/combos a su catálogo, configurar políticas de sync, aplicar diffs o desvincular clones, publicar en el muro, proponer productos (si modo colaborativo), configurar privacidad | Sí | `community_feed = true`, membresía `active`, cuota de catálogo disponible (`SPEC-03`) |
| `tenant_agent` | Ver catálogo compartido, muro de novedades y clones de comunidades a las que pertenece su comercio; publicar en el muro | Sí | Solo lectura en catálogo/clonación; prohibido clonar, desvincular, gestionar membresías, cambiar privacidad o ver métricas agregadas de liderazgo (`403 FORBIDDEN`) |
| Inquilino ajeno (no miembro) | Ver feed/catálogo privado, ver miembros, clonar o sincronizar productos de una comunidad ajena | No | `403 FORBIDDEN` (en directorio solo ve metadatos públicos de comunidades con `visibility = 'request_to_join'`) |

---

## 8. Reglas de negocio

- **RN-SPEC-15-01 (Multi-comunidad Líder → Miembro `PV-05`):** Toda comunidad vincula cuentas inquilinas reales (`admin.clients`). Un mismo inquilino puede liderar múltiples comunidades (si cuenta con aprobación de plataforma y cupo disponible) y ser miembro activo de múltiples comunidades distintas simultáneamente, manteniendo estrictamente una sola fila `active` por `(organization_id, client_id)`.
- **RN-SPEC-15-02 (Gobierno de plataforma y habilitación de Líder):** Ningún inquilino puede crear una comunidad sin contar con una autorización activa en `admin.community_leader_authorizations` (`status = 'approved'`) otorgada por `platform_admin` / `platform_owner` y sin superar su `max_owned_communities` (`403 LEADER_APPROVAL_REQUIRED` / `422 LEADER_QUOTA_EXCEEDED`). La revocación impide crear nuevas comunidades pero preserva intactas las ya creadas y los clones existentes.
- **RN-SPEC-15-03 (Prevención de auto-adopción y re-compartición en cadena):** Un comercio no puede clonar un `product_share` que él mismo originó (`422 CANNOT_ADOPT_OWN_SHARE`), aunque pertenezca a la misma comunidad. Asimismo, ningún producto clonado (`cell_products.source_share_id IS NOT NULL`) puede compartirse nuevamente hacia otra comunidad (`422 CANNOT_RESHARE_CLONED_PRODUCT`).
- **RN-SPEC-15-04 (Cuotas y combos atómicos del comercio adoptante `SPEC-03`, `SPEC-08`):** Antes de clonar (`POST /shares/[shareId]/adopt`), el servicio calcula cuántos productos nuevos requiere insertar en la celda destino (`1` para simple; `1 + componentes simples aún no clonados de ese share` para combo) y valida `products` contra `TenantCapabilityGateService`. Si excede el cupo, rechaza con `422 PRODUCT_QUOTA_EXCEEDED` sin crear registros parciales. Para multimedia (`images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`, `storage_bytes`), copia en SeaweedFS bajo `tenants/{adopterClientId}/products/{cloneProductId}/...` hasta el límite permitido por el plan del adoptante y devuelve el detalle explícito de medios copiados vs omitidos (`skippedMedia[]`).
- **RN-SPEC-15-05 (Independencia operativa, precios y stock del clon):** El clon en `cell_products` hereda ficha comercial, `bot_master_prompt`, atributos dinámicos y medios copiados, registrando `source_share_id` y `source_version`. Inicia con `cost_price_cents = wholesaleCostCents` (o `0` si no aplica), `price_cents = customSalePriceCents ?? suggestedPriceCents`, `stock_quantity = initialStock ?? 0` (solo físicos simples) y `status` elegido (`active` o `draft`). El stock del líder es meramente informativo y jamás descuenta inventario cruzado.
- **RN-SPEC-15-06 (Publicación explícita de versiones, Diff y protección de datos locales):** Editar un producto en `/workspace/products` no genera nueva versión automática. El líder visualiza el indicador de cambios pendientes en `/workspace/community` y publica explícitamente `vN+1` con `changelog` opcional. Al sincronizar un clon (manual con selección de campos tras ver el diff, o `auto_sync` en atributos configurados por el miembro), **nunca** se sobreescriben `price_cents`, `sale_price_cents` ni `stock_quantity` locales del miembro de forma automática.
- **RN-SPEC-15-07 (Supervivencia ante baja o desvinculación):** Si un producto compartido se archiva, una comunidad se suspende o un miembro sale de la comunidad, los productos ya clonados en `pg-cell-XX` permanecen 100% operativos y preservan pedidos históricos (`product_adoptions.link_active = false`).
- **RN-SPEC-15-08 (Atribución estricta y privacidad en métricas de liderazgo):** Las métricas del liderazgo agregan exclusivamente clones originados en esa comunidad (`source_share_id` de `product_shares` de esa `organization_id`) y nunca incluyen productos propios del miembro, clones de otras comunidades, conversaciones de Chatwoot ni datos personales de clientes finales (`ADM-001 RF-08.9`).

---

## 9. Criterios de aceptación (Gherkin)

```gherkin
Característica: Comunidades Multi-Red, Gobierno de Líderes y Clonación Inteligente (SPEC-15)

  Escenario: Comercio solicita ser Líder, plataforma lo aprueba y crea comunidad
    Dado que el comercio "Tostadora Andina" tiene capacidad "community_feed = true" pero aún no está autorizado como líder
    Cuando envía POST "/api/tenant/community/leader-request" con propuesta de marca
    Y un operador "platform_admin" aprueba la solicitud en "/admin/communities" con cupo de 3 comunidades
    Entonces "Tostadora Andina" puede crear hasta 3 comunidades desde "/workspace/community" y recibe notificación de aprobación

  Escenario: Comercio participa simultáneamente en dos comunidades y clona un Combo completo
    Dado que "Tienda Local" es miembro activo de "Café Premium" y de "Accesorios Hogar"
    Y "Café Premium" comparte el combo "Kit Barista" compuesto por "Prensa Francesa" y "Café 500g" con bot_master_prompt y portada
    Cuando "Tienda Local" clona "Kit Barista" definiendo su propio precio de venta y stock inicial 0
    Entonces el sistema valida el cupo total de productos (combo + 2 componentes), duplica los archivos S3 bajo el prefijo de "Tienda Local"
    Y crea los 2 componentes simples y el combo con "product_bundle_items" y "bot_master_prompt" en la celda de "Tienda Local"

  Escenario: Líder edita su producto, sistema detecta cambios pendientes y publica v2 con Diff para el miembro
    Dado que "Tostadora Andina" compartió "Café 500g" en v1 y "Tienda Local" lo clonó con precio "$55.000" y stock "14"
    Cuando "Tostadora Andina" actualiza el "bot_master_prompt" y descripción en "/workspace/products"
    Entonces el share v1 no se modifica automáticamente, pero muestra "Cambios Pendientes Por Publicar"
    Y cuando el líder publica la versión v2 con changelog "Mejorado script de objeciones"
    Y "Tienda Local" revisa el diff v1->v2 y aplica descripción y "bot_master_prompt" mediante POST "/api/tenant/community/adoptions/[id]/sync"
    Entonces el clon pasa a v2 manteniendo intactos "$55.000" y stock "14"

  Escenario: Protección contra re-compartición en cadena, auto-adopción y exceso de cuotas
    Dado que "Tienda Local" posee un producto clonado con "source_share_id" no nulo
    Cuando intenta republicarlo en otra comunidad o cuando un líder intenta clonar su propio share o un miembro excede su cuota de productos
    Entonces el servidor responde HTTP 422 ("CANNOT_RESHARE_CLONED_PRODUCT", "CANNOT_ADOPT_OWN_SHARE" o "PRODUCT_QUOTA_EXCEEDED")

  Escenario: Métricas de liderazgo con atribución estricta entre múltiples comunidades
    Dado que "Tienda Local" vendió 10 unidades de "Café 500g" (Comunidad A) y 25 unidades de "Lámpara LED" (Comunidad B)
    Cuando el líder de Comunidad A consulta GET "/api/tenant/community/leadership-metrics?organizationId=A"
    Entonces el resumen reporta únicamente las 10 unidades y el revenue de Comunidad A sin incluir ventas de Comunidad B ni chats o clientes finales
```

---

## 10. Requisitos no funcionales y observabilidad

- **Aislamiento multi-celda:** `ProductCloningAndCommunitiesService` y `CommunityLeadershipMetricsService` operan siempre vía `CellDatabasePoolManager.withTenantCellTransaction(clientId, ...)` fijando `SET LOCAL app.current_client_id`.
- **Almacenamiento S3 independiente (`SPEC-00`):** Ningún borrado de producto o media en la celda del líder elimina objetos o filas pertenecientes a la celda del miembro.
- **Trazabilidad estructurada (`AGENTS.md §4.13`):** Eventos Pino `tenant.community.leader_requested`, `admin.community.leader_decided`, `tenant.community.organization_created`, `tenant.community.share_published`, `tenant.community.share_version_published`, `tenant.community.product_adopted`, `tenant.community.adoption_synced`, `tenant.community.adoption_unlinked` con `requestId`, `clientId`, `organizationId`, `shareId`.
- **Higiene UI (`SPEC-01`, `SPEC-17`, `AGENTS.md §4.8, §4.15, §4.17`):** Cero términos de infraestructura (`celda`, `SeaweedFS`, `imgproxy`, `pg-cell`), cero códigos de spec visibles, Title Case en formularios, `es`/`en` 100% paritario, `ConfirmationModal` (`--dsn-*`), layout perimetral `w-full space-y-6 p-4 md:px-8 md:py-6`.

---

## 11. Definition of Done

- [ ] Migración Drizzle en `packages/domain/drizzle/` aplicada y validada con `drizzle-kit check` (`community_leader_authorizations`, multi-comunidad, campos extendidos de `organizations` y `product_shares`, seed de `community_feed` y eventos de notificación).
- [ ] Servicios y repositorios Drizzle reales en `packages/domain` para gobernanza, clonación (simples, combos, medios S3 independientes, diff, sync selectivo), muro moderado + privacidad y métricas con atribución estricta.
- [ ] Toggle `community_feed` habilitado en `/admin/plans` (`PlanModalDialog`) y módulo `/admin/communities` operativo en el Backoffice SaaS.
- [ ] Endpoints `/api/tenant/community/*` y `/api/admin/communities/*` validados con Zod, RBAC, `handle()` RFC 9457 y pruebas unitarias/integración.
- [ ] Vista `/workspace/community` completa reemplazando placeholder (`es`/`en`, Title Case, Mobile First, `<WorkspaceDataTable />` / patrones estándar, `ConfirmationModal`), más badge/bloqueo en `/workspace/products`.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1` + verificación HTTP 200 (`AGENTS.md §4.18`).
