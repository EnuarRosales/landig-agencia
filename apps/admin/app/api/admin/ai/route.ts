import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminAiGovernanceOverview,
  updateAdminModelSpread,
  updateAdminPromptBlock,
  updateAdminBotDefaults,
  saveAdminPlatformTrialKey,
  updateAdminPlatformKeySettings,
  setAdminPlatformKeyPriority,
  retireAdminPlatformTrialKey,
  createAdminAiProvider,
  updateAdminAiProvider,
  deleteAdminAiProvider,
  createAdminAiModel,
  updateAdminAiModel,
  deleteAdminAiModel,
  saveAdminAssistPromptVersion,
  appLogger,
} from "@mocter/domain";

function mapAdminAiErrorStatus(code?: string): number {
  switch (code) {
    case "AI_RESOURCE_IN_ACTIVE_USE":
    case "AI_PROVIDER_CODE_EXISTS":
    case "AI_MODEL_EXISTS":
      return 409;
    case "NOT_FOUND":
    case "AI_PROVIDER_NOT_FOUND":
    case "AI_MODEL_NOT_FOUND":
    case "MODEL_NOT_FOUND":
      return 404;
    case "AI_KEY_INVALID":
      return 422;
    default:
      return 400;
  }
}

/**
 * Route Handler para gobernanza de IA, modelos LLM y biblioteca de prompts maestros (BOT-001, BOT-002, AI-001).
 */
export async function GET(): Promise<NextResponse> {
  const overview = await fetchAdminAiGovernanceOverview();
  return NextResponse.json({ ok: true, data: overview });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.action === "update_model_spread") {
      if (!body.modelId || body.spreadPercent === undefined) {
        return NextResponse.json(
          { ok: false, error: "Identificador de modelo y margen (spread) son requeridos" },
          { status: 400 },
        );
      }

      const result = await updateAdminModelSpread({
        modelId: body.modelId,
        spreadPercent: Number(body.spreadPercent),
        isActive: body.isActive,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "save_prompt_block") {
      if (!body.blockKey || !body.contentEs) {
        return NextResponse.json(
          { ok: false, error: "Clave de bloque y contenido en español son requeridos" },
          { status: 400 },
        );
      }

      const result = await updateAdminPromptBlock({
        blockKey: body.blockKey,
        contentEs: body.contentEs,
        contentEn: body.contentEn || body.contentEs,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "update_defaults") {
      const result = await updateAdminBotDefaults({
        defaultMaxTurns: body.defaultMaxTurns ? Number(body.defaultMaxTurns) : undefined,
        defaultAnswerPolicy: body.defaultAnswerPolicy,
        defaultHandoffTriggers: Array.isArray(body.defaultHandoffTriggers) ? body.defaultHandoffTriggers : undefined,
        defaultMaxMessagesPerContact: body.defaultMaxMessagesPerContact ? Number(body.defaultMaxMessagesPerContact) : undefined,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "save_platform_key") {
      if (!body.providerCode || !body.apiKey) {
        return NextResponse.json(
          { ok: false, error: "Proveedor LLM y clave API son obligatorios" },
          { status: 400 },
        );
      }

      const result = await saveAdminPlatformTrialKey({
        providerCode: body.providerCode,
        modelId: body.modelId || null,
        apiKey: String(body.apiKey),
        keyId: typeof body.keyId === "string" ? body.keyId : undefined,
        monthlyTokenCap:
          body.monthlyTokenCap !== undefined &&
          body.monthlyTokenCap !== null &&
          body.monthlyTokenCap !== ""
            ? Number(body.monthlyTokenCap)
            : null,
        temperature:
          body.temperature !== undefined &&
          body.temperature !== null &&
          body.temperature !== ""
            ? Number(body.temperature)
            : undefined,
        maxTokens:
          body.maxTokens !== undefined &&
          body.maxTokens !== null &&
          body.maxTokens !== ""
            ? Number(body.maxTokens)
            : undefined,
        priorityRole:
          body.priorityRole !== undefined ? body.priorityRole : "primary",
        verifyImmediately: body.verifyImmediately !== false,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "update_platform_key_settings") {
      if (!body.platformKeyId) {
        return NextResponse.json(
          { ok: false, error: "Identificador de credencial de plataforma es obligatorio" },
          { status: 400 },
        );
      }

      const result = await updateAdminPlatformKeySettings({
        platformKeyId: String(body.platformKeyId),
        modelId: body.modelId !== undefined ? body.modelId : undefined,
        temperature:
          body.temperature !== undefined ? Number(body.temperature) : undefined,
        maxTokens:
          body.maxTokens !== undefined ? Number(body.maxTokens) : undefined,
        monthlyTokenCap:
          body.monthlyTokenCap !== undefined
            ? body.monthlyTokenCap === null || body.monthlyTokenCap === ""
              ? null
              : Number(body.monthlyTokenCap)
            : undefined,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "set_platform_key_priority") {
      if (!body.platformKeyId || !body.priorityRole) {
        return NextResponse.json(
          { ok: false, error: "Identificador de llave y prioridad son obligatorios" },
          { status: 400 },
        );
      }

      const result = await setAdminPlatformKeyPriority({
        platformKeyId: String(body.platformKeyId),
        priorityRole: body.priorityRole,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "create_provider") {
      const result = await createAdminAiProvider({
        code: String(body.code ?? ""),
        name: String(body.name ?? ""),
        apiDialect: body.apiDialect ?? "openai_compatible",
        baseUrl: String(body.baseUrl ?? ""),
        verifyPath: typeof body.verifyPath === "string" ? body.verifyPath : undefined,
        docsUrl: typeof body.docsUrl === "string" ? body.docsUrl : null,
        logoStorageKey:
          typeof body.logoStorageKey === "string" ? body.logoStorageKey : null,
        isActive: body.isActive !== false,
        supportedModes: body.supportedModes,
        sortOrder:
          body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "update_provider") {
      if (!body.providerId) {
        return NextResponse.json(
          { ok: false, error: "Identificador del proveedor es obligatorio" },
          { status: 400 },
        );
      }

      const result = await updateAdminAiProvider({
        providerId: String(body.providerId),
        name: typeof body.name === "string" ? body.name : undefined,
        apiDialect: body.apiDialect,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        verifyPath: typeof body.verifyPath === "string" ? body.verifyPath : undefined,
        docsUrl: body.docsUrl,
        logoStorageKey: body.logoStorageKey,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        supportedModes: body.supportedModes,
        sortOrder:
          body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "delete_provider") {
      if (!body.providerId) {
        return NextResponse.json(
          { ok: false, error: "Identificador del proveedor es obligatorio" },
          { status: 400 },
        );
      }

      const result = await deleteAdminAiProvider({
        providerId: String(body.providerId),
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "create_model") {
      const result = await createAdminAiModel({
        providerId: String(body.providerId ?? ""),
        modelId: String(body.modelId ?? ""),
        displayName: String(body.displayName ?? ""),
        contextWindow:
          body.contextWindow !== undefined ? Number(body.contextWindow) : undefined,
        maxOutputTokens:
          body.maxOutputTokens !== undefined
            ? Number(body.maxOutputTokens)
            : undefined,
        defaultTemperature:
          body.defaultTemperature !== undefined
            ? Number(body.defaultTemperature)
            : undefined,
        defaultMaxTokens:
          body.defaultMaxTokens !== undefined
            ? Number(body.defaultMaxTokens)
            : undefined,
        isDefault: Boolean(body.isDefault),
        isActive: body.isActive !== false,
        recommendedUse: body.recommendedUse,
        spreadPercent:
          body.spreadPercent !== undefined ? Number(body.spreadPercent) : undefined,
        costInputMtokUsdCents:
          body.costInputMtokUsdCents !== undefined
            ? Number(body.costInputMtokUsdCents)
            : undefined,
        costOutputMtokUsdCents:
          body.costOutputMtokUsdCents !== undefined
            ? Number(body.costOutputMtokUsdCents)
            : undefined,
        sortOrder:
          body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "update_model") {
      if (!body.id) {
        return NextResponse.json(
          { ok: false, error: "Identificador del modelo es obligatorio" },
          { status: 400 },
        );
      }

      const result = await updateAdminAiModel({
        id: String(body.id),
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        contextWindow:
          body.contextWindow !== undefined ? Number(body.contextWindow) : undefined,
        maxOutputTokens:
          body.maxOutputTokens !== undefined
            ? Number(body.maxOutputTokens)
            : undefined,
        defaultTemperature:
          body.defaultTemperature !== undefined
            ? Number(body.defaultTemperature)
            : undefined,
        defaultMaxTokens:
          body.defaultMaxTokens !== undefined
            ? Number(body.defaultMaxTokens)
            : undefined,
        isDefault: typeof body.isDefault === "boolean" ? body.isDefault : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        recommendedUse: body.recommendedUse,
        spreadPercent:
          body.spreadPercent !== undefined ? Number(body.spreadPercent) : undefined,
        costInputMtokUsdCents:
          body.costInputMtokUsdCents !== undefined
            ? Number(body.costInputMtokUsdCents)
            : undefined,
        costOutputMtokUsdCents:
          body.costOutputMtokUsdCents !== undefined
            ? Number(body.costOutputMtokUsdCents)
            : undefined,
        sortOrder:
          body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "delete_model") {
      if (!body.id) {
        return NextResponse.json(
          { ok: false, error: "Identificador del modelo es obligatorio" },
          { status: 400 },
        );
      }

      const result = await deleteAdminAiModel({
        id: String(body.id),
      });

      if (!result.ok) {
        const status = mapAdminAiErrorStatus(result.code);
        return NextResponse.json(
          { ok: false, error: result.error, detail: result.error, code: result.code },
          { status },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "retire_platform_key") {
      if (!body.platformKeyId) {
        return NextResponse.json(
          { ok: false, error: "Identificador de credencial de plataforma es obligatorio" },
          { status: 400 },
        );
      }

      const result = await retireAdminPlatformTrialKey({
        platformKeyId: String(body.platformKeyId),
      });

      if (!result.ok) {
        const status = result.code === "NOT_FOUND" ? 404 : 400;
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status });
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    if (body.action === "save_assist_prompt") {
      if (!body.fieldKey || !body.masterPrompt) {
        return NextResponse.json(
          { ok: false, error: "Clave de campo y prompt maestro son obligatorios" },
          { status: 400 },
        );
      }

      const result = await saveAdminAssistPromptVersion({
        fieldKey: String(body.fieldKey),
        masterPrompt: String(body.masterPrompt),
        inputHint: typeof body.inputHint === "string" ? body.inputHint : undefined,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    return NextResponse.json({ ok: false, error: "Acción no reconocida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appLogger.error("[api/admin/ai] Error procesando solicitud de gobernanza AI", { error: msg });
    return NextResponse.json({ ok: false, error: "No fue posible procesar la operación solicitada" }, { status: 500 });
  }
}
