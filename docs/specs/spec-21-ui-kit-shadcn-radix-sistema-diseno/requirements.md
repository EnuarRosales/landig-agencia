# SPEC-21 · Paquete Compartido `@mocter/ui`, Primitivas Headless Radix + shadcn/ui y Migración Total al Sistema de Diseño (`DSN-001`)

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-21` |
| **Nombre** | Paquete Compartido `@mocter/ui` (`packages/ui`), Primitivas Accesibles Radix + `shadcn/ui` Mapeadas a Tokens `--dsn-*` y Migración Exhaustiva de Vistas |
| **Tipo de intervención** | Arquitectura transversal de sistema de diseño, creación de paquete interno de monorepo (`packages/ui`) y migración integral de vistas en `apps/admin` y `apps/web` |
| **Prioridad** | P0 — Crítica (cierra la brecha arquitectónica entre `DSN-001` y la implementación actual sobre HTML nativo) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada en `/grill-me` · Lista para implementación |
| **Paquetes / Apps afectadas** | `packages/ui` [Nuevo], `apps/admin`, `apps/web`, `Dockerfile`, `docker-compose.yml` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Specs previas relacionadas** | [DSN-001](../dsn-001-sistema-diseno/requirements.md), [ADM-001](../adm-001-mocter-admin/requirements.md), [MIG-001](../mig-001-nextjs-migration/requirements.md), [AI-001](../ai-001-asistente-ai-configuracion/requirements.md), [SPEC-07](../spec-07-shell-branding-inquilino-marca-blanca/requirements.md), [SPEC-17](../spec-17-reglas-transversales-ui-i18n-tablas-guardado/requirements.md), [SPEC-20](../spec-20-estandar-geografico-e164-homologacion/requirements.md) |
| **Directivas aplicables** | `.agents/AGENTS.md` (§4.4 TSDoc, §4.6 i18n `es`/`en`, §4.8 Mobile First + Title Case, §4.11 Cero `@deprecated`, §4.15 Cero códigos de spec en UI, §4.17 Modales accesibles sin diálogos nativos, §4.18 Compilación/reinicio/healthcheck, §4.19 Layout perimetral y botones canónicos) |
| **Reglas complementarias** | `.agents/rules/rules-for-backoffice-layout-and-ui-styles.md`, `.agents/rules/rules-for-custom-confirmation-modals-no-native-dialogs.md` |

---

## 3. Problema y Motivación

Actualmente existe una brecha arquitectónica verificable entre lo aprobado en [DSN-001](../dsn-001-sistema-diseno/requirements.md) (`RF-07`, `D-02`, `design.md §2`) y lo construido en el código fuente del monorepo:

1. **Ausencia de `shadcn/ui` y de un paquete compartido `@mocter/ui`:**
   - En `packages/` solo existe `@mocter/domain`. No hay configuración `components.json` en la raíz ni en `apps/admin` o `apps/web`.
   - Aunque `"radix-ui": "^1.4.0"` figura en `apps/web/package.json`, no existe ni un solo `import` de `radix-ui` en `apps/web` ni en `apps/admin` (donde ni siquiera está declarado como dependencia).
2. **Repetición manual de HTML nativo y clases Tailwind v4 en ~45 vistas:**
   - Las piezas atómicas básicas (`Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Dialog`, `Sheet`, `Badge`, `Tooltip`, `DropdownMenu`, `Skeleton`, `EmptyState`, `Alert`, `Card`) están codificadas a mano con `<button>`, `<input>`, `<select>` y `<div role="dialog">` repitiendo strings de `className` vista por vista.
   - Los comportamientos complejos de accesibilidad WCAG 2.2 AA (trampa de foco real en modales, restauración de foco al cerrar, navegación por flechas de teclado en pestañas y menús desplegables, portales y atributos ARIA sincronizados) se reimplementan parcialmente o quedan incompletos.
3. **Asimetría de tokens CSS entre `apps/web/app/globals.css` y `apps/admin/app/globals.css`:**
   - `apps/web/app/globals.css` declara las 3 capas completas de `DSN-001 §3.1` (`--primitive-*`, `--dsn-*` incluyendo `--dsn-text-tertiary`, `--dsn-border-subtle`, `--dsn-input-bg`, `--dsn-input-border`, `--dsn-accent-subtle`, `--dsn-accent-glow`, `--dsn-code-bg`, y `--brand-*`) con el acento cian canónico (`#22d3ee` oscuro / `#0891b2` claro).
   - `apps/admin/app/globals.css` define un subconjunto reducido que omite tokens de inputs, bordes sutiles, acento glow y capa `--brand-*`, además de usar un valor distinto para `--dsn-accent` (`#14b8a6`).

---

## 4. Decisiones de Diseño (`/grill-me`)

### D-01 · Creación del Paquete Compartido `packages/ui` (`@mocter/ui`) en el Monorepo
- Se crea el paquete interno `packages/ui` con nombre `@mocter/ui`, consumido mediante `"@mocter/ui": "workspace:*"` tanto por `apps/admin` como por `apps/web`.
- El paquete exporta código fuente TypeScript/TSX directo transpilado por Next.js 16 (`transpilePackages: ["@mocter/ui"]` en `apps/admin/next.config.ts` y `apps/web/next.config.ts`) y escaneado por Tailwind CSS v4 mediante `@source` en la hoja de estilos compartida.
- Se incluye el descriptor canónico `components.json` (`style: "base-nova"`, variables CSS mapeadas a `--dsn-*`) en `packages/ui/components.json` para trazabilidad y compatibilidad con el ecosistema `shadcn/ui`.

### D-02 · Centralización de Tokens CSS en `@mocter/ui/styles/tokens.css` y Acento Cian Canónico (`DSN-001 §3.1`)
- Se centraliza la definición de las 3 capas de tokens de `DSN-001` (`--primitive-*`, `--dsn-*` claro/oscuro y `--brand-*`) junto con `@variant dark` y el bloque `@theme inline` de Tailwind CSS v4 (exponiendo utilidades `--color-dsn-*` sin colisionar con `--color-surface: var(--card)` propio de la landing pública en `apps/web`) en `packages/ui/src/styles/tokens.css` (exportado como `@mocter/ui/styles/tokens.css`).
- Se conservan exactamente los valores hexadecimales canónicos de `DSN-001 §3.1` (`--dsn-text-secondary: #8d8d93` y `--dsn-text-tertiary: #5c5c63` en oscuro; `#71717a` y `#a1a1aa` en claro; `--dsn-input-border: rgba(79, 209, 255, 0.12)` en oscuro), y se actualiza `apps/web/lib/design-tokens.test.ts` para inspeccionar tanto `packages/ui/src/styles/tokens.css` como `apps/web/app/globals.css`.
- Tanto `apps/admin/app/globals.css` como `apps/web/app/globals.css` importan `@mocter/ui/styles/tokens.css`, eliminando la divergencia entre portales y unificando el acento cian canónico de `DSN-001` (`#22d3ee` en tema oscuro / `#0891b2` en tema claro) con sus tokens derivados (`--dsn-accent-hover`, `--dsn-accent-subtle`, `--dsn-accent-glow`, `--dsn-accent-fg`, `--dsn-input-bg`, `--dsn-input-border`, `--dsn-border-subtle`, `--dsn-text-tertiary`, `--dsn-code-bg`).
- Se mantienen todas las variables `--dsn-*` en `:root`, `.dark` y `.light` (asegurando `className="dark"` como fallback SSR en `apps/admin/app/layout.tsx`) para compatibilidad 100% con el contrato de marca blanca en runtime (`TenantWorkspaceShell`, `/workspace/branding` y `/design-system`).

### D-03 · Catálogo de 17 Primitivas Atómicas (`DSN-001 RF-07`) + Promoción de 3 Componentes Compuestos Transversales a `@mocter/ui`
1. **Primitivas Atómicas y de Interacción (`packages/ui/src/components/`):**
   - `Button` (variantes CVA: `primary`, `secondary`, `outline`, `ghost`, `destructive`, `warning`, `ai`; tamaños `sm`, `md`, `lg`, `icon`; soporte `asChild` vía Radix `Slot` y prop `loading` con spinner `Loader2`).
   - `Input` (con soporte de icono izquierdo/derecho, estados `error`, `disabled`, `--dsn-input-bg` y focus ring `--dsn-accent`).
   - `Textarea` (estandarizado con `--dsn-input-bg`, focus ring y redimensionamiento controlado).
   - `Label` y `FormField` (primitiva Radix `Label` que aplica formato **Title Case** y prohíbe `uppercase` conforme a `AGENTS.md §4.8`, con soporte para mensaje de error y texto de ayuda).
   - `Select` (modo dual según `D-05`: `<Select />` / `<NativeSelect />` estilizado Mobile First y `<CustomSelect />` sobre Radix `Select`).
   - `Checkbox` y `Switch` (primitivas accesibles con teclado, `role="checkbox"` / `role="switch"` y soporte tanto para estado controlado como formularios nativos).
   - `Badge` (variantes semánticas: `default`, `accent`, `success`, `warning`, `error`, `outline`, `amber`, `purple`).
   - `Dialog` (Radix `Dialog` con portal/inline fallback seguro en tests, trampa de foco, cierre con `ESC`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, overlay `bg-black/60 backdrop-blur-xs` y superficie `--dsn-surface`).
   - `Sheet` / `Drawer` (panel lateral deslizante basado en Radix `Dialog` para navegación móvil Mobile First y paneles de inspección).
   - `Tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` sobre Radix `Tabs` con navegación por teclado).
   - `Tooltip` (`TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` sobre Radix `Tooltip`).
   - `DropdownMenu` (sobre Radix `DropdownMenu` para menús contextuales de acciones).
   - `Skeleton` (bloque shimmer con respeto a `prefers-reduced-motion`).
   - `EmptyState` (contenedor estandarizado con icono, título, descripción y slot de acción principal).
   - `Alert` (variantes `info`, `success`, `warning`, `error` / `destructive` para banners contextuales de vista y modal).
   - `Card` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` con hairline `--dsn-border` y `--dsn-surface`).
2. **Promoción de Componentes Compuestos Transversales a `@mocter/ui` con Re-exports y Adaptadores Compatibles:**
   - `ConfirmationModal`, `WorkspaceDataTable`, `FormSaveBar` y el hook `useUnsavedChangesGuard` (`requestGuardedNavigation`) se promueven a `packages/ui/src/` refactorizados internamente sobre `Dialog`, `Button`, `Input`, `Select`, `Badge`, `Alert` y `EmptyState`, usando un diccionario mínimo interno `es`/`en` (extensible vía prop `labels`) y callback `onNavigate` para mantener `@mocter/ui` desacoplado de Next.js y `@/lib/i18n`.
   - `apps/admin/components/confirmation-modal.tsx`, `apps/admin/components/ui/workspace-data-table.tsx` y `apps/admin/lib/use-unsaved-changes-guard.ts` se mantienen como **re-exports directos 1:1** desde `@mocter/ui`; `apps/admin/components/ui/form-save-bar.tsx` se mantiene como **wrapper mínimo** que inyecta `useRouter().push` sobre el `FormSaveBar` de `@mocter/ui` para preservar el 100% de compatibilidad con los imports y tests existentes.
   - Los componentes con dependencia de servicios o catálogos de dominio (`PhoneE164Input`, `GeoAddressFields`, `AiEnhanceTextarea`, `DataTable`, `AdminShell`, `TenantWorkspaceShell`, `UserProfileModal`) permanecen en `apps/admin/components/` pero se refactorizan internamente para consumir las primitivas de `@mocter/ui`.

### D-04 · Estrategia de Migración Total Exhaustiva en Lotes Secuenciales
La especificación abarca la migración completa de todas las vistas del monorepo en lotes secuenciales verificables:
1. **Lote 1:** Fundación de `packages/ui` (`@mocter/ui`), hoja `tokens.css`, utilidades `cn()`, 17 primitivas atómicas, tests unitarios de `@mocter/ui`, actualización de `apps/web/lib/design-tokens.test.ts`, configuración de `Dockerfile` y `docker-compose.yml`.
2. **Lote 2:** Refactorización de componentes compuestos (`ConfirmationModal`, `WorkspaceDataTable`, `DataTable`, `FormSaveBar`), componentes de dominio/shells (`AdminShell`, `TenantWorkspaceShell`, `UserProfileModal`, `AiEnhanceTextarea`, `PhoneE164Input`, `GeoAddressFields`, `BillingCheckoutPanel`, `CatalogQuotaBanner`, `EmailRichTextEditor`, `ThemeToggle`) y renovación integral del catálogo vivo `/design-system`.
3. **Lote 3:** Migración exhaustiva de las vistas del Backoffice del Inquilino (`/workspace/*` — 16 módulos incluyendo `conversations` y sus modales) y del asistente `/onboarding` (`tenant-onboarding-wizard` + 5 pasos en `steps/`).
4. **Lote 4:** Migración exhaustiva de las vistas del Plano de Control SaaS (`/admin/*` — los 13 módulos incluyendo `leads`, `orders`, `referrals`, `reports`, `users` y `/invite/*`) y de las vistas interactivas, de administración y autenticación en `apps/web` (`components/auth/*`, `components/admin/*`, `demo-form`, `phone-e164-input`, `cookie-preferences`, `theme-toggle`, preservando el diseño marketing de `components/sections/*`).
5. **Lote 5:** Test automatizado de auditoría arquitectónica (`ui-kit-audit.test.ts`), suite completa de pruebas en todo el monorepo, build de producción y protocolo `AGENTS.md §4.18` en contenedores Docker vivos.

### D-05 · Diseño Dual de `<Select />` en `@mocter/ui` (Mobile First + Compatibilidad con Tests `fireEvent.change`)
- `@mocter/ui` provee dos variantes complementarias de selección:
  1. **`<Select />` (y alias `<NativeSelect />`):** Renderiza un `<select>` nativo accesible envuelto en un contenedor estilizado con `--dsn-input-bg`, `--dsn-input-border`, focus ring `--dsn-accent`, altura táctil `min-h-[40px]` / `min-h-[44px]` y chevron `ChevronDown` superpuesto (`pointer-events-none`). Garantiza el uso del picker nativo del sistema operativo en dispositivos móviles (Mobile First) y preserva compatibilidad del 100% con `<option>` y con las ~400 pruebas existentes que ejecutan `fireEvent.change(select, { target: { value } })`.
  2. **`<CustomSelect />` (`CustomSelect`, `CustomSelectTrigger`, `CustomSelectContent`, `CustomSelectItem`, `CustomSelectValue`):** Construido sobre Radix `Select` (`radix-ui`) para menús desplegables enriquecidos con iconos, badges o agrupación personalizada.

### D-06 · Autorización Explícita de Infraestructura Docker (`Dockerfile` y `docker-compose.yml` conforme a `R-07`)
- Con autorización explícita del usuario en `/grill-me` (cumpliendo `R-07` de `.agents/AGENTS.md`):
  - En `Dockerfile`: se incorpora `COPY packages/ui/package.json packages/ui/package.json` en la etapa `deps` y `COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules` en la etapa `build`.
  - En `docker-compose.yml`: siguiendo el patrón de aislamiento por servicio del archivo, se declaran volúmenes nombrados separados (`ui-node-modules:/app/packages/ui/node_modules` en `web-portal` y `admin-ui-node-modules:/app/packages/ui/node_modules` en `admin-portal`, ambos en la sección raíz `volumes:`), evitando colisiones de escritura concurrente durante `pnpm install` y protegiendo el bind mount NTFS de Windows.

---

## 5. Requisitos Funcionales

### RF-01 · Paquete `@mocter/ui` y Configuración `shadcn/ui`
- **RF-01.1:** Crear `packages/ui/package.json` (`"name": "@mocter/ui"`), `packages/ui/tsconfig.json`, `packages/ui/components.json` y `packages/ui/src/index.ts`.
- **RF-01.2:** Exportar el helper `cn(...inputs: ClassValue[])` en `packages/ui/src/lib/utils.ts` combinando `clsx` y `tailwind-merge`.
- **RF-01.3:** Configurar `"radix-ui": "^1.4.0"`, `"class-variance-authority": "^0.7.1"`, `"clsx": "^2.1.1"`, `"tailwind-merge": "^3.0.2"` y `"lucide-react": "^1.66.0"` en `packages/ui/package.json`.

### RF-02 · Hoja Unificada de Tokens (`@mocter/ui/styles/tokens.css`)
- **RF-02.1:** Definir en `packages/ui/src/styles/tokens.css` las tres capas completas de `DSN-001 §3.1` (Primitivos `--primitive-*`, Semánticos `--dsn-*` en `:root`/`.dark` y `.light` con los valores exactos de `DSN-001 §3.1`, y Marca `--brand-*`) más `@variant dark` y el bloque `@theme inline` de Tailwind v4 para habilitar utilidades semánticas (`bg-dsn-surface`, `text-dsn-text`, `border-dsn-border`, `bg-dsn-accent`, `rounded-dsn-md`, etc.) sin colisionar con `--color-surface` de `apps/web`.
- **RF-02.2:** Importar `@mocter/ui/styles/tokens.css` y declarar `@source "../../../packages/ui/src/**/*.{ts,tsx}";` en `apps/admin/app/globals.css` y `apps/web/app/globals.css`, actualizando `apps/web/lib/design-tokens.test.ts` para inspeccionar `packages/ui/src/styles/tokens.css` junto con `apps/web/app/globals.css`.

### RF-03 · Catálogo de Primitivas y Compuestos en `@mocter/ui`
- **RF-03.1:** Implementar y exportar con documentación TSDoc en español (`AGENTS.md §4.4`) los componentes: `Button`, `buttonVariants`, `Input`, `Textarea`, `Label`, `FormField`, `Select`, `NativeSelect`, `CustomSelect` (y subcomponentes Radix), `Checkbox`, `Switch`, `Badge`, `badgeVariants`, `Dialog` (`Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`), `Sheet` (`Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `SheetClose`), `Tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`), `Tooltip` (`TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`), `DropdownMenu` (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`), `Skeleton`, `EmptyState`, `Alert`, `Card` (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`).
- **RF-03.2:** Promover `ConfirmationModal`, `WorkspaceDataTable` y `FormSaveBar` a `@mocter/ui` consumiendo las nuevas primitivas y mantener re-exports compatibles en `apps/admin`.

### RF-04 · Catálogo Vivo `/design-system` Actualizado (`DSN-001 RF-09.2`)
- **RF-04.1:** Actualizar `apps/admin/app/design-system/design-system-playground.tsx` para sincronizar sus tokens por defecto con el acento cian canónico de `DSN-001` y exhibir un catálogo interactivo organizado por pestañas (`<Tabs />` de `@mocter/ui`) donde se puedan probar en vivo todas las primitivas (`Button`, `Input`, `Select`, `CustomSelect`, `Checkbox`, `Switch`, `Badge`, `Dialog`, `Sheet`, `Tabs`, `Tooltip`, `DropdownMenu`, `Alert`, `Card`, `Skeleton`, `EmptyState`) y compuestos (`ConfirmationModal`, `WorkspaceDataTable`, `FormSaveBar`) tanto en modo oscuro como claro.

### RF-05 · Migración Total Exhaustiva de Vistas (`apps/admin` y `apps/web`)
- **RF-05.1:** Reemplazar los elementos nativos manuales (`<button>`, `<input>`, `<textarea>`, `<select>`, `<label>`, `<div role="dialog">`, badges y alertas manuales) por los componentes de `@mocter/ui` en:
  - Componentes compartidos y shells de `apps/admin/components/*`.
  - Todas las vistas y modales de `/workspace/*`, `/onboarding/*` e `/invite/*` en `apps/admin`.
  - Todas las vistas y formularios de `/admin/*` en `apps/admin`.
  - Todas las vistas de autenticación (`components/auth/*` para `/[locale]/(auth)/*`), paneles administrativos (`components/admin/*`) y controles interactivos (`demo-form`, `phone-e164-input`, `cookie-preferences`, `theme-toggle`) en `apps/web` (preservando el diseño marketing de `components/sections/*`).
- **RF-05.2:** Preservar el 100% de los contratos semánticos, atributos `aria-*`, `data-testid`, textos i18n (`es`/`en`), validaciones y comportamiento esperado por las suites de pruebas unitarias e integración existentes.

### RF-06 · Auditoría Arquitectónica Automatizada
- **RF-06.1:** Crear una prueba automatizada de auditoría estática (`apps/admin/lib/ui-kit-audit.test.ts`) que verifique:
  1. Que todas las primitivas requeridas por `DSN-001 RF-07` están exportadas por `@mocter/ui`.
  2. Que no existen implementaciones manuales de `role="dialog"` en las vistas de negocio fuera de `@mocter/ui` y wrappers autorizados.
  3. Que las vistas de `/workspace/*`, `/admin/*`, `/onboarding/*` y `apps/web/components/auth/*` importan y utilizan componentes de `@mocter/ui`.
  4. Que se mantiene el cumplimiento de cero `--dsn-primary`, cero `window.alert`/`confirm`/`prompt` y cero `uppercase` en `<label>` (`AGENTS.md §4.8, §4.17, §4.19`).

---

## 6. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
| --- | --- | --- |
| **RNF-01** | Accesibilidad | WCAG 2.2 AA: contraste 4.5:1 en texto, 3:1 en bordes/UI, trampa de foco y cierre con `ESC` en `Dialog`/`Sheet`, navegación por teclado en `Tabs`, `Select` y `DropdownMenu`. |
| **RNF-02** | Mobile First | Área táctil mínima de `40px`–`44px` en controles interactivos; degradación sin scroll horizontal en `390px`. |
| **RNF-03** | Cero Regresiones | El 100% de las suites de pruebas existentes en `@mocter/domain`, `@mocter/admin` y `@mocter/web`, más las nuevas pruebas de `@mocter/ui`, deben pasar en verde. |
| **RNF-04** | Compatibilidad Docker | Compilación limpia en `next build` (modo `standalone`) y verificación HTTP 200 en caliente de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` (`AGENTS.md §4.18`). |

---

## 7. Criterios de Aceptación (BDD)

### CA-SPEC21-01 · Primitivas `@mocter/ui` conectadas a tokens `--dsn-*` y marca blanca
- **Dado** un componente `<Button />`, `<Input />`, `<Select />`, `<Dialog />` o `<Tabs />` importado desde `@mocter/ui`,
- **Cuando** el inquilino o el operador cambia entre tema claro/oscuro o aplica una paleta de marca blanca en `--dsn-accent` y `--dsn-surface`,
- **Entonces** todos los componentes reflejan instantáneamente los tokens activos sin recargar la página ni perder contraste accesible WCAG 2.2 AA.

### CA-SPEC21-02 · Accesibilidad por teclado y foco en Modales (`Dialog` y `ConfirmationModal`)
- **Dado** cualquier modal de creación, edición o confirmación en `apps/admin` o `apps/web`,
- **Cuando** se abre el modal y el usuario navega con `Tab` o presiona `Escape`,
- **Entonces** el foco permanece atrapado dentro del diálogo (`role="dialog"`, `aria-modal="true"`), se cierra limpiamente al presionar `Escape` (o solicita confirmación si `isDirty = true`) y devuelve el foco al elemento disparador.

### CA-SPEC21-03 · Compatibilidad Mobile First y pruebas en `<Select />`
- **Dado** un formulario migrado a `<Select />` de `@mocter/ui`,
- **Cuando** un usuario en móvil despliega el selector o una prueba automatizada dispara `fireEvent.change(select, { target: { value } })`,
- **Entonces** el navegador móvil abre el selector nativo del sistema operativo y la prueba unitaria actualiza el estado controlado sin errores.

### CA-SPEC21-04 · Catálogo vivo `/design-system` e integridad del monorepo
- **Dado** la ruta `/design-system` en `apps/admin`,
- **Cuando** se inspecciona en el navegador,
- **Entonces** exhibe interactivamente todas las primitivas de `@mocter/ui` y el editor de tokens en vivo, y el test de auditoría `ui-kit-audit.test.ts` certifica la adopción transversal en las vistas del monorepo.
