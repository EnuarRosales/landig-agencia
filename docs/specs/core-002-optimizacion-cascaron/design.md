# CORE-002 · Diseño Técnico · Optimización Arquitectónica del Cascarón

| Atributo | Valor |
|---|---|
| ID | CORE-002 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-19 |
| Documentos | [`requirements.md`](requirements.md) · `design.md` (este) · [`tasks.md`](tasks.md) |

## 1. Visión General de la Arquitectura

Para permitir que Mocter escale de una simple landing a una plataforma de automatización robusta, separamos tajantemente las capas siguiendo principios de **Clean Architecture**:

```text
                  +----------------------------------------------+
                  |                 Presentación                 |
                  |   Server Actions · REST Routes · Webhooks    |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |               Capa de Servicios              |
                  |        (LeadService, Result Pattern)         |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |            Capa de Repositorios              |
                  |   (ILeadRepository -> DrizzleLeadRepository) |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |             Infraestructura y BD             |
                  |     (PostgreSQL 18, postgres-js, Drizzle)    |
                  +----------------------------------------------+
```

## 2. Decisiones de Diseño

### D-01 · Patrón Repositorio y Servicio en `@mocter/domain`
- **Problema:** En el código original, `insertLead` residía directamente en `src/db/index.ts`, mezclando gestión de sockets de base de datos con consultas SQL y lógica de negocio.
- **Decisión:** 
  1. Definir la interfaz abstracta `ILeadRepository` con métodos atómicos (`create`, `findById`, `findByEmail`).
  2. Implementar `DrizzleLeadRepository` inyectando la instancia de base de datos.
  3. Crear `LeadService` que contenga la lógica de negocio (validación Zod `leadSchema`, control de errores, logging de dominio).
  4. La aplicación web interactúa únicamente con `LeadService`, nunca directamente con Drizzle ni con el cliente Postgres.

### D-02 · Result Pattern para Errores de Dominio
- **Problema:** Las excepciones no controladas (`throw new Error(...)`) de base de datos se propagaban hasta los controladores de Next.js.
- **Decisión:** Usar un tipo estándar:
  ```typescript
  export type Result<T, E = Error> =
    | { ok: true; data: T }
    | { ok: false; error: string; issues?: unknown; code?: string };
  ```
  Esto permite que la Server Action y la ruta REST consuman el mismo servicio y manejen el fallo de forma determinista y sin `try/catch` redundantes.

### D-03 · Logger Estructurado y Protección de Secretos
- **Problema:** `src/db/index.ts` realizaba `console.log([Database URL] ${url})`, exponiendo la contraseña de PostgreSQL.
- **Decisión:** Implementar un logger estructurado en `packages/domain/src/utils/logger.ts` que automáticamente aplique un filtro de expresiones regulares (redactor) sobre credenciales, tokens y contraseñas antes de enviar a `stdout`/`stderr`.

### D-04 · Dual Ingress: Server Action + REST API Route
- **Problema:** El formulario solo podía enviarse mediante Server Action de React.
- **Decisión:**
  - Crear `apps/web/app/api/leads/route.ts` (`POST /api/leads`).
  - Refactorizar `apps/web/app/actions/demo-request.ts` (`submitDemoRequest`).
  - Ambos invocan la misma instancia singleton `leadService.registerLead(payload)`.

### D-05 · Rate Limiting de Perímetro
- **Problema:** Exposición pública a bots o spam en formularios y endpoints REST.
- **Decisión:** Implementar un Rate Limiter en memoria basado en IP (Sliding Window o Token Bucket con limpieza automática de memoria). Límite inicial: 10 peticiones por minuto por IP para `POST /api/leads` y `submitDemoRequest`.

### D-06 · Healthcheck Multicapa
- **Problema:** Traefik y Docker consideran el contenedor sano si Node responde HTTP 200 en `/`, incluso si la base de datos está caída o bloqueada.
- **Decisión:** Exponer `/api/health`. Retorna HTTP 200 si `SELECT 1` responde exitosamente, con métricas de tiempo de respuesta; retorna HTTP 503 si la conexión falla.

## 3. Contratos de Datos e Interfaces

### `ILeadRepository`
```typescript
import type { Lead, LeadInput } from "../index";

export interface ILeadRepository {
  create(input: LeadInput): Promise<Lead>;
  findById(id: string): Promise<Lead | null>;
  findByEmail(email: string): Promise<Lead | null>;
}
```

### `LeadService`
```typescript
export interface RegisterLeadResult {
  ok: boolean;
  data?: Lead;
  error?: string;
  fieldErrors?: Record<string, string>;
}
```

### REST Endpoint: `POST /api/leads`
- **Request Body:**
  ```json
  {
    "name": "Juan Perez",
    "email": "juan@empresa.com",
    "phone": "+573001234567",
    "message": "Interesado en automatizar ventas"
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "ok": true,
    "lead": {
      "id": "uuid-generado",
      "createdAt": "2026-10-19T10:00:00.000Z"
    }
  }
  ```
- **Response 400 Bad Request:**
  ```json
  {
    "ok": false,
    "error": "Validation failed",
    "issues": [ ... ]
  }
  ```
- **Response 429 Too Many Requests:**
  ```json
  {
    "ok": false,
    "error": "Rate limit exceeded. Please try again later."
  }
  ```
