# SPEC-01 · Tareas de Implementación

## Tareas

- [ ] **T-01 · Limpiar textos y renderizar logo del comercio en el Tablero (`TAB-02`, `TRV-04`)**
  - **Archivos:** `packages/domain/src/services/tenant-workspace.service.ts` (exponer `logoUrl` en `WorkspaceDashboardDto`), `apps/admin/app/workspace/workspace-dashboard-view.tsx` (L53–68 y L249).
  - **Verificación:** Inspección de `WorkspaceDashboardView` y test de unidad.

- [ ] **T-02 · Sustituir etiquetas y subtítulos en Productos, Contactos, Pedidos, Equipo y Bot (`PRD-01`, `PRD-02`, `CRM-01`, `PED-01`, `EQU-01`, `TRV-04`)**
  - **Archivos:** `products-view.tsx`, `contacts-view.tsx`, `orders-view.tsx`, `team-view.tsx`, `bot-view.tsx`, `tenant-workspace-shell.tsx` y archivos de diccionarios i18n (`es`/`en`).
  - **Verificación:** Cero coincidencias en búsqueda `rg -i "(seaweedfs|imgproxy|pg-cell|nodo celular|catálogo celular|crm celular|ventas celulares|membresías celulares|celda física)" apps/admin/app/workspace apps/admin/components/tenant-workspace-shell.tsx`.

- [ ] **T-03 · Crear suite de regresión léxica automatizada (`TRV-04`)**
  - **Archivos:** `apps/admin/app/workspace/terminology-hygiene.test.ts`.
  - **Verificación:** `pnpm --filter @mocter/admin test terminology-hygiene`.

- [ ] **T-04 · Compilar, reiniciar `admin-portal` y verificar vistas en navegador (`AGENTS.md §4.18`)**
  - **Verificación:** `pnpm lint`, `pnpm test` y respuesta HTTP 200 en `/workspace` y subrutas.

