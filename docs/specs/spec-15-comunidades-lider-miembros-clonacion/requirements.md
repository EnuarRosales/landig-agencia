# SPEC-15 · Comunidades de Comercios: Gestión de Líder y Miembros (Inquilinos) y Clonación de Catálogo

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-15` |
| **Nombre** | Comunidades de Comercios: Gestión de Líder y Miembros (Ambos Inquilinos) y Clonación de Catálogo |
| **Tipo de intervención** | Habilitación operativa completa de UI/API sobre servicios de dominio existentes |
| **Prioridad** | P2 — Media / Alta (red colaborativa B2B y aceleración de catálogo entre comercios) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-03` (y resolución aprobada de `PV-05`: líder y miembros son inquilinos SaaS) |
| **Specs previas relacionadas** | `ADM-001`, `TNT-001`, `ORD-001` |
| **Specs integradas / dependientes** | `SPEC-00` (clonación segura de referencias multimedia SeaweedFS / imgproxy), `SPEC-03` (capacidad `community_feed` y cuotas `products` + multimedia del comercio adoptante), `SPEC-08` (estructura completa de producto incluyendo `bot_master_prompt`, atributos dinámicos y foto principal), `SPEC-14` (notificaciones de invitación / solicitud / nueva versión de producto), `SPEC-17` (i18n y tablas estándar) |
| **Wave de ejecución sugerida** | Wave 4 — Expansión de Valor y Reglas Transversales UI |

---

## 3. Problema / Situación actual

El dominio ya cuenta con la infraestructura base de comunidades y clonación en `packages/domain`:
- Esquema `packages/domain/src/db/schemas/admin/communities-and-cloning.ts` (`organizations`, `organizationMembers`, `organizationInvitations`, `organizationJoinRequests`, `organizationPromotions`, `clientSharingProfiles`, `productShares`, `productShareVersions`, `productAdoptions`, `cloneSyncPolicies`).
- Servicios `communities-governance.service.ts`, `community-feed.service.ts`, `community-leadership-metrics.service.ts` y `product-cloning.service.ts`.

Sin embargo, en el Backoffice del Inquilino:
1. `apps/admin/app/workspace/community/page.tsx` únicamente muestra un **placeholder estático** (*«Catálogo mayorista y red colaborativa de comercios habilitada»*) cuando el plan incluye `community_feed`, sin ninguna operación real de comunidad ni clonación.
2. No existe ninguna ruta API bajo `apps/admin/app/api/tenant/` para gestionar comunidades, invitaciones/solicitudes entre comercios, compartir productos desde el catálogo del **inquilino líder** ni explorar el feed y clonar productos hacia el catálogo del **inquilino miembro**.
3. Es necesario asegurar compatibilidad con los atributos de producto extendidos en `SPEC-08` (`bot_master_prompt`, `attributes`, `composition_type`, multimedia + `is_cover`) al publicar un `product_share` y al adoptar/sincronizar en la celda destino del inquilino miembro.

---

## 4. Objetivo y valor de negocio

Materializar en el Backoffice del Inquilino (`/workspace/community`) la **red colaborativa entre comercios inquilinos de Mocter (`PV-05`)**:
- Permitir que un **inquilino líder** cree o administre una comunidad de distribuidores/aliados, invite o apruebe **otros inquilinos miembros**, publique productos de su catálogo con versión y precio sugerido, y consulte métricas agregadas de adopción.
- Permitir que un **inquilino miembro** explore el feed de productos compartidos de las comunidades a las que pertenece, revise el detalle y clone productos seleccionados directamente a su propio catálogo en `pg-cell-XX` respetando sus cuotas de plan (`SPEC-03`), eligiendo si mantiene vínculo de sincronización o copia independiente.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Verificación y ajuste de `ProductCloningService`, `CommunitiesGovernanceService`, `CommunityFeedService` y `CommunityLeadershipMetricsService` para garantizar:
  - Compatibilidad con el rol dual entre **dos inquilinos de la SaaS**: inquilino líder (`originator` / `co_leader`) e inquilino miembro (`member`) operando siempre sobre sus respectivas celdas `pg-cell-XX`.
  - Soporte completo en `product_share_versions` y clonación hacia el miembro de: nombre, descripción, `bot_master_prompt`, atributos dinámicos (`PRD-05`), precio sugerido / costo base para el miembro (`wholesalePriceCents` o `suggestedRetailPriceCents`) y referencias multimedia con `is_cover` (`SPEC-00`, `SPEC-08`), validando previamente que el comercio miembro tenga cupo en `products` y multimedia según su plan (`SPEC-03`).
  - Políticas de sincronización explícitas (`clone_sync_policies`): clonación única desconectada vs. sincronización manual/automática de metadatos ante nuevas versiones publicadas por el líder (`syncMode`).
- Creación de la familia completa de endpoints `/api/tenant/community*`:
  - `GET / POST /api/tenant/community/organizations` (mis comunidades como líder o miembro, creación de comunidad si su perfil/plan lo habilita, unirse/solicitar ingreso).
  - `POST /api/tenant/community/organizations/[orgId]/invite` y `POST .../requests/[reqId]/review` (aprobar/rechazar inquilinos solicitantes).
  - `GET / POST /api/tenant/community/shares` (listar y publicar producto propio del líder hacia una comunidad creando versión `v1`, `v2`...).
  - `GET /api/tenant/community/feed` (catálogo compartido visible para miembros activos de la organización, con búsqueda/filtros/paginación).
  - `POST /api/tenant/community/shares/[shareId]/adopt` (clonar producto del líder hacia la celda del inquilino miembro).
  - `POST /api/tenant/community/adoptions/[adoptionId]/sync` y `DELETE .../link` (sincronizar manualmente nueva versión o desvincular clon para convertirlo en producto autónomo).
  - `GET /api/tenant/community/leadership-metrics` (métricas para líder: comercios adoptantes activos, top productos clonados).
- Construcción completa de UI Mobile First en `apps/admin/app/workspace/community/` (manteniendo el bloqueo informativo elegante cuando `community_feed = false`).

### Fuera de alcance
- Liquidación automática de comisiones o pagos mayoristas entre inquilino líder e inquilino miembro dentro de Mocter (cada comercio maneja su facturación externa o registra sus condiciones comerciales).
- Clonación directa de productos sin pertenecer a una comunidad con membresía `active`.

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` (Inquilino Líder / `originator` o `co_leader`) | Crear comunidad, invitar otros comercios por slug/código, aprobar solicitudes, publicar/actualizar versiones de productos propios, ver métricas de liderazgo | Sí | Plan con `community_feed = true` y rol `originator`/`co_leader` en la organización |
| `tenancy_owner` (Inquilino Miembro / `member`) | Aceptar invitaciones o solicitar unirse a una comunidad, explorar feed compartido, clonar productos a su catálogo, sincronizar versiones o desvincular clones | Sí | Membresía `active` en la organización y cupo de catálogo disponible (`SPEC-03`) |
| `tenancy_users` (`tenant_agent`) | Explorar feed compartido de comunidades a las que ya pertenece su comercio | Sí | Solo lectura; clonar o gestionar membresías/publicaciones requiere `tenancy_owner` |
| Inquilino ajeno (no miembro de la organización) | Ver feed, listar miembros o clonar `product_share` de esa comunidad | No | `403 FORBIDDEN` |

---

## 7. Modelo de datos

Se aprovechan y extienden si corresponde las entidades existentes en `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`:
- **`admin.organizations`**: `id`, `name`, `slug`, `description`, `originator_client_id` (inquilino líder fundador), `visibility` (`'private_invite' | 'request_to_join'`), `status` (`'active' | 'suspended'`).
- **`admin.organization_members`**: `organization_id`, `client_id` (inquilino participante), `role` (`'originator' | 'co_leader' | 'member'`), `status` (`'active' | 'suspended' | 'left'`).
- **`admin.product_shares` y `admin.product_share_versions`**:
  - `sharer_client_id`: `UUID` FK → `admin.clients.id` (siempre un inquilino líder/co-líder).
  - `source_product_id`, `source_cell_id`, `current_version`.
  - Snapshot en `product_share_versions.payload` (`JSONB`): incluye `name`, `description`, `kind`, `compositionType`, `suggestedPriceCents`, `wholesaleCostCents`, `botMasterPrompt`, `attributes`, `mediaSnapshot[]` (con `isCover` y referencia segura para duplicar metadato en destino sin mutar el original del líder).
- **`admin.product_adoptions` y `admin.clone_sync_policies`**:
  - `share_id`, `adopter_client_id` (inquilino miembro), `clone_product_id`, `clone_cell_id`, `adopted_version`, `link_active` (`BOOLEAN`), `sync_policy` (`'manual' | 'notify_only' | 'auto_metadata'`).
- **Aislamiento de celdas al clonar:** El servicio de clonación lee el snapshot aprobado de `admin.product_share_versions` (nunca expone credenciales ni datos privados de la celda del líder directamente al navegador del miembro) e inserta el nuevo producto exclusivamente dentro de `pg-cell-XX` del `adopter_client_id` bajo su `app.current_client_id`.
- **Estrategia de eliminación:** Si el líder retira un `product_share` de la comunidad o un miembro sale de la comunidad, los productos ya clonados en el catálogo del miembro **NO se borran**; `product_adoptions.link_active` pasa a `false` preservando la operación y los pedidos históricos del miembro.

---

## 8. Reglas de negocio

- **RN-SPEC-15-01 (Relación Inquilino Líder → Inquilino Miembro `PV-05`):** Toda comunidad vincula cuentas inquilinas reales (`admin.clients`). Tanto el distribuidor/marca líder que comparte productos como los comercios miembros que los clonan operan cada uno desde su propio workspace Mocter bajo su propio `client_id` y celda asignada.
- **RN-SPEC-15-02 (Prevención de auto-adopción y re-compartición en cadena):** Un inquilino líder no puede clonar sobre sí mismo un `product_share` que él mismo publicó (`422 CANNOT_ADOPT_OWN_SHARE`), y por defecto un producto ya clonado (`source_share_id IS NOT NULL` en `cell_products`) no puede republicarse como producto maestro original a otra comunidad para evitar pirámide de copias inconsistentes (`422 CANNOT_RESHARE_CLONED_PRODUCT`).
- **RN-SPEC-15-03 (Respeto estricto a cuotas del comercio miembro `SPEC-03`):** Antes de materializar la clonación (`POST /adopt`), el sistema valida en `TenantCapabilityGateService` que el inquilino miembro disponga de cupo en `products` y ajuste la copia de medios según sus topes (`images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`, `storage_bytes`). Si supera el cupo de productos, rechaza con `422 PRODUCT_QUOTA_EXCEEDED`. Si tiene menos cupo de un medio (ej. plan del miembro permite 0 videos), informa o omite los medios excedentes con aviso explícito según configuración elegida sin violar su plan.
- **RN-SPEC-15-04 (Independencia operativa y opcionalidad de precios del clon):** Al clonarse en `cell_products` del miembro, el producto hereda el nombre, descripción, atributos, `bot_master_prompt` y foto principal, registrando `source_share_id` y poniendo su `cost_price_cents` inicial igual al `wholesaleCostCents` (o sugerido) para que el miembro ajuste su precio de venta (`price_cents`) y su stock físico local (`stock_quantity` inicia en `0` o configurable, nunca comparte inventario del líder salvo consulta informativa).
- **RN-SPEC-15-05 (Versionamiento y desvinculación segura):** Cuando el líder publica una nueva versión (`v2`) de un producto compartido, los clones vinculados (`link_active = true`) reciben indicador «Nueva Versión Disponible» (con política `manual` o notificación según `SPEC-14`) permitiendo al miembro revisar qué cambió antes de aplicar sincronización sobre descripción/atributos/prompt sin sobreescribir su precio de venta ni stock propios. El miembro o el líder pueden desvincular (`link_active = false`) en cualquier momento tras confirmación modal `--dsn-*`.

---

## 9. Contratos de interfaz

- `GET /api/tenant/community/overview`: Estado de capacidad `community_feed`, comunidades donde participa el comercio, invitaciones/solicitudes pendientes y métricas si es líder.
- `POST /api/tenant/community/organizations`: Crear comunidad (nombre, descripción, visibilidad).
- `POST /api/tenant/community/organizations/[orgId]/invite`: `{ targetClientSlugOrEmail, role: 'member' | 'co_leader' }` (permite invitar comercios existentes en Mocter sin exponer datos privados ajenos).
- `POST /api/tenant/community/invitations/[id]/respond` y `POST .../requests/[id]/review`: Aceptar/rechazar invitaciones o solicitudes.
- `GET / POST /api/tenant/community/shares` & `POST /api/tenant/community/shares/[shareId]/version`: Líder publica o actualiza versión de producto propio hacia una comunidad.
- `GET /api/tenant/community/feed`: Listado paginado, filtrable y ordenable de productos compartidos en comunidades activas del inquilino.
- `POST /api/tenant/community/shares/[shareId]/adopt`: `{ syncPolicy: 'manual' | 'notify_only', customSalePriceCents?, initialStock? }` → ejecuta clonación en celda destino y retorna ID del nuevo producto en `/workspace/products`.
- `POST /api/tenant/community/adoptions/[adoptionId]/sync` y `DELETE /api/tenant/community/adoptions/[adoptionId]/link`.

---

## 10. Especificación de UI/UX

- **Vista `/workspace/community`:**
  - Si `community_feed === false`: mantiene tarjeta elegante con acceso directo a `/workspace/billing`.
  - Si `community_feed === true`: diseño Mobile First por pestañas claras:
    1. **Catálogo De Comunidad (Para Miembros):** Grid / Tabla con filtros por comunidad/categoría, miniatura (`cover`), precio sugerido, nombre del comercio líder, indicador «Ya Clonado» si ya fue adoptado, botón «Ver Ficha» y botón «Clonar A Mi Catálogo» (abre modal rápido donde el miembro confirma o ajusta su precio de venta al público y stock inicial).
    2. **Mis Productos Clonados:** Lista paginada con badge de estado (`Sincronizado v2` / `Actualización Disponible v3` / `Desvinculado`), botón «Actualizar Desde Líder» y «Desvincular» (modal `--dsn-*`, cero `window.confirm`).
    3. **Gestión De Mi Comunidad (Para Líderes):** Botón «Crear Comunidad», tabla de comercios miembros e invitaciones/solicitudes, selector de productos propios para «Compartir En Comunidad» / «Publicar Nueva Versión» y métricas agregadas (clones activos y top productos adoptados).
- Todos los labels en **Title Case**, `es`/`en` i18n, cero códigos internos en vistas.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Comunidades Líder-Miembros (Inquilinos) y Clonación de Productos

  Escenario: Inquilino líder comparte producto y un inquilino miembro lo clona a su propio catálogo
    Dado que el comercio inquilino "Marca Central" es líder ("originator") de la comunidad "Distribuidores Café"
    Y el comercio inquilino "Tienda Local" es miembro activo de la misma comunidad con cupo de productos disponible
    Cuando "Marca Central" publica su producto "Café Molido 500g" (con bot_master_prompt, atributos y foto principal) en la comunidad
    Y "Tienda Local" abre "/workspace/community", consulta el feed y ejecuta "Clonar A Mi Catálogo" definiendo su precio de venta "$52.000"
    Entonces el servicio crea una copia independiente en "cell_products" de "Tienda Local" con "source_share_id" registrado
    Y copia la ficha, prompt maestro, atributos y portada sin alterar el producto original ni el stock de "Marca Central"

  Escenario: Líder publica nueva versión de producto y miembro decide sincronizar metadatos sin perder su precio ni stock
    Dado que "Tienda Local" tiene clonado "Café Molido 500g" en versión 1 con su propio precio "$52.000" y stock "18"
    Cuando "Marca Central" publica versión 2 mejorando descripción y prompt maestro
    Y "Tienda Local" pulsa "Actualizar Desde Líder" mediante POST "/api/tenant/community/adoptions/[id]/sync"
    Entonces el clon actualiza su descripción y prompt a la versión 2 manteniendo intactos "$52.000" y stock "18"
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo al intentar crear comunidad con nombre vacío o invitar correo mal formado
    Dado que un usuario envía POST "/api/tenant/community/organizations" con "name = ''"
    Cuando el servidor valida con Zod
    Entonces responde HTTP 400 Problem Details
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo cuando un inquilino miembro excede su cuota de productos al intentar clonar
    Dado que el comercio miembro tiene 50/50 productos creados en su plan
    Cuando intenta clonar un producto compartido desde el feed
    Entonces el backend rechaza la clonación con HTTP 422 "PRODUCT_QUOTA_EXCEEDED" sin crear registro parcial

  Escenario: Prevención de clonación del propio producto compartido o re-compartición en cadena
    Dado que "Marca Central" publicó el share S1
    Cuando intenta clonarse a sí misma el share S1 o un miembro intenta republicar su clon hacia otra comunidad
    Entonces el servidor retorna HTTP 422 ("CANNOT_ADOPT_OWN_SHARE" o "CANNOT_RESHARE_CLONED_PRODUCT")
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Inquilino no miembro de comunidad privada no puede ver el feed ni clonar sus productos
    Dado que el comercio "Externo SAS" no pertenece a la comunidad privada "Distribuidores Café"
    Cuando consulta el feed o invoca POST "/api/tenant/community/shares/[shareId]/adopt"
    Entonces el backend responde HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Desvinculación o salida de comunidad conserva los productos clonados como catálogo propio del miembro
    Dado que "Tienda Local" clonó 5 productos de una comunidad y decide desvincular o salir de ella
    Cuando confirma la operación en modal "--dsn-*"
    Entonces "product_adoptions.link_active" pasa a false pero los 5 productos permanecen operativos en el catálogo y pedidos históricos de "Tienda Local"
```

---

## 12. Requisitos no funcionales

- **Aislamiento multi-celda:** `ProductCloningService` resuelve conexiones independientes para `sourceCellId` y `cloneCellId` vía `CellDatabasePoolManager` sin mezclar nunca contextos `app.current_client_id`.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.community.share_published`, `tenant.community.product_adopted`, `tenant.community.adoption_synced` con `requestId`, `sharerClientId`, `adopterClientId`, `shareId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (clonación de referencia/objeto multimedia en SeaweedFS sin que borrar el original rompa el clon), `SPEC-03` (gating `community_feed` y cuotas `products`), `SPEC-08` (campos extendidos de producto), `SPEC-14` (avisos de invitaciones/nuevas versiones).
- **Riesgos:**
  - *Eliminación de archivo físico SeaweedFS por el líder dejando enlace roto en el clon:* Mitigado copiando o manteniendo referencia ref-counted / copia independiente de key S3 en la celda del adoptante al clonar.

---

## 14. Definition of Done

- [ ] `ProductCloningService`, `CommunitiesGovernanceService` y `CommunityFeedService` actualizados para soportar todos los campos de `SPEC-08` y aislamiento inquilino líder → inquilino miembro.
- [ ] Endpoints `/api/tenant/community/*` creados, validados con Zod, `handle()` RFC 9457, RBAC y tests entre dos inquilinos distintos.
- [ ] Vista `/workspace/community` completa reemplazando placeholder (`es`/`en`, Title Case, Mobile First, tablas estándar y modales `--dsn-*`).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Aprobada la aclaración `PV-05`: tanto el líder de comunidad como los miembros son cuentas inquilinas activas de la SaaS y la clonación ocurre desde el catálogo del inquilino líder hacia el catálogo del inquilino miembro. Sin preguntas pendientes.

