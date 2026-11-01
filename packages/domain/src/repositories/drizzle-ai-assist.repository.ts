import { eq, and, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { aiAssistFields, aiAssistPrompts, type AiAssistField, type AiAssistPrompt } from "../db/schemas/admin/ai-assist";
import type { IAiAssistRepository } from "./ai-assist.repository.interface";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Implementación Drizzle del repositorio para AI Assist (AI-001 RF-02).
 */
export class DrizzleAiAssistRepository implements IAiAssistRepository {
  constructor(private readonly db: PostgresJsDatabase<Record<string, unknown>>) {}

  async getAllFields(): Promise<AiAssistField[]> {
    return this.db
      .select()
      .from(aiAssistFields)
      .orderBy(aiAssistFields.fieldKey) as unknown as Promise<AiAssistField[]>;
  }

  async getActiveFields(): Promise<AiAssistField[]> {
    return this.db
      .select()
      .from(aiAssistFields)
      .where(eq(aiAssistFields.isActive, true)) as unknown as Promise<AiAssistField[]>;
  }

  async listPromptsByFieldKey(fieldKey: string): Promise<AiAssistPrompt[]> {
    return this.db
      .select()
      .from(aiAssistPrompts)
      .where(eq(aiAssistPrompts.fieldKey, fieldKey))
      .orderBy(sql`version DESC`) as unknown as Promise<AiAssistPrompt[]>;
  }

  async getNextVersionForField(fieldKey: string): Promise<number> {
    const rows = await this.db
      .select({ maxVersion: sql<number>`coalesce(max(version), 0)::int` })
      .from(aiAssistPrompts)
      .where(eq(aiAssistPrompts.fieldKey, fieldKey));
    return (rows[0]?.maxVersion ?? 0) + 1;
  }

  async getFieldByKey(fieldKey: string): Promise<AiAssistField | null> {
    const rows = await this.db
      .select()
      .from(aiAssistFields)
      .where(eq(aiAssistFields.fieldKey, fieldKey));
    return (rows[0] as AiAssistField) ?? null;
  }

  async getActivePromptByFieldKey(fieldKey: string): Promise<AiAssistPrompt | null> {
    const rows = await this.db
      .select()
      .from(aiAssistPrompts)
      .where(
        and(
          eq(aiAssistPrompts.fieldKey, fieldKey),
          eq(aiAssistPrompts.status, "active"),
        ),
      );
    return (rows[0] as AiAssistPrompt) ?? null;
  }

  async getPromptByVersion(fieldKey: string, version: number): Promise<AiAssistPrompt | null> {
    const rows = await this.db
      .select()
      .from(aiAssistPrompts)
      .where(
        and(
          eq(aiAssistPrompts.fieldKey, fieldKey),
          eq(aiAssistPrompts.version, version),
        ),
      );
    return (rows[0] as AiAssistPrompt) ?? null;
  }

  async saveField(
    field: Omit<AiAssistField, "createdAt" | "updatedAt">,
  ): Promise<AiAssistField> {
    const rows = await this.db
      .insert(aiAssistFields)
      .values({
        fieldKey: field.fieldKey,
        entity: field.entity,
        columnName: field.columnName,
        labels: field.labels,
        isActive: field.isActive,
        createdBy: field.createdBy,
        updatedBy: field.updatedBy,
      })
      .onConflictDoUpdate({
        target: aiAssistFields.fieldKey,
        set: {
          labels: field.labels,
          isActive: field.isActive,
          updatedBy: field.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0] as unknown as AiAssistField;
  }

  async savePrompt(
    prompt: Omit<AiAssistPrompt, "id" | "createdAt" | "updatedAt">,
  ): Promise<AiAssistPrompt> {
    const rows = await this.db
      .insert(aiAssistPrompts)
      .values({
        fieldKey: prompt.fieldKey,
        version: prompt.version,
        masterPrompt: prompt.masterPrompt,
        inputHint: prompt.inputHint,
        outputRules: prompt.outputRules,
        examples: prompt.examples,
        status: prompt.status,
        createdBy: prompt.createdBy,
        updatedBy: prompt.updatedBy,
      })
      .returning();
    return rows[0] as unknown as AiAssistPrompt;
  }

  async promotePromptToActive(
    fieldKey: string,
    version: number,
    updatedBy: string,
  ): Promise<Result<AiAssistPrompt>> {
    try {
      // 1. Marcar versión objetivo como active
      const targetRows = await this.db
        .select()
        .from(aiAssistPrompts)
        .where(
          and(
            eq(aiAssistPrompts.fieldKey, fieldKey),
            eq(aiAssistPrompts.version, version),
          ),
        );

      if (targetRows.length === 0) {
        return err(`Prompt ${fieldKey} v${version} no encontrado.`, "NOT_FOUND");
      }

      // Retirar previas activas
      await this.db
        .update(aiAssistPrompts)
        .set({
          status: "retired",
          updatedBy,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAssistPrompts.fieldKey, fieldKey),
            eq(aiAssistPrompts.status, "active"),
          ),
        );

      // Activar versión elegida
      const updated = await this.db
        .update(aiAssistPrompts)
        .set({
          status: "active",
          updatedBy,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAssistPrompts.fieldKey, fieldKey),
            eq(aiAssistPrompts.version, version),
          ),
        )
        .returning();

      return ok(updated[0] as unknown as AiAssistPrompt);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[DrizzleAiAssistRepository] Error al promover prompt a activo: ${msg}`, error);
      return err(msg, "DB_ERROR");
    }
  }
}

