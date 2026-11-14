import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAdminDictionary } from "@/lib/i18n";

const FORBIDDEN_PATTERN =
  /\b(celda|célula|celular|celulares|cell|cell-01|pg-cell|nodo|instancia física|seaweedfs|imgproxy|pgbouncer|rls|drizzle|router global|ADM-001|CEL-001|CHW-001|DAT-001|BILL-001|NTF-001|DSN-001|TNT-001|SPEC-\d+|PRD-\d+|CRM-\d+|PED-\d+|EQU-\d+|TAB-\d+|TRV-\d+)\b/i;

function collectTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripTechnicalComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("SPEC-01 · Higiene terminológica de la UI del inquilino (Zero Infra Leaks)", () => {
  it("no expone términos de infraestructura ni códigos de specs en archivos TSX del inquilino", () => {
    const adminRoot = path.resolve(__dirname, "../..");
    const targetFiles = [
      ...collectTsxFiles(path.join(adminRoot, "app", "workspace")),
      ...collectTsxFiles(path.join(adminRoot, "app", "onboarding")),
      path.join(adminRoot, "components", "tenant-workspace-shell.tsx"),
      path.join(adminRoot, "components", "portal-shell-router.tsx"),
    ];

    expect(targetFiles.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; line: number; match: string; text: string }> = [];

    for (const filePath of targetFiles) {
      const raw = fs.readFileSync(filePath, "utf8");
      const cleaned = stripTechnicalComments(raw);
      const lines = cleaned.split(/\r?\n/);

      lines.forEach((line, idx) => {
        const m = line.match(FORBIDDEN_PATTERN);
        if (m) {
          violations.push({
            file: path.relative(adminRoot, filePath),
            line: idx + 1,
            match: m[0],
            text: line.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("mantiene diccionarios i18n (es/en) de workspace libres de términos de infraestructura", () => {
    for (const locale of ["es", "en"] as const) {
      const dict = getAdminDictionary(locale).workspace;
      for (const [key, value] of Object.entries(dict)) {
        const match = value.match(FORBIDDEN_PATTERN);
        expect(match, `Diccionario ${locale}.workspace.${key} contiene término prohibido: ${match?.[0]}`).toBeNull();
      }
    }
  });
});
