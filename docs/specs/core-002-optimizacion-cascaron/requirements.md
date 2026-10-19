# CORE-002 · Requisitos · Optimización Arquitectónica del Cascarón

| Atributo | Valor |
|---|---|
| ID | CORE-002 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-19 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |

## 1. Propósito

Consolidar y desacoplar los cimientos arquitectónicos del proyecto Mocter para garantizar que el cascarón sea modular, seguro, observable y extensible para fases posteriores (módulo administrativo, CRM, automatizaciones de IA y clientes móviles), sin incurrir en desarrollo prematuro de funcionalidades no especificadas (como autenticación o webhooks sin contrato).

## 2. Alcance

### Incluye
- **Arquitectura Limpia en `@mocter/domain`**: Desacoplamiento de conexión a base de datos, implementación del patrón Repositorio (`ILeadRepository`) y capa de Servicio (`LeadService`) con `Result Pattern`.
- **API REST de Prospectos (`POST /api/leads`)**: Endpoint HTTP estándar que expone la captura de prospectos consumiendo el mismo `LeadService` de dominio que la Server Action de la landing.
- **Observabilidad y Seguridad de Logs**:
  - Eliminación estricta de la exposición de credenciales (`DATABASE_URL`) en stdout.
  - Implementación de un logger estructurado ligero (JSON en producción, legible en desarrollo con redacción de secretos).
  - Endpoint de salud HTTP `/api/health` conectado a la verificación real de PostgreSQL.
- **Seguridad Perimetral**:
  - Cabeceras HTTP de seguridad OWASP en `next.config.ts`.
  - Rate limiting en memoria / IP sliding window para peticiones públicas a Server Actions y API REST de leads.
- **Configuración y DX**:
  - Validación tipada de variables de entorno al arranque mediante Zod.
  - Actualización de healthchecks en Docker y Compose.

### Excluye
- Autenticación y control de acceso RBAC (postergado hasta la especificación del módulo administrativo `AUTH-001`).
- Webhooks de terceros (WhatsApp Business, Google Calendar) sin contratos oficiales.
- Panel administrativo de leads o vistas de administración.
- Base de datos o dependencias externas no declaradas en la constitución.

## 3. Actores

| Actor | Rol |
|---|---|
| Visitante / Prospecto | Envía solicitud de demo vía formulario web o integración REST |
| Sistema Externo / App | Envía leads consumiendo `POST /api/leads` |
| Orquestador (Docker / Traefik / Uptime) | Consulta `/api/health` para validar el estado del contenedor |
| Desarrollador / Agente | Extiende la plataforma creando nuevos servicios y repositorios desacoplados |

## 4. Requisitos Funcionales

### RF-01 · Dominio y Patrón Repositorio / Servicio
| ID | Requisito |
|---|---|
| RF-01.1 | `@mocter/domain` debe separar la conexión de bajo nivel (`db/client.ts`) de las entidades de persistencia. |
| RF-01.2 | Debe existir una interfaz `ILeadRepository` y su implementación concreta en Drizzle (`DrizzleLeadRepository`). |
| RF-01.3 | Debe existir una clase `LeadService` que contenga la lógica de negocio, validación Zod (`leadSchema`) y orquestación de leads. |
| RF-01.4 | `LeadService.registerLead` debe devolver un contrato estándar tipo `Result`: `{ ok: true, data: Lead }` o `{ ok: false, error: string, issues?: unknown }`, evitando que excepciones no controladas se propaguen a la UI o API. |

### RF-02 · API REST para Captura de Leads
| ID | Requisito |
|---|---|
| RF-02.1 | La aplicación web debe exponer una ruta REST `POST /api/leads`. |
| RF-02.2 | `POST /api/leads` debe validar el payload usando el mismo `LeadService` de `@mocter/domain`. |
| RF-02.3 | Ante un payload válido, debe retornar status HTTP `201 Created` con JSON `{ ok: true, data: { id, createdAt } }`. |
| RF-02.4 | Ante un payload inválido o error de validación, debe retornar status HTTP `400 Bad Request` con el detalle de los errores. |
| RF-02.5 | La Server Action existente `submitDemoRequest` debe ser refactorizada para delegar en `LeadService`, garantizando paridad total entre la acción de formulario y el endpoint REST. |

### RF-03 · Observabilidad y Endpoint de Salud
| ID | Requisito |
|---|---|
| RF-03.1 | El sistema debe remover cualquier volcado de `DATABASE_URL` o contraseñas en los flujos de log. |
| RF-03.2 | `@mocter/domain` debe proporcionar una utilidad de log estructurado que soporte niveles (`debug`, `info`, `warn`, `error`) y metadatos contextuales. |
| RF-03.3 | La aplicación web debe exponer un Route Handler `GET /api/health`. |
| RF-03.4 | Si PostgreSQL responde correctamente a `SELECT 1`, `GET /api/health` debe retornar status HTTP `200 OK` con JSON descriptivo y latencia. |
| RF-03.5 | Si PostgreSQL no responde o está degradado, `GET /api/health` debe retornar status HTTP `503 Service Unavailable`. |

### RF-04 · Seguridad Perimetral y Rate Limiting
| ID | Requisito |
|---|---|
| RF-04.1 | Todas las respuestas HTTP de `apps/web` deben incluir cabeceras de seguridad: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy`. |
| RF-04.2 | Las peticiones a `POST /api/leads` y a la Server Action `submitDemoRequest` deben estar protegidas por un limitador de tasa (rate limiter) basado en IP. |
| RF-04.3 | Si una IP excede el umbral permitido (ej. 5 peticiones por minuto), `POST /api/leads` debe retornar status HTTP `429 Too Many Requests`. |

## 5. Requisitos No Funcionales

| ID | Requisito |
|---|---|
| RNF-01 | **Rendimiento:** El middleware y el rate limiter no deben añadir más de 5ms de latencia por solicitud. |
| RNF-02 | **Compatibilidad:** La capa de repositorio debe permitir en el futuro implementar repositorios en memoria para pruebas de integración sin levantar contenedores Docker. |
| RNF-03 | **Seguridad de Secretos:** Cumplir estrictamente con la restricción R-01 de `AGENTS.md` (cero secretos en logs o repositorio). |
| RNF-04 | **Retrocompatibilidad:** La experiencia de usuario de la landing page y el formulario de demo actual deben permanecer 100% funcionales. |
