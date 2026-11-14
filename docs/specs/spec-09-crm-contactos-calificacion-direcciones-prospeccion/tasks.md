# SPEC-09 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender `crm.ts` con campos ampliados, `cell_contact_ratings` y `cell_contact_addresses`**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/crm.ts`, script de migración de celdas.
  - **Detalle:** Agregar `phoneSecondary`, `companyName`, `birthDate`, `currentRatingStars`, `currentRatingComment`, `lastInboundMessageAt`, `convertedToCustomerAt`, `deletedAt`, y definir nuevas tablas con RLS `app.current_client_id`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar helper de ventana WhatsApp 24h y métodos avanzados en `CrmService`**
  - **Archivos:** `packages/domain/src/services/crm.service.ts`, `packages/domain/src/services/crm.service.test.ts`, `packages/domain/src/services/tenant-contacts-and-users.service.ts`.
  - **Detalle:** Implementar `computeWhatsappWindow`, `rateContact` con historial, CRUD de direcciones múltiples con invariante `is_default`, y cambio de etapa / conversión con cuota del plan (`SPEC-03`).
  - **Verificación:** `pnpm --filter @mocter/domain test crm`.

- [ ] **T-03 · Sincronizar `last_inbound_message_at` en webhook de Chatwoot**
  - **Archivos:** `apps/admin/app/api/webhooks/chatwoot/route.ts`, `apps/admin/app/api/webhooks/chatwoot/route.test.ts`.
  - **Detalle:** Actualizar `last_inbound_message_at` ante eventos entrantes reales sin afectar flujo existente.
  - **Verificación:** `apps/admin/app/api/webhooks/chatwoot/route.test.ts`.

- [ ] **T-04 · Crear endpoints `/api/tenant/contacts/[id]*` (ficha, calificaciones, direcciones, etapa)**
  - **Archivos:** `apps/admin/app/api/tenant/contacts/route.ts`, `apps/admin/app/api/tenant/contacts/[id]/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/ratings/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/addresses/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/addresses/[addressId]/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/stage/route.ts` [Nuevo].
  - **Detalle:** Zod + `handle()` RFC 9457 + RBAC (`tenant_agent` bloqueado en `DELETE` contacto) + aislamiento estricto `clientId`.
  - **Verificación:** Pruebas de integración en `tenant-routes.test.ts`.

- [ ] **T-05 · Construir UI integral en `/workspace/contacts`**
  - **Archivos:** `apps/admin/app/workspace/contacts/contacts-view.tsx`, `apps/admin/app/workspace/contacts/contact-detail-modal.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Tabla paginada/ordenable/filtrable con badge de ventana 24h y estrellas; modal 4 pestañas (Datos Generales + Empresa/Cumpleaños/Tel2, Múltiples Direcciones, Calificación 1–5 + Historial, Prospección/Consentimiento); modales `--dsn-*` (cero `window.confirm`, Title Case, Mobile First).
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-06 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/contacts`.

