# SPEC-07 · Shell del Inquilino, Identidad de Cabecera (Logo + Estado Conectado) y Marca Blanca Enterprise

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-07` |
| **Nombre** | Shell del Inquilino, Identidad de Cabecera y Módulo Operativo de Marca Blanca |
| **Tipo de intervención** | Remediación de UI crítica + Completitud de módulo Enterprise |
| **Prioridad** | P1 — Alta (identidad visual del comercio en toda la navegación del Backoffice) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `TAB-01`, `GEN-05` |
| **Specs previas relacionadas** | `ADM-001` (RF-15), `DSN-001` (§7, §9), `TNT-001` |
| **Specs dependientes / integradas** | `SPEC-00` (carga y URL firmada/imgproxy para logo y favicon), `SPEC-01` (eliminación previa de `cellCode` y `Nodo Celular` del shell), `SPEC-05` (gestión del logo básico e identidad comercial para todos los planes en `/workspace/profile`), `SPEC-13` (posición de `Conversaciones` en la barra lateral) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

1. **Identidad recortada y jerga de celda en esquina superior izquierda del shell (`TAB-01`):**
   - En `apps/admin/components/tenant-workspace-shell.tsx` (líneas 284 y 497), el nombre del comercio aplica `truncate max-w-[120px]`, recortando nombres comerciales reales con puntos suspensivos a pocos caracteres.
   - Además, en el bloque inferior al nombre comercial (líneas 293, 398, 510–513), el shell muestra `pg-cell-01` / `cellCode` en lugar de un indicador de estado limpio (**icono de conexión + texto «Conectado»**) y no prioriza de forma consistente el **logo comercial del inquilino** (o logo predeterminado de Mocter si aún no cargó uno).
2. **Módulo de Marca Blanca `/workspace/branding` incompleto (`GEN-05`):**
   - Aunque `packages/domain/src/services/white-label.service.ts` y `packages/domain/src/db/schemas/admin/client-brandings.ts` implementan el repositorio y la validación WCAG 2.2 AA (`WhiteLabelService.validateContrast`), la página `apps/admin/app/workspace/branding/page.tsx` únicamente muestra un aviso placeholder estático (*«Configuración autorizada de marca blanca activa para este comercio»*), sin formulario, sin API `/api/tenant/branding`, sin personalización de paleta ni vista previa ni restauración a valores por defecto.

---

## 4. Objetivo y valor de negocio

1. Entregar un **encabezado de navegación limpio y profesional** (`TAB-01`) en el que el comercio reconozca de inmediato su marca (logo comercial cargado o predeterminado + nombre comercial completo legible sin truncamientos arbitrarios) y un indicador de salud comprensible («Conectado»).
2. Habilitar de extremo a extremo el módulo **Identidad Y Marca Blanca (`/workspace/branding`)** conectado a `WhiteLabelService`, permitiendo a los planes autorizados (`paleta` o `completa`/Enterprise) personalizar colores validados WCAG 2.2 AA, tipografía, favicon, dominio personalizado y remoción de marca Mocter.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Refactorización de la zona superior izquierda y header de `apps/admin/components/tenant-workspace-shell.tsx` (`TAB-01`):
  - Renderizar `logoResolvedUrl` del comercio (con fallback garantizado al logo predeterminado Mocter si no existe o falla carga).
  - Eliminar `max-w-[120px]` y `truncate` agresivo en `tenantInfo.name`, aplicando tipografía flexible con soporte de hasta 2 líneas limpias en móvil/sidebar para mostrar el **nombre comercial completo**.
  - Mostrar debajo del nombre comercial el badge visual de estado con punto/icono verde y etiqueta i18n **«Conectado»** (sin `pg-cell-01` ni nombres de nodos).
- Implementación del endpoint `/api/tenant/branding` (`GET`, `PUT`, `DELETE` para restaurar defaults) conectado a `WhiteLabelService` y validación de capacidad por plan (`custom_branding` / `WhiteLabelCapabilityMode`: `'none' | 'paleta' | 'completa'`).
- Implementación de `apps/admin/app/workspace/branding/branding-view.tsx` [Nuevo] + actualización de `apps/admin/app/workspace/branding/page.tsx`:
  - Nivel `'none'`: pantalla clara informando la diferencia entre el logo comercial básico (disponible gratis en `/workspace/profile` — link directo) y las capacidades avanzadas de marca blanca del plan superior.
  - Nivel `'paleta'`: editor visual de paleta (`primary`, `accent`, `surface`, `sidebar`) con **cálculo en tiempo real de ratio de contraste WCAG 2.2 AA** (mínimo `4.5:1` texto, `3.0:1` elementos UI), bloqueando guardar combinaciones ilegibles.
  - Nivel `'completa'` (Enterprise): desbloquea además favicon, fuente personalizada, dominio propio (`CNAME`) y toggle **«Ocultar Marca Mocter» (`removeMocterBranding`)**.
  - Acción **«Restaurar Marca Por Defecto»** protegida por modal de confirmación `--dsn-*` (`AGENTS.md §4.17`).
- Inyección segura de CSS custom properties (`--dsn-accent`, etc.) en el layout del workspace del comercio cuando exista branding válido persistido.

### Fuera de alcance
- Configuración del logo comercial básico y datos generales del negocio (pertenece a `SPEC-05` `/workspace/profile`).
- Configuración de DNS externo o emisión automática de certificados SSL fuera del contrato Traefik ya existente en el VPS (se muestran instrucciones `CNAME` claras para dominio personalizado).
- Marca blanca del backoffice administrativo de la SaaS (`/admin/settings/branding` ya existe y se mantiene intacto).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Visualizar encabezado de shell + estado «Conectado» | Sí | Todos los planes |
| `tenancy_owner` | Consultar y modificar marca blanca (`/workspace/branding`) | Condicionado | Según `WhiteLabelCapabilityMode` (`paleta` o `completa`) del plan; `'none'` ve vista informativa sin mutación (`403` si fuerza API) |
| `tenancy_users` (`tenant_agent`) | Visualizar encabezado e identidad personalizada aplicada | Sí | Hereda tema del comercio |
| `tenancy_users` (`tenant_agent`) | Modificar paleta, dominio o branding | No | `403 Forbidden` |

---

## 7. Modelo de datos

Se utiliza la tabla existente `admin.client_brandings` (`packages/domain/src/db/schemas/admin/client-brandings.ts`):
- `id`: `UUID` PK.
- `client_id`: `UUID` FK → `admin.clients.id`, único (`UNIQUE`), aislamiento por inquilino.
- `brand_name`: `VARCHAR(160)` nullable (opcional para sobreescribir título de marca blanca; por defecto usa `clients.display_name`).
- `logo_url`: `TEXT` nullable (sincronizada/respaldada por `admin.media_catalog` vía `SPEC-00`, manteniendo prioridad de logo básico `clients.logo_media_id` cuando el usuario carga en perfil).
- `favicon_url`: `TEXT` nullable (validado MIME `image/png`, `image/x-icon`, `image/svg+xml`).
- `palette`: `JSONB` `BrandingPaletteTokens` (`primaryHex`, `accentHex`, `surfaceHex`, `textHex`, `sidebarBgHex`, `sidebarTextHex`).
- `remove_mocter_branding`: `BOOLEAN` `NOT NULL`, default `false`.
- `custom_domain`: `VARCHAR(255)` nullable, único (formato FQDN válido sin esquema ni puerto, ej. `tienda.miempresa.co`).
- `custom_font`: `VARCHAR(64)` nullable (catálogo seguro permitido: `Inter`, `Geist`, `Space Grotesk`, `Plus Jakarta Sans`, `DM Sans`).
- `updated_at`: `TIMESTAMPTZ`.
- **Estrategia de eliminación / restauración:** `DELETE /api/tenant/branding` elimina físicamente la fila de `admin.client_brandings` (o restablece sus valores personalizados a `null`/`false`) previa confirmación modal `--dsn-*`, dejando la tienda instantáneamente con el sistema de diseño estándar `--dsn-*` sin afectar datos comerciales en `admin.clients`.

---

## 8. Reglas de negocio

- **RN-SPEC-07-01 (Visualización íntegra de marca del inquilino en Shell `TAB-01`):** La esquina superior izquierda del shell del inquilino (`desktop` y `mobile` drawer) muestra siempre: (a) el logo del comercio cargado en Onboarding/Perfil (o el logotipo por defecto si no tiene uno cargado), (b) el nombre comercial completo del comercio sin clases CSS restrictivas tipo `max-w-[120px]` ni `truncate` de una sola línea que mutile el nombre, y (c) debajo, un ícono visual de conectividad + texto **«Conectado»** (en idioma activo `es`/`en`). Prohibido mostrar códigos de celda o bases de datos (`pg-cell-01`, `cell-01`).
- **RN-SPEC-07-02 (Precedencia del logo comercial):** Si el inquilino configuró una marca blanca en `client_brandings` con `logoUrl` propio, o cargó un logo en `clients.logoMediaId`, la interfaz unifica la lectura priorizando el logo activo resuelto vía imgproxy (`SPEC-00`) y permite mantenerlo actualizado desde `/workspace/profile` y `/workspace/branding` sin duplicar fuentes contradictorias.
- **RN-SPEC-07-03 (Gating granular por nivel de plan en Marca Blanca):**
  - Modo `'none'`: Bloquea mutaciones en `PUT /api/tenant/branding` con `403 WHITE_LABEL_NOT_IN_PLAN` y redirige con enlace claro a `/workspace/billing` si desea ampliar su plan, recordando que el logo básico sigue disponible en `/workspace/profile`.
  - Modo `'paleta'`: Autoriza únicamente la personalización de `palette`; ignora o rechaza cambios en `customDomain` y `removeMocterBranding` con `403 ENTERPRISE_BRANDING_REQUIRED`.
  - Modo `'completa'`: Autoriza paleta, tipografía, favicon, dominio personalizado y `removeMocterBranding`.
- **RN-SPEC-07-04 (Cumplimiento obligatorio WCAG 2.2 AA en paletas personalizadas):** Todo cambio de paleta se valida en servidor y cliente mediante `WhiteLabelService.validateContrast()`: ningún par texto/fondo personalizado puede guardarse con ratio `< 4.5:1` (ni elementos de interfaz `< 3.0:1`), devolviendo error `422 WCAG_CONTRAST_TOO_LOW` con el ratio medido exacto.
- **RN-SPEC-07-05 (Validación de dominio personalizado sin acoplamiento local `AGENTS.md §4.16`):** El campo `customDomain` valida formato FQDN válido (`^[a-z0-9.-]+\.[a-z]{2,}$`), rechaza `localhost`, IPs crudas o puertos explícitos (`:3000`, `:3003`), y verifica unicidad global contra otros inquilinos (`409 CUSTOM_DOMAIN_IN_USE`).

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/branding` [Nuevo]
- **Respuesta `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "capabilityMode": "completa",
      "clientLogoUrl": "https://...",
      "branding": {
        "brandName": "Tienda Sol",
        "logoUrl": "https://...",
        "faviconUrl": null,
        "palette": { "primaryHex": "#0F172A", "accentHex": "#2563EB", "surfaceHex": "#FFFFFF", "textHex": "#0F172A" },
        "removeMocterBranding": true,
        "customDomain": "catalogo.tiendasol.co",
        "customFont": "Space Grotesk"
      }
    }
  }
  ```

### 9.2 `PUT /api/tenant/branding` [Nuevo]
- **Autenticación:** `tenancy_owner`.
- **Validaciones:** Zod + gating `WhiteLabelCapabilityMode` + `WhiteLabelService.validateContrast()` + unicidad `customDomain`.
- **Errores RFC 9457:** `400 validation_error`, `403 WHITE_LABEL_NOT_IN_PLAN | ENTERPRISE_BRANDING_REQUIRED`, `409 CUSTOM_DOMAIN_IN_USE`, `422 WCAG_CONTRAST_TOO_LOW`.

### 9.3 `DELETE /api/tenant/branding` [Nuevo]
- **Autenticación:** `tenancy_owner`.
- **Propósito:** Restaura la apariencia predeterminada del sistema de diseño Mocter eliminando la personalización en `admin.client_brandings` y registrando auditoría.

---

## 10. Especificación de UI/UX

- **En `TenantWorkspaceShell` (`apps/admin/components/tenant-workspace-shell.tsx`):**
  - Bloque superior izquierdo de sidebar (y barra móvil):
    ```
    [ Logo Comercial 36x36 o Default ]   Nombre Comercial Completo
                                         (sin truncate a 120px)
                                         ● Conectado
    ```
  - Tooltip accesible si el nombre excede 40 caracteres mostrando texto completo; ajuste Mobile First sin desbordamientos.
- **En `/workspace/branding` (`branding-view.tsx`):**
  - Vista dividida en formulario (colores con picker + hex, selector de fuente, subida de favicon, campo dominio propio con tarjeta de instrucción `CNAME`, switch «Ocultar Marca Mocter») y **Panel De Vista Previa En Vivo** que simula botones, tarjeta y cabecera del catálogo.
  - Indicador en vivo debajo de cada color mostrando `Contraste: 7.4:1 — Aprobado AA` o `3.1:1 — Contraste Insuficiente`.
  - Todos los labels en Title Case (`AGENTS.md §4.8`), cero diálogos nativos, botón «Restaurar Valores Por Defecto» protegido por modal `--dsn-*` con resumen de qué se restablecerá.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Shell del comercio y módulo de Marca Blanca

  Escenario: Shell muestra logo del comercio, nombre completo sin truncar e indicador Conectado
    Dado que el comercio "Distribuidora Internacional Del Café Y Cacao S.A.S." cargó su logotipo comercial
    Cuando el usuario navega a "/workspace" o cualquier ruta del Backoffice del Inquilino
    Entonces la esquina superior izquierda muestra su logo comercial y el nombre completo legible sin recorte de 120px
    Y debajo muestra un icono verde con el texto "Conectado" sin mencionar "pg-cell-01" ni "cell-01"

  Escenario: Propietario con plan Enterprise configura paleta WCAG válida y dominio propio
    Dado que el comercio tiene capacidad de marca blanca "completa"
    Cuando en "/workspace/branding" define paleta con contraste 8.2:1, dominio "tienda.mitienda.co" y activa "Ocultar Marca Mocter"
    Y pulsa "Guardar Marca Blanca"
    Entonces PUT "/api/tenant/branding" retorna HTTP 200
    Y los tokens CSS personalizados se reflejan en el entorno autorizado
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de dominio propio con puerto local o formato inválido
    Dado que un propietario intenta guardar "customDomain = localhost:3003" o "http://tienda.co"
    Cuando envía PUT "/api/tenant/branding"
    Entonces el servidor retorna HTTP 400 Problem Details indicando que debe ser un dominio FQDN válido sin esquema ni puerto
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Rechazo de paleta de colores que incumple contraste mínimo WCAG 2.2 AA
    Dado que el propietario selecciona texto "#94A3B8" sobre fondo "#FFFFFF" (ratio inferior a 4.5:1)
    Cuando intenta guardar la configuración en "/workspace/branding"
    Entonces el sistema rechaza el guardado con HTTP 422 "WCAG_CONTRAST_TOO_LOW" mostrando el ratio calculado
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Comercio sin capacidad Enterprise no puede activar dominio propio ni ocultar marca Mocter
    Dado que un comercio tiene plan con modo "none" o "paleta" únicamente
    Cuando invoca PUT "/api/tenant/branding" intentando establecer "removeMocterBranding: true" o "customDomain"
    Entonces el backend responde HTTP 403 Forbidden sin persistir cambios
```

### (e) Escenarios de borde

```gherkin
  Escenario: Restauración a valores por defecto tras confirmación en modal del sistema de diseño
    Dado que el comercio tiene marca blanca activa y pulsa "Restaurar Marca Por Defecto"
    Cuando confirma la acción en el modal accesible "--dsn-*" (sin window.confirm)
    Entonces DELETE "/api/tenant/branding" elimina la personalización y el shell vuelve inmediatamente a los tokens estándar sin errores visuales
```

---

## 12. Requisitos no funcionales

- **Accesibilidad:** Cumplimiento verificado por `WhiteLabelService.validateContrast` (`>= 4.5:1` / `>= 3.0:1`), foco gestionado en picker/modales, labels Title Case.
- **Compatibilidad Traefik (`AGENTS.md §4.16`):** Los logos y tokens personalizados funcionan sobre rutas relativas y resolución DNS/TLS sin acoplamiento a puertos.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.branding.updated` y `tenant.branding.reset` con `requestId` y `clientId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (resolución imgproxy), `SPEC-01` (limpieza de jerga `cell-01`), `SPEC-03` (capacidad `custom_branding` resuelta por `TenantCapabilityGateService`), `SPEC-05` (logo comercial en `clients.logo_media_id`).
- **Riesgos:**
  - *Inyección CSS maliciosa mediante nombres de fuentes o colores:* Mitigado validando estrictamente con regex hexadecimal `^#[0-9A-Fa-f]{6}$` y enum cerrado de fuentes permitidas.

---

## 14. Definition of Done

- [ ] Eliminado `truncate max-w-[120px]` y `pg-cell-01` en `apps/admin/components/tenant-workspace-shell.tsx`; logo comercial + nombre completo + indicador «Conectado» visibles en móvil y desktop.
- [ ] Creado `/api/tenant/branding` (`GET`/`PUT`/`DELETE`) conectado a `WhiteLabelService` + gating por plan + tests.
- [ ] Implementado `apps/admin/app/workspace/branding/branding-view.tsx` con vista previa, validador WCAG 2.2 AA en vivo y modal `--dsn-*` de restauración (cero `window.confirm`, i18n `es`/`en`).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas abiertas para esta especificación.

