# SPEC-17 · Gobernanza Transversal UI/UX: Internacionalización Total, Tablas Estandarizadas y Guardado Seguro

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-17` |
| **Nombre** | Reglas Transversales de Interfaz: Internacionalización `es`/`en`, Tablas Estandarizadas y Barra de Guardado Segura |
| **Tipo de intervención** | Estandarización transversal + Refactorización de componentes compartidos UI |
| **Prioridad** | P1 — Alta (cierra consistencia UX en todo el Backoffice del Inquilino) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `TRV-01`, `TRV-02`, `AIB-04` |
| **Specs previas relacionadas** | `DSN-001`, `MIG-001`, `CORE-002` |
| **Specs consumidoras / aplicadoras** | Todas las vistas de tabla y formularios del Backoffice del Inquilino (`SPEC-03`, `SPEC-04`, `SPEC-05`, `SPEC-06`, `SPEC-07`, `SPEC-08`, `SPEC-09`, `SPEC-10`, `SPEC-11`, `SPEC-12`, `SPEC-14`, `SPEC-15`, `SPEC-16`) |
| **Wave de ejecución sugerida** | Wave 4 — Consolidación Transversal y Cierre QA (el componente `<DataTable />` y diccionarios pueden crearse desde Wave 1 y aplicarse uniformemente) |

---

## 3. Problema / Situación actual

Las vistas actuales del Backoffice del Inquilino presentan tres defectos sistémicos de interfaz que violan las directivas permanentes de `.agents/AGENTS.md`:

1. **Textos incrustados hardcoded únicamente en español (`TRV-01`, `AGENTS.md §4.6`):**
   - Componentes como `bot-view.tsx`, `products-view.tsx`, `contacts-view.tsx`, `orders-view.tsx`, `team-view.tsx`, `billing-view.tsx` y `tenant-workspace-shell.tsx` contienen decenas de cadenas de texto fijas en JSX en lugar de consumir diccionarios i18n (`es` / `en`), impidiendo que un comercio con `clients.locale = 'en'` o un usuario angloparlante utilice realmente el Backoffice en inglés.
   - Adicionalmente, debe garantizarse cumplimiento estricto de `AGENTS.md §4.11` (prohibición de APIs `@deprecated` como `setRequestLocale` de `next-intl`).
2. **Tablas heterogéneas sin paginación, filtros ni ordenamiento real (`TRV-02`, `AGENTS.md §4.8`):**
   - Las tablas actuales muestran listados planos con estilos dispares, sin ordenamiento por columna, sin selector de tamaño de página (`10`, `20`, `50`), sin estado vacío accionable unificado ni adaptación consistente a tarjetas Mobile First en pantallas pequeñas.
3. **Guardado incómodo en formularios largos y riesgo de pérdida de cambios (`AIB-04`):**
   - En `apps/admin/app/workspace/bot/bot-view.tsx` (línea 140), el botón **«Guardar Cambios»** aparece únicamente en la parte superior derecha; al editar políticas o mensajes al final de una pantalla larga, el usuario debe hacer scroll hacia arriba cada vez para guardar, o puede abandonar la pestaña sin advertencia de cambios pendientes.

---

## 4. Objetivo y valor de negocio

Establecer **primitivas transversales obligatorias** y validar su adopción en todas las pantallas del comercio:
1. **`TRV-01` — i18n integral (`es` por defecto y `en` completo):** Cascada `preferencia de usuario -> clients.locale -> navegador -> 'es'` + diccionario tipado compartido + selector rápido de idioma de sesión/usuario sin `@deprecated`.
2. **`TRV-02` — Componente canónico `<DataTable />`:** Un único patrón de tabla en todo el Backoffice con paginación, búsqueda/filtros, ordenamiento, estados vacíos/carga/error y modo tarjetas Mobile First.
3. **`AIB-04` — Barra de guardado dual (superior + inferior/sticky) y guarda de cambios sin guardar:** Disponible en `/workspace/bot` y todo formulario extenso del inquilino.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Infraestructura i18n tipada en `apps/admin` libre de APIs `@deprecated`:
  - Diccionarios completos `es.json` y `en.json` cubriendo navegación (`TenantWorkspaceShell`), Onboarding, Tablero, Productos, CRM, Pedidos, Asistente AI y Bot, Equipo, Perfil, Marca Blanca, Notificaciones, Plan/Facturación/Bre-B, Comunidades y Referidos.
  - Regla de linting/test automatizado que detecte claves faltantes entre `es` y `en` (paridad del 100%).
  - Selector discreto de idioma en barra de usuario (`ES` / `EN`) + endpoint ligero `PATCH /api/tenant/locale` para guardar preferencia individual de usuario (`cell_users` / cookie), respetando `clients.locale` (`SPEC-05`) como base por comercio.
- Diseño e implementación del componente compartido `<WorkspaceDataTable />` (`apps/admin/components/ui/workspace-data-table.tsx` [Nuevo]):
  - Soporta paginación controlada (`page`, `pageSize` 10/20/50, `total`), ordenamiento por columnas (`sortBy`, `sortDir: 'asc' | 'desc'`), barra de búsqueda + filtros configurables, esqueleto de carga, estado vacío con CTA, banner de error reintentable y renderizado alternativo en tarjetas Mobile First `< 768px`.
  - Adopción verificada en: Productos, Contactos CRM, Pedidos, Equipo/Invitaciones, Facturas/Pagos, Notificaciones, Comunidades y Referidos.
- Diseño e implementación del componente compartido `<FormSaveBar />` + hook `useUnsavedChangesGuard` (`AIB-04`):
  - En formularios largos (`/workspace/bot`, `/workspace/profile`, `/workspace/branding`, modal de producto): botón de guardado visible tanto en el encabezado como en la **parte inferior / barra fija inferior (`sticky bottom-0`)** cuando existen cambios pendientes (`isDirty`), acompañado de contador de cambios pendientes y botón «Descartar Cambios».
  - Confirmación mediante modal accesible `--dsn-*` (nunca `window.confirm`) si el usuario intenta cambiar de sección teniendo cambios sin guardar.
- Auditoría transversal de cumplimiento de `AGENTS.md §4.8` (**Title Case** en todos los `<label>`, prohibido CSS `uppercase`) y `§4.17` (**cero `window.alert`/`window.confirm`/`window.prompt`** en todo `apps/admin/app/workspace/*`).

### Fuera de alcance
- Traducción automática mediante LLM de catálogos de productos cargados por el comercio (el contenido del usuario permanece en el idioma en que lo redactó; el sistema traduce íntegramente toda la interfaz de plataforma).
- Soporte de terceros idiomas (francés, portugués) en esta fase (solo `es` y `en`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` y `tenancy_users` | Cambiar su preferencia personal de idioma UI (`es`/`en`), paginar/filtrar/ordenar tablas permitidas | Sí | No modifica el `clients.locale` global si es agente (`SPEC-05`) |
| `tenancy_owner` | Guardar cambios de configuración desde barra superior o inferior | Sí | Validado por permisos de cada módulo |

---

## 7. Modelo de datos

### 7.1 Preferencia de idioma a nivel de usuario (`packages/domain/src/db/schemas/tenant/users.ts`)
- Verificar/añadir columna opcional en `cell_users`:
  - `preferred_locale`: `VARCHAR(10)` nullable (`'es' | 'en'`). Si es `NULL`, hereda automáticamente `admin.clients.locale` (`SPEC-05`) y luego `Accept-Language` del navegador.
- **Resolución en `resolveAuthenticatedPortalContext` (`packages/domain/src/services/session-context.service.ts`):**
  `activeLocale = cellUser.preferredLocale ?? client.locale ?? acceptLanguageLocale ?? "es"`.

---

## 8. Reglas de negocio

- **RN-SPEC-17-01 (Paridad 100% `es`/`en` sin literales en JSX `TRV-01`):** Toda etiqueta, título, botón, placeholder, validación, estado vacío y mensaje de error visible en Onboarding y Workspace debe provenir de los diccionarios `es` y `en`. Ninguna clave puede existir en español sin su equivalente exacto en inglés, validado mediante prueba automatizada en CI (`i18n-parity.test.ts`).
- **RN-SPEC-17-02 (Cascada canónica de idioma sin APIs `@deprecated`):** La resolución del idioma activo sigue estrictamente el orden `user.preferredLocale -> client.locale -> browser Accept-Language -> 'es'` sin usar APIs obsoletas (`setRequestLocale` prohibido). El usuario puede alternar temporal o persistentemente su idioma desde el shell sin afectar al resto del equipo.
- **RN-SPEC-17-03 (Contrato único de tablas `TRV-02`):** Toda tabla del sistema implementa obligatoriamente paginación explícita (tamaño por defecto 20 registros, máximo 50 por página en API), al menos búsqueda por texto o filtro de estado, ordenamiento por columnas clave y vista adaptativa para móvil (`Mobile First`).
- **RN-SPEC-17-04 (Doble punto de guardado y protección contra pérdida de datos `AIB-04`):** Todo formulario de configuración de múltiples secciones (`/workspace/bot`, `/workspace/profile`, `/workspace/branding`) presenta controles «Guardar Cambios» accesibles en su cabecera y al pie del formulario (`sticky` cuando `isDirty = true`). Si hay cambios sin guardar y el usuario pulsa «Descartar» o intenta navegar entre pestañas internas, se solicita confirmación con modal `--dsn-*`.
- **RN-SPEC-17-05 (Higiene transversal de UI `AGENTS.md §4.8, §4.15, §4.17`):** Cero clases CSS `uppercase` en `<label>`, todos los `<label>` redactados en **Title Case**, cero llamadas nativas a `window.confirm`/`alert`/`prompt`, y cero identificadores internos (`ONB-`, `TRV-`, `SPEC-`, etc.) en código renderizable.

---

## 9. Contratos de interfaz

### 9.1 `PATCH /api/tenant/locale` [Nuevo]
- **Autenticación:** Cualquier usuario autenticado del comercio (`tenancy_owner` o `tenant_agent`).
- **Request JSON:** `{ "locale": "es" | "en" }`.
- **Comportamiento:** Actualiza `cell_users.preferred_locale` (o resetea a `null` si elige seguir idioma del comercio) + actualiza cookie de idioma `mocter_locale`, retornando `200 OK` con `{ locale }`.

### 9.2 Contrato estándar de paginación/ordenamiento en listados `GET /api/tenant/*`
- Query params estándar compartidos (`parsePaginationQuery` en `@mocter/domain`):
  `?page=1&limit=20&sortBy=...&sortDir=asc|desc&q=...`
- Envelope de respuesta estándar:
  ```json
  {
    "ok": true,
    "data": {
      "items": [],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 134,
        "totalPages": 7
      }
    }
  }
  ```

---

## 10. Especificación de UI/UX

- **`<WorkspaceDataTable />` (`TRV-02`):**
  - Barra superior con input de búsqueda debounced (`300ms`), selects/chips de filtro rápido en línea y botón «Limpiar Filtros».
  - Cabecera de columnas con íconos claros de ordenamiento (`▲ / ▼ / ⇅`).
  - Pie con contador *«Mostrando 1–20 de 134 resultados»*, selector de página (`10`, `20`, `50`) y botones «Anterior» / números / «Siguiente».
  - En viewport `< md` (`768px`), renderiza tarjeta compacta apilada por registro evitando tablas con scroll horizontal roto.
- **`<FormSaveBar />` (`AIB-04`):**
  - En `/workspace/bot` y formularios de configuración: se mantiene botón arriba para edición rápida y aparece barra inferior anclada (`sticky bottom-4` sobre fondo elevado con tokens `--dsn-*` y sombra sutil) indicando *«Tienes cambios sin guardar»* + «Descartar» + «Guardar Cambios», tanto en desktop como en móvil.
- **Selector de idioma en `TenantWorkspaceShell`:** Pill discreta `ES | EN` accesible desde el menú de perfil / cabecera.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Estandarización i18n, tablas con paginación/filtros y barra de guardado

  Escenario: Cambio de idioma a Inglés actualiza inmediatamente todo el Backoffice del Inquilino
    Dado que el usuario inicia sesión en un comercio con "clients.locale = 'es'"
    Cuando selecciona el idioma "EN" en el selector de usuario (PATCH "/api/tenant/locale") y recarga la vista
    Entonces la navegación lateral, botones, encabezados, tablas y mensajes en Tablero, Productos, CRM, Pedidos, Bot y Equipo se renderizan íntegramente en inglés sin fragmentos en español

  Escenario: Barra de guardado inferior en /workspace/bot permite guardar sin volver arriba
    Dado que el propietario abre "/workspace/bot" y hace scroll hasta el final para editar los 6 mensajes clave
    Cuando modifica el texto de "Mensaje Fuera De Horario"
    Entonces aparece inmediatamente la barra inferior fija con el botón "Guardar Cambios" accesible en pantalla
    Y al pulsar "Guardar Cambios" desde abajo persiste la configuración completa con éxito

  Escenario: Toda tabla operativa soporta búsqueda, ordenamiento y cambio de tamaño de página
    Dado que el comercio tiene 45 pedidos en "/workspace/orders"
    Cuando el usuario ordena por total descendente, cambia tamaño de página a 10 y navega a la página 2
    Entonces la tabla consulta "?page=2&limit=10&sortBy=total&sortDir=desc" mostrando exactamente los registros 11 a 20
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de idioma no soportado o parámetro de paginación fuera de rango
    Dado que el cliente invoca PATCH "/api/tenant/locale" con "locale = fr" o GET "/api/tenant/products?limit=500"
    Cuando el servidor valida las entradas con Zod
    Entonces responde HTTP 400 Problem Details rechazando la solicitud
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Advertencia al intentar abandonar formulario con cambios sin guardar en modo interactivo
    Dado que el usuario editó una política comercial en "/workspace/bot" sin pulsar "Guardar Cambios"
    Cuando intenta cambiar de sección interna o pulsar "Descartar"
    Entonces el sistema abre un modal accesible "--dsn-*" (sin window.confirm) solicitando confirmar si descarta o conserva sus cambios
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Cambio de idioma personal de un agente no modifica el idioma comercial global de otros usuarios
    Dado que un usuario "tenant_agent" cambia su preferencia a "en" vía PATCH "/api/tenant/locale"
    Cuando el propietario del mismo comercio abre su propia sesión
    Entonces el propietario conserva el idioma "es" configurado para el comercio sin alteración cruzada
```

### (e) Escenarios de borde

```gherkin
  Escenario: Prueba automática en CI detecta ausencia de traducción o uso de etiquetas prohibidas en vistas
    Dado el conjunto de diccionarios "es" y "en" y los componentes de "apps/admin/app/workspace"
    Cuando se ejecuta la suite de auditoría automatizada de i18n e higiene UI
    Entonces todas las claves presentes en español existen en inglés y no existen llamadas a "window.confirm", "window.alert", "setRequestLocale" ni clase CSS "uppercase" en etiquetas "<label>"
```

---

## 12. Requisitos no funcionales

- **Cero código `@deprecated` (`AGENTS.md §4.11`):** Verificado mediante regla ESLint/TypeScript y revisión explícita de imports de `next-intl` / Next.js 16.
- **Accesibilidad (`AGENTS.md §4.8`):** Contraste WCAG 2.2 AA en barras sticky y tablas; `aria-sort` en encabezados ordenables, `aria-label` localizado en controles de paginación.
- **Performance:** Diccionarios divididos de forma limpia o cargados sin inflar el bundle innecesariamente; debounce en búsquedas de tabla para evitar ráfagas HTTP.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-01` (limpieza de jerga técnica previa), `SPEC-05` (`clients.locale` fuente base).
- **Riesgos:**
  - *Aparición de textos nuevos hardcoded durante desarrollo paralelo de specs:* Mitigado añadiendo test automatizado en `pnpm test` (`i18n-parity` y scan estático sobre `apps/admin/app/workspace/` para `window.confirm`, `uppercase` en `<label>` y códigos de spec).

---

## 14. Definition of Done

- [ ] Columna `preferred_locale` agregada a `cell_users` + endpoint `PATCH /api/tenant/locale` + cascada en `resolveAuthenticatedPortalContext`.
- [ ] Diccionarios completos `es` y `en` integrados en todas las pantallas del workspace/onboarding con test de paridad al 100% (`TRV-01`).
- [ ] Componente compartido `<WorkspaceDataTable />` adoptado uniformemente en todas las tablas del comercio (`TRV-02`).
- [ ] Componente `<FormSaveBar />` + guard de cambios sin guardar integrado en `/workspace/bot` (`AIB-04`) y formularios extensos de configuración.
- [ ] Tests estáticos confirmando cero `window.confirm`/`alert`/`prompt`, cero `uppercase` en `<label>`, cero APIs `@deprecated`, y cero códigos internos en UI.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas abiertas para esta especificación.

