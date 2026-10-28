# LND-001 · Tareas · Landing page, planes comerciales y accesos

| Atributo | Valor |
|---|---|
| ID | LND-001 |
| Versión | 1.2 (Aprobada — plan_code y planes canónicos) |
| Fecha | 2026-10-27 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- Esta especificación se reparte por slices del plan maestro: T-01 a T-07 corresponden a la Fase 1; T-08 (upgrade) corresponde a la Fase 5, después de BILL-001. T-09 verifica los criterios del slice en cada compuerta y se cierra después de la última.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Comandos de verificación:
  ```bash
  pnpm --filter @mocter/domain exec drizzle-kit check
  pnpm lint
  pnpm test
  ```

---

## Fase 1 · Capa de Datos y Consultas de Planes

- [x] **T-01 · Consolidar la tabla plans canónica en packages/domain**
  - Incorporar `id uuid`, `code` único, `name`/`description` JSONB `{es,en}`, `status` (`draft`/`active`/`retired`), `is_public`, `is_popular`, `sort_order`, `trial_days`, `grace_days`, `billing_cycles`, `price_monthly_cents`, `price_annual_cents`, `currency` y `marketing_features` JSONB `{es:[],en:[]}`.
  - Verificación: `drizzle-kit check` pasa; `plans.code` es único; las FKs `plan_id` son uuid.

- [x] **T-02 · Implementar repositorio y función getPublicPlans()**
  - Crear en `packages/domain/src/repositories/plans.repository.ts` la consulta de planes con `WHERE status = 'active' AND is_public = true ORDER BY sort_order ASC`.
  - Verificación: Test unitario comprueba que los planes no públicos, en draft o retirados son excluidos; el resultado expone `code` para la URL.
  - Evidencia: 2026-10-27 — `IPlansRepository` y `DrizzlePlansRepository` creados en `packages/domain/src/repositories/plans.repository.ts` con funciones standalone `getPublicPlans()` y `getPlanByCode(code)`. 6 pruebas unitarias pasando en `plans.repository.test.ts`. Expuesto en `packages/domain/src/index.ts`.

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

## Fase 5 · Vista de Upgrade en Backoffice del Inquilino

- [ ] **T-08 · Crear vista de suscripción y cambio de plan en mocter-admin**
  - Implementar en `apps/web/app/[locale]/(admin)/admin/settings/billing/page.tsx` la visualización del plan actual y el comparador para Upgrade.
  - Verificación: El inquilino visualiza su plan vigente y puede pulsar "Mejorar plan".

---

## Verificación BDD y cierre por compuerta

- [ ] **T-09 · Validar criterios BDD por slice (CA-LND-01 a CA-LND-05)**
  - Ejecutar en cada fase las pruebas unitarias y de integración de los criterios cubiertos por ese slice, incluidos renderizado condicional, navegación en header, query params del plan y upgrade.
  - Verificación: cada slice pasa sus criterios en su compuerta; T-09 se cierra cuando se validaron todos los criterios, incluido el upgrade de Fase 5.
