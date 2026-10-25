# LND-001 · Tareas · Landing page, planes comerciales y accesos

| Atributo | Valor |
|---|---|
| ID | LND-001 |
| Versión | 1.1 (Aprobada — plan_code y planes canónicos) |
| Fecha | 2026-10-25 |
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

- [ ] **T-01 · Consolidar la tabla plans canónica en packages/domain**
  - Incorporar `id uuid`, `code` único, `name`/`description` JSONB `{es,en}`, `status` (`draft`/`active`/`retired`), `is_public`, `is_popular`, `sort_order`, `trial_days`, `grace_days`, `billing_cycles`, `price_monthly_cents`, `price_annual_cents`, `currency` y `marketing_features` JSONB `{es:[],en:[]}`.
  - Verificación: `drizzle-kit check` pasa; `plans.code` es único; las FKs `plan_id` son uuid.

- [ ] **T-02 · Implementar repositorio y función getPublicPlans()**
  - Crear en `packages/domain/src/repositories/plans.repository.ts` la consulta de planes con `WHERE status = 'active' AND is_public = true ORDER BY sort_order ASC`.
  - Verificación: Test unitario comprueba que los planes no públicos, en draft o retirados son excluidos; el resultado expone `code` para la URL.

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
  - Si hay planes, renderiza las tarjetas con CTA hacia `/[locale]/register?plan_code=...`.
  - Verificación: Componente desaparece sin romper el layout cuando la base no tiene planes públicos.

---

## Fase 3 · Pantallas de Login y Registro Interconectadas

- [ ] **T-06 · Implementar pantalla de Login con enlace a Registro**
  - Crear `apps/web/app/[locale]/(auth)/login/page.tsx` con formulario de acceso y enlace claro hacia `/[locale]/register`.
  - Verificación: Click en "¿Aún no tienes cuenta?" navega a `/register`.

- [ ] **T-07 · Implementar pantalla de Registro con parámetro plan_code**
  - Crear `apps/web/app/[locale]/(auth)/register/page.tsx` con formulario de alta.
  - Si en URL viene `plan_code`, resuelve el plan por `plans.code`, muestra badge con `plan.name[locale]` y conserva el UUID para el alta.
  - Enlace inferior hacia `/[locale]/login`.
  - Verificación: Al entrar con `?plan_code=pro`, el formulario refleja la selección y el alta recibe el UUID correcto.

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
