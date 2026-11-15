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

interface ChatwootActor {
  id?: number;
  name?: string;
  phone_number?: string;
  email?: string;
  type?: string;
}

/**
 * Estructura tipada esperada de eventos omnicanal de webhook emitidos por Chatwoot.
 */
interface ChatwootWebhookPayload {
  event?: string;
  account?: { id?: number };
  account_id?: number;
  id?: number;
  name?: string;
  phone_number?: string;
  email?: string;
  channel?: string;
  created_at?: string | number;
  message_type?: string | number;
  sender?: ChatwootActor;
  contact?: ChatwootActor;
  meta?: { sender?: ChatwootActor };
  inbox?: { channel_type?: string };
  conversation?: {
    channel?: string;
    created_at?: string | number;
    last_activity_at?: string | number;
    meta?: { sender?: ChatwootActor };
  };
}

function parseChatwootTimestamp(raw: string | number | undefined): Date | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1_000_000_000_000 ? raw * 1000 : raw;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const numeric = Number(raw);
    if (!Number.isNaN(numeric) && /^\d+(\.\d+)?$/.test(raw.trim())) {
      const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function extractChatwootContact(payload: ChatwootWebhookPayload): ChatwootActor | undefined {
  const isMessageEvent =
    payload.event === "message_created" || payload.event === "message_updated";

  if (isMessageEvent) {
    const convSender = payload.conversation?.meta?.sender ?? payload.meta?.sender ?? payload.contact;
    const msgSender =
      payload.sender && payload.sender.type !== "user" ? payload.sender : undefined;
    const resolved = msgSender ?? convSender;
    if (resolved && typeof resolved.id === "number") {
      return resolved;
    }
    if (convSender && typeof convSender.id === "number") {
      return convSender;
    }
    return undefined;
  }

  const metaSender = payload.conversation?.meta?.sender ?? payload.meta?.sender;
  const sender = payload.sender?.type !== "user" ? payload.sender : undefined;

  if (payload.contact && typeof payload.contact.id === "number") {
    return payload.contact;
  }
  if (sender && typeof sender.id === "number") {
    return sender;
  }
  if (metaSender && typeof metaSender.id === "number") {
    return metaSender;
  }
  if (typeof payload.id === "number") {
    return {
      id: payload.id,
      name: payload.name,
      phone_number: payload.phone_number,
      email: payload.email,
    };
  }
  return undefined;
}

/**
 * Generador del Route Handler omnicanal de webhooks de Chatwoot con inyección de dependencias.
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

      // 2. Extraer datos omnicanal de contacto y tipo de mensaje
      const contact = extractChatwootContact(payload);
      const contactId = contact?.id;

      if (typeof contactId !== "number") {
        return NextResponse.json({ ok: true, status: "ignored_no_contact" }, { status: 200 });
      }

      const isIncomingMessage =
        payload.message_type === "incoming" || payload.message_type === 0;
      const messageTimestamp = parseChatwootTimestamp(
        payload.created_at ?? payload.conversation?.last_activity_at ?? payload.conversation?.created_at,
      );
      const channel =
        payload.conversation?.channel ?? payload.inbox?.channel_type ?? payload.channel ?? "whatsapp";

      const fallbackName =
        payload.event === "message_created" || payload.event === "message_updated"
          ? contact?.name
          : (payload.name ?? contact?.name);
      const name = (fallbackName ?? "").trim() || `Contacto Chatwoot #${contactId}`;
      const phoneMobile =
        (contact?.phone_number ?? (payload.event?.startsWith("message_") ? undefined : payload.phone_number) ?? "").trim() ||
        undefined;
      const email =
        (contact?.email ?? (payload.event?.startsWith("message_") ? undefined : payload.email) ?? "").trim() ||
        undefined;

      // 3. Delegar ingesta omnicanal idempotente al CrmService en la celda correspondiente
      const ingestionResult = await crmService.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: contactId,
        name,
        phoneMobile,
        email,
        channel,
        isIncomingMessage,
        messageTimestamp,
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
          isWhatsapp: ingestionResult.data.isWhatsapp,
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
 * Route Handler receptor omnicanal de webhooks de Chatwoot en mocter-admin (CRM-001 / SPEC-09).
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/webhooks/chatwoot`
 */
export const POST = createChatwootWebhookHandler();
