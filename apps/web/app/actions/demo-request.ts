"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { leadService } from "@mocter/domain";
import { checkRateLimit } from "../../lib/rate-limit";
import { getRequestLogger } from "@/lib/logger";
import type { DemoFormState } from "./types";

export type { DemoFormState };

/**
 * Traduce el código de error devuelto por Zod a un identificador semántico estable para la interfaz de usuario.
 *
 * @param code - Código de problema emitido por el validador Zod.
 * @returns Cadena identificadora del error para mapear textos en el cliente ("required", "format", "max", "unknown").
 */
function codeForIssue(code: string): string {
  switch (code) {
    case "invalid_type": // null o undefined cuando falta un campo
    case "too_small":
      return "required";
    case "invalid_format":
      return "format";
    case "too_big":
      return "max";
    default:
      return "unknown";
  }
}

/**
 * Server Action para procesar el envío del formulario público de solicitud de demostración.
 *
 * Diseñada para integrarse de forma nativa con el hook `useActionState` de React 19.
 * Extrae los campos del objeto `FormData`, delega la validación y persistencia a {@link leadService}
 * y devuelve el estado del formulario garantizando degradación elegante (no pierde la entrada del usuario ante fallos de BD).
 *
 * @param _prevState - Estado anterior del formulario según {@link DemoFormState}.
 * @param formData - Datos crudos del formulario enviados desde el cliente.
 * @returns Promesa que resuelve al nuevo estado del formulario {@link DemoFormState}.
 *
 * @example
 * ```tsx
 * const [state, formAction, isPending] = useActionState(submitDemoRequest, demoRequestInitialState);
 * ```
 */
export async function submitDemoRequest(
  _prevState: DemoFormState,
  formData: FormData,
): Promise<DemoFormState> {
  const start = performance.now();
  const log = await getRequestLogger({ action: "submitDemoRequest" });

  // 1. Verificación de tasa por dirección IP (RF-04.2)
  try {
    const reqHeaders = await headers();
    const forwarded = reqHeaders.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      log.warn({ event: "lead.rate_limited", ip });
      return {
        status: "idle",
        fieldErrors: {},
        reason: "rate_limit",
      };
    }
  } catch {
    // Si se ejecuta fuera de contexto HTTP (por ejemplo en tests sin headers mockeados), continúa.
  }

  const rawMessage = String(formData.get("message") ?? "").trim();

  const rawPayload = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    // El esquema de dominio transforma cadenas vacías a null.
    message: rawMessage === "" ? null : rawMessage,
  };

  const result = await leadService.registerLead(rawPayload);

  if (!result.ok) {
    if (result.code === "VALIDATION_ERROR" && Array.isArray(result.issues)) {
      const fieldErrors: DemoFormState["fieldErrors"] = {};
      for (const issue of result.issues as Array<{ path: (string | number)[]; code: string }>) {
        const field = issue.path[0];
        const code = codeForIssue(issue.code);
        if (field === "name") {
          fieldErrors.name = "required";
        } else if (field === "email") {
          fieldErrors.email = code === "required" ? "required" : "email";
        } else if (field === "phone") {
          fieldErrors.phone = code === "required" ? "required" : "phone";
        } else if (field === "message") {
          fieldErrors.message = "max";
        }
      }

      log.warn({
        event: "lead.validation_failed",
        fieldErrors,
        durationMs: Math.round(performance.now() - start),
      });

      return { status: "idle", fieldErrors };
    }

    log.error({
      event: "lead.persistence_failed",
      code: result.code,
      durationMs: Math.round(performance.now() - start),
    });

    // Degradación elegante: mantiene la entrada del usuario, indicando fallo de persistencia
    return { status: "idle", fieldErrors: {}, reason: "db" };
  }

  // Telemetría no bloqueante post-respuesta
  const emitSuccessTelemetry = () => {
    try {
      log.info({
        event: "lead.registered_successfully",
        durationMs: Math.round(performance.now() - start),
      });
    } catch {
      // El fallo de logging jamás interrumpe la respuesta
    }
  };

  try {
    after(emitSuccessTelemetry);
  } catch {
    // Si se ejecuta fuera del contexto de petición de Next.js (ej. testing unitario en vitest)
    emitSuccessTelemetry();
  }

  return { status: "success", fieldErrors: {} };
}

