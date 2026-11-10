import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const createContactSchema = z.object({
  fullName: z.string().min(2, "El nombre completo debe tener al menos 2 caracteres."),
  email: z.string().email("Correo electrónico no válido.").nullable().optional(),
  phoneMobile: z.string().nullable().optional(),
  documentType: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  stage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const contacts = await tenantWorkspaceService.getContacts(auth.clientId);
    return NextResponse.json({ ok: true, data: contacts }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/contacts Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al listar contactos.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message || "Datos de contacto inválidos.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const created = await tenantWorkspaceService.createContact(auth.clientId, parsed.data, actor);
    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[POST /api/tenant/contacts Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/contact-creation-failed",
        title: "Contact Creation Failed",
        status: 400,
        detail: msg || "Error al crear el contacto.",
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

