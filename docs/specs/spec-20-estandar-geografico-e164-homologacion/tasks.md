# SPEC-20 · Plan de Tareas · Estándar Geográfico Internacional, Teléfonos E.164 y Homologación Conversacional

| Atributo | Valor |
| --- | --- |
| **ID** | `SPEC-20` |
| **Versión** | `1.0.0` |
| **Depende de** | [`requirements.md`](requirements.md), [`design.md`](design.md) |
| **Estado** | Implementada · Verificada en Control Plane, Celda y Portales (`@mocter/domain`, `@mocter/admin`, `@mocter/web`) |

---

## Tareas de Implementación

### `T-01` · Fundación Geográfica ISO 3166-1/2, Perfiles por País y Validador E.164 (`@mocter/domain`)
- [x] **T-01.1**: Incorporar `libphonenumber-js` como dependencia en `packages/domain/package.json` y crear el módulo `packages/domain/src/geo/phone-e164.ts` con `normalizeAndValidatePhoneE164`, `formatPhoneForFormInput` e `inferCandidateCountriesFromE164` (manejo explícito de prefijos compartidos como `+1`), reemplazando el regex ingenuo en `packages/domain/src/services/crm-omnichannel.helpers.ts` sin romper casos de prueba válidos.
- [x] **T-01.2**: Crear `packages/domain/src/geo/country-profiles.ts` y `packages/domain/src/geo/iso-subdivisions.ts` con catálogo ISO 3166-1 alpha-2, helper 1:1 hacia ISO numérico (`032`, `170`) para adaptadores externos, perfiles `CountryAddressProfile` (etiquetas localizadas `es`/`en` de subdivisión y localidad dependiente, reglas de código postal y `callingCode`) y catálogo ISO 3166-2 por país.
- [x] **T-01.3**: Agregar suite unitaria en `packages/domain/src/geo/geo-and-phone.test.ts` validando números reales/inválidos de múltiples países (CO, AR, MX, CR, US, ES), desempate de prefijo `+1` y perfiles de dirección por país.
- **Verificación:** `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain lint`.

### `T-02` · Esquemas Drizzle y Migraciones Aditivas BD Central + BD de Celda (`@mocter/domain`)
- [x] **T-02.1**: Actualizar `packages/domain/src/db/schemas/admin/clients.ts` (`countryCode`, `subdivisionCode`, `addressComplement`) y crear `packages/domain/src/db/schemas/admin/geo-provider-locations.ts` (`admin.geo_provider_locations`) exportándolo desde `packages/domain/src/db/schemas/admin/index.ts`.
- [x] **T-02.2**: Actualizar en BD de Celda `packages/domain/src/db/schemas/tenant/crm.ts` (`cellContacts`, `cellContactAddresses`), `conversation-state.ts` (`cellConversationState`) y `orders.ts` (`cellOrders`) agregando `countryCode`, `subdivisionCode`, `neighborhood`, `addressComplement`, `referenceNotes`, `geoResolutionStatus`, `rawLocationInput`, `providerGeoRefs` y `phoneValidationStatus`.
- [x] **T-02.3**: Generar nuevas migraciones SQL versionadas y unificadas con `SPEC-10` (sin editar migraciones previas, regla `R-09`) en `packages/domain/drizzle/` (`0037_*`) y `packages/domain/drizzle-cell/` (`0017_*` + `0018_*_rls_grants_comments.sql`) con `COMMENT ON TABLE`, `COMMENT ON COLUMN`, índices compuestos iniciando por `client_id`, backfill seguro de nombres de país unívocos hacia ISO alpha-2 y permisos/grants de celda.
- [x] **T-02.4**: Actualizar pruebas de esquema (`admin-schema.test.ts`, `crm-schema.test.ts`, `orders-schema.test.ts`, `cell-auth-schema.test.ts`) verificando columnas, checks, índices y comentarios.
- **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`, `pnpm --filter @mocter/domain exec drizzle-kit check --config=drizzle.cell.config.ts` y `pnpm --filter @mocter/domain test`.

### `T-03` · Motor `LocationResolverService`, ACL Logístico y Servicios de Dominio (`@mocter/domain`)
- [x] **T-03.1**: Definir el contrato de repositorio/puerto ACL `IGeoProviderLocationsRepository` (`packages/domain/src/repositories/geo-provider-locations.repository.interface.ts`) y el servicio determinístico `LocationResolverService` (`packages/domain/src/services/location-resolver.service.ts`) con normalización Unicode, tabla de alias comunes (p. ej. `"Medallo"` → `"Medellín"`, `"CABA"` → `"Ciudad Autónoma de Buenos Aires"`), inferencia contextual (`E.164 + clients.country_code`), desambiguación (`ambiguous`) y tolerancia de CRM sin conector activo (`soft_normalized` / `unresolved`).
- [x] **T-03.2**: Implementar `DrizzleGeoProviderLocationsRepository` (`packages/domain/src/repositories/drizzle-geo-provider-locations.repository.ts`), mappers ACL iniciales para `dropi` (absorbiendo departamentos sin `department_code`, duplicados tipo `LA GUAJIRA`/`GUAJIRA` y DANE de 8 dígitos), `effi` (DANE 5 dígitos) y `mercadolibre` (ISO 3166-2 + IDs de ciudad), y exportar módulos/tipos públicos en `packages/domain/src/index.ts`.
- [x] **T-03.3**: Actualizar `CrmService`, `OrdersService`, `TenantProfileService`, `TenantOnboardingService`, `TenancyService` y `LeadService` para validar E.164 con `libphonenumber-js` en todos los teléfonos de contacto/comercio/pedido, persistir el set híbrido completo de dirección (`countryCode`, `subdivisionCode`, `neighborhood`, `addressComplement`, `referenceNotes`, `geoResolutionStatus`, `providerGeoRefs`), sincronizar dirección predeterminada con `contacts` y actualizar la resolución de pasarela de pago por `countryCode`.
- [x] **T-03.4**: Agregar pruebas unitarias para `LocationResolverService`, ACL de Dropi/Effi y regresión en `crm.service.test.ts`, `orders.service.test.ts`, `tenant-profile.service.test.ts`, `tenant-onboarding.service.test.ts` y `lead.service.test.ts`.
- **Verificación:** `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain build`.

### `T-04` · Integración Conversacional del Bot y Bloque `core.order_flow` v2 (`@mocter/domain`)
- [x] **T-04.1**: Actualizar `ConversationStateService` (`packages/domain/src/services/conversation-state.service.ts`) para aceptar y conservar por turno `countryCode`, `subdivisionCode`, `stateName`, `neighborhood`, `addressLine`, `addressComplement`, `postalCode`, `referenceNotes`, `geoResolutionStatus` y `providerGeoRefs`.
- [x] **T-04.2**: Actualizar `BotOrderCaptureService` (`packages/domain/src/services/bot-order-capture.service.ts`) ampliando `RegistrarPedidoToolInput.shipping` con el contrato híbrido completo (`countryCode`, `subdivisionCode`, `neighborhood`, `addressComplement`, `referenceNotes`, `geoResolutionStatus`, `providerGeoRefs`), ejecutando `LocationResolverService` antes de delegar en `OrdersService` y normalizando teléfonos locales sin `+` usando `clients.country_code` (`allowLocalWithDefaultCountry: true`).
- [x] **T-04.3**: Actualizar `INITIAL_PROMPT_BLOCKS` (`core.order_flow` a `version: 2`) en `packages/domain/src/services/prompt-blocks.seed.ts` (y promoción automática en seed) para capturar el contrato híbrido internacional en `es`/`en` (incorporando País, División administrativa genérica, Ciudad, Barrio/Colonia, Dirección, Complemento y Referencias), además de registrar la tool `resolve_location` en el runtime del bot con manejo explícito de `ambiguous` y `unresolved`.
- [x] **T-04.4**: Actualizar `bot-runtime.test.ts` y `bot-engine.test.ts` cubriendo inferencia desde prefijo E.164, desambiguación de homónimos (`Rionegro`), captura sin conector activo y preservación de `Complemento` + `Barrio/Colonia`.
- **Verificación:** `pnpm --filter @mocter/domain test`.

### `T-05` · Validación Zod en Endpoints API y Server Actions (`@mocter/admin`, `@mocter/web`)
- [x] **T-05.1**: Actualizar esquemas Zod en `apps/admin/app/api/tenant/contacts/_shared.ts` (validando E.164 en `phoneMobile` y `phoneSecondary`, y agregando `countryCode`, `subdivisionCode`, `addressComplement` en alta/edición de contacto y direcciones), más rutas de `/api/tenant/profile`, `/api/tenant/onboarding`, `/api/admin/tenants` y `/api/tenant/orders` (cuando aplique).
- [x] **T-05.2**: Actualizar `apps/web/app/actions/demo-request.ts` para exigir y validar formato E.164 en solicitudes de demo desde la landing pública.
- [x] **T-05.3**: Actualizar pruebas de API y Server Actions (`spec09-contacts-routes.test.ts`, `demo-request.test.ts` y rutas afectadas).
- **Verificación:** `pnpm --filter @mocter/admin test` y `pnpm --filter @mocter/web test`.

### `T-06` · Componentes UI Compartidos, Diccionarios i18n y Migración de Formularios (`@mocter/admin`, `@mocter/web`)
- [x] **T-06.1**: Actualizar diccionarios i18n (`apps/admin/lib/i18n.ts`, `apps/web/messages/es.json`, `apps/web/messages/en.json`) con paridad 100 % `es`/`en`, formato Title Case gramatical (`AGENTS.md §4.8`) y cero códigos técnicos de spec en UI (`SPEC-01`).
- [x] **T-06.2**: Construir `<PhoneE164Input />` (`apps/admin/components/phone-e164-input.tsx` y `apps/web/components/phone-e164-input.tsx`) y `<GeoAddressFields />` (`apps/admin/components/geo-address-fields.tsx`) con diseño Mobile First, accesibilidad de teclado/lectores y tokens `--dsn-*`.
- [x] **T-06.3**: Migrar todos los formularios inventariados en `SPEC-20 §5.3`:
  - `apps/admin/app/workspace/contacts/contacts-view.tsx` (móvil + secundario + dirección inicial completa con Barrio y Complemento).
  - `apps/admin/app/workspace/contacts/contact-detail-modal.tsx` (teléfonos E.164 + pestaña Direcciones con `<GeoAddressFields />`).
  - `apps/admin/app/onboarding/steps/step-business.tsx` (teléfono E.164 + país del comercio).
  - `apps/admin/app/workspace/profile/profile-view.tsx` (teléfono E.164 + `<GeoAddressFields />`).
  - `apps/admin/app/admin/tenants/create-tenant-form.tsx` y `tenant-actions.tsx` (teléfono E.164 + país ISO).
  - `apps/admin/app/admin/orders/new-order-dialog.tsx` (teléfono E.164 + campos geográficos completos).
  - `apps/web/components/demo-form.tsx` y `apps/web/components/admin/crm/contacts-dashboard.tsx` (`<PhoneE164Input />`).
- [x] **T-06.4**: Actualizar y ampliar pruebas de interfaz (`workspace-views.test.tsx`, `tenant-onboarding-wizard.test.tsx`, `components/geo-and-phone-inputs.test.tsx`).
- **Verificación:** `pnpm --filter @mocter/admin lint`, `pnpm --filter @mocter/admin test`, `pnpm --filter @mocter/web lint`, `pnpm --filter @mocter/web test`.

### `T-07` · Compilación Integral, Migraciones Locales, Reinicio de Contenedores y Health Check (`AGENTS.md §4.18`)
- [x] **T-07.1**: Ejecutar `pnpm lint` y `pnpm test` en todo el monorepo, verificar migraciones locales (`db:migrate` / `db:migrate:cell`) y ejecutar `pnpm --filter @mocter/domain build` + `next build` en `apps/admin` y `apps/web`.
- [x] **T-07.2**: Recompilar y reiniciar los contenedores Docker afectados (`mocter-core-admin-portal-1`, `mocter-core-web-portal-1`) verificando código HTTP `200`, logs estructurados limpios y actualización del índice de specs en `.agents/AGENTS.md` tras confirmar cierre de la spec.
- **Verificación:** `curl -I http://localhost:...` / comprobación HTTP `200` y logs sin excepciones en ambos portales.
