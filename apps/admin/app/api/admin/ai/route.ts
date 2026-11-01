import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminAiGovernanceOverview,
  updateAdminModelSpread,
  updateAdminPromptBlock,
  updateAdminBotDefaults,
} from "@mocter/domain";

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

    return NextResponse.json({ ok: false, error: "Acción no reconocida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
