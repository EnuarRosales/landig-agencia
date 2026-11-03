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

Sistema de información empresarial multi-inquilino de alta disponibilidad para **Mocter**, diseñado para centralizar la prospección, automatizar la atención omnicanal 24/7 con LLMs y orquestar el agendamiento inteligente y ventas asistidas por IA mediante una **arquitectura distribuida basada en celdas de datos autónomas**.

---

## 1. Ficha Técnica y Resumen Ejecutivo

| Atributo | Detalle del Sistema |
| :--- | :--- |
| **Nombre Comercial:** | Plataforma SaaS Mocter (Portal Público, Consola Administrativa & Plano Celular) |
| **Identificador del Proyecto:** | Monorepo `landig-agencia` (`@mocter/web`, `@mocter/admin`, `@mocter/domain`) |
| **Versión Actual:** | `1.5.0` (SemVer) |
| **Tipo de Sistema:** | Plataforma SaaS Multi-Inquilino con Arquitectura Celular Distribuida |
| **Propiedad Intelectual:** | © 2026 Mocter. Todos los derechos reservados. |
| **Contacto Oficial:** | [info@mocter.co](mailto:info@mocter.co) · WhatsApp: +57 322 275 2524 |
| **Soberanía de Datos:** | Datos alojados y procesados conforme a la normativa colombiana (Ley 1581/2012) e internacional. |

### 1.1 Objetivos de Negocio y Arquitectura
- **Plataforma Única (Single Pane of Glass):** Consola administrativa unificada (`mocter-admin`) para el Platform Owner (gobernanza, infraestructura celular, facturación) y para los inquilinos (pedidos, productos, CRM, Chatwoot embebido).
- **Arquitectura de Celdas Autónomas (DAT-001):** Particionamiento físico y lógico donde cada célula (50-100 inquilinos) opera como un nodo completo (PostgreSQL 18 + pgvector + PgBouncer transaccional + capa celular HTTP `tenant-app`), garantizando aislamiento y zero blast radius.
- **Orquestación Declarativa (Modelo A):** Aprovisionamiento seguro con paquetes de secretos cifrados en AES-256-GCM, Handshake Dual 360° (probes TCP y HTTP con secretos de tiempo constante) y manifiestos canónicos.
- **Gobernanza RBAC y Seguridad Híbrida (AUTH-001):** Control granular de acceso por roles de plataforma e inquilino, TOTP 2FA cifrado, tokens CSRF, validación estricta de origen administrativo y SSO transparente hacia Chatwoot.
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
        Traefik["Traefik v2.11 (TLS Let's Encrypt · mocter.co, admin.mocter.co)"]
    end

    subgraph SupportPlane["Plano de Soporte Aislado (Singleton Global)"]
        ChatwootApp["Chatwoot v4.19.1 (Atención Omnicanal Embebida)"]
        PGChatwoot[("PostgreSQL Chatwoot (pg-chatwoot)")]
        N8nApp["n8n Automation Engine"]
        PGN8n[("PostgreSQL n8n (pg-n8n)")]
        ChatwootApp --> PGChatwoot
        N8nApp --> PGN8n
    end

    subgraph ControlPlane["Plano de Control Global (Control Plane)"]
        direction TB
        WebPortal["apps/web (Landing Pública · Next.js 16)"]
        AdminPortal["apps/admin (Consola Administrativa Unificada · Next.js 16)"]
        DomainCore["@mocter/domain (Servicios, Repositorios, RBAC & Outbox)"]
        PGControl[("pg-control-plane: PG18 + pgvector (leads, cells, plans, clients, users)")]
        RedisControl[("Redis 7+ (Sesiones, Rate Limit, Caché)")]
        RabbitMQ["RabbitMQ 3.13 (Relay de Notificaciones Outbox)"]
        MediaS3["SeaweedFS S3 + imgproxy (Entrega Multimedia Cifrada)"]

        WebPortal --> DomainCore
        AdminPortal --> DomainCore
        DomainCore --> PGControl
        DomainCore --> RedisControl
        DomainCore --> RabbitMQ
        DomainCore --> MediaS3
    end

    subgraph DataPlane["Plano de Datos Distribuido (Celdas Autónomas · DAT-001)"]
        direction TB
        subgraph Cell01["Célula Autónoma cell-01 (50-100 Inquilinos)"]
            TenantApp["tenant-app: Cómputo HTTP Celular (mocter-web standalone)"]
            PgBouncer["pgbouncer-cell-01 (Pooling Transaccional · Puerto 6432)"]
            PGCell[("pg-cell-01: PG18 + pgvector (mocter_cell schema)")]
            TenantApp --> PgBouncer
            PgBouncer --> PGCell
        end
    end

    Traefik --> WebPortal
    Traefik --> AdminPortal
    Traefik --> ChatwootApp
    AdminPortal -.->|Handshake Dual 360° & Secretos AES-256-GCM| Cell01
    AdminPortal -.->|SSO JWT & Iframe Same-Site| ChatwootApp
```

### 3.1 Estructura del Monorepo

```text
landig-agencia/
├── .agents/                          # Constitución permanente y directivas de ingeniería
│   ├── AGENTS.md                     # Reglas de desarrollo, metodología SDD y restricciones
│   ├── rules/                        # Directivas vinculantes (TSDoc, DB, i18n, Logs, Modales)
│   └── skills/                       # Habilidades especializadas del proyecto
├── .github/
│   └── workflows/                    # Automatización CI/CD
│       ├── ci.yml                    # CI: Lint, pruebas unitarias, build y drizzle-kit check
│       ├── cd.yml                    # CD: Compilación y publicación de imágenes en GHCR
│       └── deploy.yml                # Despliegue automatizado por SSH a VPS Hostinger
├── apps/
│   ├── admin/                        # Consola administrativa unificada (@mocter/admin)
│   │   ├── app/                      # App Router Next.js 16 (Single Pane of Glass)
│   │   │   ├── admin/                # Vistas de gobernanza (cells, tenants, users, plans, billing, ai)
│   │   │   ├── api/                  # Route Handlers administrativos (RFC 9457 Problem Details)
│   │   │   └── globals.css           # Tokens de diseño del sistema DSN-001 (Title Case estricto)
│   │   ├── components/               # Componentes atómicos (AdminShell, ConfirmationModal, AiEnhance)
│   │   └── proxy.ts                  # Inyector de x-request-id y AsyncLocalStorage para trazas
│   └── web/                          # Portal público y landing page (@mocter/web)
│       ├── app/                      # Rutas localizadas (/es, /en) en App Router Next.js 16
│       ├── components/               # Componentes de presentación, dock flotante y widgets
│       └── messages/                 # Diccionarios de internacionalización (next-intl)
├── packages/
│   └── domain/                       # Capa de dominio, reglas de negocio y persistencia (@mocter/domain)
│       ├── drizzle/                  # Migraciones SQL del Plano de Control (schema admin & public)
│       ├── drizzle-cell/             # Migraciones SQL del Plano Celular de Datos (schema mocter_cell)
│       ├── src/
│       │   ├── auth/                 # Motor de autenticación híbrida (Argon2id, TOTP, CSRF, SSO)
│       │   ├── db/                   # Esquema relacional del Control Plane (users, cells, plans, audit)
│       │   ├── db-cell/              # Esquema relacional celular (tenants, leads, orders, products)
│       │   ├── repositories/         # Repositorios de persistencia desacoplados de infraestructura
│       │   └── services/             # Servicios de dominio (cell-secrets, admin-dashboard, outbox, bot)
│       ├── scripts/                  # Ejecutores standalone de migraciones para Docker/CI
│       └── package.json              # Configuración y dependencias de la capa de dominio
├── data-cell-dev/                    # Entorno local de emulación de célula de datos (DAT-001)
│   ├── docker-compose.yml            # Orquestación de pg-cell-01, pgbouncer-cell-01 y tenant-app
│   └── pgbouncer/                    # Configuración de PgBouncer transaccional y userlist
├── deploy/
│   └── server/                       # Artefactos y scripts de aprovisionamiento en servidor
│       ├── deploy.sh                 # Script de despliegue con pre-deploy hook, healthcheck y rollback
│       ├── deploy.conf.example       # Plantilla de configuración del servidor
│       ├── env.prod.example          # Plantilla de variables de entorno para producción
│       └── env.test.example          # Plantilla de variables de entorno para staging/test
├── docs/
│   ├── deployment.md                 # Manual operativo de despliegue y administración
│   ├── reference/                    # Inventarios técnicos de servicios de producción
│   └── specs/                        # Especificaciones Spec-Driven Development (SDD)
├── k8s/                              # Manifiestos de Kubernetes para despliegues enterprise
├── docker-compose.yml                # Orquestación de desarrollo del Control Plane (apps/admin, apps/web, PG, Redis, RabbitMQ)
├── docker-compose.cell.yml           # Orquestación de emulación de célula de datos autónoma
├── docker-compose.test.yml           # Orquestación de pruebas aisladas y validación de calidad
├── docker-compose.prod.yml           # Orquestación de producción con Traefik v2.11 y servicio migrate
├── Dockerfile                        # Multi-stage build optimizado (Node 24 Alpine, standalone + migrator)
├── .env.example                      # Plantilla de variables de entorno documentada en la raíz
├── turbo.json                        # Definición de pipelines y variables globales de Turborepo
└── package.json                      # Configuración raíz de pnpm workspaces
```

---

## 4. Pila Tecnológica Detallada

### 4.1 Consola Administrativa & Frontend Web (`apps/admin` y `apps/web`)
- **Framework Principal:** [Next.js 16](https://nextjs.org/) con React 19 y compilador Turbopack en modo `standalone`.
- **Paradigma de Enrutamiento (App Router Exclusivo):** Implementado 100% bajo **Next.js App Router** (`app/`). Queda expresamente **prohibido el uso de Pages Router** (`pages/`). React Server Components (RSC), Route Handlers (`app/api/`) con formato estándar RFC 9457 Problem Details (`application/problem+json`), y Server Actions.
- **Sistema de Diseño (DSN-001):** Tailwind CSS v4 con variables CSS dinámicas. Cumplimiento estricto de accesibilidad WCAG 2.2 AA, labels de formularios en Title Case (cero uppercase) y modales de confirmación accesibles (cero diálogos nativos `window.confirm`).
- **Asistencia AI en Formularios (AI-001):** Integración «Mejorar con AI» en textareas mediante biblioteca versionada de prompts maestros y revisión humana obligatoria antes de persistir.
- **Trazabilidad y Observabilidad:** Logging estructurado JSON tipado (`LogEvent`) sin `console.*`, correlacionado por `requestId` (`x-request-id` propagado por `proxy.ts` vía `AsyncLocalStorage`).

### 4.2 Capa de Dominio & Persistencia (`packages/domain`)
- **Motor de Base de Datos:** [PostgreSQL 18+](https://www.postgresql.org/) con extensión `pgvector` para soporte de búsquedas vectoriales e indexación semántica.
- **Arquitectura de Celdas Autónomas (DAT-001):** Particionamiento celular donde cada célula aloja de 50 a 100 inquilinos con su propio PostgreSQL 18, esquema celular `mocter_cell` y PgBouncer transaccional (`port 6432`).
- **ORM & Migraciones Duales:** [Drizzle ORM](https://orm.drizzle.team/) con dos grafos de migración completamente independientes:
  - `drizzle/`: Migraciones del Plano de Control Global (`schema.ts`: usuarios, células, clientes, membresías, planes, auditoría).
  - `drizzle-cell/`: Migraciones del Plano Celular de Datos (`src/db-cell/schema.ts`: inquilinos, leads, pedidos, productos).
- **Criptografía de Secretos Celulares:** Cifrado autenticado AES-256-GCM con rotación de claves (`CELL_SECRETS_KEY`) y validación de Datos Asociados Autenticados (AAD) vinculados al UUID/código de la célula (`${cellId}:cell-secrets`).
- **Verificación de Conexión Celular (Dual Handshake 360°):** Probes no invasivos TCP y HTTP sobre la URL de la aplicación celular con secretos efímeros de tiempo constante, validando la salud y accesibilidad antes del despliegue.

### 4.3 Seguridad, Autenticación y Autorización (AUTH-001)
- **Roles Canónicos RBAC:** 5 roles inmutables (`platform_owner`, `platform_support`, `tenant_owner`, `tenant_admin`, `tenant_agent`) con permisos granulares por scopes (`cells:provision`, `cells:read`, `users:manage`, etc.).
- **Hashing de Contraseñas:** Algoritmo Argon2id con parámetros de alta seguridad (memoria 64 MiB, 3 iteraciones, paralelismo 1).
- **Segundo Factor TOTP (2FA):** Claves maestras cifradas en base de datos con AES-256-GCM y verificación con ventana de tolerancia de 1 paso.
- **Sesiones & CSRF:** Sesiones revocables en base de datos sincronizadas con Redis 7+, cookies HTTP-only `mocter_session` (`SameSite=Lax`, `Secure`), tokens CSRF criptográficos de un solo uso y verificación estricta de origen (`Origin` / `Referer`).
- **SSO Transparente a Chatwoot:** Emisión de tokens JWT HS256 firmados con secreto compartido (`CHATWOOT_SSO_SECRET`) para embedding seguro en iframe same-site.

### 4.4 Mensajería Asíncrona & Notificaciones (NTF-001)
- **Patrón Outbox Transaccional:** Registro de eventos en la misma transacción de base de datos para garantizar consistencia eventual libre de pérdidas.
- **Broker RabbitMQ:** Cola desacoplada con relay de reintentos exponenciales, Dead Letter Queue (DLQ) para anomalías y despacho de correo SMTP.

### 4.5 DevOps, Infraestructura & Contenedores
- **Monorepo Manager:** [Turborepo v2](https://turbo.build/repo) + [pnpm v12+](https://pnpm.io/) (`corepack`).
- **Contenedores Docker:** Multi-stage build optimizado (`node:24-alpine`) con imagen única para portal web, consola admin y ejecutor de migraciones.
- **Proxy Perimetral:** [Traefik v2.11](https://traefik.io/) con TLS Let's Encrypt automático y resolución DNS (`mocter.co`, `admin.mocter.co`). Cero puertos expuestos en el host en entornos de staging y producción.
- **CI/CD:** [GitHub Actions](https://github.com/features/actions) con publicación de imágenes en **GHCR** (`ghcr.io/enuarrosales/mocter-web`) y despliegue idempotente con rollback automático mediante `deploy.sh`.

---

## 5. Requisitos Previos del Sistema

### 5.1 Requisitos de Hardware (Recomendados)
- **CPU:** 4 núcleos o superior (x86_64 o ARM64).
- **Memoria RAM:** Mínimo 8 GB (16 GB recomendados para ejecución simultánea del Control Plane, Célula local y Chatwoot).
- **Almacenamiento:** Mínimo 20 GB de espacio libre en disco.

### 5.2 Requisitos de Software
- **Node.js:** Versión `24.x` o superior.
- **Gestor de Paquetes:** `pnpm 12.x` (`corepack enable`).
- **Docker & Docker Compose:** Docker Engine `24.x+` con Docker Compose v2.
- **Git:** Versión `2.40+`.

---

## 6. Variables de Entorno y Configuración

El proyecto utiliza un **único archivo `.env` en la raíz** del repositorio como fuente de verdad (basado en [.env.example](.env.example)).

| Variable | Tipo | Descripción | Valor por Defecto (Dev) | Obligatoria en Prod |
| :--- | :---: | :--- | :--- | :---: |
| `DATABASE_URL` | String | URI de conexión a PostgreSQL del Control Plane | `postgres://mocter:M0ct3rP0rt4LDev2026@localhost:54321/db-portal` | **Sí** |
| `NODE_ENV` | Enum | Entorno de ejecución (`development`, `test`, `production`) | `development` | **Sí** |
| `POSTGRES_USER` | String | Usuario administrativo de PostgreSQL Control Plane | `mocter` | **Sí** |
| `POSTGRES_PASSWORD` | String | Clave de acceso a PostgreSQL Control Plane | `M0ct3rP0rt4LDev2026` | **Sí** |
| `POSTGRES_DB` | String | Nombre de base de datos del Control Plane | `db-portal` | **Sí** |
| `REDIS_PASSWORD` | String | Contraseña de autenticación de Redis plano de control | — | **Sí** |
| `RABBITMQ_URL` | String | URI de conexión al broker RabbitMQ (Outbox relay) | `amqp://mocter_rabbit:${RABBITMQ_PASSWORD}@rabbitmq:5672` | **Sí** |
| `AUTH_RATE_LIMIT_PEPPER` | String | Sal secreta para cálculo de hashes de IP en rate limiting | `mocter-dev-pepper` | **Sí** |
| `ALLOWED_ORIGINS` | String | Orígenes autorizados separados por coma para CORS/Origin | `http://localhost:3001,http://localhost:3003` | **Sí** |
| `CHATWOOT_SSO_SECRET` | String | Secreto compartido HMAC-SHA256 (`SECRET_KEY_BASE` de Chatwoot) | — | **Sí** |
| `CHATWOOT_BASE_URL` | String | URL base de la instancia oficial de Chatwoot | `https://chat.mocter.co` | **Sí** |
| `TOTP_ACTIVE_KEY_ID` | String | Identificador activo de la clave de cifrado TOTP | `k1` | **Sí** |
| `TOTP_KEY` | String | Clave maestra AES-256 de cifrado TOTP (64 hex o 44 base64) | — | **Sí** |
| `CELL_SECRETS_ACTIVE_KEY_ID` | String | Identificador activo de clave para secretos celulares | `k1` | **Sí** |
| `CELL_SECRETS_KEY` | String | Clave maestra AES-256 para secretos celulares (DAT-001) | — | **Sí** |
| `CELL_SECRETS_DIR` | String | Directorio de lectura de secretos de producción | `/run/secrets` | En Prod |
| `SETUP_OWNER_TOKEN` | String | Token de un solo uso para bootstrap de Platform Owner | — | Inicial |
| `NEXT_PUBLIC_ADMIN_URL`| String | URL pública de la consola administrativa unificada | `http://localhost:3003` | **Sí** |
| `TAG` | String | Etiqueta de versión de la imagen Docker en GHCR | — | **Sí** (Prod/CI) |

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

# O compilar de forma aislada una aplicación o paquete específico:
pnpm --filter @mocter/domain build
pnpm --filter @mocter/admin build
pnpm --filter @mocter/web build
```

### 7.3 Ejecución de Pruebas y Control de Calidad
```bash
# Ejecutar la suite completa de pruebas unitarias e integración (1,048 pruebas pasando / 135 suites)
# Distribución: 679 en @mocter/domain, 259 en @mocter/web, 110 en @mocter/admin
pnpm test

# Verificación estricta de linting y reglas de tipos TypeScript (tsc --noEmit)
pnpm lint

# Verificación de consistencia del esquema Drizzle en Control Plane y Plano Celular
pnpm --filter @mocter/domain exec drizzle-kit check
```

### 7.4 Migraciones de Base de Datos
```bash
# Control Plane (admin & public):
pnpm --filter @mocter/domain db:generate
pnpm --filter @mocter/domain db:migrate

# Plano Celular (mocter_cell):
pnpm --filter @mocter/domain exec drizzle-kit generate --config=drizzle.cell.config.ts
```

### 7.5 Orquestación y Emulación Celular (DAT-001)
```bash
# Levantar el entorno de emulación de célula de datos (pg-cell-01, pgbouncer, tenant-app)
pnpm cell:up

# Ver registros de la célula de datos en tiempo real
pnpm cell:logs

# Detener el entorno celular
pnpm cell:down
```

---

## 8. Guía de Despliegue en sus Diferentes Ambientes

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  1. Desarrollo  │  ───> │  2. Pruebas/CI  │  ───> │  3. Producción  │  ───> │  4. Enterprise  │
│  (Control+Cell) │       │  (Compose Test) │       │ (Compose Prod)  │       │  (Kubernetes)   │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Ambiente 1: Desarrollo Local Control Plane (`docker-compose.yml`)
Diseñado para velocidad con **Hot Module Reloading (HMR)** mediante Turbopack. Aísla `node_modules` en volúmenes Docker y ejecuta las migraciones pendientes automáticamente al iniciar:

```bash
# 1. Levantar el stack de desarrollo del Control Plane
docker compose up -d

# 2. Puntos de acceso:
#    - Portal Web Público: http://localhost:3001/es
#    - Consola Administrativa Unificada: http://localhost:3003/admin
#    - PostgreSQL Control Plane: localhost:54321 (Usuario: mocter | BD: db-portal)
#    - RabbitMQ Management Console: http://localhost:15672 (mocter_rabbit)
#    - Redis Control Plane: localhost:6379

# 3. Detener los servicios:
docker compose down
```

### Ambiente 1.B: Emulación de Célula de Datos Local (`docker-compose.cell.yml`)
Permite validar el ciclo de vida completo de células de datos (DAT-001 Modelo A) en el entorno de desarrollo:

```bash
# 1. Levantar el nodo celular cell-01
pnpm cell:up

# 2. Puntos de acceso celular:
#    - Aplicación Celular (HTTP Probes): http://localhost:3004
#    - PgBouncer Celular (Pooling Transaccional): localhost:6432
#    - PostgreSQL Celular Directo: localhost:54322 (BD: pg-cell-01)
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
