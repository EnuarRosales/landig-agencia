import type { CellSecretsBundle } from "../../cell-secrets.service";

/**
 * Subconjunto de columnas de `admin.cells` que consume el generador de manifiestos.
 *
 * Los casos replican filas legadas reales y se usan para capturar y comparar
 * la salida del baseline (CEL-001 §6, Etapa 1).
 */
export interface LegacyManifestCellRow {
  id: string;
  code: string;
  tier: string;
  status: string;
  topologyType: string;
  pgbouncerHost: string;
  pgbouncerPort: number;
  databaseName: string;
  appUrl: string;
  privateIp: string | null;
  publicIp: string | null;
  workingDir: string | null;
  deployUser: string | null;
  cellSecretsCiphertext: string;
  cellSecretsKeyId: string;
  maxClients: number;
  currentClients: number;
  region: string;
}

/**
 * Caso de equivalencia: fila de celda, secretos ya descifrados y nombre del golden asociado.
 */
export interface LegacyManifestCase {
  name: string;
  cell: LegacyManifestCellRow;
  secrets: CellSecretsBundle;
}

const SECRETS_A: CellSecretsBundle = {
  mocter_app_password: "fixture-app-password-A",
  mocter_migrator_password: "fixture-migrator-password-A",
  mocter_healthcheck_password: "fixture-healthcheck-password-A",
  handshake_secret: "fixture-handshake-secret-A",
};

const SECRETS_B: CellSecretsBundle = {
  mocter_app_password: "fixture-app-password-B",
  mocter_migrator_password: "fixture-migrator-password-B",
  mocter_healthcheck_password: "fixture-healthcheck-password-B",
  handshake_secret: "fixture-handshake-secret-B",
};

const SECRETS_C: CellSecretsBundle = {
  mocter_app_password: "fixture-app-password-C",
  mocter_migrator_password: "fixture-migrator-password-C",
  mocter_healthcheck_password: "fixture-healthcheck-password-C",
  handshake_secret: "fixture-handshake-secret-C",
};

/**
 * Casos que cubren las topologías persistidas legadas (`remote_vps`, `local_compose`)
 * y los valores por defecto de `workingDir` / `deployUser` cuando la fila no los define.
 */
export const LEGACY_MANIFEST_CASES: LegacyManifestCase[] = [
  {
    name: "remote-vps-explicit-paths",
    secrets: SECRETS_A,
    cell: {
      id: "01930000-0000-7000-8000-000000000010",
      code: "cell-02",
      tier: "standard",
      status: "draft",
      topologyType: "remote_vps",
      pgbouncerHost: "10.0.1.15",
      pgbouncerPort: 6432,
      databaseName: "db_cell_02",
      appUrl: "https://cell-02.internal:3000",
      privateIp: "10.0.1.15",
      publicIp: null,
      workingDir: "/opt/cell-02",
      deployUser: "deploy:1000",
      cellSecretsCiphertext: "unused-in-equivalence",
      cellSecretsKeyId: "k-test-1",
      maxClients: 100,
      currentClients: 0,
      region: "us-east-1",
    },
  },
  {
    name: "local-compose-default-paths",
    secrets: SECRETS_B,
    cell: {
      id: "01930000-0000-7000-8000-000000000020",
      code: "cell-local",
      tier: "premium",
      status: "draft",
      topologyType: "local_compose",
      pgbouncerHost: "pgbouncer-cell-local",
      pgbouncerPort: 6543,
      databaseName: "pg-cell-local",
      appUrl: "http://localhost:3004/",
      privateIp: null,
      publicIp: null,
      workingDir: null,
      deployUser: null,
      cellSecretsCiphertext: "unused-in-equivalence",
      cellSecretsKeyId: "k-test-1",
      maxClients: 50,
      currentClients: 3,
      region: "eu-west-1",
    },
  },
  {
    name: "local-compose-cell-01-baseline",
    secrets: SECRETS_C,
    cell: {
      id: "01930000-0000-7000-8000-000000000001",
      code: "cell-01",
      tier: "standard",
      status: "error_connection",
      topologyType: "local_compose",
      pgbouncerHost: "pgbouncer-cell-01",
      pgbouncerPort: 6432,
      databaseName: "pg-cell-01",
      appUrl: "http://localhost:3004/",
      privateIp: "127.0.0.1",
      publicIp: null,
      workingDir: "/opt/cell-01",
      deployUser: "deploy:1000",
      cellSecretsCiphertext: "unused-in-equivalence",
      cellSecretsKeyId: "k-test-1",
      maxClients: 100,
      currentClients: 0,
      region: "us-east-1",
    },
  },
];

