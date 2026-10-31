import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { aiAssistFields, aiAssistPrompts } from "./ai-assist";

describe("AI-001 T-02 · Esquema de Asistente AI de Configuración", () => {
  it("ai_assist_fields declara las columnas requeridas por AI-001 §3.1 y auditoría", () => {
    const cols = getTableColumns(aiAssistFields);

    expect(cols.fieldKey).toBeDefined();
    expect(cols.entity).toBeDefined();
    expect(cols.columnName).toBeDefined();
    expect(cols.labels).toBeDefined();
    expect(cols.isActive).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
  });

  it("ai_assist_prompts declara las columnas de versionado, prompt maestro y auditoría", () => {
    const cols = getTableColumns(aiAssistPrompts);

    expect(cols.id).toBeDefined();
    expect(cols.fieldKey).toBeDefined();
    expect(cols.version).toBeDefined();
    expect(cols.masterPrompt).toBeDefined();
    expect(cols.inputHint).toBeDefined();
    expect(cols.outputRules).toBeDefined();
    expect(cols.examples).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
  });
});

