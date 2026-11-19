import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import esDict from "./i18n/es.json";
import enDict from "./i18n/en.json";

const ADMIN_ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = [
  path.join(ADMIN_ROOT, "app", "workspace"),
  path.join(ADMIN_ROOT, "app", "onboarding"),
  path.join(ADMIN_ROOT, "components"),
];

/**
 * Recorre recursivamente los diccionarios JSON y extrae sus claves hoja en notación `ruta.clave`.
 */
function collectLeafEntries(
  obj: unknown,
  prefix = "",
): Array<{ key: string; value: unknown }> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return [{ key: prefix, value: obj }];
  }

  const entries: Array<{ key: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      entries.push(...collectLeafEntries(v, nextKey));
    } else {
      entries.push({ key: nextKey, value: v });
    }
  }
  return entries;
}

/**
 * Lista todos los archivos fuente `.ts` / `.tsx` dentro de un directorio excluyendo pruebas unitarias.
 */
function listNonTestSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listNonTestSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    results.push(fullPath);
  }
  return results;
}

/**
 * Elimina comentarios de bloque, JSX y de línea para inspeccionar código ejecutable y JSX renderizable.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

describe("SPEC-17 T-04 · Auditoría Automática i18n, Higiene UI y No-Deprecación", () => {
  it("garantiza paridad recursiva del 100 % y valores string no vacíos entre es.json y en.json", () => {
    const esEntries = collectLeafEntries(esDict);
    const enEntries = collectLeafEntries(enDict);

    const esMap = new Map(esEntries.map((e) => [e.key, e.value]));
    const enMap = new Map(enEntries.map((e) => [e.key, e.value]));

    const missingInEn = [...esMap.keys()].filter((k) => !enMap.has(k));
    const extraInEn = [...enMap.keys()].filter((k) => !esMap.has(k));

    expect(missingInEn).toEqual([]);
    expect(extraInEn).toEqual([]);

    const invalidEs = esEntries
      .filter((e) => typeof e.value !== "string" || e.value.trim().length === 0)
      .map((e) => e.key);
    const invalidEn = enEntries
      .filter((e) => typeof e.value !== "string" || e.value.trim().length === 0)
      .map((e) => e.key);

    expect(invalidEs).toEqual([]);
    expect(invalidEn).toEqual([]);
  });

  it("prohíbe diálogos nativos, setRequestLocale, uppercase en <label> y códigos internos en UI", () => {
    const files = SCAN_DIRS.flatMap(listNonTestSourceFiles);
    expect(files.length).toBeGreaterThan(20);

    const nativeDialogViolations: string[] = [];
    const deprecatedLocaleViolations: string[] = [];
    const uppercaseLabelViolations: string[] = [];
    const specCodeViolations: string[] = [];

    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const code = stripComments(raw);
      const rel = path.relative(ADMIN_ROOT, file);

      if (/\bwindow\.(confirm|alert|prompt)\s*\(/.test(code)) {
        nativeDialogViolations.push(rel);
      }

      if (/\bsetRequestLocale\b/.test(code)) {
        deprecatedLocaleViolations.push(rel);
      }

      const labelTags = code.match(/<label\b[\s\S]*?>/g) ?? [];
      if (labelTags.some((tag) => /\buppercase\b/.test(tag))) {
        uppercaseLabelViolations.push(rel);
      }

      if (/\b(?:SPEC|ADM|CHW|DAT|BILL|NTF|DSN|TRV|AIB|ONB)-[0-9]+/.test(code)) {
        specCodeViolations.push(rel);
      }
    }

    expect(nativeDialogViolations).toEqual([]);
    expect(deprecatedLocaleViolations).toEqual([]);
    expect(uppercaseLabelViolations).toEqual([]);
    expect(specCodeViolations).toEqual([]);
  });
});
