# SPEC-09 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender `crm.ts` con campos omnicanales/ampliados, `cell_contact_ratings` y `cell_contact_addresses` + migraciones de celda**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/crm.ts`, `packages/domain/drizzle-cell/0015_cell_phase7_crm_spec09.sql`, `packages/domain/drizzle-cell/0016_cell_phase7_crm_spec09_rls_grants_comments.sql`, `packages/domain/src/db/schemas/tenant/crm-schema.test.ts`.
  - **Detalle:** Agregar `phoneSecondary`, `companyName`, `birthDate`, `preferredChannel`, `lastChannel`, `lastInboundMessageAt`, `lastWhatsappInboundAt`, `currentRatingStars`, `currentRatingComment`, `convertedToCustomerAt`; ampliar `contacts_source_check`; definir `cellContactRatings` y `cellContactAddresses` con FK compuesta `(client_id, contact_id)` y RLS `app.current_client_id`.
  - **Verificación:** `pnpm --filter @mocter/domain run db:check:cell` y `pnpm --filter @mocter/domain test crm-schema`.

- [x] **T-02 · Implementar helpers omnicanal/ventana 24h y métodos avanzados en `CrmService` + repositorio / workspace**
  - **Archivos:** `packages/domain/src/services/crm.service.ts`, `packages/domain/src/repositories/crm.repository.interface.ts`, `packages/domain/src/repositories/drizzle-crm.repository.ts`, `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/services/crm.service.test.ts`.
  - **Detalle:** Implementar `computeWhatsappWindow`, `normalizeChatwootChannel`, reconciliación omnicanal en `ingestFromChatwoot`, rechazo de duplicados en creación manual (`CONFLICT`), cuota `contacts` (`SPEC-03`), `rateContact` con historial, CRUD de direcciones múltiples con invariante `is_default`, cambio de etapa/conversión, otorgamiento/revocación manual de consentimientos y consultas paginadas con ordenamiento por prioridad WhatsApp.
  - **Verificación:** `pnpm --filter @mocter/domain test crm`.

- [x] **T-03 · Normalizar ingesta omnicanal y refrescar `last_inbound_message_at` / `last_whatsapp_inbound_at` en webhook de Chatwoot**
  - **Archivos:** `apps/admin/app/api/webhooks/chatwoot/route.ts`, `apps/admin/app/api/webhooks/chatwoot/route.test.ts`.
  - **Detalle:** Detectar canal real (`WhatsApp`, `Instagram`, `Facebook`, `Web`, `Telegram`, `Email`, `SMS`, `API`, `Line`) y mensajes entrantes (`message_type === 'incoming' || 0`) actualizando actividad omnicanal y, solo si es WhatsApp, el timestamp de ventana 24h.
  - **Verificación:** `pnpm --filter @mocter/admin test route.test.ts`.

- [x] **T-04 · Crear y actualizar endpoints `/api/tenant/contacts*` (listado/alta multi-fuente, ficha `[id]`, calificaciones, direcciones, etapa y consentimientos)**
  - **Archivos:** `apps/admin/app/api/tenant/contacts/route.ts`, `apps/admin/app/api/tenant/contacts/_shared.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/ratings/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/addresses/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/addresses/[addressId]/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/stage/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/consents/route.ts` [Nuevo], `apps/admin/app/api/tenant/contacts/[id]/consents/[consentId]/revoke/route.ts` [Nuevo].
  - **Detalle:** Zod + `handle()` RFC 9457 (`400`, `401`, `403`, `404`, `409 Conflict`) + RBAC (`tenant_agent` bloqueado en `DELETE` contacto) + aislamiento estricto `clientId` + pruebas de integración.
  - **Verificación:** `pnpm --filter @mocter/admin test spec09-contacts-routes`.

- [x] **T-05 · Construir UI omnicanal integral en `/workspace/contacts`**
  - **Archivos:** `apps/admin/app/workspace/contacts/page.tsx`, `apps/admin/app/workspace/contacts/contacts-view.tsx`, `apps/admin/app/workspace/contacts/contact-detail-modal.tsx` [Nuevo], `apps/admin/lib/i18n.ts`.
  - **Detalle:** Tabla estándar `<DataTable />` (`SPEC-17`) paginada/ordenable/filtrable con prioridad WhatsApp, badges de fuente/canal y ventana 24h, acceso a `/workspace/conversations`, modal creación multi-fuente, modal 4 pestañas (`Datos Generales`, `Direcciones De Envío`, `Calificación E Historial`, `Atención Y Consentimiento`); modales `--dsn-*` (`ConfirmationModal`), cero `window.confirm`, Title Case, Mobile First, i18n `es`/`en` 100% paridad.
  - **Verificación:** `pnpm --filter @mocter/admin test i18n` y pruebas de vista `/workspace/contacts`.

- [x] **T-06 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `pnpm --filter @mocter/domain run db:check:cell`, build y reinicio de `mocter-core-admin-portal-1` (y `mocter-core-web-portal-1` por cambio en `@mocter/domain`), verificación HTTP 200 y logs limpios.
