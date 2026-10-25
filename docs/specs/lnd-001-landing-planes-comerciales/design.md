# LND-001 · Diseño · Landing page, planes comerciales y accesos

| Atributo | Valor |
|---|---|
| ID | LND-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [BILL-001](../bill-001-facturacion-saas/design.md) · [DSN-001](../dsn-001-sistema-diseno/design.md) |
| Estado | Aprobada |

## 1. Principios de Diseño

1. **Gobernanza dinámica desde base de datos:** La oferta comercial visible en la landing no está cableada en código; responde al catálogo de planes administrado desde el backoffice SaaS.
2. **Cero fricción en el embudo:** La selección de un plan en la landing transfiere fluidamente la intención al registro (`/register?plan_id=...`).
3. **Coherencia visual HUD:** La sección de planes y los botones del header heredan los tokens del sistema de diseño (`DSN-001`), con micro-animaciones y soporte claro/oscuro.
4. **Navegación simétrica:** Las pantallas de login y registro forman un ciclo continuo con enlaces cruzados y soporte de i18n sin pérdidas de contexto.

## 2. Arquitectura de Componentes (`apps/web`)

```mermaid
flowchart TD
    subgraph Landing Page / Header
        NavComponent[Componente Nav] -->|Botón Acceso| LoginPage[/[locale]/login]
        NavComponent -->|Enlace #planes si hay planes| PricingSection[Sección Pricing #planes]
    end

    subgraph Flujo de Conversión
        PricingSection -->|CTA Elegir Plan| RegisterPage[/[locale]/register?plan_id=...]
        RegisterPage <-->|Navegación Cruzada| LoginPage
    end

    subgraph mocter-admin / Backoffice Inquilino
        TenantAdmin[mocter-admin / Configuración] --> UpgradeView[Vista de Suscripción & Upgrade]
        UpgradeView -->|Cambio de Plan & Prorrateo| BillingGateway[BILL-001 Pasarela]
    end

    subgraph Capa de Datos / packages/domain
        DrizzlePlans[(Tabla plans en Router Global)] -->|Query Planes Públicos Activos| PricingSection
        DrizzlePlans --> UpgradeView
    end
```

---

## 3. Modelo de Datos para Planes (`packages/domain`)

La tabla `plans` (schema `admin` en Router Global) almacena los atributos necesarios para el renderizado dinámico en la landing y la contratación:

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `varchar(64)` PK | Slug único del plan (ej. `starter`, `growth`, `scale`) |
| `name` | `varchar(128)` | Nombre comercial (ej. "Plan Emprendedor", "Plan Pro") |
| `description` | `text` | Subtítulo comercial descriptivo |
| `price_monthly_cents` | `bigint` | Precio mensual en centavos |
| `price_annual_cents` | `bigint` | Precio anual en centavos (con descuento aplicado) |
| `currency` | `varchar(3)` | Divisa base (`COP` o `USD`) |
| `features` | `jsonb` | Array de características (`string[]`) visibles en la tarjeta |
| `is_active` | `boolean` | Flag de disponibilidad operativa |
| `is_public` | `boolean` | **Flag para visualización en landing page pública** |
| `is_popular` | `boolean` | Marca badge de "Más popular" en la landing |
| `sort_order` | `integer` | Orden de visualización en la UI (ascendente) |
| `created_at` · `updated_at` | `timestamptz` | Auditoría DAT-001 RF-10.9 |

---

## 4. Especificación de Componentes de Interfaz

### 4.1 Componente `Nav` (`apps/web/components/nav.tsx`)
- **Extremo derecho (Acción de Login):**
  Junto al botón actual `t("cta")` ("Solicitar demo"), se añade el botón de inicio de sesión:
  ```tsx
  <a
    href={`/${locale}/login`}
    className="inline-flex items-center gap-1.5 rounded-full border border-stroke/90 bg-surface/80 px-4 py-2 text-[14px] font-medium text-txt transition-all hover:bg-stroke/40 dark:hover:bg-white/10"
  >
    {t("login")}
  </a>
  ```
- **Menú Cápsula Dinámico:**
  Si la consulta de planes activos devuelve `plans.length > 0`, se inyecta en el arreglo de navegación:
  ```tsx
  { href: `/${locale}#planes`, label: t("pricing") }
  ```

### 4.2 Componente `PricingSection` (`apps/web/components/sections/pricing-section.tsx`)
- Server Component que consulta los planes públicos activos mediante `getPublicPlans()`.
- Si `plans.length === 0`, el componente retorna `null` (cero markup en el DOM).
- Si hay planes, renderiza:
  - Cabecera con título y subtítulo traducibles.
  - Switch interactivo `Ciclo: Mensual / Anual` con badge de descuento (ej. "Ahorra 20%").
  - Grid de tarjetas de precios: borde con glow sutil en el plan marcado con `is_popular`.
  - Botón CTA enlazado a `/${locale}/register?plan_id=${plan.id}&cycle=${selectedCycle}`.

### 4.3 Formularios de Login y Registro (`apps/web/app/[locale]/(auth)/`)
- **Página Login (`login/page.tsx`):**
  - Campos: Email y Contraseña.
  - Botones OAuth dinámicos según `auth_providers_config` (`AUTH-001`).
  - Pie de formulario: Texto de ayuda con enlace hacia `/${locale}/register`.
- **Página Registro (`register/page.tsx`):**
  - Campos: Nombre completo, Email, Contraseña (con validador de complejidad en tiempo real).
  - Si existe `searchParams.plan_id`, muestra un badge HUD: `Plan seleccionado: {plan.name}`.
  - Pie de formulario: Texto de ayuda con enlace hacia `/${locale}/login`.

### 4.4 Vista de Suscripción en Backoffice (`mocter-admin`)
- Ruta: `apps/web/app/[locale]/(admin)/admin/settings/billing/page.tsx`.
- Muestra la ficha de la suscripción activa (`subscriptions`) y un comparador de planes para ejecutar **Upgrade** directo mediante diálogo de confirmación con prorrateo (`BILL-001`).

---

## 5. Verificación Técnica

| Control | Prueba |
|---|---|
| Ocultamiento Condicional | Con tabla `plans` vacía o `is_public = false`, `#planes` no aparece en DOM ni en menú. |
| Visualización Activa | Al insertar 1 plan con `is_public = true`, `#planes` y su link de menú aparecen en la landing. |
| Redirección CTA | Click en "Elegir plan" navega a `/register?plan_id=...` con el parámetro en URL. |
| Navegación Cruzada | Transición fluida entre `/login` y `/register` mediante clicks en los enlaces respectivos. |
| i18n | Cambio de selector de idioma (`es` ↔ `en`) traduce instantáneamente textos de precios y botones. |
