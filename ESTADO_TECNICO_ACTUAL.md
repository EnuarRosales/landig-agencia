# Estado Técnico Actual del Proyecto — Plataforma SaaS Mocter

**Fecha de corte:** 2 de noviembre de 2026  
**Repositorio:** `EnuarRosales/landig-agencia`  
**Rama activa:** `feature/doc-sdd-core-admin`  
**Organización / Marca:** Mocter  
**Remoto de origen:** `https://github.com/EnuarRosales/landig-agencia.git`  
**Versión del Sistema:** `1.5.0` (SemVer)  
**Metodología:** Spec-Driven Development (SDD) bajo directivas permanentes de `.agents/AGENTS.md`

---

## 1. Resumen Ejecutivo de la Transformación Arquitectónica

El proyecto ha completado una **transformación arquitectónica profunda y de vanguardia**, consolidando su evolución desde un portal web estático hacia una **Plataforma SaaS Multi-Inquilino Distribuida de Alta Disponibilidad**, gobernada por una **Arquitectura de Celdas Autónomas de Datos (DAT-001)** y una **Consola Administrativa Unificada (Single Pane of Glass - ADM-001)**.

### 1.1 La Topología de Tres Planos
El sistema desacopla sus cargas de trabajo en tres planos de ejecución con límites de falla estrictos (*zero blast radius*):

1. **Plano de Soporte Aislado (Singleton Global):**
   - **Chatwoot (`v4.19.1` canónico):** Motor omnicanal para mensajería y atención humana, respaldado por su propia base de datos dedicada (`pg-chatwoot`). Los inquilinos comparten la instancia pero quedan aislados lógicamente a través de su `account_id` numérico, integrados en la consola administrativa vía **iframe same-site** con autenticación automática por SSO JWT (HMAC-SHA256 con `CHATWOOT_SSO_SECRET`).
   - **n8n Automation Engine:** Motor de flujos de trabajo e integraciones externas con base de datos dedicada (`pg-n8n`), garantizando que la orquestación masiva no compita por recursos con la lógica transaccional.

2. **Plano de Control Global (Control Plane):**
   - **Consola Administrativa Unificada (`apps/admin` - `@mocter/admin`):** Núcleo administrativo centralizado en Next.js 16 (App Router) para el Platform Owner (gobernanza celular, gestión de inquilinos, catálogo de planes, auditoría y facturación) y para los operadores del inquilino (pedidos, productos, CRM y configuración).
   - **Portal Público Web (`apps/web` - `@mocter/web`):** Landing page modular de alto rendimiento con internacionalización (`/es`, `/en`), SEO estructurado, captura y calificación de prospectos.
   - **Base de Datos del Plano de Control (`pg-control-plane`):** PostgreSQL 18 con `pgvector`, alojando tablas globales: `admin.users`, `admin.clients`, `admin.memberships`, `admin.plans`, `admin.cells`, `admin.cell_secrets`, `admin.audit_events`, `public.leads`, `billing_*`, etc.
   - **Servicios de Respaldo y Mensajería:** Redis 7+ (gestión de sesiones revocables, rate limiting distribuido con sal secreta) y RabbitMQ 3.13 (relay asíncrono para notificaciones con Outbox transaccional).
   - **Multimedia y Almacenamiento:** SeaweedFS S3 interno y entrega optimizada con firmas criptográficas mediante `imgproxy`.

3. **Plano de Datos Distribuido (Celdas Autónomas de Datos · DAT-001 Modelo A):**
   - Cada célula es una unidad física y lógica independiente dimensionada para **50 a 100 inquilinos**.
   - Cada célula encapsula:
     - **`pg-cell`:** Nodo PostgreSQL 18 con extensión `pgvector` y esquema transaccional celular `mocter_cell` (tablas: `tenants`, `tenant_users`, `leads`, `orders`, `catalog`, etc.).
     - **`pgbouncer-cell`:** Pooler transaccional de alto rendimiento en puerto `6432` con aislamiento estricto de conexiones.
     - **`tenant-app`:** Capa celular HTTP que corre la imagen unificada `ghcr.io/enuarrosales/mocter-web` en modo standalone. Provee cómputo local al lado de los datos (latencia mínima para inferencia local, búsqueda vectorial y webhooks directos), además de endpoints de diagnóstico y salud.

---

## 2. Matriz Comparativa de Madurez Integral

| Dimensión | Estado Inicial (Octubre 2026 · v1.2.0) | Estado Actual (Noviembre 2026 · v1.5.0) | Beneficio Técnico & Arquitectónico |
| :--- | :--- | :--- | :--- |
| **Arquitectura Global** | Monolito de portal web con base de datos única | **Plataforma Celular Distribuida en 3 Planos** (Soporte, Control Plane y Celdas de Datos) | Cero radio de explosión (*zero blast radius*); escalamiento horizontal infinito por nodos. |
| **Consola Administrativa** | Inexistente (solo landing pública en `apps/web`) | **Consola Unificada `apps/admin` (ADM-001)** con 12 módulos funcionales | Single Pane of Glass para gobernanza de plataforma y gestión operativa del inquilino. |
| **Particionamiento de Datos** | Base de datos única compartida sin particionar | **Celdas Autónomas (DAT-001)** con esquemas celulares y PgBouncer transaccional | Soberanía de datos por celda, contención de fallas y alta concurrencia transaccional. |
| **Gestión de Secretos Celulares** | Inexistente | **Cifrado AES-256-GCM con AAD** (`cell-secrets.service.ts`) y rotación de claves | Confidencialidad total; credenciales de base de datos nunca viajan ni residen en texto plano. |
| **Ciclo de Vida de Células** | Inexistente | **Máquina de Estados Modelo A:** `draft` → `provisioning` → `ready` / `error_conection` | Aprovisionamiento declarativo asistido con registro previo de UUID y AAD consistente. |
| **Verificación de Células** | Inexistente | **Verificación de Conexión Dual 360°:** Probes TCP a PostgreSQL/PgBouncer + HTTP a `tenant-app` | Detección preventiva de inalcanzabilidad antes de enrutar tráfico de inquilinos. |
| **Manifiestos de Despliegue** | Inexistente | **Generador Declarativo Canónico:** Genera `manifest.json` y `docker-compose.cell.yml` | Despliegue reproducible e infraestructura como código (IaC) de nodos celulares. |
| **Emulación Celular Local** | Inexistente | **Entorno Celular Emulado:** `data-cell-dev/` y `docker-compose.cell.yml` (`pnpm cell:up`) | Validación 100% fiel del plano de datos en el entorno del desarrollador. |
| **Autenticación & RBAC** | Sin autenticación administrativa | **Sistema Híbrido (AUTH-001):** 5 roles canónicos, Argon2id, scopes granulares | Control granular por rol (`platform_owner`, `platform_support`, `tenant_owner`, etc.). |
| **Segundo Factor (2FA TOTP)** | Inexistente | **TOTP RFC 6238** con claves maestras cifradas en BD y tolerancia de paso | Protección de cuentas de alto privilegio con respaldo criptográfico. |
| **Perfil & Cierre de Sesión** | Inexistente | **Ficha de Perfil Modal** + **Logout Seguro** con revocación en BD y limpieza de cookies | Cumplimiento de seguridad de sesiones; cierre formal en backend y frontend. |
| **Formularios de Célula** | Formularios desalineados con alineación errónea | **Formularios Unificados 1:1:** 6 filas idénticas en creación y edición, Title Case estricto | Experiencia visual coherente y cumplimiento de la Regla 4.8 sin saltos de contexto. |
| **Atención Omnicanal** | Widget embebido básico | **Chatwoot v4.19.1 Embebido en Iframe Same-Site** con SSO JWT HS256 automático | Operación omnicanal unificada sin abrir pestañas externas ni redirecciones. |
| **Inteligencia Artificial** | Mockup visual sin backend | **Asistente AI (AI-001) y Motor BOT-001 / BOT-002** con prompts maestros versionados | Redacción asistida con revisión humana obligatoria («Mejorar con AI») y captura de pedidos. |
| **Facturación & Cobros** | Inexistente | **Módulo BILL-001:** Wompi, Stripe y cobertura 100% con créditos de referidos (REF-001) | Monetización automatizada con emisión de recibos y conciliación idempotente de webhooks. |
| **Notificaciones Asíncronas** | Inexistente | **Outbox Pattern Transaccional (NTF-001)** sobre RabbitMQ con reintentos y DLQ | Garantía de entrega libre de bloqueos en transacciones de negocio. |
| **Sistema de Diseño (DSN)** | Tailwind básico sin directivas | **Sistema de Diseño DSN-001:** Title Case obligatorio, modales accesibles (cero nativos) | Accesibilidad WCAG 2.2 AA y cumplimiento estricto de las directivas 4.8 y 4.17. |
| **Logs y Trazabilidad** | `console.log` sin correlación | **Logging Estructurado Pino:** JSON tipado correlacionado con `x-request-id` | Diagnóstico de incidentes en tiempo real y cumplimiento de las directivas 4.13 y 4.14. |
| **Cobertura de Pruebas** | 39 pruebas unitarias | **1,048 pruebas automatizadas pasando (135 suites, 100% éxito)** en Vitest | Cobertura integral y verificación continua de contratos, seguridad y UI. |

---

## 3. Topología de Redes y Arquitectura de Infraestructura

```text
                                 [ INTERNET / USUARIOS ]
                                            │
                                            ▼
                           ┌─────────────────────────────────┐
                           │   Traefik v2.11 (Reverse Proxy)  │
                           │   TLS Let's Encrypt · Puerto 443 │
                           └────────────────┬────────────────┘
                                            │
             ┌──────────────────────────────┴──────────────────────────────┐
             │                                                             │
             ▼                                                             ▼
┌──────────────────────────┐                                  ┌──────────────────────────┐
│  mocter.co / apps/web    │                                  │ admin.mocter.co / admin  │
│  (Landing Pública)       │                                  │ (Consola Unificada)      │
└────────────┬─────────────┘                                  └────────────┬─────────────┘
             │                                                             │
             └──────────────────────────────┬──────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PLANO DE CONTROL GLOBAL (Control Plane)                         │
│                                                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │   PostgreSQL 18      │  │     Redis 7+         │  │       RabbitMQ 3.13          │  │
│  │   pg-control-plane   │  │ (Sesiones, Tokens,   │  │   (Relay de Notificaciones   │  │
│  │ (Esquema admin/pub)  │  │  Rate Limiting)      │  │    con Outbox Pattern)       │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────────────┘  │
│                                                                                        │
│  ┌────────────────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │  SeaweedFS (S3) + imgproxy (Multimedia Cifrada)│  │ Chatwoot v4.19.1 + pg-chatwoot│  │
│  └────────────────────────────────────────────────┘  └──────────────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                ┌───────────────────────────┴───────────────────────────┐
                │ Handshake Dual 360° / Manifiestos / Despliegue IaC   │
                ▼                                                       ▼
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────┐
│     CÉLULA DE DATOS 01 (cell-01 · DAT-001)    │   │ CÉLULA DE DATOS N (cell-N · ...)  │
│                                               │   │                                   │
│  ┌─────────────────────────────────────────┐  │   │  ┌─────────────────────────────┐  │
│  │ tenant-app (HTTP Celular / Next.js)     │  │   │  │ tenant-app                  │  │
│  └────────────────────┬────────────────────┘  │   │  └──────────────┬──────────────┘  │
│                       ▼                       │   │                 ▼                 │
│  ┌─────────────────────────────────────────┐  │   │  ┌─────────────────────────────┐  │
│  │ pgbouncer-cell-01 (Pooling Puerto 6432) │  │   │  │ pgbouncer-cell-N            │  │
│  └────────────────────┬────────────────────┘  │   │  └──────────────┬──────────────┘  │
│                       ▼                       │   │                 ▼                 │
│  ┌─────────────────────────────────────────┐  │   │  ┌─────────────────────────────┐  │
│  │ pg-cell-01 (PG18 + pgvector: mocter_cell│  │   │  │ pg-cell-N (PG18 + pgvector) │  │
│  └─────────────────────────────────────────┘  │   │  └─────────────────────────────┘  │
└───────────────────────────────────────────────┘   └───────────────────────────────────┘
```

---

## 4. Estructura Exhaustiva del Monorepo

```text
landig-agencia/
├── .agents/                               # Directivas vinculantes y constitución del proyecto
│   ├── AGENTS.md                          # Constitución permanente, reglas R-01 a R-10, convenciones
│   ├── rules/                             # Normas de ingeniería complementarias:
│   │   ├── rules-for-tsdoc-proyect.md     # Directiva 4.4: Documentación TSDoc en español técnico
│   │   ├── rules-for-database-postgres-drizzle.md # Directiva 4.5: Estándares Drizzle + PostgreSQL 18
│   │   ├── rules-for-i18n.md              # Directiva 4.6: Internacionalización ES/EN estricta
│   │   ├── rules-for-no-deprecated-code.md# Directiva 4.11: Prohibición de APIs deprecadas
│   │   ├── rules-for-env-and-no-hardcoding.md # Directiva 4.12: Validación estricta con Zod/T3
│   │   ├── rules-for-logging-*.md         # Directiva 4.13: Logging estructurado en JSON con Pino
│   │   ├── rules-for-exceptions-*.md      # Directiva 4.14: Errores Problem Details RFC 9457
│   │   ├── rules-for-no-spec-codes-in-ui.md # Directiva 4.15: Cero códigos de spec en vistas finales
│   │   ├── rules-for-environment-and-traefik-compatibility.md # Directiva 4.16: Cero puertos fijos
│   │   └── rules-for-custom-confirmation-modals-no-native-dialogs.md # Directiva 4.17: Cero window.confirm
│   └── skills/                            # Habilidades de agente instaladas en el repositorio
├── .github/
│   └── workflows/                         # Automatización CI/CD
│       ├── ci.yml                         # CI: Lint, tests, build y drizzle-kit check
│       ├── cd.yml                         # CD: Publicación en GitHub Container Registry (GHCR)
│       └── deploy.yml                     # Despliegue automatizado por SSH a Hostinger
├── apps/
│   ├── admin/                             # Consola administrativa unificada (@mocter/admin)
│   │   ├── app/
│   │   │   ├── admin/                     # Vistas administrativas principales:
│   │   │   │   ├── ai/                    # Asistente AI y bibliotecas de prompts maestros (AI-001)
│   │   │   │   ├── billing/               # Facturación, pagos Wompi/Stripe y recargas (BILL-001)
│   │   │   │   ├── cells/                 # Gobernanza y aprovisionamiento de células (DAT-001)
│   │   │   │   │   ├── cell-actions.tsx   # Menú de acciones: Verificar Conexión, Manifiesto, Edición
│   │   │   │   │   ├── create-cell-form.tsx # Formulario modal de aprovisionamiento celular (Title Case)
│   │   │   │   │   └── page.tsx           # Tabla de inventario celular con métricas y estado
│   │   │   │   ├── conversations/         # Bandeja de atención con Chatwoot embebido (CHW-001)
│   │   │   │   ├── leads/                 # Trazabilidad y gestión de prospectos calificados
│   │   │   │   ├── orders/                # Órdenes de compra y pedidos capturados por el bot (ORD-001)
│   │   │   │   ├── plans/                 # Gestión de catálogo de planes (UUID + code canónico)
│   │   │   │   ├── referrals/             # Programa de referidos y balances de comisiones (REF-001)
│   │   │   │   ├── reports/               # Métricas e informes ejecutivos de conversión
│   │   │   │   ├── settings/              # Configuración de marca blanca (DSN-001) y notificaciones
│   │   │   │   ├── tenants/               # Gestión de clientes, inquilinos y cuotas de uso
│   │   │   │   └── users/                 # Directorio de usuarios, asignación de roles RBAC y TOTP
│   │   │   ├── api/                       # Route Handlers de la consola administrativa
│   │   │   │   ├── admin/                 # Endpoints protegidos para gobernanza de células, planes, etc.
│   │   │   │   ├── auth/logout/           # Cierre de sesión formal con revocación en base de datos
│   │   │   │   └── webhooks/              # Ingestores de eventos de Wompi, Stripe y Chatwoot
│   │   │   ├── globals.css                # Tokens de diseño Tailwind v4 y clases del sistema DSN-001
│   │   │   └── layout.tsx                 # Shell administrativo con AdminShell, navegación y temas
│   │   ├── components/                    # Componentes atómicos y modulares:
│   │   │   ├── admin-shell.tsx            # Barra lateral, navegación y popover de usuario con Logout
│   │   │   ├── confirmation-modal.tsx     # Diálogo modal accesible (Regla 4.17 · Cero window.confirm)
│   │   │   └── user-profile-modal.tsx     # Ficha de perfil de usuario con visualización de roles y TOTP
│   │   ├── env.ts                         # Validación tipada de variables de entorno cliente/servidor
│   │   └── proxy.ts                       # Correlación de requestId vía AsyncLocalStorage (Regla 4.13)
│   └── web/                               # Portal web público y PWA (@mocter/web)
│       ├── app/
│       │   ├── [locale]/                  # Rutas dinámicas localizadas (/es, /en)
│       │   │   ├── cookies/               # Gestión interactiva de consentimiento de cookies
│       │   │   ├── privacidad/            # Política de privacidad (Habeas Data Ley 1581/2012)
│       │   │   ├── terminos/              # Términos y condiciones contractuales
│       │   │   ├── layout.tsx             # Layout raíz con ThemeProvider, SEO y Schema.org
│       │   │   └── page.tsx               # Landing page modular de alta conversión
│       │   ├── actions/                   # Server Actions para captura transaccional de prospectos
│       │   └── api/                       # Endpoints públicos y de autenticación híbrida
│       ├── components/                    # Secciones modulares, cápsula flotante y widget Chatwoot
│       └── messages/                      # Diccionarios de internacionalización estructurados
├── packages/
│   └── domain/                            # Capa agnóstica de negocio y datos (@mocter/domain)
│       ├── drizzle/                       # Migraciones SQL del Plano de Control Global (admin/public)
│       ├── drizzle-cell/                  # Migraciones SQL del Plano Celular de Datos (mocter_cell)
│       ├── scripts/                       # Ejecutores standalone de migración para contenedores
│       ├── src/
│       │   ├── auth/                      # Motor de seguridad: Argon2id, TOTP, CSRF, SSO Chatwoot
│       │   ├── db/                        # Esquema relacional Drizzle del Control Plane (users, cells)
│       │   ├── db-cell/                   # Esquema relacional Drizzle de células (tenants, orders)
│       │   ├── repositories/              # Abstracciones de acceso a datos desacopladas
│       │   ├── services/                  # Lógica de dominio: cell-secrets, admin-dashboard, outbox
│       │   └── validation.ts              # Esquemas de validación Zod en tiempo de ejecución
│       └── package.json                   # Exports modulares tipados
├── data-cell-dev/                         # Entorno de emulación local para células de datos (DAT-001)
│   ├── docker-compose.yml                 # Stacks de pg-cell-01, pgbouncer-cell-01 y tenant-app
│   └── pgbouncer/                         # Configuraciones de pooling transaccional
├── deploy/
│   └── server/                            # Scripts y configuración de despliegue en servidor Hostinger
│       ├── deploy.sh                      # Script de despliegue con pre-deploy hook, healthcheck y rollback
│       ├── env.prod.example               # Plantilla de variables de entorno para producción
│       └── env.test.example               # Plantilla de variables de entorno para staging/test
├── docs/                                  # Especificaciones SDD (ADM-001, AUTH-001, DAT-001, BILL-001, etc.)
├── docker-compose.yml                     # Orquestación de desarrollo del Control Plane
├── docker-compose.cell.yml                # Orquestador de emulación de célula de datos
├── Dockerfile                             # Multi-stage build optimizado (Node 24 Alpine)
└── package.json                           # Configuración raíz de Turborepo y pnpm workspaces
```

---

## 5. Profundización en los Módulos Críticos Implementados

### 5.1 Gobernanza de Células de Datos (DAT-001 Modelo A)
- **Máquina de Estados de Célula:**
  - `draft`: Célula registrada en base de datos con configuración inicial de red y topología.
  - `provisioning`: En proceso de emisión de secretos, verificación de conectividad y despliegue.
  - `ready`: Célula verificada mediante Handshake Dual 360°, activa y recibiendo inquilinos.
  - `error_conection`: Célula con fallo de conectividad TCP o HTTP detectado por los probes de diagnóstico.
  - `maintenance` / `retired`: Retirada controlada o drenado de inquilinos.
- **Criptografía de Secretos con AAD Dinámico:**
  - Los secretos de conexión (usuario, contraseña de PostgreSQL/PgBouncer y clave de aplicación) se cifran mediante **AES-256-GCM**.
  - El AAD (*Additional Authenticated Data*) vincula criptográficamente el paquete con el UUID de la célula (`${cellId}:cell-secrets`).
  - Para garantizar compatibilidad hacia atrás y robustez operativa, `cell-secrets.service.ts` incorpora un mecanismo de fallback que valida contra `cell.code` (`${cellCode}:cell-secrets`), resolviendo fallos de autenticación de datos ante registros históricos.
  - La función `createAdminCell` genera el `cellId = randomUUID()` de manera anticipada, garantizando que el paquete de secretos y el registro en base de datos compartan exactamente el mismo UUID canónico.
- **Verificación de Conexión Celular (Dual Handshake 360°):**
  - El endpoint `/api/admin/cells/[id]/handshake` ejecuta un diagnóstico exhaustivo en dos fases:
    1. **Sonda TCP:** Valida la conectividad a nivel de socket contra el host y puerto de PgBouncer (`6432`) o PostgreSQL (`5432`) con un timeout estricto de 3 segundos.
    2. **Sonda HTTP:** Envía un probe HTTP firmado con cabecera de autenticación efímera contra la URL de la aplicación celular (`tenant-app`).
  - Si ambas sondas responden satisfactoriamente, el estado transiciona a `ready`. Si alguna falla, transiciona limpiamente a `error_conection` registrando el diagnóstico detallado sin provocar caídas de servicio.
- **Generación de Manifiesto Canónico:**
  - El endpoint `/api/admin/cells/[id]/manifest` descifra el paquete de secretos celular y genera en caliente:
    1. `manifest.json`: Definición formal estructurada de metadatos, topología, capacidades y variables de entorno requeridas.
    2. `docker-compose.cell.yml`: Manifiesto declarativo listo para ser ejecutado en el servidor de destino con `pg-cell`, `pgbouncer` y `tenant-app`.

### 5.2 Autenticación Híbrida y Sesiones de Usuario (AUTH-001)
- **Roles Canónicos del Sistema:**
  1. `platform_owner`: Control total de infraestructura, células, asignación de planes y configuración global.
  2. `platform_support`: Soporte técnico de plataforma con visibilidad restringida y auditoría.
  3. `tenant_owner`: Propietario del inquilino, responsable de facturación, usuarios y catálogo.
  4. `tenant_admin`: Administrador de inquilino para gestión de productos, órdenes y atención.
  5. `tenant_agent`: Agente de atención asignado a la bandeja omnicanal de Chatwoot.
- **Ficha de Perfil de Usuario en Backoffice:**
  - Componente accesible `UserProfileModal` (`role="dialog"`, `aria-modal="true"`) integrado en el menú de usuario de `AdminShell`.
  - Muestra información en formato Title Case: Nombre Completo, Correo Corporativo, Rol Canónico, Inquilino Activo, Estado Operativo de la Cuenta y Estado de Segundo Factor (2FA TOTP).
- **Cierre de Sesión Seguro (Logout Flow):**
  - Diálogo de confirmación del sistema de diseño (cumpliendo la Regla 4.17 sin diálogos nativos).
  - Al confirmar, ejecuta una petición `POST /api/auth/logout` con token CSRF válido.
  - El backend revoca formalmente la sesión en la base de datos y en Redis, garantizando que el identificador no pueda reutilizarse.
  - Limpia la cookie HTTP-only `mocter_session` (`Max-Age=0`) y redirige limpiamente al portal público.

### 5.3 Cumplimiento Riguroso de Directivas Constitucionales (`.agents/AGENTS.md`)
- **Regla 4.8 (Formularios en Title Case):** Queda estrictamente prohibido el uso de mayúsculas sostenidas (`uppercase`) en los labels de formularios. Se auditaron y unificaron todos los campos de creación y edición celular en `apps/admin` bajo Title Case («Código De La Célula», «Nivel De Servicio», «Topología De Despliegue», etc.).
- **Regla 4.13 (Gestión Estructurada de Logs con Pino):** Prohibido el uso de `console.*`. Todo log se emite como JSON tipado con nivel estricto, correlacionado obligatoriamente por `requestId` propagado por `proxy.ts` vía `AsyncLocalStorage`.
- **Regla 4.14 (Problem Details RFC 9457):** Todas las respuestas de error en Route Handlers implementan el formato estándar `application/problem+json` con `type`, `title`, `status`, `detail`, e `instance`.
- **Regla 4.16 (Zero Hardcoded Ports & Traefik Compatibility):** Ningún componente ni proxy asume puertos fijos locales (`3000`, `3001`, `3003`). Todo el tráfico opera bajo resolución de nombres DNS (`mocter.co`, `admin.mocter.co`) y redes internas Docker sin puertos expuestos en host en producción.
- **Regla 4.17 (Zero Native Dialogs):** Prohibido el uso de `window.alert()`, `window.confirm()` o `window.prompt()`. Toda acción destructiva o confirmación crítica se implementa mediante `ConfirmationModal` con roles de diálogo accesible y feedback de carga.

---

## 6. Métricas de Calidad, Cobertura y Verificación

El monorepo cuenta con compuertas de calidad automatizadas ejecutadas directamente en el entorno de desarrollo y en la cadena de CI/CD:

```bash
# 1. Ejecución global de la suite de pruebas unitarias y de integración:
pnpm test
```

### Resultados de la Auditoría Automatizada (2 de Noviembre de 2026):
| Paquete / Aplicación | Archivos de Prueba (Suites) | Pruebas Ejecutadas | Estado | Framework |
| :--- | :---: | :---: | :---: | :---: |
| **`@mocter/domain`** | 59 archivos | **679 pruebas** | **100% Pasando** | Vitest v3.2 |
| **`@mocter/web`** | 37 archivos | **259 pruebas** | **100% Pasando** | Vitest v5.0 |
| **`@mocter/admin`** | 39 archivos | **110 pruebas** | **100% Pasando** | Vitest v5.0 |
| **TOTAL CONSOLIDADO** | **135 suites** | **1,048 pruebas** | **Cero fallos (0 errors)** | **Verificado** |

### Verificaciones Complementarias:
- **Verificación de Tipos Estáticos (TypeScript Strict Mode):** `tsc --noEmit` ejecutado sin errores en todas las aplicaciones y paquetes.
- **Consistencia de Esquemas Drizzle:** `drizzle-kit check` validado exitosamente en Control Plane y Plano Celular.
- **Compilación de Producción:** Compilación standalone optimizada en Next.js 16 con Turbopack sin advertencias de deprecación.

---

## 7. Plan de Trabajo Inmediato y Próximos Pasos

1. **Laboratorio de Embedding y SSO Chatwoot (T-17 / T-18 de CHW-001):** Validar en entorno de staging la sincronización de agentes entre `apps/admin` y Chatwoot v4.19.1 mediante el iframe same-site.
2. **Aprovisionamiento de Célula de Producción (DAT-001 / OPS-001):** Ejecutar el primer despliegue formal de un nodo celular autónomo en servidor dedicado utilizando el manifiesto canónico generado.
3. **Consolidación del Motor de Inferencia (BOT-002):** Conexión del orquestador de prompts dinámicos con los canales de mensajería para captura autónoma de pedidos en WhatsApp.
4. **Monitoreo y Métricas Prometheus (OPS-001):** Implementación de exporters en PgBouncer y `tenant-app` para dashboards unificados en Grafana.

---

## 8. Conclusión

El proyecto Mocter se encuentra en un **estado de madurez técnica excepcional (Production-Grade)**. La arquitectura de 3 planos resuelve de raíz los problemas clásicos de contención y escalabilidad en SaaS multi-inquilino, dotando a la plataforma de una base robusta, segura y completamente verificada por más de mil pruebas automatizadas para soportar el crecimiento comercial continuo.

---

*Documento técnico de estado actual consolidado el 2 de noviembre de 2026 bajo la auditoría de arquitectura de software para Mocter.*
