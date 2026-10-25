# AGENTS.md · Constitución del proyecto Mocter

> Reglas permanentes para cualquier agente de IA (Claude Code, OpenCode, Antigravity u otro)
> que trabaje en este repositorio. Prevalecen sobre cualquier instrucción de una especificación
> individual. Si una tarea exige violar una regla, **detente y reporta**.

## 1. Contexto del proyecto

| Elemento | Valor |
|---|---|
| Repositorio | `EnuarRosales/landig-agencia` (público) |
| Tipo | Monorepo pnpm + Turborepo |
| Aplicación | `apps/web` (`@mocter/web`) · Next.js 16 (**App Router exclusivo**, React 19) en modo `standalone` |
| Dominio / datos | `packages/domain` (`@mocter/domain`) · Drizzle ORM |
| Enrutamiento | Next.js App Router (`apps/web/app/`). Prohibido el uso de Pages Router (`pages/`). |
| Base de datos | PostgreSQL 18 con pgvector (`pgvector/pgvector:pg18`) |
| Runtime | Node.js 24 (alpine en contenedor) |
| Imagen | `ghcr.io/enuarrosales/mocter-web` (única: aplicación + migrador) |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`, `cd.yml`, `deploy.yml`) |
| Producción | VPS Hostinger · Traefik v2.11 · `mocter.co` |
| Pruebas | VPS proyectado, despliegue desactivado (`STAGING_ENABLED=false`) |

## 2. Metodología: Spec-Driven Development (SDD)

1. Todo cambio no trivial nace de una especificación en `docs/specs/<id>-<nombre>/`:
   - `requirements.md` → **qué** y **por qué** (requisitos y criterios de aceptación).
   - `design.md` → **cómo** (decisiones, arquitectura, contratos).
   - `tasks.md` → **pasos** ejecutables, en orden, con verificación.
2. Orden de lectura obligatorio: `AGENTS.md` → `requirements.md` → `design.md` → `tasks.md`.
3. Ejecuta las tareas **en el orden de `tasks.md`**. Marca `[x]` solo cuando su verificación pase.
4. Si encuentras una contradicción entre documentos, prevalece: `AGENTS.md` > `requirements.md` > `design.md` > `tasks.md`. Reporta la contradicción.
5. No amplíes el alcance. Lo que no esté en `requirements.md` va a la sección *Hallazgos* del reporte, no al código.
6. Las tareas marcadas **[HUMANO]** no se ejecutan; se documentan como pendientes.

## 3. Restricciones (no negociables)

| ID | Restricción |
|---|---|
| R-01 | No versionar secretos, `.env` reales, llaves SSH ni contraseñas. |
| R-02 | No modificar código de la aplicación (`apps/web`, `packages/domain/src`) salvo que una especificación lo indique explícitamente. |
| R-03 | No cambiar nombre de imagen, redes Docker, routers de Traefik ni rutas del servidor definidos en las especificaciones. |
| R-04 | No usar la etiqueta `latest` para desplegar. El servidor siempre ejecuta una etiqueta explícita (`vX.Y.Z` o `sha-xxxxxxx`). |
| R-05 | No ampliar permisos de workflows más allá de los declarados. No cambiar *Workflow permissions* a *Read and write*. |
| R-06 | No agregar acciones de terceros distintas de `actions/*`, `docker/*` y `pnpm/action-setup`. |
| R-07 | No modificar el compose de desarrollo local (`docker-compose.yml`) salvo solicitud expresa. |
| R-08 | No usar `drizzle-kit push` en workflows, scripts de despliegue ni imágenes. Solo se permite en desarrollo local. |
| R-09 | No editar ni eliminar migraciones SQL ya versionadas en `packages/domain/drizzle`. Para corregir, generar una nueva. |
| R-10 | En **staging y producción**, ningún servicio Docker de Mocter publica puertos en el host; todo el tráfico entra por Traefik. En **desarrollo local** se permite publicar puertos solo en `127.0.0.1` (loopback), sin exposición externa. |

## 4. Convenciones

### 4.1 Ramas y versiones

| Rama / ref | Uso |
|---|---|
| `feat/*`, `fix/*` | Trabajo; PR hacia `develop` |
| `develop` | Integración; despliega a pruebas (cuando esté habilitado) |
| `main` | Estable; no despliega por sí sola |
| Tag `vX.Y.Z` sobre `main` | Libera a producción (con aprobación manual) |
| Tag `vX.Y.Z-rc.N` | Construye imagen, no despliega |

Mensajes de commit: Conventional Commits (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`, `refactor:`).

### 4.2 Migraciones (estándar Drizzle)

1. Editar el esquema en `packages/domain`.
2. Iterar en local con `pnpm --filter @mocter/domain db:push` (opcional, solo BD local).
3. Generar la migración: `pnpm --filter @mocter/domain db:generate`.
4. Revisar el SQL generado (renombres, `DROP`, datos existentes).
5. Validar en local: `pnpm --filter @mocter/domain db:migrate`.
6. Commit del esquema **y** de la carpeta `drizzle/` en el mismo PR.
7. Cambios destructivos se dividen en dos versiones (expandir → contraer).

### 4.3 Comandos de verificación

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm e2e
pnpm --filter @mocter/domain exec drizzle-kit check
docker build -t mocter-web:local .
bash -n deploy/server/deploy.sh
TAG=test docker compose -f docker-compose.prod.yml config -q
```

### 4.4 Documentación de código (TSDoc)

Toda función, clase, interfaz, método y endpoint exportado o con lógica no trivial debe documentarse usando **TSDoc** en **idioma español** neutral y técnico. Consulte la directiva completa en [rules/rules-for-tsdoc-proyect.md](rules/rules-for-tsdoc-proyect.md).

### 4.5 Base de datos (PostgreSQL + Drizzle)

Toda base de datos propia de Mocter cumple las buenas prácticas de PostgreSQL y Drizzle ORM: nomenclatura en minúscula con separador `_`, comentarios de tabla y columna obligatorios, integridad referencial donde la lógica de negocio la exija, índices por camino de acceso conocido, y modelo lógico normalizado antes de cualquier particionado. **No aplica a la base de datos de Chatwoot.** Consulte la directiva completa en [rules/rules-for-database-postgres-drizzle.md](rules/rules-for-database-postgres-drizzle.md).

### 4.6 Internacionalización (i18n)

Toda interfaz y texto visible de Mocter soporta **Español e Inglés**, con **Español por defecto**. Ningún texto visible va incrustado en componentes: vive en diccionarios por idioma, y el idioma activo se resuelve por usuario → inquilino (`clients.locale`) → navegador → defecto. Consulte la directiva completa en [rules/rules-for-i18n.md](rules/rules-for-i18n.md).

### 4.7 Asistencia AI en la configuración

Todo **campo de texto libre (`textarea`)** que el inquilino redacte cuenta con **«Mejorar con AI»**, en **todos los planes**; los campos de una línea (nombre, precio, slug) quedan fuera salvo que el prompt maestro del campo lo justifique. La plataforma mantiene una biblioteca de prompts maestros por campo (AI-001) y la sugerencia siempre es revisada y aceptada por el inquilino; nunca se guarda sola. La inferencia usa el proveedor BYOK del inquilino, el trial de onboarding o la inferencia Mocter cuando la propuesta de agregador madure. Consulte la spec [AI-001](docs/specs/ai-001-asistente-ai-configuracion/requirements.md).

### 4.8 Diseño visual (Mobile First + sistema de diseño)

Toda vista de Mocter se diseña **Mobile First**: la versión móvil se define primero y el escritorio la amplía, nunca al revés. El look & feel vive en el sistema de diseño [DSN-001](docs/specs/dsn-001-sistema-diseno/requirements.md): tokens en capas, paleta parametrizable (SaaS e inquilino por plan), tipografía (Chakra Petch/Space Grotesk · Inter/Geist · IBM Plex Mono), tablas con paginación/filtros/ordenamiento en todo el sistema, alto contraste (WCAG 2.2 AA) y el contrato de marca blanca por capas.

### 4.9 Time-to-value: operación en una sesión corta

Un inquilino nuevo debe quedar **operativo en una sesión corta** (5 minutos como guía de diseño, no como SLA): onboarding guiado con defaults de plataforma, un producto, bot con preset y canal de atención activo. **WhatsApp es el canal preferido** y su conexión puede extenderse sin bloquear la operación; el widget web permite operar de inmediato. Todo lo demás (políticas, FAQs, catálogo completo) es opcional, se completa después y nunca bloquea. La configuración avanzada no es requisito del alta.

### 4.10 Plataforma única y Chatwoot embebido

El usuario del inquilino trabaja en **una sola plataforma**: `mocter-admin` es el único nivel superior y Chatwoot se presenta **embebido en un iframe same-site**. No se abre en pestaña nueva, no se redirige el nivel superior y no se reimplementa la bandeja; la operación ocurre en la interfaz de Chatwoot (ADM-001 D-32, CHW-001 §6.2). La marca blanca aplica a la shell; la personalización visual del contenido embebido es un alcance separado.

## 5. Formato del reporte del agente

Al terminar una especificación, entrega:
1. Resultado de las tareas de descubrimiento.
2. Tareas completadas `[x]` y pendientes `[ ]` de `tasks.md`.
3. Archivos creados / modificados y desviaciones (con justificación).
4. Resultado de los comandos de verificación.
5. Hallazgos fuera de alcance.
6. Tareas **[HUMANO]** pendientes.

## 6. Índice de especificaciones

| ID | Nombre | Estado |
|---|---|---|
| MIG-001 | [Migración Next.js 16](docs/specs/mig-001-nextjs-migration/requirements.md) | Implementada · Estable |
| CD-001 | [Despliegue continuo](docs/specs/cd-001-despliegue-continuo/requirements.md) | Implementada · Primer release desplegado (2026-10-24) |
| CORE-002 | [Optimización del cascarón](docs/specs/core-002-optimizacion-cascaron/requirements.md) | Implementada · Estable |
| API-001 | [Documentación OpenAPI (Swagger)](docs/specs/api-001-openapi-swagger/requirements.md) | Implementada · Estable |
| ADM-001 | [mocter-admin — núcleo administrativo de inquilinos](docs/specs/adm-001-mocter-admin/requirements.md) | Aprobada · 2026-10-25; D-15 (membresía 1:0..1), D-30 (Router Global), D-31 (roles/scopes), D-32 (Chatwoot embebido), onboarding con `plan_code` → UUID y bandeja `/admin/leads` |
| AUTH-001 | [Sistema híbrido de autenticación y autorización](docs/specs/auth-001-autenticacion-hibrida/requirements.md) | Aprobada · 2026-10-22; AUTH-D-01 a AUTH-D-07 cerradas |
| CHW-001 | [Inventario técnico de Chatwoot](docs/specs/chw-001-inventario-chatwoot/requirements.md) | Aprobada · 2026-10-25; Chatwoot `v4.19.1` canónico, sincronización alineada con membresía 1:0..1, digest por fijar en T-01A y embedding iframe pendiente de laboratorio (T-17/T-18) |
| DAT-001 | [Arquitectura de datos multi-inquilino basada en celdas](docs/specs/dat-001-arquitectura-datos-multiinquilino/requirements.md) | Aprobada · 2026-10-25; alineada con AUTH-D-06, membresía 1:0..1 y modelo canónico de `plans` (UUID + `code`) |
| OPS-001 | [Operación, continuidad y observabilidad](docs/specs/ops-001-operacion-continuidad-observabilidad/requirements.md) | Aprobada · 2026-10-25; O-01 a O-06 cerradas (≤USD 50/mes, full semanal + diff diario, logs 14 días, sin WORM, operador único, SeaweedFS incluido), monitoreo de RabbitMQ; lab T-02, T-03, T-08 y T-18 pendientes |
| BOT-001 | [Bot de atención automatizada con LLM e inferencia como servicio](docs/specs/bot-001-atencion-automatizada-llm/requirements.md) | Aprobada · 2026-10-24; día uno BYOK; billetera y spread parametrizables (Wompi+Stripe, USD interno, 30% default, prepago estricto + fallback BYOK, bot + asistente); decisiones O-01 a O-07 cerradas |
| BOT-002 | [Motor de atención y composición dinámica de prompts](docs/specs/bot-002-motor-atencion-prompts/requirements.md) | Aprobada · 2026-10-25; prompt compuesto en runtime, clasificación de leads, captura de pedido, RNF/BDD/i18n y contrato `registrar_pedido` |
| ORD-001 | [Pedidos y fulfillment](docs/specs/ord-001-pedidos-fulfillment/requirements.md) | Aprobada · 2026-10-25; pedido desde bot y manual, estados, idempotencia, pago, envío, devoluciones y RNF/BDD/i18n |
| BILL-001 | [Facturación SaaS, pagos y comprobantes](docs/specs/bill-001-facturacion-saas/requirements.md) | Aprobada · 2026-10-25; pasarela dual Wompi/Stripe, `plan_id uuid`, `payment_methods` tokenizados, prorrateo por días, datos Matías API, comprobantes Excel/PDF, sin retenciones v1 y créditos de referidos |
| REF-001 | [Programa de referidos](docs/specs/ref-001-programa-referidos/requirements.md) | Borrador · 2026-10-25; Modelo A (crédito) unilateral, recompensa parametrizable (monto fijo o porcentaje), crédito único por referido con vigencia 365 días, tope configurable sin valor fijo por defecto, ventana de 60 días y toggle activo/pausado; sin decisiones abiertas, pendiente aprobación final |
| CRM-001 | [Prospectos y gestión comercial](docs/specs/crm-001-prospectos-gestion-comercial/requirements.md) | Aprobada · 2026-10-25; maestro de prospectos en Mocter, Chatwoot como proyección, Habeas Data (Ley 1581 de 2012); dos propósitos de consentimiento, aviso editable versionado y captura por botones + enlace; sin decisiones abiertas |
| AI-001 | [Asistente AI de configuración](docs/specs/ai-001-asistente-ai-configuracion/requirements.md) | Aprobada · 2026-10-25; prompts maestros por campo, «Mejorar con AI» con BYOK o billetera Mocter, modelo propio configurable y sin límite mensual separado; sin decisiones abiertas |
| REP-001 | [Informes y dashboards](docs/specs/rep-001-informes-dashboards/requirements.md) | Aprobada · 2026-10-25; cálculo en caliente sin snapshots, roles D-31 (`tenant_owner`/`tenant_agent`, sin `tenant_admin`), 5 criterios BDD y exportación nativa Excel/PDF |
| DSN-001 | [Sistema de diseño y look & feel](docs/specs/dsn-001-sistema-diseno/requirements.md) | Aprobada · 2026-10-25; Mobile First, catálogo `/design-system`, HUD sutil + acentos de marca, tipografía solo Top/Enterprise y tema que sigue al sistema con fallback oscuro; sin decisiones abiertas |
| LND-001 | [Landing page, planes comerciales y accesos](docs/specs/lnd-001-landing-planes-comerciales/requirements.md) | Aprobada · 2026-10-25; planes dinámicos condicionales con `plan_code` y resolución a UUID, botón acceso header, login/register interconectados y upgrade en backoffice |
| NTF-001 | [Notificaciones transaccionales y plantillas de correo](docs/specs/ntf-001-notificaciones-plantillas/requirements.md) | Aprobada · 2026-10-25; remitentes múltiples, SMTP, catálogo de eventos, plantillas TipTap versionadas y **outbox + RabbitMQ + worker no bloqueante**; si la notificación falla, el negocio continúa; administración en `/admin/settings/notifications` |


