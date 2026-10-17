"use server";

import { leadSchema, insertLead } from "@mocter/domain";
import type { DemoFormState } from "./types";

export type { DemoFormState };

/** Kind of Zod issue → stable form code (validated input shape from `@mocter/domain`). */
function codeForIssue(code: string): string {
  switch (code) {
    case "invalid_type": // null/undefined when field missing
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

export async function submitDemoRequest(
  _prevState: DemoFormState,
  formData: FormData,
): Promise<DemoFormState> {
  const rawMessage = String(formData.get("message") ?? "").trim();

  const parsed = leadSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    // The domain schema transforms nullish/empty into null.
    message: rawMessage === "" ? null : rawMessage,
  });

  if (!parsed.success) {
    const fieldErrors: DemoFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
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

  try {
    await insertLead(parsed.data);
  } catch (err) {
    const errorDetails = err instanceof Error ? err.message : String(err);
    console.error(
      `[Server Action demo-request] Error al persistir lead en PostgreSQL: ${errorDetails}`,
    );
    // Graceful degradation: keep the user's input, never pretend it was saved.
    return { status: "idle", fieldErrors: {}, reason: "db" };
  }

  return { status: "success", fieldErrors: {} };
}
