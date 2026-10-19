"use server";

import { leadService } from "@mocter/domain";
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const issue of result.issues as any[]) {
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
      return { status: "idle", fieldErrors };
    }

    // Degradación elegante: mantiene la entrada del usuario, indicando fallo de persistencia
    return { status: "idle", fieldErrors: {}, reason: "db" };
  }

  return { status: "success", fieldErrors: {} };
}
