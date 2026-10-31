import { NextRequest, NextResponse } from "next/server";
import {
  CrmService,
  DrizzleCrmRepository,
  DrizzleClientsRepository,
  appLogger,
} from "@mocter/domain";

const defaultClientsRepo = new DrizzleClientsRepository();
const defaultCrmRepo = new DrizzleCrmRepository();
const defaultCrmService = new CrmService(defaultCrmRepo);

/**
 * Estructura tipada esperada de eventos de webhook emitidos por Chatwoot.
 */
interface ChatwootWebhookPayload {
  account?: { id?: number };
  account_id?: number;
  id?: number;
  name?: string;
  phone_number?: string;
  email?: string;
  sender?: { id?: number; name?: string; phone_number?: string; email?: string };
  meta?: { sender?: { id?: number; name?: string; phone_number?: string; email?: string } };
  inbox?: { channel_type?: string };
}

/**
 * Generador del Route Handler de webhooks de Chatwoot con inyección de dependencias.
 */
export function createChatwootWebhookHandler(
  clientsRepo: Pick<DrizzleClientsRepository, "findTenantByChatwootAccountId"> = defaultClientsRepo,
  crmService: Pick<CrmService, "ingestFromChatwoot"> = defaultCrmService,
) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    try {
      let payload: ChatwootWebhookPayload;
      try {
        payload = (await req.json()) as ChatwootWebhookPayload;
      } catch {
        return NextResponse.json(
          { ok: false, error: "El cuerpo de la solicitud no es un JSON válido." },
          { status: 400 },
        );
      }

      const accountId = payload?.account?.id ?? payload?.account_id;
      if (typeof accountId !== "number") {
        appLogger.warn("[ChatwootWebhook] Petición descartada: falta account.id numérico", { payload });
        return NextResponse.json(
          { ok: false, error: "Falta el identificador numérico de cuenta (account.id)." },
          { status: 400 },
        );
      }

      // 1. Resolver inquilino y celda en el Router Global
      const tenantRouting = await clientsRepo.findTenantByChatwootAccountId(accountId);
      if (!tenantRouting) {
        appLogger.warn("[ChatwootWebhook] Cuenta de Chatwoot no mapeada en Mocter Router", { accountId });
        return NextResponse.json({ ok: true, status: "ignored_unknown_account" }, { status: 200 });
      }

      const { clientId, cellId } = tenantRouting;

      // 2. Extraer datos de contacto de la carga útil multicanal
      const sender = payload?.sender ?? payload?.meta?.sender;
      const contactId = payload?.id ?? sender?.id;

      if (typeof contactId !== "number") {
        return NextResponse.json({ ok: true, status: "ignored_no_contact" }, { status: 200 });
      }

      const name = (payload?.name ?? sender?.name ?? "").trim() || `Contacto Chatwoot #${contactId}`;
      const phoneMobile = (payload?.phone_number ?? sender?.phone_number ?? "").trim() || undefined;
      const email = (payload?.email ?? sender?.email ?? "").trim() || undefined;
      const channel = payload?.inbox?.channel_type ?? "whatsapp";

      // 3. Delegar ingesta idempotente al CrmService en la celda correspondiente
      const ingestionResult = await crmService.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: contactId,
        name,
        phoneMobile,
        email,
        channel,
        executedBy: "chatwoot-webhook",
      });

      if (!ingestionResult.ok) {
        appLogger.error("[ChatwootWebhook] Error al procesar ingesta en celda", {
          clientId,
          cellId,
          contactId,
          error: ingestionResult.error,
        });
        return NextResponse.json(
          { ok: false, error: ingestionResult.error },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          ok: true,
          action: ingestionResult.data.action,
          duplicateWarning: ingestionResult.data.duplicateWarning ?? false,
        },
        { status: 200 },
      );
    } catch (error: unknown) {
      appLogger.error("[ChatwootWebhook] Error no controlado en Route Handler", { error });
      return NextResponse.json(
        { ok: false, error: "Error interno al procesar webhook de Chatwoot." },
        { status: 500 },
      );
    }
  };
}

/**
 * Route Handler receptor de webhooks de Chatwoot en mocter-admin (CRM-001 §5, T-04, T-08).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/webhooks/chatwoot`
 */
export const POST = createChatwootWebhookHandler();
