# Estado Técnico Actual del Proyecto — Plataforma Mocter (`mocter-portal`)

**Fecha de actualización:** 17 de octubre de 2026  
**Repositorio:** `landig-agencia`  
**Rama activa:** `feature/mocter-nextjs-migration`  
**Organización / Marca:** Mocter  
**Remoto de origen:** `https://github.com/EnuarRosales/landig-agencia.git`  
**Versión del Sistema:** `1.1.0`

---

## 1. Resumen Ejecutivo de la Transformación

El proyecto ha completado una **transformación arquitectónica integral y funcional**, evolucionando desde una landing page monolítica en un único archivo HTML estático (`index.html`) hacia una **plataforma web empresarial contenerizada de nivel de producción basada en Next.js 16 (App Router), React 19, Turbopack, Tailwind CSS v4 y arquitectura modular de monorepo**.

Adicionalmente, el sistema incorpora:
1. **Capa agnóstica de dominio y persistencia (`@mocter/domain`)** conectada a **PostgreSQL 18 con extensión `pgvector`**, asegurando persistencia transaccional y validación estricta de prospectos (leads) mediante Server Actions.
2. **Atención en vivo y omnicanalidad:** Widget oficial de atención en línea **Chatwoot** (`chatwoot-widget.tsx`) con inyección DOM asíncrona no bloqueante, complementado con botón flotante interactivo de WhatsApp FAB reubicado a media altura lateral izquierda.
3. **Internacionalización y Navegación Avanzada:** Selector de idioma interactivo (`ES | EN`) con persistencia en cookie `NEXT_LOCALE`, cabecera con menú centrado en cápsula flotante translúcida tipo dock (`Floating Glass Island`) y botón de conmutación de tema con alta denotación visual y micro-rotación.
4. **Páginas Legales y Cumplimiento Normativo (Colombia & RGPD):** Secciones de Política de Privacidad (13 cláusulas bajo Ley 1581/2012 de Habeas Data), Términos y Condiciones (Ley 527/1999 y Ley 1480/2011) y Configuración de Privacidad y Cookies con panel interactivo de consentimiento (`CookiePreferences`) y persistencia local.
5. **SEO, AIO, GEO y LLMO:** Prerenderizado estático de 19 rutas con Schema.org (`BreadcrumbList`, `Organization`, `SoftwareApplication`), sitemap multilingüe con `hreflang` y manifiestos de IA (`llms.txt`, `llms-full.txt`).

---

## 2. Matriz Comparativa: Estado Inicial vs. Estado Actual

| Dimensión | Estado Inicial (16 Oct 2026) | Estado Actual (17 Oct 2026) |
| :--- | :--- | :--- |
| **Arquitectura** | Monolito de un solo archivo `index.html` (~591 líneas) | Monorepo modular (`pnpm workspaces` + `Turborepo v2`) |
| **Framework Frontend** | Vanilla HTML5 / JS sin framework | **Next.js 16.4.2** con Turbopack, React 19 y Server Components |
| **Estilos y Temas** | CSS embebido en `<style>` (solo tema oscuro) | **Tailwind CSS v4** con modo claro/oscuro dinámico, tokens contrastados y ThemeProvider protegido |
| **Cabecera y Navegación** | Menú estático rígido a la izquierda | **Cápsula Flotante Dock** centrada con pestañas interactivas y botón de tema con halo de luz |
| **Internacionalización** | Español estático en código duro | **`next-intl`** bilingüe estructurado (`/es`, `/en`) con selector `LocaleSwitcher` (cookie `NEXT_LOCALE`) |
| **Atención al Cliente** | Enlaces inertes a WhatsApp | **Chatwoot oficial** (soporte en línea asíncrono) + **WhatsApp FAB flotante** lateral izquierdo |
| **Marco Legal y Cumplimiento** | Inexistente (sin enlaces ni políticas) | **Páginas completas** de Privacidad (Ley 1581/2012), Términos y Configuración de Cookies interactiva |
| **Navegación Secundaria** | Inexistente | **Migas de pan (Breadcrumbs)** semánticas con marcado estructurado Schema.org `BreadcrumbList` |
| **Persistencia de Datos** | Inexistente (sin backend ni base de datos) | **PostgreSQL 18 (`pgvector`)** con Drizzle ORM y pool perezoso (*lazy*) |
| **Captura de Leads** | Formularios simulados / enlaces estáticos | **Server Action real** con validación Zod y guardado transaccional |
| **Testing y Calidad** | Inexistente (0 pruebas, sin linters) | **15 pruebas unitarias** pasando (Vitest), compilación limpia con 19 rutas prerenderizadas |
| **Contenedores y DevOps** | Inexistente (ejecución con Live Server) | Docker multi-stage, **Docker Compose v2** (`dev`, `test`, `prod`) y **Kubernetes (`k8s/`)** |
| **Identidad de Marca** | Placeholder "agencIA / IdenTechnology" | **Mocter** estandarizado con favicon claro en SVG, legalidad colombiana y canales oficiales |

---

## 3. Estructura Actual del Repositorio

```text
landig-agencia/
├── apps/
│   └── web/                         # Aplicación Web y PWA en Next.js 16
│       ├── app/
│       │   ├── [locale]/             # Enrutamiento localizado bilingüe (/es, /en)
│       │   │   ├── cookies/          # Página de Configuración de Privacidad y Cookies
│       │   │   │   └── page.tsx
│       │   │   ├── privacidad/       # Página de Política de Privacidad (Ley 1581/2012)
│       │   │   │   └── page.tsx
│       │   │   ├── terminos/         # Página de Términos y Condiciones
│       │   │   │   └── page.tsx
│       │   │   ├── layout.tsx        # Layout raíz (SEO, JSON-LD, ThemeProvider, Chatwoot)
│       │   │   └── page.tsx          # Landing page de alta fidelidad
│       │   ├── actions/              # Server Actions con mutaciones seguras
│       │   │   ├── demo-request.ts   # Acción de captura y persistencia de leads
│       │   │   └── types.ts          # Tipos y contratos del formulario
│       │   ├── globals.css           # Tokens de diseño Tailwind v4 (dark/light)
│       │   ├── icon.svg              # Favicon vectorial en tono claro
│       │   ├── proxy.ts              # Proxy de internacionalización Next.js
│       │   └── sitemap.ts            # Generador dinámico de Sitemap multilingüe
│       ├── components/               # Componentes modulares de interfaz
│       │   ├── sections/             # Secciones (Hero, Features, Sectores, Pipeline, FAQ, Footer, WhatsApp FAB)
│       │   ├── breadcrumbs.tsx       # Migas de pan semánticas con JSON-LD Schema.org
│       │   ├── chatwoot-widget.tsx   # Widget oficial de soporte en vivo Chatwoot
│       │   ├── cookie-preferences.tsx# Panel interactivo de gestión de cookies y consentimiento
│       │   ├── demo-form.tsx         # Formulario interactivo responsivo (ancho completo)
│       │   ├── locale-switcher.tsx   # Selector de idioma ES/EN con cookie persistente
│       │   ├── theme-provider.tsx    # Wrapper anti-FOUC con supresión de falsos positivos en React 19
│       │   ├── theme-toggle.tsx      # Conmutador accesible de Modo Claro / Oscuro con sol/luna estilizados
│       │   ├── nav.tsx               # Barra de navegación con cápsula flotante centrada
│       │   └── floating-background.tsx # Fondo reactivo con cursor glow y blobs
│       ├── messages/                 # Diccionarios de traducción estructurados (es.json, en.json)
│       ├── public/                   # PWA Manifest, llms.txt, llms-full.txt, robots.txt, iconos
│       ├── next.config.ts            # Configuración de compilador, orígenes dev e imágenes
│       └── package.json              # Dependencias específicas de la app web
├── packages/
│   └── domain/                       # Capa de dominio y persistencia agnóstica
│       ├── drizzle/                  # Migraciones SQL versionadas
│       ├── src/
│       │   ├── db.ts                 # Cliente PostgreSQL resiliente y diagnóstico
│       │   ├── schema.ts             # Definición tipada de la entidad PostgreSQL 'leads'
│       │   ├── validation.ts         # Contratos y esquemas de validación Zod
│       │   └── tests/                # Suites de pruebas unitarias (Vitest)
│       ├── drizzle.config.ts         # Configuración de Drizzle Kit
│       ├── README.md                 # Documentación técnica del paquete en español
│       └── package.json              # Dependencias del paquete de dominio
├── k8s/                              # Manifiestos enterprise para Kubernetes
│   ├── namespace.yaml                # Aislamiento de namespace 'mocter'
│   ├── secrets.example.yaml          # Plantilla para secretos de producción
│   ├── pg-portal.yaml                # StatefulSet y Service para PostgreSQL 18 (pgvector)
│   ├── deployment.yaml               # Deployment de Next.js (web-portal) con startupProbe
│   ├── service.yaml                  # Service ClusterIP interno
│   └── ingress.yaml                  # Enrutamiento Nginx Ingress con TLS
├── .github/workflows/                # Automatización CI/CD
├── docker-compose.dev.yml            # Entorno de desarrollo local con HMR
├── docker-compose.test.yml           # Entorno de pruebas y control de calidad
├── docker-compose.prod.yml           # Entorno de producción standalone
├── Dockerfile                        # Multi-stage build optimizado (Node 24 Alpine)
├── .env.example                      # Plantilla de variables de entorno documentada en español
├── turbo.json                        # Pipeline de compilación y orquestación Turborepo
├── package.json                      # Configuración raíz de pnpm workspaces
├── README.md                         # Documentación general del sistema de información
└── ESTADO_TECNICO.md                 # Informe histórico del estado técnico inicial
```

---

## 4. Arquitectura de Software y Capas

El sistema implementa una arquitectura limpia (*Clean Architecture*) orientada a dominios:

```mermaid
flowchart TD
    subgraph Presentation["Capa de Presentación (apps/web)"]
        UI["Landing Modular (Next.js 16 + Tailwind v4)"]
        Nav["Dock Flotante & Theme/Locale Switchers"]
        Legal["Páginas Legales (/privacidad, /terminos, /cookies)"]
        Breadcrumbs["Migas de Pan (Schema.org BreadcrumbList)"]
        Chat["Chatwoot Widget & WhatsApp FAB"]
        Theme["Theme Tokens & ThemeProvider Wrapper"]
        i18n["next-intl (Rutas /es, /en + Cookie NEXT_LOCALE)"]
    end

    subgraph AppLogic["Capa de Aplicación"]
        Action["Server Action: submitDemoRequest"]
        CookiesAction["Cookie Preferences State Handler"]
    end

    subgraph Domain["Capa de Dominio (@mocter/domain)"]
        ZodSchema["Contratos de Validación (validation.ts)"]
        DBService["Servicio de Persistencia (db.ts)"]
        DrizzleSchema["Esquema Relacional Drizzle (schema.ts)"]
    end

    subgraph Infrastructure["Capa de Infraestructura"]
        PG[(PostgreSQL 18 + pgvector: pg-portal)]
        Docker["Docker Compose v2 (mocter-admin)"]
        K8s["Kubernetes Cluster: mocter namespace"]
        ChatwootSvc["Chatwoot Live Support Service"]
    end

    UI --> Nav
    UI --> Action
    Legal --> Breadcrumbs
    Legal --> CookiesAction
    Action --> ZodSchema
    ZodSchema --> DBService
    DBService --> DrizzleSchema
    DrizzleSchema --> PG
    Chat --> ChatwootSvc
    Presentation -.-> Docker
    Infrastructure -.-> K8s
```

---

## 5. Pila Tecnológica Implementada

### 5.1 Frontend (`apps/web`)
- **Next.js 16.4.2:** Motor de renderizado híbrido con App Router, Turbopack y React 19.
- **Tailwind CSS v4:** Motor CSS basado en variables dinámicas para alternancia instantánea entre tema claro y oscuro sin recarga.
- **`next-intl`:** Internacionalización nativa con diccionarios estructurados y soporte de cambio dinámico mediante `LocaleSwitcher`.
- **Chatwoot SDK:** Integración asíncrona no bloqueante de atención en línea (`chatwoot-widget.tsx`).
- **PWA & Accesibilidad:** Manifiesto web nativo (`manifest.webmanifest`), `sw.js`, contraste auditado (`text-a1 dark:text-[#dff0ff]`) y componentes accesibles (Radix UI primitives).
- **Control de Scroll:** Atributo `data-scroll-behavior="smooth"` en `<html>` para compatibilidad completa con transiciones de ruta en Next.js 16.

### 5.2 Capa de Dominio y Persistencia (`@mocter/domain`)
- **PostgreSQL 18 (`pgvector/pgvector:pg18`):** Motor relacional preparado para almacenamiento transaccional y futuras capacidades de búsqueda vectorial e indexación semántica con IA.
- **Drizzle ORM v0.45:** ORM tipado de cero sobrecarga computacional con migraciones idempotentes versionadas en SQL.
- **Zod v4:** Validación estricta de contratos en tiempo de ejecución en el servidor.
- **Resiliencia de Conexión:** Pool de conexiones perezoso (*lazy pooling*), fail-fast ante variables ausentes y healthcheck proactivo `checkDatabaseConnection()`.

### 5.3 Infraestructura, Monorepo y DevOps
- **pnpm Workspaces & Turborepo v2.11:** Grafo de dependencias optimizado con caché remota, tareas paralelizadas y filtrado por workspaces.
- **Docker Compose v2:** Stacks dedicados bajo el proyecto `mocter-admin`:
  - `docker-compose.dev.yml`: Desarrollo local con HMR y volúmenes aislados.
  - `docker-compose.test.yml`: Ejecución de pruebas automatizadas sobre imagen develop.
  - `docker-compose.prod.yml`: Ejecución productiva de imagen standalone optimizada.
- **Kubernetes Enterprise (`k8s/`):** Manifiestos listos para producción con `Deployment`, `Service`, `StatefulSet` de base de datos, `Ingress` Nginx con TLS y sondas de salud (`startupProbe`, `readinessProbe`, `livenessProbe`).

---

## 6. Estado de Madurez de Funcionalidades

| Funcionalidad | Estado Anterior | Estado Actual | Detalle Técnico |
| :--- | :---: | :---: | :--- |
| **Landing Page** | Estática monolítica | **Modular en Next.js 16** | Dividida en componentes atómicos con SSR y SSG optimizados. |
| **Cabecera y Menú** | Enlaces planos dispersos | **Cápsula Flotante Dock** | Menú centrado con fondo translúcido, padding suave y microinteracciones. |
| **Temas (Dark / Light)** | Solo oscuro (hardcoded) | **Totalmente Dinámico con Realce** | Botón de tema con sol ámbar resplandeciente / luna azul, tokens adaptados y contraste corregido en iconos. |
| **Soporte en Vivo** | Enlaces inertes | **Chatwoot Integrado** | Widget oficial con carga asíncrona en DOM y fallback resiliente. |
| **WhatsApp Flotante** | Inferior derecho | **Lateral Izquierdo a Media Altura** | Posición `fixed left-4 top-1/2 -translate-y-1/2` con microanimación de pulso. |
| **Selector de Idioma** | Inexistente en UI | **Interactivo (ES \| EN)** | Conmutador tipo chip en cabecera con persistencia en cookie `NEXT_LOCALE`. |
| **Páginas Legales** | Inexistentes | **100% Desarrolladas** | Páginas dedicadas de Privacidad (Habeas Data Colombia), Términos y Cookies. |
| **Gestión de Cookies** | Inexistente | **Panel Interactivo** | `CookiePreferences` con interruptores por categoría y guardado en `localStorage`. |
| **Migas de Pan** | Inexistentes | **Semánticas con Schema.org** | Componente `Breadcrumbs` con marcado estructurado `BreadcrumbList` en JSON-LD. |
| **Acordeón FAQ** | Estático / No expandible | **Interactivo y Accesible** | Animación suave basada en CSS Grid (`grid-rows-[1fr]/[0fr]`) y rotación de icono. |
| **Captura de Leads** | Mockup sin backend | **100% Funcional** | Validación Zod en Server Action con persistencia en tabla `leads` de PostgreSQL. |
| **Diseño del Formulario** | 3 columnas con hueco | **Responsivo 100% Ancho** | Cuadrícula modular `grid-cols-1 md:grid-cols-3` + bloque textarea a ancho completo. |
| **Pipeline Interactivo** | Contadores hardcodeados | **Animado y Reactivo** | Simulación de pipeline con rotación automática cada 3.2s y contadores dinámicos. |
| **SEO y Metadatos IA** | Meta tags básicos | **Enterprise SEO + llms.txt** | OpenGraph, Twitter Cards, Schema.org JSON-LD, sitemap dinámico con `hreflang`, `llms.txt` y `llms-full.txt`. |
| **Soporte PWA** | Inexistente | **Instalable (PWA Ready)** | Manifest completo, service worker configurado, favicon claro en SVG y recursos precacheados. |
| **Base de Datos** | Inexistente | **PostgreSQL 18 + Vector** | Tabla relacional `leads` con UUIDs, timestamps timezone y soporte pgvector. |

---

## 7. Verificación de Calidad y Pruebas

El monorepo cuenta con compuertas de calidad automatizadas:

```bash
# Ejecución de pruebas unitarias
pnpm test
# Resultado: 15/15 pruebas unitarias pasando en @mocter/domain (Vitest)

# Verificación de tipado estático
pnpm --filter @mocter/domain build
# Resultado: tsc --noEmit finalizado con 0 errores de tipado

# Compilación de producción
pnpm build
# Resultado: Compilación standalone exitosa en Next.js 16 con Turbopack
# 19 páginas estáticas generadas exitosamente:
# - /[locale] (/es, /en)
# - /[locale]/privacidad (/es/privacidad, /en/privacidad)
# - /[locale]/terminos (/es/terminos, /en/terminos)
# - /[locale]/cookies (/es/cookies, /en/cookies)
# - /sitemap.xml, /robots.txt, /icon.svg, /manifest.webmanifest
```

---

## 8. Conclusión

El proyecto ha superado con éxito la fase de prototipo estático y se encuentra en un **estado de madurez empresarial productivo (Production-Ready)**. 

La solución posee una separación estricta de responsabilidades, contratos de datos verificados, persistencia resiliente en PostgreSQL 18 con soporte para inteligencia artificial (`pgvector`), suites de calidad ejecutables, atención omnicanal en tiempo real (Chatwoot y WhatsApp), cumplimiento legal normativo riguroso (Habeas Data Ley 1581/2012) y procedimientos de despliegue automatizados para cualquier entorno contenerizado moderno.

---

*Documento técnico de estado actual consolidado el 17 de octubre de 2026 bajo la auditoría de arquitectura de software para Mocter.*
