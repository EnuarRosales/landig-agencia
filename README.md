# Mocter — Plataforma Empresarial de Automatización con IA

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black?logo=next.js)](https://nextjs.org/)
[![Turbopack](https://img.shields.io/badge/Turbopack-Ready-blueviolet)](https://turbo.build/pack)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-v0.45-C5F74F?logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.x-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Multi--stage-2496ED?logo=docker)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5?logo=kubernetes)](https://kubernetes.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Licencia](https://img.shields.io/badge/Licencia-Propiedad_de_Mocter-emerald)](#12-propiedad-intelectual-marca-y-copyright)

Sistema de información web de alta disponibilidad y arquitectura empresarial para **Mocter**, diseñado para centralizar la prospección, automatizar la atención al cliente 24/7 y orquestar el agendamiento inteligente de citas y ventas asistidas por Inteligencia Artificial.

---

## 1. Ficha Técnica y Resumen Ejecutivo

| Atributo | Detalle del Sistema |
| :--- | :--- |
| **Nombre Comercial:** | Plataforma Web Mocter (Portal Público & Captura de Leads) |
| **Identificador del Proyecto:** | `mocter-portal` / Monorepo `landig-agencia` |
| **Versión Actual:** | `1.0.0` (SemVer) |
| **Tipo de Sistema:** | Web Application & Progressive Web App (PWA) de Alto Desempeño |
| **Propiedad Intelectual:** | © 2026 Mocter. Todos los derechos reservados. |
| **Contacto Oficial:** | [info@mocter.co](mailto:info@mocter.co) · WhatsApp: +57 322 275 2524 |
| **Soberanía de Datos:** | Datos alojados y procesados conforme a la normativa colombiana e internacional. |

### 1.1 Objetivos de Negocio
- **Conversión Acelerada:** Captación inmediata de prospectos calificados a través de un canal unificado y responsivo.
- **Demostración Interactiva en Vivo:** Simulación visual del pipeline de IA (recepción, análisis semántico, consulta de agenda y confirmación automática).
- **Omnicanalidad y Alta Fidelidad:** Experiencia fluida con conmutación dinámica de tema (Modo Claro / Modo Oscuro), animaciones de bajo costo computacional y soporte multilingüe nativo (`es` / `en`).

---

## 2. Equipo de Desarrollo y Gobernanza

El proyecto está estructurado bajo las mejores prácticas de la ingeniería de software moderna, con roles y responsabilidades claramente delimitados:

| Rol | Responsabilidad Principal |
| :--- | :--- |
| **Tech Lead & Senior Architect** | Diseño de la arquitectura de software (Clean Architecture), gobernanza técnica, seguridad y patrones de concurrencia. |
| **Frontend Engineer (Next.js / React)** | Desarrollo de la interfaz, componentes de alta fidelidad, accesibilidad (a11y), PWA y animaciones CSS nativas. |
| **Backend & Data Engineer** | Modelado de datos en PostgreSQL 18, contratos de persistencia con Drizzle ORM y validaciones con Zod. |
| **DevOps & Cloud Architect** | Pipeline CI/CD en GitHub Actions, orquestación Docker multi-stage y despliegue enterprise en Kubernetes. |
| **QA Automation Engineer** | Mantenimiento de suite de pruebas unitarias, integración (Vitest) y pruebas end-to-end (Playwright). |
| **Product Designer (UI/UX)** | Sistema de diseño (Design Tokens), coherencia visual corporativa y experiencia de usuario optimizada para conversión. |

---

## 3. Arquitectura del Sistema

La solución implementa una **Arquitectura Limpia y Modular (Clean Architecture / Screaming Architecture)** dividida en un monorepo administrado por **Turborepo** y **pnpm workspaces**:

```mermaid
flowchart TD
    subgraph Client["Cliente / Navegador (PWA & Web)"]
        UI["Interfaz Web (Next.js 16 + Tailwind CSS v4)"]
        Theme["Gestor de Temas (Dark / Light Tokens)"]
        i18n["Internacionalización (next-intl /es, /en)"]
    end

    subgraph AppLayer["Capa de Aplicación (apps/web)"]
        ServerAction["Server Actions (demo-request.ts)"]
        ValidationZod["Validación de Entrada (Zod v4)"]
    end

    subgraph DomainLayer["Capa de Dominio (packages/domain)"]
        DBModule["Módulo de Conexión y Consultas (db.ts)"]
        Schema["Esquema Tipado (Drizzle ORM)"]
    end

    subgraph DataLayer["Capa de Datos y Persistencia"]
        Postgres[(PostgreSQL 18+ / Tabla: leads)]
    end

    UI --> ServerAction
    ServerAction --> ValidationZod
    ValidationZod --> DBModule
    DBModule --> Schema
    Schema --> Postgres
```

### 3.1 Estructura del Monorepo

```text
landig-agencia/
├── apps/
│   └── web/                         # Aplicación pública Next.js 16 (App Router)
│       ├── app/
│       │   ├── [locale]/             # Rutas dinámicas localizadas (/es, /en)
│       │   │   ├── layout.tsx        # Layout raíz (SEO, JSON-LD estructurado, ThemeProvider)
│       │   │   └── page.tsx          # Landing page modular de alta fidelidad
│       │   ├── actions/              # Server Actions con validación y mutaciones seguras
│       │   │   ├── demo-request.ts   # Acción de captura y persistencia de leads
│       │   │   └── types.ts          # Contratos de estado del formulario
│       │   └── globals.css           # Tokens de diseño Tailwind v4 (soporte dark/light nativo)
│       ├── components/               # Componentes atómicos y seccionales
│       │   ├── sections/             # Secciones (Hero, Features, Sectores, Pipeline Demo, FAQ, Footer)
│       │   ├── demo-form.tsx         # Formulario reactivo y accesible para solicitud de demo
│       │   ├── theme-toggle.tsx      # Conmutador accesible de Modo Claro / Modo Oscuro
│       │   └── nav.tsx               # Barra de navegación flotante adaptable
│       ├── messages/                 # Diccionarios de internacionalización (es.json, en.json)
│       ├── public/                   # PWA Manifest, iconos adaptativos, llms.txt, robots.txt
│       └── next.config.ts            # Configuración de compilador, orígenes dev e imágenes
├── packages/
│   └── domain/                       # Capa de dominio agnóstica de frameworks
│       ├── drizzle/                  # Migraciones SQL versionadas
│       └── src/
│           ├── db.ts                 # Pool de conexiones perezoso y chequeo de salud proactivo
│           ├── schema.ts             # Definición tipada de la entidad PostgreSQL 'leads'
│           └── validation.ts         # Contratos de validación de negocio Zod
├── k8s/                              # Manifiestos de Kubernetes para producción enterprise
│   ├── deployment.yaml               # Deployment con réplicas, límites y health probes
│   ├── ingress.yaml                  # Reglas de enrutamiento perimetral con TLS
│   ├── namespace.yaml                # Aislamiento lógico del entorno
│   ├── secrets.example.yaml          # Plantilla para secretos inyectados en runtime
│   └── service.yaml                  # Exposición interna ClusterIP
├── .github/workflows/                # Automatización CI/CD (lint, test, build, container push)
├── docker-compose.dev.yml            # Orquestación de desarrollo con Hot Reload (HMR)
├── docker-compose.test.yml           # Orquestación de pruebas aisladas y validación de calidad
├── docker-compose.prod.yml           # Orquestación de producción contenerizada standalone
├── Dockerfile                        # Multi-stage build optimizado (Node 24 Alpine, output standalone)
└── turbo.json                        # Definición de pipelines y variables globales de Turborepo
```

---

## 4. Pila Tecnológica Detallada

### 4.1 Frontend & Aplicación Web (`apps/web`)
- **Framework Principal:** [Next.js 16](https://nextjs.org/) con React 19 y compilador Turbopack.
- **Sistema de Estilos:** [Tailwind CSS v4](https://tailwindcss.com/) configurado con variables CSS dinámicas para cambio de tema instantáneo.
- **Tipografía:** Sora (Display) & Inter (Sans) optimizadas con precarga nativa `next/font`.
- **Internacionalización:** [next-intl](https://next-intl-docs.vercel.app/) con detección y resolución limpia de rutas (`/es` y `/en`).
- **Soporte PWA:** Manifiesto web progresivo (`manifest.webmanifest`), `sw.js` y metadatos para instalación en dispositivos móviles y de escritorio.
- **SEO & Descubrimiento:** Metadatos OpenGraph, Twitter Cards, Canonical URLs, Schema.org JSON-LD estructurado y archivos `llms.txt` / `llms-full.txt` para motores de búsqueda de IA.

### 4.2 Capa de Datos & Persistencia (`packages/domain`)
- **Motor de Base de Datos:** [PostgreSQL 18+](https://www.postgresql.org/) con soporte de UUIDs e índices de tiempo.
- **ORM & Migraciones:** [Drizzle ORM](https://orm.drizzle.team/) sobre cliente ultraligero `postgres-js`.
- **Validación de Datos:** [Zod v4](https://zod.dev/) para validación estricta en servidor antes de tocar la base de datos.
- **Resiliencia de Conexión:** Pool de conexiones inicializado bajo demanda (`lazy pool`), fail-fast ante ausencia de credenciales y función de diagnóstico `checkDatabaseConnection()`.

### 4.3 Herramientas, Infraestructura & DevOps
- **Monorepo Manager:** [Turborepo v2](https://turbo.build/repo) + [pnpm v10+](https://pnpm.io/).
- **Contenedores:** [Docker](https://www.docker.com/) con imágenes multi-stage basadas en `node:24-alpine`.
- **Orquestación en la Nube:** [Kubernetes](https://kubernetes.io/) con manifiestos nativos listos para producción.

---

## 5. Requisitos Previos del Sistema

### 5.1 Requisitos de Hardware (Recomendados)
- **CPU:** 4 núcleos o superior (x86_64 o ARM64).
- **Memoria RAM:** Mínimo 4 GB (8 GB recomendados para ejecución simultánea de contenedores y compilación).
- **Almacenamiento:** Mínimo 10 GB de espacio libre en disco.

### 5.2 Requisitos de Software
- **Node.js:** Versión `24.x` o superior.
- **Gestor de Paquetes:** `pnpm 10.x` o superior (`corepack enable`).
- **Docker & Docker Compose:** Docker Engine `24.x+` con Docker Compose v2.
- **Git:** Versión `2.40+`.

---

## 6. Variables de Entorno y Configuración

El sistema opera mediante variables de entorno inyectadas. Para desarrollo local se utiliza un archivo `.env` en la raíz o en `apps/web/.env`.

| Variable | Tipo | Descripción | Valor por Defecto (Dev) | Obligatoria en Prod |
| :--- | :---: | :--- | :--- | :---: |
| `DATABASE_URL` | String | Cadena de conexión JDBC/URI hacia PostgreSQL | `postgres://mocter:mocter@postgres:5432/mocter` | **Sí** |
| `NODE_ENV` | Enum | Entorno de ejecución (`development`, `test`, `production`) | `development` | **Sí** |
| `PORT` | Integer | Puerto TCP de escucha del servidor HTTP | `3000` | No (def: 3000) |
| `POSTGRES_USER` | String | Usuario de administración de PostgreSQL | `mocter` | **Sí** |
| `POSTGRES_PASSWORD` | String | Clave de acceso a la base de datos | `mocter` | **Sí** |
| `POSTGRES_DB` | String | Nombre de la base de datos relacional | `mocter` | **Sí** |
| `TAG` | String | Etiqueta / versión de la imagen Docker | `latest` | No |

---

## 7. Compilación y Desarrollo Local

### 7.1 Preparación Inicial
```bash
# 1. Habilitar Corepack para asegurar la versión estricta de pnpm
corepack enable

# 2. Instalar dependencias exactas del monorepo
pnpm install --frozen-lockfile
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
# Ejecutar todas las pruebas unitarias y de integración
pnpm test

# Ejecución en modo observador interactivo (watch)
pnpm test:watch

# Verificación estricta de linting y reglas de formato
pnpm lint
```

### 7.4 Migraciones de Base de Datos
```bash
# Generar nuevas migraciones SQL a partir del esquema Drizzle
pnpm db:generate

# Aplicar las migraciones directamente en la base de datos destino
pnpm db:migrate
```

---

## 8. Guía de Despliegue en sus Diferentes Ambientes

El sistema cuenta con cuatro configuraciones de despliegue diseñadas para garantizar aislamiento, reproducibilidad y cero paradas no planificadas.

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  1. Desarrollo  │  ───> │  2. Pruebas/CI  │  ───> │  3. Producción  │  ───> │  4. Enterprise  │
│  (Compose Dev)  │       │  (Compose Test) │       │ (Compose Prod)  │       │  (Kubernetes)   │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Ambiente 1: Desarrollo Local (`docker-compose.dev.yml`)
Diseñado para la máxima velocidad de iteración con **Hot Module Reloading (HMR)** mediante Turbopack. Aísla `node_modules` en un volumen Docker para evitar colisiones entre el sistema operativo anfitrión y el contenedor Linux.

```bash
# 1. Levantar la pila de desarrollo (Next.js + PostgreSQL 18)
docker compose -f docker-compose.dev.yml up --build

# 2. Puntos de acceso:
#    - Aplicación Web: http://localhost:3000
#    - Base de Datos: localhost:5432 (Usuario: mocter | BD: mocter)

# 3. Detener los servicios:
docker compose -f docker-compose.dev.yml down
```

### Ambiente 2: Pruebas y Validación CI (`docker-compose.test.yml`)
Construye la etapa de build en Docker, levanta una base de datos efímera de PostgreSQL 18 con las migraciones iniciales aplicadas y ejecuta la compuerta de calidad completa (`lint`, `test`, `build`).

```bash
# Ejecutar la compuerta de calidad y capturar el código de salida
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from web

# Limpiar los volúmenes y contenedores temporales de prueba
docker compose -f docker-compose.test.yml down -v
```

### Ambiente 3: Producción Contenerizada (`docker-compose.prod.yml`)
Ejecuta la imagen de producción optimizada (`standalone runner`), minimizando la superficie de ataque y el peso de la imagen mediante multi-stage build.

```bash
# 1. Definir variables productivas seguras
export TAG="v1.0.0"
export DATABASE_URL="postgres://mocter:CONTRASENA_SEGURA@postgres:5432/mocter"
export POSTGRES_PASSWORD="CONTRASENA_SEGURA"

# 2. Iniciar el servicio en segundo plano (daemon)
docker compose -f docker-compose.prod.yml up -d

# 3. Verificar estado de salud y logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web
```

### Ambiente 4: Producción Enterprise en Kubernetes (`k8s/`)
Provee alta disponibilidad, auto-escalabilidad horizontal y gestión declarativa de configuración y certificados TLS.

```bash
# 1. Crear el espacio de nombres (namespace)
kubectl apply -f k8s/namespace.yaml

# 2. Configurar los secretos de producción a partir de la plantilla
# (Copiar secrets.example.yaml, ajustar valores base64 y aplicar)
kubectl apply -f k8s/secrets.yaml

# 3. Desplegar los componentes de la aplicación
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# 4. Comprobar el estado y salud de los pods
kubectl get pods -n mocter-prod -l app=mocter-web
kubectl describe ingress mocter-web-ingress -n mocter-prod
```

---

## 9. Seguridad, Respaldo y Protección de Datos

### 9.1 Políticas de Seguridad
- **Sanitización Estricta:** Todo dato recibido en el formulario pasa por validación Zod en el servidor. Nunca se confía en la validación del cliente.
- **Inyecciones SQL Mitigadas:** Consultas totalmente parametrizadas mediante Drizzle ORM sobre PostgreSQL.
- **Encabezados HTTP Seguros:** Next.js configurado con directivas de seguridad para prevenir XSS, Clickjacking y Sniffing de tipos MIME.
- **Sin Ejecución como Root:** Las imágenes productivas de Docker ejecutan bajo un usuario no privilegiado (`nextjs:nodejs`, UID 1001).

### 9.2 Respaldos de Base de Datos (Backup & Restore)
```bash
# Generar un respaldo completo de la base de datos
docker exec -t mocter-portal-dev-postgres-1 pg_dump -U mocter -F c mocter > backup_mocter_$(date +%Y%m%d_%H%M%S).dump

# Restaurar un respaldo en una instancia limpia
docker exec -i mocter-portal-dev-postgres-1 pg_restore -U mocter -d mocter -c < backup_mocter_20261016.dump
```

---

## 10. Monitoreo, Logs y Diagnóstico de Fallos

- **Verificación de Base de Datos:** La función `checkDatabaseConnection()` en `packages/domain/src/db.ts` ejecuta `SELECT 1` y reporta con claridad si existe fallo de autenticación o inalcanzabilidad del socket.
- **Inspección de Logs en Tiempo Real:**
  ```bash
  # Ver logs del contenedor web en desarrollo
  docker compose -f docker-compose.dev.yml logs -f web

  # Ver logs del contenedor de base de datos
  docker compose -f docker-compose.dev.yml logs -f postgres
  ```
- **Prueba de Endpoint PWA / Healthcheck:**
  ```bash
  curl -I http://localhost:3000/manifest.webmanifest
  ```

---

## 11. Convenciones de Desarrollo y Flujo Git

- **Políticas de Ramas:**
  - `main`: Código estable, validado y desplegable en producción.
  - `develop`: Rama de integración para pruebas de regresión.
  - `feature/*`: Funcionalidades nuevas y aisladas.
  - `fix/*`: Correcciones de bugs con pruebas asociadas.
- **Estándar de Commits:** [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Sin menciones automatizadas de autoría externa.

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
