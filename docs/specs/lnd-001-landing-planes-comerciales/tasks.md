# LND-001 · Tareas · Landing page, planes comerciales y accesos

| Atributo | Valor |
|---|---|
| ID | LND-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- Esta especificación se ejecuta como parte de la **Fase 1** del plan maestro de implementación.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Comandos de verificación:
  ```bash
  pnpm --filter @mocter/domain exec drizzle-kit check
  pnpm lint
  pnpm test
  ```

---

## Fase 1 · Capa de Datos y Consultas de Planes

- [ ] **T-01 · Extender la tabla plans en packages/domain**
  - Incorporar en el esquema de Drizzle los campos `is_public`, `is_popular`, `sort_order`, `price_monthly_cents`, `price_annual_cents`, `currency`, `features`.
  - Verificación: `drizzle-kit check` pasa sin errores sintácticos.

- [ ] **T-02 · Implementar repositorio y función getPublicPlans()**
  - Crear en `packages/domain/src/repositories/plans.repository.ts` la consulta de planes con `WHERE is_active = true AND is_public = true ORDER BY sort_order ASC`.
  - Verificación: Test unitario comprueba que los planes no públicos o inactivos son excluidos.

---

## Fase 2 · Adaptaciones en Header y Landing Page

- [ ] **T-03 · Incorporar botón de acceso en Nav (header)**
  - Modificar `apps/web/components/nav.tsx` añadiendo el botón de login contiguo al botón actual de «Solicitar demo».
  - Verificación: Visualización correcta en escritorio y menú móvil con enlace a `/[locale]/login`.

- [ ] **T-04 · Inyectar enlace dinámico de planes en menú cápsula**
  - Modificar `Nav` para que incluya `{ href: '/[locale]#planes', label: t('pricing') }` únicamente cuando existan planes públicos.
  - Verificación: Sin planes activos, el enlace no se muestra; con planes activos, el enlace navega suavemente a `#planes`.

- [ ] **T-05 · Crear componente PricingSection con renderizado condicional**
  - Implementar `apps/web/components/sections/pricing-section.tsx` con toggle mensual/anual y tarjetas de precios HUD.
  - Si no hay planes activos, retorna `null`.
  - Si hay planes, renderiza las tarjetas con CTA hacia `/[locale]/register?plan_id=...`.
  - Verificación: Componente desaparece sin romper el layout cuando la base no tiene planes públicos.

---

## Fase 3 · Pantallas de Login y Registro Interconectadas

- [ ] **T-06 · Implementar pantalla de Login con enlace a Registro**
  - Crear `apps/web/app/[locale]/(auth)/login/page.tsx` con formulario de acceso y enlace claro hacia `/[locale]/register`.
  - Verificación: Click en "¿Aún no tienes cuenta?" navega a `/register`.

- [ ] **T-07 · Implementar pantalla de Registro con parámetro plan_id**
  - Crear `apps/web/app/[locale]/(auth)/register/page.tsx` con formulario de alta.
  - Si en URL viene `plan_id`, muestra badge con el nombre del plan elegido.
  - Enlace inferior hacia `/[locale]/login`.
  - Verificación: Al entrar con `?plan_id=pro`, el formulario refleja la selección.

---

## Fase 4 · Vista de Upgrade en Backoffice del Inquilino

- [ ] **T-08 · Crear vista de suscripción y cambio de plan en mocter-admin**
  - Implementar en `apps/web/app/[locale]/(admin)/admin/settings/billing/page.tsx` la visualización del plan actual y el comparador para Upgrade.
  - Verificación: El inquilino visualiza su plan vigente y puede pulsar "Mejorar plan".

---

## Fase 5 · Verificación BDD y Cierre

- [ ] **T-09 · Validar criterios BDD (CA-LND-01 a CA-LND-05)**
  - Pruebas unitarias y de integración para renderizado condicional, navegación en header y query params de plan.
  - Verificación: Suite de tests automatizados pasa al 100%.
