# API-001 · Requisitos · Documentación OpenAPI (Swagger) de APIs en Mocter

| Atributo | Valor |
|---|---|
| ID | API-001 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-19 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |

## 1. Propósito

Establecer un estándar técnico unificado y automatizado para documentar las interfaces de programación de aplicaciones (APIs REST) de la plataforma Mocter bajo el estándar **OpenAPI v3.1 / Swagger**. La especificación debe generarse automáticamente a partir de esquemas tipados (Zod) en tiempo de ejecución o compilación, evitando divergencias entre código y documentación, y ofreciendo tanto un endpoint JSON canónico como una interfaz interactiva de exploración.

## 2. Alcance

### Incluye
- **Generación Automática de Especificación OpenAPI 3.1**:
  - Definición centralizada del registro OpenAPI en `apps/web` (`apps/web/lib/openapi.ts` o módulo homólogo).
  - Integración directa con los esquemas de validación Zod de `@mocter/domain` y `apps/web`.
  - Mapeo de contratos para todos los Route Handlers existentes:
    - `GET /api/health`: Estado de salud del sistema y conectividad a base de datos.
    - `POST /api/leads`: Registro y validación de prospectos de clientes.
- **Exposición Pública de la Documentación**:
  - Endpoint HTTP `GET /api/openapi.json`: Retorna el documento OpenAPI 3.1 serializado en formato JSON.
  - Interfaz web interactiva `GET /api-docs`: Página web en Next.js App Router que visualiza y permite probar los endpoints (utilizando `@scalar/api-reference-react` o Swagger UI embebido).
- **Acceso y Configuración**:
  - Acceso público en desarrollo y producción sin requerir autenticación previa.
  - Exclusión explícita de `/api-docs` y `/api/openapi.json` del middleware de prefijo de internacionalización de `next-intl` (si aplica).
- **Pruebas y Verificación**:
  - Pruebas unitarias e integración que verifiquen la validez del esquema OpenAPI generado y la respuesta exitosa de los endpoints.

### Excluye
- Documentación de Server Actions (reservado a Route Handlers HTTP REST).
- Autenticación JWT / OAuth2 para las rutas de documentación.
- Modificación de esquemas de base de datos o lógica de negocio existente.

## 3. Actores

| Actor | Rol |
|---|---|
| Desarrollador Frontend / Mobile | Consulta la documentación OpenAPI y prueba endpoints vía Swagger/Scalar UI |
| Integrador Externo / Cliente | Consume la especificación `/api/openapi.json` para generar SDKs o validar contratos |
| Orquestador CI/CD / QA | Ejecuta suites de pruebas para verificar que el esquema OpenAPI sea válido |

## 4. Requisitos Funcionales

### RF-01 · Registro y Generación del Esquema OpenAPI
| ID | Requisito |
|---|---|
| RF-01.1 | Debe existir un generador OpenAPI en `apps/web` que ensamble la metadata del sistema (título, versión, descripción, servidores) y registre los paths y schemas. |
| RF-01.2 | El endpoint `GET /api/health` debe estar documentado con sus posibles respuestas (200 OK y 503 Service Unavailable). |
| RF-01.3 | El endpoint `POST /api/leads` debe estar documentado con su schema de entrada (`leadSchema`), respuesta exitosa (201 Created) y errores de validación (400 Bad Request) o limitación de tasa (429 Too Many Requests). |

### RF-02 · Endpoints y Visualización
| ID | Requisito |
|---|---|
| RF-02.1 | Debe exponerse la ruta `GET /api/openapi.json` devolviendo un objeto OpenAPI 3.1 válido con cabecera `Content-Type: application/json`. |
| RF-02.2 | Debe exponerse una página en `apps/web/app/api-docs/page.tsx` que renderice la interfaz interactiva para explorar y ejecutar peticiones a la API. |
| RF-02.3 | La interfaz interactiva debe consumir directamente la especificación provista por `/api/openapi.json`. |

## 5. Criterios de Aceptación

1. `GET /api/openapi.json` responde con código HTTP 200 y un JSON que contiene los tags `info`, `paths`, `/api/health`, y `/api/leads`.
2. La página `/api-docs` se renderiza sin errores de cliente ni servidor en Next.js 16 con React 19.
3. El middleware de `next-intl` no intercepta ni redirige `/api-docs` o `/api/openapi.json` con prefijos de idioma no deseados.
4. Las pruebas automatizadas `pnpm test` en `apps/web` pasan al 100% incluyendo la validación del esquema OpenAPI.
