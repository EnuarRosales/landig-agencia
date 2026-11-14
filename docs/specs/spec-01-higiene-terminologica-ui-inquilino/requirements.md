# SPEC-01 · Requisitos · Higiene Terminológica de la UI del Inquilino

## 1. Identificación

| Atributo | Valor |
|---|---|
| **ID** | `SPEC-01` |
| **Nombre** | Higiene terminológica de la UI del inquilino (Zero Infra Leaks) |
| **Tipo de intervención** | `CORRECCIÓN` |
| **Prioridad** | `P0` |
| **Versión** | `1.0` |
| **Estado** | `Aprobado` |

---

## 2. Trazabilidad

- **IDs de observación cubiertos (dueño):** `TRV-04`, `TAB-02`, `PRD-01`, `PRD-02`, `CRM-01`, `PED-01`, `EQU-01`.
- **IDs referenciados:** `TAB-01` (`SPEC-07`, branding del header lateral y estado `"Conectado"`), `AIB-04` (`SPEC-17`, toast en `bot-view.tsx`).
- **Specs previas relacionadas:** `ADM-001`, `DSN-001`, `TNT-001`.
- **Directivas vinculantes:** `.agents/AGENTS.md §4.8` (Title Case en labels), `.agents/AGENTS.md §4.15` (prohibición de códigos de specs en UI), `.agents/AGENTS.md §4.6` (i18n).

---

## 3. Problema / Situación Actual

Durante la auditoría del Backoffice del Inquilino (`/workspace/*`) se detectó exposición sistemática de terminología interna de arquitectura e infraestructura hacia el usuario final del comercio:

1. **Shell lateral y móvil (`TAB-01`, `TRV-04`):** `apps/admin/components/tenant-workspace-shell.tsx` (líneas 293, 398–399, 510–513) muestra el código `pg-cell-01`, `"Celda de datos"` y `"Conectado a pg-cell-01"`.
2. **Tablero principal (`TAB-02`):** `apps/admin/app/workspace/workspace-dashboard-view.tsx` muestra `"Nodo Celular: {cellCode}"` (línea 66), el ícono estático `<Store>` en vez del logo comercial (línea 54) y `"Sube fotos a SeaweedFS con firma automática."` (línea 249).
3. **Productos y Catálogo (`PRD-01`, `PRD-02`):** `apps/admin/app/workspace/products/products-view.tsx` muestra el badge `"Catálogo Celular"` (línea 189) y el subtítulo `"Gestión transaccional de productos con imágenes alojadas en SeaweedFS y optimización con imgproxy."` (línea 193).
4. **Contactos CRM (`CRM-01`):** `apps/admin/app/workspace/contacts/contacts-view.tsx` muestra el badge `"CRM Celular"` (línea 70).
5. **Pedidos y Ventas (`PED-01`):** `apps/admin/app/workspace/orders/orders-view.tsx` muestra el badge `"Ventas Celulares"` (línea 60).
6. **Equipo y Colaboradores (`EQU-01`):** `apps/admin/app/workspace/team/team-view.tsx` muestra el badge `"Membresías Celulares"` (línea 23), combinando un término técnico inapropiado (`"Celulares"`) con uno poco intuitivo (`"Membresías"` en lugar de `"Usuarios"`).
7. **Asistente AI (`TRV-04`):** `apps/admin/app/workspace/bot/bot-view.tsx` muestra en el mensaje de éxito `"Configuración del asistente actualizada exitosamente en la celda física."` (línea 127).

---

## 4. Objetivo y Valor de Negocio

Eliminar al 100 % cualquier filtración de nombres de infraestructura, bases de datos o patrones internos de arquitectura en todas las interfaces visibles para el inquilino, sustituyéndolos por lenguaje comercial claro, confiable e internacionalizado que fortalezca la percepción de marca y simplicidad del producto.

---

## 5. Alcance

### Incluye
- Lista negra estricta de términos prohibidos en toda UI, diccionario i18n, badge, tooltip, toast, título, subtítulo y mensaje de error del inquilino (`/onboarding` y `/workspace/*`).
- Sustitución exacta de textos y componentes en `workspace-dashboard-view.tsx` (`TAB-02`), `products-view.tsx` (`PRD-01`, `PRD-02`), `contacts-view.tsx` (`CRM-01`), `orders-view.tsx` (`PED-01`), `team-view.tsx` (`EQU-01`), `bot-view.tsx` y `tenant-workspace-shell.tsx` (`TRV-04`).
- Visualización del logo del comercio (cargado en onboarding o logo por defecto) en el header del Tablero (`TAB-02`).
- Prueba automatizada de regresión léxica que falle en CI si algún archivo de cliente del inquilino reintroduce términos prohibidos.

### Fuera de Alcance
- El Backoffice corporativo de la SaaS (`/admin/*`), donde el administrador global sí gestiona nodos y celdas (`/admin/cells`).
- Rediseño del sidebar izquierdo y truncamiento del nombre comercial (cubierto en `SPEC-07` por `TAB-01`).

---

## 6. Actores y Permisos

| Actor / Rol | Impacto de la Regla | Alcance |
|---|---|---|
| `tenancy_owner` | Visualiza exclusivamente terminología comercial en todas sus vistas | `/onboarding` y `/workspace/*` |
| `tenancy_users` (`tenant_agent`) | Visualiza exclusivamente terminología comercial en las vistas habilitadas | `/workspace/*` |
| `platform_owner` / `platform_admin` | Mantiene terminología técnica de infraestructura únicamente en su consola corporativa | `/admin/*` (excluido de esta restricción) |

---

## 7. Modelo de Datos

- No requiere cambios de esquema SQL.
- El DTO `WorkspaceDashboardDto` (`packages/domain/src/services/tenant-workspace.service.ts`) debe incluir `tenant.logoUrl: string | null` para que `TAB-02` renderice el logo comercial en el header del Tablero sin exponer `cellCode` en UI.

---

## 8. Reglas de Negocio

- **RN-SPEC-01-01 (Cero términos de arquitectura interna en el Backoffice del Inquilino):** Queda prohibido renderizar en cualquier vista, toast, tooltip, atributo `title`, `aria-label` o diccionario del inquilino (`/onboarding` y `/workspace/*`) cualquiera de los términos prohibidos: `celda`, `célula`, `celular`, `celulares`, `cell`, `cell-01`, `pg-cell`, `nodo`, `nodo celular`, `instancia física`, `celda física`, `seaweedfs`, `imgproxy`, `pgbouncer`, `rls`, `drizzle`, `router global`, o códigos de especificación (`ADM-001`, `PRD-XX`, etc.).
- **RN-SPEC-01-02 (Header limpio e identidad visual en Tablero — `TAB-02`):** El header de `/workspace` debe mostrar el logo comercial cargado por el inquilino (o el isotipo comercial por defecto si no posee logo), el nombre comercial, el badge del plan y únicamente la `"Moneda Operativa: {currency}"` en la línea secundaria, suprimiendo `"Nodo Celular: {cellCode}"`.
- **RN-SPEC-01-03 (Textos comerciales homologados por vista):**
  - **Tablero (`workspace-dashboard-view.tsx`):** tarjeta de acción rápida de producto debe mostrar `"Publica fotos, videos y ficha de tus productos."` sin mencionar `"SeaweedFS"`.
  - **Productos (`PRD-01`, `PRD-02`):** badge `"Catálogo Comercial"` y subtítulo `"Administra tu portafolio de productos, precios, inventario y galería multimedia para tus canales de venta."`.
  - **Contactos (`CRM-01`):** badge `"Directorio De Clientes"` (o `"Gestión De Clientes"`).
  - **Pedidos (`PED-01`):** badge `"Gestión De Pedidos"`.
  - **Equipo (`EQU-01`):** badge `"Usuarios"` (eliminando `"Membresías Celulares"`).
  - **Asistente AI (`bot-view.tsx`):** toast `"Configuración del asistente actualizada exitosamente."`.
- **RN-SPEC-01-04 (Mensajes de error desacoplados de la infraestructura):** Ningún error retornado por APIs hacia `/api/tenant/*` puede filtrar nombres de motores internos al navegador; los detalles técnicos solo se escriben en logs estructurados de servidor (`requestId`).

---

## 9. Contratos de Interfaz

- **Actualización de DTO `WorkspaceDashboardDto`:**
  - `tenant`: `{ id: string; name: string; slug: string; planName: string; currency: string; logoUrl: string | null }` (el campo `cellCode` deja de enviarse o renderizarse en la UI del inquilino).

---

## 10. Especificación de UI/UX

- **Diccionario bilingüe (`es` / `en`) obligatorio:** Todos los textos sustitutos viven en el diccionario i18n de `apps/admin` (`es` como idioma por defecto y su equivalente exacto en `en`).
- **Title Case en badges y encabezados:** Todos los badges y labels respetan formato Tipo Título sin clases `uppercase` (`.agents/AGENTS.md §4.8`).
- **Fallback de logo en Tablero:** Si `tenant.logoUrl` es nulo o falla al cargar, se muestra un contenedor estilizado `--dsn-accent` con `<Store />` o la inicial del comercio; nunca un ícono roto (`broken image`).

---

## 11. Criterios de Aceptación en Gherkin (Español)

### Escenarios satisfactorios
```gherkin
Escenario: Navegación completa del inquilino sin términos de infraestructura
  Dado que un propietario de comercio ingresa a su backoffice en /workspace
  Cuando recorre las vistas Tablero, Productos, Contactos, Pedidos, Asistente AI y Equipo
  Entonces ninguna vista muestra palabras como "celda", "celular", "pg-cell", "Nodo Celular", "SeaweedFS" o "imgproxy"
  Y el Tablero muestra el logo del comercio y "Moneda Operativa" en el encabezado
  Y la vista Equipo muestra el badge "Usuarios" en lugar de "Membresías Celulares"
```

### Validaciones de entrada
```gherkin
Escenario: Verificación estática automática de higiene terminológica en código fuente UI
  Dado el conjunto de archivos de interfaz del inquilino bajo apps/admin/app/workspace y apps/admin/app/onboarding
  Cuando se ejecuta la prueba automatizada de regresión léxica en CI
  Entonces la prueba escanea cadenas literales renderizadas al DOM y verifica 0 coincidencias con la lista negra de infraestructura
```

### Errores de regla de negocio
```gherkin
Escenario: Mensajes de error de servicios internos traducidos a lenguaje comercial
  Dado que ocurre una falla en almacenamiento o base de datos durante una acción del inquilino
  Cuando el endpoint retorna la respuesta RFC 9457 al cliente
  Entonces la UI muestra un mensaje comprensible de negocio sin exponer "PgBouncer", "PostgreSQL", "SeaweedFS" ni "imgproxy"
```

### Seguridad y autorización
```gherkin
Escenario: Mantenimiento de información técnica exclusivamente en el Backoffice SaaS
  Dado que existen operadores SaaS con rol platform_owner
  Cuando acceden al Backoffice administrativo en /admin/cells
  Entonces siguen visualizando la telemetría de celdas físicas sin que la higiene del workspace afecte sus herramientas de gobierno
```

### Escenarios de borde
```gherkin
Escenario: Renderizado seguro cuando el inquilino aún no ha cargado su logo comercial
  Dado que un comercio activó su tienda sin subir logo comercial en el onboarding
  Cuando ingresa a /workspace
  Entonces el header del Tablero renderiza el icono comercial por defecto con alto contraste WCAG 2.2 AA y sin elemento img roto
```

---

## 12. Requisitos No Funcionales

- **Calidad y Regresión Continua:** Suite Vitest dedicada (`apps/admin/app/workspace/terminology-hygiene.test.ts`) ejecutada en cada `pnpm test` de CI.
- **Accesibilidad:** Contraste mínimo 4.5:1 en badges y textos de subtítulo (`--dsn-text-secondary` y `--dsn-accent`).

---

## 13. Dependencias y Riesgos

- **Dependencias:** Ninguna (puede ejecutarse en Ola 0 en paralelo con `SPEC-00`).
- **Riesgos:** Reintroducción accidental de textos técnicos por futuros cambios en diccionarios o componentes; mitigado mediante la prueba automática de escaneo léxico en CI.

---

## 14. Definition of Done (DoD)

- [ ] Eliminados el 100 % de los términos de infraestructura en `tenant-workspace-shell.tsx`, `workspace-dashboard-view.tsx`, `products-view.tsx`, `contacts-view.tsx`, `orders-view.tsx`, `team-view.tsx`, `bot-view.tsx` y `tenant-onboarding-wizard.tsx`.
- [ ] Prueba `terminology-hygiene.test.ts` creada y pasando en `pnpm test`.
- [ ] `pnpm lint` y verificación visual en navegador tras compilación/reinicio (`AGENTS.md §4.18`) confirmados.

---

## 15. Propuestas a Validar (PV)

- Ninguna. Todos los textos sustitutos y eliminaciones derivan directamente de las observaciones `TRV-04`, `TAB-02`, `PRD-01`, `PRD-02`, `CRM-01`, `PED-01` y `EQU-01`.

