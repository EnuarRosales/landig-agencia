import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extender Zod con las capacidades de OpenAPI
extendZodWithOpenApi(z);

/**
 * Registro unificado para la especificación OpenAPI de Mocter.
 */
export const registry = new OpenAPIRegistry();

/**
 * Esquema de respuesta para el estado de la base de datos en Healthcheck.
 */
const DatabaseHealthSchema = z
  .object({
    status: z.enum(["up", "down"]).openapi({ example: "up", description: "Estado operativo de la base de datos" }),
    latencyMs: z.number().openapi({ example: 4.2, description: "Latencia en milisegundos de la consulta ping" }),
    error: z.string().optional().openapi({ example: "Connection timeout", description: "Detalle del error si falló" }),
  })
  .openapi("DatabaseHealth");

/**
 * Esquema de respuesta del endpoint de Healthcheck.
 */
const HealthResponseSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy"]).openapi({ example: "healthy" }),
    timestamp: z.string().datetime().openapi({ example: "2026-10-19T18:00:00.000Z" }),
    services: z.object({
      database: DatabaseHealthSchema,
    }),
  })
  .openapi("HealthResponse");

/**
 * Esquema del cuerpo de entrada para registro de prospectos (Lead).
 */
export const LeadInputSchema = z
  .object({
    name: z.string().min(1).max(120).openapi({
      example: "Carlos Restrepo",
      description: "Nombre completo del prospecto",
    }),
    email: z.string().email().openapi({
      example: "carlos@empresa.com",
      description: "Correo electrónico corporativo o personal de contacto",
    }),
    phone: z.string().min(7).max(20).openapi({
      example: "+573001234567",
      description: "Número telefónico o de WhatsApp con prefijo internacional",
    }),
    message: z.string().max(2000).nullish().openapi({
      example: "Solicito información sobre la automatización de citas con IA.",
      description: "Mensaje o requerimiento opcional del prospecto",
    }),
  })
  .openapi("LeadInput");

/**
 * Esquema de la entidad Lead persistida.
 */
export const LeadEntitySchema = z
  .object({
    id: z.number().int().openapi({ example: 101, description: "Identificador único secuencial" }),
    name: z.string().openapi({ example: "Carlos Restrepo" }),
    email: z.string().openapi({ example: "carlos@empresa.com" }),
    phone: z.string().openapi({ example: "+573001234567" }),
    message: z.string().nullable().openapi({ example: "Solicito información sobre la automatización de citas con IA." }),
    createdAt: z.string().openapi({ example: "2026-10-19T18:00:00.000Z" }),
  })
  .openapi("LeadEntity");

/**
 * Esquema de respuesta exitosa de creación de prospecto.
 */
const LeadSuccessResponseSchema = z
  .object({
    ok: z.literal(true),
    data: LeadEntitySchema,
  })
  .openapi("LeadSuccessResponse");

/**
 * Esquema de error estándar de la API.
 */
const ErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    error: z.string().openapi({ example: "Error de validación" }),
    code: z.string().optional().openapi({ example: "VALIDATION_ERROR" }),
    issues: z.unknown().optional(),
  })
  .openapi("ErrorResponse");

// ==========================================
// REGISTRO DE RUTAS (PATHS)
// ==========================================

// 1. GET /api/health
registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["Sistema"],
  summary: "Monitoreo de salud del sistema y conectividad a base de datos",
  description:
    "Ruta pública para verificar el estado de la aplicación y la conexión activa con la base de datos PostgreSQL. Utilizada por sondas Docker, Traefik y Kubernetes.",
  responses: {
    200: {
      description: "El sistema y la base de datos están saludables",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: "La base de datos o el sistema no se encuentran disponibles",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

// 2. POST /api/leads
registry.registerPath({
  method: "post",
  path: "/api/leads",
  tags: ["Prospectos (Leads)"],
  summary: "Registrar una nueva solicitud de demostración o prospecto",
  description:
    "Permite registrar un prospecto en la base de datos aplicando validación Zod y limitación de tasa por IP.",
  request: {
    body: {
      description: "Datos de contacto del prospecto a registrar",
      required: true,
      content: {
        "application/json": {
          schema: LeadInputSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Prospecto registrado exitosamente",
      content: {
        "application/json": {
          schema: LeadSuccessResponseSchema,
        },
      },
    },
    400: {
      description: "Cuerpo de solicitud inválido o error en campos requeridos",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    429: {
      description: "Límite de tasa por dirección IP excedido (10 req/min)",
      headers: {
        "Retry-After": {
          description: "Segundos de espera antes de reintentar",
          schema: { type: "integer", example: 60 },
        },
      },
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Error interno del servidor o fallo de persistencia",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

/**
 * Función que genera y retorna la especificación OpenAPI 3.1.0 completa.
 *
 * @returns Documento OpenAPI en formato objeto JavaScript serializable a JSON.
 */
export function getOpenApiSpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Mocter API",
      version: "1.0.0",
      description:
        "Documentación oficial e interactiva de las APIs REST de Mocter — Plataforma Empresarial de Automatización con IA.",
      contact: {
        name: "Soporte Técnico Mocter",
        email: "info@mocter.co",
        url: "https://mocter.co",
      },
      license: {
        name: "Propiedad de Mocter",
      },
    },
    servers: [
      {
        url: "/",
        description: "Servidor actual (relativo)",
      },
      {
        url: "http://localhost:3000",
        description: "Entorno de desarrollo local (puerto por defecto)",
      },
      {
        url: "http://localhost:3001",
        description: "Entorno de desarrollo local (puerto alterno Docker)",
      },
      {
        url: "https://mocter.co",
        description: "Servidor de producción oficial",
      },
    ],
  });
}
