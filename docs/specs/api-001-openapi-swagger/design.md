# API-001 · Diseño Técnico · Documentación OpenAPI (Swagger) de APIs en Mocter

| Atributo | Valor |
|---|---|
| ID | API-001 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-19 |
| Documentos | [`requirements.md`](requirements.md) · `design.md` (este) · [`tasks.md`](tasks.md) |

## 1. Arquitectura y Decisiones de Diseño

### 1.1 Librería de Generación: `@asteasolutions/zod-to-openapi`
Para cumplir con el principio de única fuente de verdad (Single Source of Truth), los esquemas de validación Zod existentes (`leadSchema`, etc.) se extenderán con metadatos de OpenAPI mediante `@asteasolutions/zod-to-openapi`.
Esta librería:
- Es totalmente compatible con Zod y TypeScript 5.x.
- Permite registrar rutas (`OpenAPIRegistry.registerPath`) con descripción, tags, parámetros, payloads de petición y esquemas de respuesta tipados.
- Produce un documento estándar OpenAPI v3.1 listo para ser consumido por visores o generadores de clientes.

### 1.2 Librería de Visualización: Scalar (`@scalar/api-reference-react`)
Para la interfaz interactiva en `apps/web/app/api-docs/page.tsx`, se selecciona **Scalar** (`@scalar/api-reference-react` o embebido en cliente), por las siguientes ventajas técnicas:
- Soporte nativo y probado para React 19 y Next.js App Router.
- Diseño visual moderno, responsivo y modo oscuro sincronizado que se integra orgánicamente con la estética de Mocter.
- Menor sobrecarga de bundles y mayor velocidad de carga frente a las librerías tradicionales de Swagger UI en React 19.

### 1.3 Estructura de Módulos en `apps/web`

```text
apps/web/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts
│   │   ├── leads/
│   │   │   └── route.ts
│   │   └── openapi.json/
│   │       └── route.ts              # Route Handler que expone la spec OpenAPI generada
│   └── api-docs/
│       └── page.tsx                  # Página cliente/servidor que renderiza Scalar API Reference
├── lib/
│   └── openapi.ts                    # Registry centralizado con definiciones de rutas y esquemas
```

### 1.4 Compatibilidad con `middleware.ts`
El middleware de `next-intl` intercepta rutas por defecto para anteponer el locale (`/es`, `/en`).
Actualmente, el matcher está configurado como:
```ts
matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
```
Dado que `/api-docs` no inicia con `/api`, debe incluirse en la lista de exclusiones del middleware o montarse como una ruta no internacionalizada para que no redirija a `/es/api-docs`.
Ajuste en `middleware.ts`:
```ts
matcher: ["/((?!api|api-docs|_next|_vercel|.*\\..*).*)"]
```

## 2. Contratos de Rutas y Esquemas OpenAPI

### 2.1 Metadata General
- **Título**: `Mocter API`
- **Versión**: `1.0.0`
- **Descripción**: APIs públicas y de integración de la plataforma empresarial Mocter.
- **Servidores**:
  - Local: `http://localhost:3000` (o `http://localhost:3001` según el puerto del host)
  - Producción: `https://mocter.co`

### 2.2 Endpoints Registrados
1. `GET /api/health`
   - **Tag**: `Sistema`
   - **Resumen**: Chequeo de salud del servicio y conectividad con PostgreSQL.
   - **Respuestas**:
     - `200`: Base de datos operativa y contenedor saludable (`{ status: "ok", timestamp, database: { connected: true, latencyMs } }`).
     - `503`: Fallo de conectividad a la base de datos (`{ status: "unhealthy", ... }`).

2. `POST /api/leads`
   - **Tag**: `Prospectos`
   - **Resumen**: Registro y validación de una nueva solicitud de demostración / contacto.
   - **Cuerpo**: `LeadInput` (nombre, email, teléfono, mensaje opcional).
   - **Respuestas**:
     - `201`: Prospecto registrado exitosamente (`{ ok: true, data: { id, name, ... } }`).
     - `400`: Error de validación en los campos del cuerpo (`{ ok: false, error, issues }`).
     - `429`: Límite de tasa de solicitudes excedido (`{ ok: false, error: "Demasiadas solicitudes..." }`).
     - `500`: Error interno del servidor al procesar la solicitud.

## 3. Consideraciones de Rendimiento y Seguridad
- La especificación OpenAPI se genera en memoria de forma perezosa (lazy singleton) y se cachea durante el ciclo de vida del proceso de Node.js.
- No se exponen credenciales, variables de entorno sensibles ni estructuras de bases de datos internas no expuestas por los contratos públicos.
