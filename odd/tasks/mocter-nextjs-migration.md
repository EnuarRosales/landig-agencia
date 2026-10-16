# Mocter — Migración a Next.js 16 (Interfaz Pública + Despliegue)

**Objetivo:** Migrar la landing page actual (`index.html`) a una app Next.js 16 (App Router) en monorepo (`apps/web` + `packages/domain`) con Tailwind CSS v4, Radix UI, Light/Dark Mode, i18n (`next-intl`, rutas `/[locale]`, ES predeterminado, EN secundario), persistencia de leads en PostgreSQL (versión admisible 18+) con Drizzle ORM + Zod en Server Actions, PWA nativa, optimización SEO/AIO/GEO/LLMO y rebranding integral a "Mocter". Solo interfaz pública en esta iteración; la interfaz administrativa se integrará en una iteración posterior.

**Estructura:** Monorepo pnpm workspaces + Turborepo (`apps/web` para la landing pública y `packages/domain` para esquemas de Drizzle, validaciones Zod y tipos compartidos).

**Persistencia & Dominio:** PostgreSQL 18+ (servicio en `docker-compose`) + Drizzle ORM + validación Zod. Formulario funcional "Solicitar demo" procesado mediante Server Actions (`use server`).

**Despliegue:** Cero despliegue local nativo; ejecución 100% contenerizada vía Docker (Dockerfile multi-stage + `docker-compose.dev.yml`, `docker-compose.test.yml`, `docker-compose.prod.yml`). CI/CD automatizado en GitHub Actions publicando imágenes en GitHub Container Registry (`ghcr.io`). Manifiestos declarativos Kubernetes en `k8s/` (`deployment.yaml` con réplicas y health probes, `service.yaml`, `ingress.yaml`).

**Branching & Releases:**
- `develop`: Disparador de pruebas automáticas y despliegue a entorno de pruebas.
- `main`: Rama de producción / versión `latest` (se mantiene `main` y se crea `develop` a partir de ella).
- Producción: Tags de versión SemVer estándar `vMAJOR.MINOR.PATCH` (ej. `v1.0.0`).

**Estrategia de entrega:** `ask-on-risk` (forecast ≈ 400+ authored changed lines; se consultará antes de encadenar PRs si se excede el presupuesto).

**Test runner:** Vitest para pruebas unitarias e integración (`packages/domain`, esquemas Zod, server actions) + Playwright para pruebas E2E en navegador (interactividad, formulario, cambio de idioma y tema).

---

## Specs

| ID | Spec (verbatim del usuario) | Alcance autorizado y definido en entrevista |
|----|----------------------------|---------------------------------------------|
| S1 | "Desarrollo de la interfaz pública mediante Next.js 16 (App Router) y soporte PWA." | Scaffold Next.js 16 App Router en `apps/web`. PWA con manifest nativo App Router (`manifest.ts`) y Service Worker liviano compatible con Turbopack. Soporte i18n con rutas `/[locale]` (`/es` y `/en`) mediante `next-intl`. |
| S2 | "Diseño e implementación del sistema de componentes dinámicos con Radix UI, Tailwind CSS v4 y soporte nativo para modo claro y oscuro (Light/Dark Mode)." | Tailwind CSS v4, primitivas accesibles de Radix UI, gestión de tema claro/oscuro con `next-themes` y tipografías Sora / Inter. |
| S3 | "Implementacion de la capa de dominio compartida (packages/domain), esquemas Drizzle ORM, validaciones tipadas con Zod y delimitación estricta de directivas 'use client' y 'use server'." | Monorepo pnpm workspaces + Turborepo con `packages/domain`. Esquemas Drizzle ORM para entidad `leads`, validaciones Zod y conexión a PostgreSQL 18+. Formulario "Solicitar demo" procesado con Server Action (`use server`). |
| S4 | "La actual landing page debe convertirse en una app del sistema que no requiere autenticación." | Migración de secciones de `index.html` a componentes modulares React en `apps/web`. Acceso público total sin login. |
| S5 | "La landig page debe ser automatizada para SEO, AIO, GEO y LLMO." | Metadatos dinámicos, OpenGraph, JSON-LD (Schema.org `Organization` y `SoftwareApplication`), sitemap dinámico (`sitemap.ts`), `robots.ts`, y descriptores de IA (`llms.txt`, `llms-full.txt`). |
| S6 | "Se debe cambiar el concepto de nombre de negocio de AgencIA a Mocter." | Rebranding completo en textos, metadatos y creación de logotipo SVG vectorizado para Mocter adaptable a modo claro y oscuro. |
| S7 | "Mantener el diseño actual solo organizar la vista actual como la primera app de NextJs del proyecto." | Fidelidad visual del diseño actual: Hero, demo interactiva WhatsApp, pipeline de leads, sectores, testimonios, FAQ, y micro-interacciones. |
| S8 | "No se realiza despliegue local, se realiza mediante docker por consiguiente se debe crear, el dockerfile, dockercompose para desarrollo, pruebas y producción, tener en cuenta que el proyecto se desplegara usando ci/cd GitHub Actions y de una vez proyectar el pod para futuro despliegue en Kubernetes." | Dockerfile multi-stage optimizado para Next.js standalone en monorepo. `docker-compose.dev.yml` (con servicio PostgreSQL 18+), `docker-compose.test.yml`, `docker-compose.prod.yml`. Manifiestos K8s en `k8s/` (`deployment.yaml` con probes, `service.yaml`, `ingress.yaml`). GitHub Actions publicando en `ghcr.io`. |
| S9 | "Para los despliegues a pruebas se debe usar como disparador el branch develop, el brach master actual se convierte en la version Latest y la version de produccion sera el tag en formato v.x.x.x" | Flujo Git: `develop` dispara pruebas, `main` se conserva como rama principal / `latest`, tags SemVer `vX.Y.Z` disparan versión de producción en CI/CD. |

---

## Tasks

| ID | Linked S# | Route | Status | Commit identity | Descripción |
|----|-----------|-------|--------|-----------------|-------------|
| T1 | S1, S3 | inline | done | feat: monorepo pnpm + turborepo con cascaron next 16 (apps/web) | Configurar monorepo pnpm workspaces + Turborepo (`apps/web`, `packages/domain`, configs compartidas). |
| T2 | S3 | inline | done | 22bf5cb | Implementar `packages/domain`: esquemas Drizzle ORM (`leads`), validación Zod y cliente PostgreSQL 18+. |
| T3 | S1, S2, S6 | inline | done | 6e434bb | Configurar `apps/web` con Next.js 16, Tailwind CSS v4, Radix UI, `next-themes` y logotipo SVG Mocter. |
| T4 | S1, S5 | inline | done | cb6adb7 | Implementar i18n con `next-intl` (rutas `/[locale]`, diccionarios ES/EN) y metadatos SEO/AIO/GEO/LLMO (`robots.ts`, `sitemap.ts`, `llms.txt`). |
| T5 | S4, S7 | inline | done | 3604e1d | Portar secciones de la landing a componentes modulares React (Hero, WhatsApp demo, Features, Sectors, Pipeline, Testimonials, FAQ, Footer). |
| T6 | S3, S4 | inline | done | d205753 | Implementar componente y Server Action del formulario "Solicitar demo" con validación Zod y guardado en BD. |
| T7 | S1 | inline | done | 69233b0 | Configurar soporte PWA en `apps/web` (manifest nativo `manifest.ts` e instalación/Service Worker). |
| T8 | — | inline | pending | — | Configurar suite de pruebas: Vitest para `packages/domain` y Server Actions + Playwright para E2E de la landing. |
| T9 | S8 | inline | done | 36843cc | Crear Dockerfile multi-stage, docker-compose (`dev` con Postgres 18+, `test`, `prod`) y manifiestos K8s en `k8s/` (`deployment.yaml`, `service.yaml`, `ingress.yaml`). |
| T10 | S8, S9 | inline | pending | — | Configurar workflows de GitHub Actions para CI (lint/tests) y CD (build y push a `ghcr.io` con ramas `develop`, `main` y tags `v*.*.*`). |

---

## Log

**L1** (16 Oct 2026): Usuario solicita implementar Next.js 16 sobre el proyecto landig-agencia actual. Requisitos: App Router, PWA, Radix UI, Tailwind CSS v4, Light/Dark Mode, packages/domain, Drizzle ORM, Zod, 'use client'/'use server', landing sin autenticación, SEO/AIO/GEO/LLMO, rebrand AgencIA→Mocter, mantener diseño actual como primera app Next.js. S1 corregido: solo interfaz pública en esta iteración; administrativa en iteración posterior.

**L2** (16 Oct 2026): Se agregan requisitos de despliegue: no despliegue local, solo Docker. Crear Dockerfile y docker-compose para desarrollo, pruebas y producción. CI/CD con GitHub Actions. Proyectar pod Kubernetes para futuro despliegue. Branching: develop dispara pruebas, master = latest, producción = tags v.x.x.x. Se agregaron specs S8 y S9, y tasks T7-T10. No implementar código todavía; solo planificación actualizada.

**L3** (16 Oct 2026): Sesión `/grill-me` completada con 10 decisiones arquitectónicas acordadas:
1. Ramas: Conservar `main` como rama principal (`latest`) y ramificar `develop` a partir de ella.
2. Tags de producción: SemVer estándar `vMAJOR.MINOR.PATCH` (ej. `v1.0.0`).
3. Arquitectura: Monorepo pnpm workspaces + Turborepo (`apps/web` y `packages/domain`).
4. Alcance Drizzle/DB: Servicio PostgreSQL en docker-compose + formulario funcional "Solicitar demo" con Server Action.
5. i18n: Rutas con prefijo `/[locale]` mediante `next-intl` para SEO/AIO/LLMO óptimo.
6. Registro de imágenes CI/CD: GitHub Container Registry (`ghcr.io`) vía `GITHUB_TOKEN`.
7. Kubernetes: Manifiestos estándar en `k8s/` (`deployment.yaml` con réplicas y probes, `service.yaml`, `ingress.yaml`).
8. Testing: Vitest para tests unitarios/integración en domain/actions + Playwright para E2E.
9. Logotipo: Componente SVG vectorizado de Mocter adaptable a Light/Dark Mode y PWA.
10. PWA: Manifest nativo App Router (`manifest.ts`) + Service Worker liviano compatible con Turbopack.

**L4** (16 Oct 2026): Aclaración de versión de persistencia: la versión admisible de base de datos se establece explícitamente como PostgreSQL 18+ (en compose, conexión de dominio y despliegue).

**L5** (16 Oct 2026): Work-unit commits T2–T7 en `feature/mocter-nextjs-migration` (T3–T7 alcance solicitado por el usuario; T2 incluído por ser dependencia de persistencia de T6):
- T2 `22bf5cb` feat(domain): Drizzle schemas, Zod validation, PostgreSQL client (Risk: item 1)
- T3 `6e434bb` feat(web): Next.js 16, Tailwind v4, Radix, next-themes, Mocter logo (Risk: none)
- T4 `cb6adb7` feat(i18n-seo): /[locale] routes, ES/EN dictionaries, SEO/AIO/GEO/LLMO (Risk: none)
- T5 `3604e1d` feat(ui): landing modular sections (Risk: none)
- T6 `d205753` feat(forms): Solicitar demo form + Server Action + BD persistence (Risk: item 1)
- T7 `69233b0` feat(pwa): native manifest + Service Worker (Risk: none)
- Soporte: `3f6dc76` chore(deps): sync pnpm-lock; `36843cc` feat(infra): Docker, compose env vars, k8s (Risk: item 5 — also covers T9 code)
- T6 review nativo bloqueado: schema `gentle-ai.review-intended-untracked-selection/v1` desconocido; no se pudo completar collect de intended_untracked_selection.

**L6** (16 Oct 2026): Regla de IaC establecida y aplicada: datos sensibles (POSTGRES_USER/PASSWORD/DB, DATABASE_URL) solo via variables de entorno con valor por defecto en docker-compose.dev.yml, docker-compose.test.yml, docker-compose.prod.yml, .env.example. k8s ya usaba secretKeyRef / placeholder vacío. Dockerfile sin sensibles hardcodeados.

**L7** (16 Oct 2026): Estabilización para build y despliegue Docker dev (commit 870f019):
- Bug corregido: `apps/web/package.json` faltaba `@mocter/domain` como dependencia declarada (`workspace:*`). El `paths` de tsconfig solo ayuda a TypeScript; sin la dependencia en package.json, pnpm no crea el symlink y Node/Turbopack no resuelve el paquete en runtime.
- Bug corregido: `packages/domain/src/{index,db}.ts` importaban entre sí con extensión `.js` sobre archivos `.ts`; Node/Turbopack no resuelve `.js` a `.ts`. Cambiado a `.ts`.
- Bug corregido: `apps/web/components/sections/live-demo.tsx` importaba `../../count-up|reveal|icons` desde `components/sections/` (resuelve a `apps/web/`); corregido a `../`.
- Bug corregido: Docker Compose no soporta `${VAR:default}`; cambiado a `${VAR:-default}` en los 3 compose files y .env.example.
- Entorno dev verificado: `docker compose -f docker-compose.dev.yml up --build -d` levanta postgres:18-alpine (healthy) + next dev (puerto 3000). `/es` y `/en` responden HTTP 200 con contenido completo (i18n ES/EN funcionando).

---

*Documento de trazabilidad ODD actualizado y alineado con la entrevista técnica. T3–T7 implementados y commiteados. T9 verificado en Docker dev. T8 (tests), T10 (CI/CD workflows) permanecen pendientes.*

---

*Documento de trazabilidad ODD actualizado y alineado con la entrevista técnica. T3–T7 implementados y commiteados. T8 (tests), T10 (CI/CD workflows) permanecen pendientes.*
