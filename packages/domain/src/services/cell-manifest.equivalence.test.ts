import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CellManifestService, type CellManifestDto } from "./cell-manifest.service";
import type { CellSecretsCryptoService } from "./cell-secrets.service";
import { buildCellDeploymentSpec } from "./cell-deployment-spec";
import { ComposeCellManifestRenderer } from "./compose-cell-manifest-renderer";
import * as clientModule from "../db/client";
import { LEGACY_MANIFEST_CASES } from "./__fixtures__/cell-manifest/cases";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "cell-manifest");

/** Claves y fragmentos de sintaxis Compose prohibidos en el modelo neutral (CEL-RF-007). */
const FORBIDDEN_KEYS = [
  "container_name",
  "depends_on",
  "restart",
  "external",
  "network_mode",
  "labels",
  "ports",
  "volumes",
  "secrets",
  "networks",
  "image",
];
const FORBIDDEN_VALUE_FRAGMENTS = ["/opt/", "traefik", "external: true", "docker compose", "cell-backend"];

function readGolden(name: string): CellManifestDto {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.golden.json`), "utf8")) as CellManifestDto;
}

function collectKeysAndStrings(value: unknown, keys: string[] = [], strings: string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeysAndStrings(item, keys, strings));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeysAndStrings(nested, keys, strings);
    }
  } else if (typeof value === "string") {
    strings.push(value);
  }
  return { keys, strings };
}

describe("CEL-001 Etapa 1 · equivalencia del manifiesto celular", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(LEGACY_MANIFEST_CASES)("caso $name", (testCase) => {
    it("el servicio delegado produce exactamente la salida capturada del baseline legado", async () => {
      const secretsStub = { decryptBundle: () => testCase.secrets } as unknown as CellSecretsCryptoService;
      const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [testCase.cell] }) }) }) };
      vi.spyOn(clientModule, "getDb").mockReturnValue(db as never);

      const manifest = await new CellManifestService(secretsStub).generateManifest(testCase.cell.id);
      const golden = readGolden(testCase.name);

      expect(manifest).toStrictEqual(golden);
    });

    it("el renderer produce los artefactos del baseline a partir del modelo neutral", () => {
      const spec = buildCellDeploymentSpec(testCase.cell);
      const artifacts = new ComposeCellManifestRenderer().render(spec, {
        secrets: testCase.secrets,
        workingDirOverride: testCase.cell.workingDir,
        deployUserOverride: testCase.cell.deployUser,
        legacyRegion: testCase.cell.region,
      });
      const golden = readGolden(testCase.name);

      expect(artifacts.workingDir).toBe(golden.workingDir);
      expect(artifacts.deployUser).toBe(golden.deployUser);
      expect(artifacts.envContent).toBe(golden.envContent);
      expect(artifacts.dockerComposeContent).toBe(golden.dockerComposeContent);
      expect(artifacts.instructions).toStrictEqual(golden.instructions);
    });

    it("el modelo neutral no contiene primitivas Compose, secretos ni región", () => {
      const spec = buildCellDeploymentSpec(testCase.cell);
      const { keys, strings } = collectKeysAndStrings(spec);

      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, `clave Compose prohibida: ${forbidden}`).not.toContain(forbidden);
      }
      expect(keys).not.toContain("region");
      for (const text of strings) {
        for (const fragment of FORBIDDEN_VALUE_FRAGMENTS) {
          expect(text.toLowerCase(), `fragmento prohibido en "${text}"`).not.toContain(fragment.toLowerCase());
        }
      }

      const serialized = JSON.stringify(spec);
      for (const secretValue of Object.values(testCase.secrets)) {
        expect(serialized).not.toContain(secretValue);
      }
      expect(serialized).not.toContain(testCase.cell.region);
    });
  });
});

