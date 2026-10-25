# DSN-001 · Tareas · Sistema de diseño y look & feel

| Atributo | Valor |
|---|---|
| ID | DSN-001 |
| Versión | 0.2 (Aprobada — decisiones O-01 a O-04 cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que DSN-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: MIG-001 (landing con Tailwind v4 + Radix) y ADM-001 T-02 (`apps/admin`).

## Fase 0 · Decisiones

- [x] **T-01 · [HUMANO] Cerrar las decisiones abiertas (2026-10-25)**
  - Cerradas: O-01 (`/design-system` interno, sin Storybook), O-02 (HUD sutil + acentos de marca), O-03 (tipografía solo Top/Enterprise) y O-04 (seguir al sistema, fallback oscuro).
  - Verificación: las decisiones quedaron registradas en `requirements.md` §6 y en la trazabilidad.

## Fase 1 · Tokens y tema base

- [ ] **T-02 · Implementar los tokens en tres capas**
  - CSS variables (Tailwind v4 `@theme`) con primitivos, semánticos claro/oscuro y marca; paleta base de §3.1.
  - El tema sigue al sistema y usa oscuro como fallback del primer render, sin flash.
  - Verificación: la paleta base pasa AA en claro y oscuro; cada token documentado en el catálogo; sin preferencia del sistema se renderiza oscuro.

- [ ] **T-03 · Implementar las fuentes self-hosted**
  - Chakra Petch o Space Grotesk (display), Inter o Geist (texto), IBM Plex Mono (datos); subset es/en; `font-display: swap`.
  - Verificación: las fuentes cargan offline; los KPI usan mono con `tabular-nums`.

## Fase 2 · Catálogo de componentes

- [ ] **T-04 · Montar el catálogo vivo en `/design-system`**
  - Página interna protegida con todos los componentes base (RF-07), variantes, tokens y guías de uso; sin Storybook en v1.
  - Verificación: cada componente se exhibe en claro y oscuro con sus estados; la ruta no se publica en la landing.

- [ ] **T-05 · Implementar la tabla de datos estándar**
  - `DataTable` con paginación, filtros por columna, ordenamiento, header pegajoso, densidades y degradación a tarjetas en móvil.
  - Verificación: la misma tabla funciona en 390px (tarjetas) y en escritorio (columnas) sin scroll horizontal obligatorio.

## Fase 3 · Vistas obligatorias

- [ ] **T-06 · Implementar login, registro y menú hamburguesa**
  - Una columna Mobile First, acción principal visible, drawer en móvil que se vuelve sidebar en escritorio.
  - Verificación: login y registro completos en 390px; el menú cierra por gesto y tecla.

- [ ] **T-07 · Implementar el dashboard**
  - KPIs en display font, tarjetas con hairline y glow sutil, grilla responsive.
  - Verificación: una columna en móvil y grilla en escritorio; cifras en mono.

- [ ] **T-08 · Implementar creación/edición de producto con el sistema**
  - Formulario Mobile First con «Mejorar con AI» en campos asistidos y panel de medios.
  - Verificación: el flujo completo se hace en móvil; el botón de AI sigue el patrón del catálogo.

## Fase 4 · Paleta parametrizable y marca blanca

- [ ] **T-09 · Implementar `themes` y el editor de paleta**
  - Tabla `themes` (Router) con tema de plataforma y por inquilino; editor con validación AA automática, preview en vivo y restauración.
  - Verificación: un valor sin contraste se rechaza sin persistir; el cambio de un inquilino no altera a otros ni el layout.

- [ ] **T-10 · Implementar el contrato de marca blanca por capas**
  - Capas 1–3 según plan (identidad, paleta, experiencia propia); la tipografía de marca queda solo en Top/Enterprise y en capa 3 el espacio del inquilino no muestra marca Mocter.
  - Verificación: un inquilino sin plan no accede al editor; White-label no expone tipografía; en capa 3 no queda ningún rastro de Mocter en su espacio.

## Fase 5 · Accesibilidad y cierre

- [ ] **T-11 · Auditoría de accesibilidad**
  - WCAG 2.2 AA sobre las vistas y componentes: contraste, foco, teclado y `prefers-reduced-motion`.
  - Verificación: la suite de accesibilidad pasa en claro y oscuro; un tema custom no degrada contraste.

- [ ] **T-12 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-09 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia; ninguno queda «asumido».

- [x] **T-13 · [HUMANO] Aprobar DSN-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
