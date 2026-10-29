# Mocter — Plataforma Empresarial de Automatización con IA

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?logo=next.js)](https://nextjs.org/)
[![Turbopack](https://img.shields.io/badge/Turbopack-Ready-blueviolet)](https://turbo.build/pack)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-v0.45-C5F74F?logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.x-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?logo=docker)](https://www.docker.com/)
[![Traefik](https://img.shields.io/badge/Traefik-v2.11-24A1C1?logo=traefik)](https://traefik.io/)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?logo=githubactions)](https://github.com/features/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Licencia](https://img.shields.io/badge/Licencia-Propiedad_de_Mocter-emerald)](#12-propiedad-intelectual-marca-y-copyright)

Sistema de información web de alta disponibilidad y arquitectura empresarial para **Mocter**, diseñado para centralizar la prospección, automatizar la atención al cliente 24/7 y orquestar el agendamiento inteligente de citas y ventas asistidas por Inteligencia Artificial.

---

## 1. Ficha Técnica y Resumen Ejecutivo

| Atributo | Detalle del Sistema |
| :--- | :--- |
| **Nombre Comercial:** | Plataforma Web Mocter (Portal Público & Captura de Leads) |
| **Identificador del Proyecto:** | `mocter-portal` / Monorepo `landig-agencia` |
| **Versión Actual:** | `1.2.0` (SemVer) |
| **Tipo de Sistema:** | Web Application & Progressive Web App (PWA) de Alto Desempeño |
| **Propiedad Intelectual:** | © 2026 Mocter. Todos los derechos reservados. |
| **Contacto Oficial:** | [info@mocter.co](mailto:info@mocter.co) · WhatsApp: +57 322 275 2524 |
| **Soberanía de Datos:** | Datos alojados y procesados conforme a la normativa colombiana e internacional. |

### 1.1 Objetivos de Negocio
- **Conversión Acelerada:** Captación inmediata de prospectos calificados a través de un canal unificado y responsivo.
- **Demostración Interactiva en Vivo:** Simulación visual del pipeline de IA (recepción, análisis semántico, consulta de agenda y confirmación automática).
- **Omnicanalidad y Alta Fidelidad:** Experiencia fluida con conmutación dinámica de tema (Modo Claro / Modo Oscuro), animaciones de bajo costo computacional y soporte multilingüe nativo (`es` / `en`).
- **Despliegue Continuo Seguro:** Automatización integral de pruebas, compilación de imágenes y despliegue idempotente con rollback automático y sin caídas de servicio.

---

## 2. Equipo de Desarrollo y Gobernanza

El proyecto está estructurado bajo las mejores prácticas de la ingeniería de software moderna y la metodología **Spec-Driven Development (SDD)** definida en `.agents/AGENTS.md`:

| Rol | Responsabilidad Principal |
| :--- | :--- |
| **Tech Lead & Senior Architect** | Diseño de la arquitectura de software (Clean Architecture), gobernanza técnica, seguridad y patrones de concurrencia. |
| **Frontend Engineer (Next.js / React)** | Desarrollo de la interfaz, componentes de alta fidelidad, accesibilidad (a11y), PWA y animaciones CSS nativas. |
| **Backend & Data Engineer** | Modelado de datos en PostgreSQL 18, contratos de persistencia con Drizzle ORM y validaciones con Zod. |
| **DevOps & Cloud Architect** | Pipeline CI/CD en GitHub Actions, orquestación Docker multi-stage, Traefik v2.11 y despliegue seguro en VPS. |
| **QA Automation Engineer** | Mantenimiento de suite de pruebas unitarias, integración (Vitest) y compuertas de calidad automatizadas. |
| **Product Designer (UI/UX)** | Sistema de diseño (Design Tokens), coherencia visual corporativa y experiencia de usuario optimizada para conversión. |

---

## 3. Arquitectura del Sistema

La solución implementa una **Arquitectura Limpia y Modular (Clean Architecture / Screaming Architecture)** dividida en un monorepo administrado por **Turborepo** y **pnpm workspaces**:

```mermaid
flowchart TD
    subgraph Ingress["Perímetro & Proxy Inverso"]
        Traefik["Traefik v2.11 (TLS Let's Encrypt + Redirección 301 www)"]
    end

    subgraph Client["Cliente / Navegador (PWA & Web)"]
        UI["Interfaz Web (Next.js 16 + Tailwind CSS v4)"]
        Theme["Gestor de Temas (Dark / Light Tokens)"]
        i18n["Internacionalización (next-intl /es, /en)"]
    end

    subgraph AppLayer["Capa de Aplicación (apps/web)"]
        ServerAction["Server Actions (demo-request.ts)"]
        ValidationZod["Validación de Entrada (Zod v4)"]
    end

    subgraph DomainLayer["Capa de Dominio (@mocter/domain)"]
        DBModule["Módulo de Conexión y Consultas (src/db/index.ts)"]
        Schema["Esquema Tipado Drizzle (src/db/schema.ts)"]
        Migrator["Script de Migraciones Standalone (scripts/migrate.mjs)"]
    end

    subgraph DataLayer["Capa de Datos y Persistencia"]
        Postgres[(PostgreSQL 18 + pgvector: pg-portal)]
    end

    Traefik --> UI
    UI --> ServerAction
    ServerAction --> ValidationZod
    ValidationZod --> DBModule
    DBModule --> Schema
    Schema --> Postgres
    Migrator -.->|Pre-despliegue| Postgres
```

### 3.1 Estructura del Monorepo

```text
landig-agencia/
├── .agents/                          # Constitución permanente de directivas del repositorio
│   └── AGENTS.md                     # Reglas de desarrollo, metodología SDD y restricciones
├── .github/
│   └── workflows/                    # Automatización CI/CD
│       ├── ci.yml                    # CI: Lint, tests, build y drizzle-kit check en PRs
│       ├── cd.yml                    # CD: Construcción y publicación de imágenes en GHCR
│       └── deploy.yml                # Despliegue automatizado por SSH a VPS Hostinger
├── apps/
│   └── web/                         # Aplicación pública Next.js 16 (App Router)
│       ├── app/
│       │   ├── [locale]/             # Rutas dinámicas localizadas (/es, /en)
│       │   │   ├── layout.tsx        # Layout raíz (SEO, JSON-LD estructurado, ThemeProvider)
│       │   │   ├── page.tsx          # Landing page modular de alta fidelidad
│       │   │   ├── cookies/          # Página de configuración de cookies
│       │   │   ├── privacidad/       # Página de política de privacidad (Ley 1581/2012)
│       │   │   └── terminos/         # Página de términos y condiciones
│       │   ├── actions/              # Server Actions con validación y mutaciones seguras
│       │   │   ├── demo-request.ts   # Acción de captura y persistencia de leads
│       │   │   └── types.ts          # Contratos de estado del formulario
│       │   └── globals.css           # Tokens de diseño Tailwind v4 (soporte dark/light nativo)
│       ├── components/               # Componentes atómicos y modulares
│       │   ├── sections/             # Secciones (Hero, Features, Sectores, Pipeline, FAQ, Footer)
│       │   ├── demo-form.tsx         # Formulario reactivo y accesible para solicitud de demo
│       │   ├── chatwoot-widget.tsx   # Widget oficial de soporte en vivo Chatwoot
│       │   ├── theme-toggle.tsx      # Conmutador accesible de Modo Claro / Modo Oscuro
│       │   └── nav.tsx               # Barra de navegación en cápsula flotante adaptable
│       ├── messages/                 # Diccionarios de internacionalización (es.json, en.json)
│       ├── public/                   # PWA Manifest, iconos adaptativos, llms.txt, robots.txt
│       └── next.config.ts            # Configuración de compilador, orígenes dev e imágenes
├── packages/
│   └── domain/                       # Capa de dominio agnóstica de frameworks
│       ├── drizzle/                  # Migraciones SQL versionadas
│       ├── scripts/
│       │   └── migrate.mjs           # Ejecutor standalone de migraciones para Docker/CI
│       ├── src/
│       │   ├── db/
│       │   │   ├── index.ts          # Pool postgres-js perezoso, proxy db y funciones de datos
│       │   │   └── schema.ts         # Definición tipada de la entidad PostgreSQL 'leads'
│       │   ├── validation.ts         # Contratos de validación de negocio Zod (leadSchema)
│       │   ├── validation.test.ts    # Pruebas unitarias de validación (Vitest)
│       │   └── index.ts              # API pública reexportada
│       ├── drizzle.config.ts         # Configuración oficial de Drizzle Kit
│       ├── tsconfig.json             # Configuración TypeScript del paquete
│       └── package.json              # Exports modulares (., ./schema, ./validation, ./db)
├── deploy/
│   └── server/                       # Artefactos y scripts de aprovisionamiento en servidor
│       ├── deploy.sh                 # Script de despliegue con pre-deploy hook, healthcheck y rollback
│       ├── deploy.conf.example       # Plantilla de configuración del servidor
│       ├── env.prod.example          # Plantilla de variables de entorno para producción
│       └── env.test.example          # Plantilla de variables de entorno para staging/test
├── docs/
│   ├── deployment.md                 # Manual operativo de despliegue y administración
│   └── specs/                        # Especificaciones Spec-Driven Development (SDD)
│       ├── mig-001-nextjs-migration/ # Especificación técnica de migración a Next.js 16
│       └── cd-001-despliegue-continuo/ # Especificación técnica de CI/CD y despliegue
├── k8s/                              # Manifiestos de Kubernetes para producción enterprise
├── docker-compose.yml                # Orquestación de desarrollo con HMR y volúmenes aislados
├── docker-compose.test.yml           # Orquestación de pruebas aisladas y validación de calidad
├── docker-compose.prod.yml           # Orquestación de producción con Traefik v2.11 y servicio migrate
├── Dockerfile                        # Multi-stage build optimizado (Node 24 Alpine, standalone + migrator)
├── .env.example                      # Plantilla de variables de entorno documentada en la raíz
├── turbo.json                        # Definición de pipelines y variables globales de Turborepo
└── package.json                      # Configuración raíz de pnpm workspaces
```

---

## 4. Pila Tecnológica Detallada

### 4.1 Frontend & Aplicación Web (`apps/web`)
- **Framework Principal:** [Next.js 16](https://nextjs.org/) con React 19 y compilador Turbopack.
- **Paradigma de Enrutamiento (App Router Exclusivo):** Implementado 100% bajo **Next.js App Router** (`apps/web/app/`). Queda expresamente **prohibido el uso de Pages Router** (`pages/`), así como métodos legados (`getServerSideProps`, `getStaticProps`). La arquitectura aprovecha React Server Components (RSC), Route Handlers nativos (`app/api/`) y Server Actions para mutaciones de datos.
- **Sistema de Estilos:** [Tailwind CSS v4](https://tailwindcss.com/) configurado con variables CSS dinámicas para cambio de tema instantáneo.
- **Tipografía:** Sora (Display) & Inter (Sans) optimizadas con precarga nativa `next/font`.
- **Internacionalización:** [next-intl](https://next-intl-docs.vercel.app/) con detección y resolución limpia de rutas (`/es` y `/en`).
- **Soporte PWA:** Manifiesto web progresivo (`manifest.webmanifest`), `sw.js` y metadatos para instalación en dispositivos móviles y de escritorio.
- **SEO & Descubrimiento:** Metadatos OpenGraph, Twitter Cards, Canonical URLs, Schema.org JSON-LD estructurado y archivos `llms.txt` / `llms-full.txt` para motores de búsqueda de IA.
- **Documentación de APIs (OpenAPI / Swagger):** Documentación OpenAPI 3.1 tipada y autogenerada desde esquemas Zod con `@asteasolutions/zod-to-openapi`. Expuesta vía endpoint JSON canónico (`/api/openapi.json`) y visor interactivo moderno en tiempo real con Scalar (`/api-docs`).

### 4.2 Capa de Datos & Persistencia (`packages/domain`)
- **Motor de Base de Datos:** [PostgreSQL 18+](https://www.postgresql.org/) con extensión `pgvector` para soporte de búsquedas semánticas.
- **ORM & Migraciones:** [Drizzle ORM](https://orm.drizzle.team/) con arquitectura canónica:
  - `src/db/schema.ts`: Definición de esquema relacional y tipado (`Lead`, `NewLead`).
  - `src/db/index.ts`: Inicialización perezosa de conexión `postgres-js`, pool administrado y operaciones (`insertLead`).
  - `scripts/migrate.mjs`: Script autónomo de migraciones que corre de forma segura antes de iniciar el tráfico web.
- **Aislamiento de Schemas:** Tablas de negocio en schema `public`; historial de migraciones en schema dedicado `drizzle` (`drizzle.__drizzle_migrations`). Cero impacto en rendimiento.
- **Validación de Datos:** [Zod v4](https://zod.dev/) para validación estricta en servidor antes de persistir en base de datos.

### 4.3 Herramientas, Infraestructura & DevOps
- **Monorepo Manager:** [Turborepo v2](https://turbo.build/repo) + [pnpm v12+](https://pnpm.io/) (`corepack`).
- **Contenedores:** [Docker](https://www.docker.com/) con imágenes multi-stage basadas en `node:24-alpine` que albergan la aplicación Next.js standalone y el migrador (`/app/migrator`).
- **Proxy Perimetral y Redes:** [Traefik v2.11](https://traefik.io/) con TLS Let's Encrypt automático (`mytlschallenge`) y redirección 301 permanente de `www.mocter.co` a `mocter.co`.
- **CI/CD:** [GitHub Actions](https://github.com/features/actions) con publicación de imágenes en **GHCR** (`ghcr.io/enuarrosales/mocter-web`) y despliegue por SSH a VPS Hostinger con `deploy.sh`.

---

## 5. Requisitos Previos del Sistema

### 5.1 Requisitos de Hardware (Recomendados)
- **CPU:** 4 núcleos o superior (x86_64 o ARM64).
- **Memoria RAM:** Mínimo 4 GB (8 GB recomendados para ejecución simultánea de contenedores y compilación).
- **Almacenamiento:** Mínimo 10 GB de espacio libre en disco.

### 5.2 Requisitos de Software
- **Node.js:** Versión `24.x` o superior.
- **Gestor de Paquetes:** `pnpm 12.x` (`corepack enable`).
- **Docker & Docker Compose:** Docker Engine `24.x+` con Docker Compose v2.
- **Git:** Versión `2.40+`.

---

## 6. Variables de Entorno y Configuración

El proyecto utiliza un **único archivo `.env` en la raíz** del repositorio como fuente de verdad (basado en la plantilla [.env.example](.env.example)). No deben crearse archivos `.env` duplicados en subdirectorios.

| Variable | Tipo | Descripción | Valor por Defecto (Dev) | Obligatoria en Prod |
| :--- | :---: | :--- | :--- | :---: |
| `DATABASE_URL` | String | Cadena de conexión URI hacia PostgreSQL | `postgres://mocter:M0ct3rP0rt4LDev2026@localhost:54321/db-portal` | **Sí** |
| `NODE_ENV` | Enum | Entorno de ejecución (`development`, `test`, `production`) | `development` | **Sí** |
| `POSTGRES_USER` | String | Usuario de administración de PostgreSQL | `mocter` | **Sí** |
| `POSTGRES_PASSWORD` | String | Clave de acceso a la base de datos | `M0ct3rP0rt4LDev2026` | **Sí** |
| `POSTGRES_DB` | String | Nombre de la base de datos relacional | `db-portal` | **Sí** |
| `POSTGRES_PORT` | Integer | Puerto expuesto en el host para la base de datos local | `54321` | Solo Dev |
| `REDIS_PASSWORD` | String | Contraseña de autenticación de Redis plano de control | — | **Sí** |
| `AUTH_RATE_LIMIT_PEPPER` | String | Sal secreta para cálculo de hashes de IP en rate limiting | `mocter-dev-pepper` | **Sí** |
| `ALLOWED_ORIGINS` | String | Orígenes autorizados separados por coma para CORS/Origin | `http://localhost:3001,http://127.0.0.1:3001` | **Sí** |
| `CHATWOOT_SSO_SECRET` | String | Secreto compartido HMAC-SHA256 para emisión de tokens JWT de SSO | — | **Sí** |
| `TAG` | String | Etiqueta / versión de la imagen Docker en GHCR | — | **Sí** (en prod/test) |

### 6.1 Obtención y Sincronización de `CHATWOOT_SSO_SECRET`

En la arquitectura de Mocter ([AUTH-001 §5.10](docs/specs/auth-001-autenticacion-hibrida/design.md#510-sso-a-chatwoot)), el módulo de autenticación emite tokens JWT HS256 con TTL de 5 minutos para el inicio de sesión único hacia la instancia de Chatwoot (`v4.19.1`).

Al ser Chatwoot una aplicación basada en Ruby on Rails, su clave simétrica de firma y validación criptográfica es su variable maestra **`SECRET_KEY_BASE`**. Por consiguiente, `CHATWOOT_SSO_SECRET` en Mocter debe coincidir exactamente con el valor de `SECRET_KEY_BASE` configurado en el contenedor de Chatwoot del ambiente correspondiente.

#### A. Ambiente de Desarrollo Local (Docker)
Con el stack local en ejecución, ejecutar en la terminal para extraer el valor configurado en el contenedor `mocter-chatwoot-rails-1`:

```powershell
# En PowerShell (Windows):
docker inspect mocter-chatwoot-rails-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | findstr SECRET_KEY_BASE

# En Bash / WSL:
docker inspect mocter-chatwoot-rails-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep SECRET_KEY_BASE
```
*(Alternativamente, consultar el archivo `.env` del compose local de Chatwoot).*

#### B. Ambientes de Pruebas y Producción (Docker + Traefik en VPS Hostinger)
En los servidores de producción y pruebas (donde Chatwoot reside bajo `/opt/mocter-chatwoot/`, documentado en [docs/reference/production-services.md](docs/reference/production-services.md)), conectarse por SSH y extraer el valor por cualquiera de las siguientes vías:

```bash
# Opción 1: Consulta directa al contenedor en ejecución
docker inspect mocter-chatwoot-rails-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep SECRET_KEY_BASE

# Opción 2: Lectura directa del archivo de configuración del host
grep SECRET_KEY_BASE /opt/mocter-chatwoot/.env
```

El valor obtenido se asigna a la variable `CHATWOOT_SSO_SECRET` en el archivo `.env` de Mocter en dicho entorno.


---

## 7. Compilación y Desarrollo Local

### 7.1 Preparación Inicial
```bash
# 1. Habilitar Corepack para asegurar la versión estricta de pnpm
corepack enable

# 2. Instalar dependencias exactas del monorepo en el host (para soporte de tipos en IDE)
corepack pnpm install --frozen-lockfile
```

### 7.2 Compilación del Proyecto (Build)
Turborepo gestiona la caché y el grafo de dependencias entre paquetes:
```bash
# Compilar todos los paquetes y aplicaciones del monorepo
pnpm build

# O compilar de forma aislada un paquete específico:
pnpm --filter @mocter/domain build
pnpm --filter @mocter/web build
```

### 7.3 Ejecución de Pruebas y Control de Calidad
```bash
# Ejecutar todas las pruebas unitarias y de integración (39 pruebas pasando)
pnpm test

# Verificación estricta de linting y reglas de tipos TypeScript
pnpm lint

# Verificación de consistencia del esquema Drizzle
pnpm --filter @mocter/domain exec drizzle-kit check
```

### 7.4 Migraciones de Base de Datos
```bash
# Generar nuevas migraciones SQL a partir de cambios en src/db/schema.ts
pnpm --filter @mocter/domain db:generate

# Aplicar las migraciones directamente en la base de datos local
pnpm --filter @mocter/domain db:migrate
```

---

## 8. Guía de Despliegue en sus Diferentes Ambientes

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  1. Desarrollo  │  ───> │  2. Pruebas/CI  │  ───> │  3. Producción  │  ───> │  4. Enterprise  │
│  (Compose Dev)  │       │  (Compose Test) │       │ (Compose Prod)  │       │  (Kubernetes)   │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Ambiente 1: Desarrollo Local (`docker-compose.yml`)
Diseñado para velocidad con **Hot Module Reloading (HMR)** mediante Turbopack. Aísla `node_modules` en volúmenes Docker y ejecuta las migraciones pendientes automáticamente al iniciar:

```bash
# 1. Levantar el stack de desarrollo (Next.js 16 + PostgreSQL 18)
docker compose up

# 2. Puntos de acceso:
#    - Aplicación Web: http://localhost:3001/es
#    - PostgreSQL: localhost:54321 (Usuario: mocter | BD: db-portal)

# 3. Detener los servicios:
docker compose down
```

### Ambiente 2: Pruebas y Validación CI (`docker-compose.test.yml`)
Entorno de staging aislado para validación de imágenes productivas previas al despliegue final.

```bash
# Levantar el entorno de pruebas con una versión específica
TAG=sha-xxxxxxx docker compose -f docker-compose.test.yml up -d
```

### Ambiente 3: Producción en VPS Hostinger (`docker-compose.prod.yml`)
En producción, el sistema opera detrás de **Traefik v2.11** con cero puertos expuestos en el host:

1. **Flujo de Entrega Continua:**
   - Crear un release tag en `main` (ej. `v1.2.0`).
   - El workflow `.github/workflows/cd.yml` construye la imagen multi-stage y la publica en `ghcr.io/enuarrosales/mocter-web:v1.2.0`.
   - El workflow `.github/workflows/deploy.yml` se conecta vía SSH al VPS y ejecuta el script [`deploy/server/deploy.sh`](deploy/server/deploy.sh).
2. **Ciclo de Despliegue Seguro (`deploy.sh`):**
   - Descarga la nueva imagen desde GHCR.
   - Ejecuta el servicio de pre-despliegue `migrate` (`docker compose --profile migrate run --rm migrate`).
   - Levanta el servicio `web-portal` y evalúa el healthcheck interno (`wget http://127.0.0.1:3000/`).
   - Si el contenedor no responde saludablemente en el tiempo estipulado, ejecuta un **rollback automático** a la versión anterior.
   - Si es exitoso, actualiza el puntero de versión y limpia imágenes antiguas no utilizadas.

---

## 9. Seguridad y Administración Remota de la Base de Datos

### 9.1 Políticas de Seguridad y Redes
- **Sin Puertos Expuestos:** En producción y pruebas, el servicio `pg-portal` no expone el puerto `5432` al host ni a internet; reside exclusivamente en la red interna de Docker `backend`.
- **Tráfico Perimetral Seguro:** Todo el tráfico HTTP/HTTPS ingresa exclusivamente por el puerto 443 a través de Traefik con TLS gestionado por Let's Encrypt.
- **Sanitización y Tipado Estricto:** Toda entrada del formulario `demo-request` es validada con Zod en el servidor. Drizzle ORM previene inyecciones SQL mediante consultas 100% parametrizadas.

### 9.2 Administración Remota Segura (Túnel SSH)
Para conectar herramientas de administración GUI (DBeaver, TablePlus, DataGrip) o CLI (`psql`) a la base de datos de producción:

1. **Vía Cliente GUI con SSH Tunnel (Recomendado):**
   - **Host:** `localhost` o `pg-portal` | **Port:** `5432` | **Database:** `db-portal` | **User/Pass:** Credenciales del `.env` de producción.
   - **Pestaña SSH Tunnel:** Host del VPS (`mocter.co`), puerto SSH (22), usuario (`root` o despliegue) y clave privada SSH (`id_ed25519`).
2. **Vía Terminal Local:**
   ```bash
   ssh -L 5433:localhost:5432 usuario@mocter.co
   # Luego conectar cliente local a localhost:5433
   ```
3. **Vía CLI Directa en el Servidor:**
   ```bash
   docker exec -it mocter-admin-prod-pg-portal-1 psql -U mocter -d db-portal
   ```

---

## 10. Monitoreo, Logs y Diagnóstico de Fallos

- **Verificación de Base de Datos:** La función `checkDatabaseConnection()` en `packages/domain/src/db/index.ts` ejecuta `SELECT 1` y reporta con claridad cualquier inalcanzabilidad.
- **Inspección de Logs en Servidor:**
  ```bash
  # Ver logs de la aplicación web en producción
  docker compose -f /opt/mocter-admin/compose.yml logs -f web-portal

  # Ver logs del migrador
  docker compose -f /opt/mocter-admin/compose.yml logs migrate
  ```
- **Inspección de Estado y Despliegues:**
  ```bash
  /opt/mocter-admin/deploy.sh status
  /opt/mocter-admin/deploy.sh rollback
  ```

---

## 11. Convenciones de Desarrollo y Flujo Git

- **Políticas de Ramas:**
  - `main`: Código estable, validado y desplegable en producción.
  - `develop`: Rama de integración para pruebas de regresión.
  - `feat/*`: Funcionalidades nuevas y aisladas.
  - `fix/*`: Correcciones de bugs con pruebas asociadas.
- **Estándar de Commits:** [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`).

---

## 12. Propiedad Intelectual, Marca y Copyright

### Declaración de Marca
**Mocter** es una plataforma y marca registrada dedicada a la automatización inteligente de flujos comerciales, atención omnicanal y agendamiento de citas asistido por IA para empresas y profesionales.

### Copy Green e Identidad Institucional
> **Tecnología consciente, eficiente y sostenible.**  
> En Mocter construimos arquitecturas de software de alto rendimiento con optimización de consumo computacional, minimizando la huella de carbono digital mediante compilaciones standalone ultraligeras, código tipado libre de sobrecarga y soberanía tecnológica local.

### Derechos Reservados
```text
Copyright © 2026 Mocter. Todos los derechos reservados.
Hecho con orgullo y precisión en Colombia.

Queda prohibida la reproducción, distribución o modificación no autorizada
de este software sin el consentimiento expreso y por escrito de Mocter.
```
