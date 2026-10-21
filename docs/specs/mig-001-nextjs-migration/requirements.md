# MIG-001 · Requisitos · Migración a Next.js 16

| Atributo | Valor |
|---|---|
| ID | MIG-001 |
| Versión | 1.0 |
| Estado | Implementada · Estable |
| Documentos | `requirements.md` (este) · [`tasks.md`](tasks.md) |

## 1. Propósito

Migrar la landing page pública inicial (`index.html`) a una aplicación Next.js 16 (App Router) modular en monorepo pnpm + Turborepo, con persistencia de leads en PostgreSQL 18+ vía Drizzle ORM, PWA nativa, optimización internacionalizada SEO/AIO/GEO/LLMO y rebranding integral a "Mocter".

## 2. Alcance

### Incluye
- `apps/web`: Aplicación Next.js 16 con App Router, Tailwind CSS v4, Radix UI, Light/Dark Mode y PWA.
- `packages/domain`: Capa de dominio compartida con esquemas Drizzle ORM (`leads`), validaciones Zod y cliente PostgreSQL.
- Formulario "Solicitar demo" conectado a Server Actions (`use server`) con persistencia directa en base de datos.
- Internacionalización i18n (`next-intl`) con rutas `/es` y `/en`.
- Manifiestos de despliegue Docker (`Dockerfile`, `docker-compose.dev.yml`, `docker-compose.prod.yml`) y Kubernetes (`k8s/`).

### Excluye
- Interfaz administrativa (reservada para iteraciones posteriores).
- Autenticación de usuarios para la navegación de la landing.

## 3. Especificaciones funcionales (S1 - S9)

| ID | Especificación | Descripción |
|---|---|---|
| S1 | Interfaz pública Next.js 16 + PWA | App Router modular y Service Worker nativo. |
| S2 | Componentes dinámicos | Radix UI accesible + Tailwind CSS v4 + Light/Dark mode. |
| S3 | Capa de dominio compartida | `@mocter/domain` con esquemas Drizzle y validaciones tipadas Zod. |
| S4 | Landing sin autenticación | Acceso público sin login para captación de leads. |
| S5 | Automatización SEO/AIO/GEO/LLMO | Metadatos dinámicos, `sitemap.ts`, `robots.ts`, `llms.txt`. |
| S6 | Rebranding a Mocter | Logotipo SVG adaptable e identidad gráfica de marca. |
| S7 | Fidelidad de diseño | Hero, Demo interactiva WhatsApp, Casos de uso, FAQ, Footer. |
| S8 | Despliegue contenerizado | Dockerfile multi-stage, compose files y manifiestos K8s. |
| S9 | Flujo Git y releases | Ramas `main`, `develop` y tags SemVer `vX.Y.Z`. |
