# SPEC-15 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Actualizar tipos de snapshot en `communities-and-cloning.ts` y `ProductCloningService`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`, `packages/domain/src/services/product-cloning.service.ts`, `product-cloning.service.test.ts`, `communities-governance.service.ts`, `community-feed.service.ts`.
  - **Detalle:** Incluir campos `SPEC-08` en snapshot versionado, validar cuotas del comercio adoptante (`SPEC-03`), duplicar referencias S3 independientes en SeaweedFS (`SPEC-00`), impedir auto-adopción y re-compartición en cadena, y proteger precio/stock del miembro al sincronizar.
  - **Verificación:** `pnpm --filter @mocter/domain test product-cloning communities-governance community-feed`.

- [ ] **T-02 · Crear endpoints REST `/api/tenant/community/*`**
  - **Archivos:** `apps/admin/app/api/tenant/community/{overview,organizations,feed,shares,adoptions}/**` [Nuevos].
  - **Detalle:** Control de acceso por `clientId`, capacidad `community_feed`, rol en comunidad (`originator` vs `member`), Zod y `handle()` RFC 9457.
  - **Verificación:** Pruebas de integración entre inquilino líder e inquilino miembro.

- [ ] **T-03 · Reemplazar placeholder y construir UI completa en `/workspace/community`**
  - **Archivos:** `apps/admin/app/workspace/community/page.tsx`, `community-view.tsx` [Nuevo] y pestañas modulares, diccionarios i18n `es`/`en`.
  - **Detalle:** Pestañas de Feed / Mis Clones / Administración De Comunidad (Líder), modal rápido de clonación con ajuste de precio/stock, tablas estándar Mobile First, Title Case y modales `--dsn-*` para desvincular o salir.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-04 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/community`.

