# SPEC-01 · Diseño Técnico · Higiene Terminológica de la UI del Inquilino

## 1. Mapa de Reemplazos Exactos por Archivo

| Archivo (`apps/admin/...`) | Ubicación actual | Texto / Elemento Defectuoso | Reemplazo Canónico (`es` / `en`) | ID |
|---|---|---|---|---|
| `app/workspace/workspace-dashboard-view.tsx` | L53–55 | `<Store />` fijo | `<img src={logoUrl} />` si existe, si no `<Store />` | `TAB-02` |
| `app/workspace/workspace-dashboard-view.tsx` | L66 | `Nodo Celular: {cellCode} · Moneda Operativa: {currency}` | `Moneda Operativa: {currency}` / `Operating Currency: {currency}` | `TAB-02` |
| `app/workspace/workspace-dashboard-view.tsx` | L249 | `Sube fotos a SeaweedFS con firma automática.` | `Publica fotos, videos y detalles de tus productos.` | `TRV-04` |
| `app/workspace/products/products-view.tsx` | L189 | `Catálogo Celular` | `Catálogo Comercial` / `Commercial Catalog` | `PRD-01` |
| `app/workspace/products/products-view.tsx` | L193 | `Gestión transaccional de productos con imágenes alojadas en SeaweedFS y optimización con imgproxy.` | `Administra tu portafolio de productos, precios, inventario y galería multimedia para tus canales de venta.` | `PRD-02` |
| `app/workspace/contacts/contacts-view.tsx` | L70 | `CRM Celular` | `Directorio De Clientes` / `Customer Directory` | `CRM-01` |
| `app/workspace/orders/orders-view.tsx` | L60 | `Ventas Celulares` | `Gestión De Pedidos` / `Order Management` | `PED-01` |
| `app/workspace/team/team-view.tsx` | L23 | `Membresías Celulares` | `Usuarios` / `Users` | `EQU-01` |
| `app/workspace/bot/bot-view.tsx` | L127 | `...actualizada exitosamente en la celda física.` | `Configuración del asistente actualizada exitosamente.` | `TRV-04` |
| `components/tenant-workspace-shell.tsx` | L293, L398–399, L510–513 | `{tenantInfo.cellCode}`, `Celda de datos`, `Conectado a {cellCode}` | Indicador verde + `Conectado` / `Connected` (coordinado con `SPEC-07`) | `TRV-04` |

---

## 2. Guardia Automatizada en Pruebas (`terminology-hygiene.test.ts`)

Se implementará una prueba unitaria en `apps/admin/app/workspace/terminology-hygiene.test.ts` que lea todos los archivos `.tsx` bajo:
- `apps/admin/app/workspace/**`
- `apps/admin/app/onboarding/**`
- `apps/admin/components/tenant-workspace-shell.tsx`

y verifique mediante expresiones regulares insensibles a mayúsculas sobre literales JSX y cadenas visibles (excluyendo comentarios técnicos TSDoc o nombres de tipos TypeScript) que no aparezcan:
`/\b(seaweedfs|imgproxy|pgbouncer|pg-cell|cell-01|nodo celular|catálogo celular|crm celular|ventas celulares|membresías celulares|celda física|instancia física|ADM-001|CHW-001|DAT-001|BILL-001|NTF-001|DSN-001)\b/i`

