/**
 * Central configuration for Mocter E2E test harness.
 * Resolves local and CI environment endpoints, database credentials, and storage services.
 */

export const config = {
  // Application endpoints
  adminUrl: (process.env.ADMIN_URL || "http://localhost:3003").replace(/\/+$/, ""),
  webUrl: (process.env.WEB_URL || "http://localhost:3001").replace(/\/+$/, ""),
  seaweedfsUrl: (process.env.S3_ENDPOINT || "http://localhost:8333").replace(/\/+$/, ""),
  imgproxyUrl: (process.env.IMGPROXY_BASE_URL || "http://localhost:8081").replace(/\/+$/, ""),

  // Control plane database (db-portal)
  dbPortal: {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: parseInt(process.env.POSTGRES_PORT || "54321", 10),
    user: process.env.POSTGRES_USER || "mocter",
    password: process.env.POSTGRES_PASSWORD || "M0ct3rP0rt4LDev2026",
    database: process.env.POSTGRES_DB || "db-portal",
    connectionString: process.env.DATABASE_URL || "postgresql://mocter:M0ct3rP0rt4LDev2026@127.0.0.1:54321/db-portal",
    containerName: "mocter-core-pg-portal-1",
  },

  // Cell data plane database (pg-cell-01)
  cellDb: {
    host: process.env.CELL_POSTGRES_HOST || "127.0.0.1",
    port: parseInt(process.env.CELL_POSTGRES_PORT || "5433", 10),
    user: process.env.CELL_POSTGRES_USER || "mocter_app",
    password: process.env.CELL_POSTGRES_PASSWORD || "mocter_cell_dev_pass",
    database: process.env.CELL_POSTGRES_DB || "pg-cell-01",
    connectionString: process.env.CELL_DATABASE_URL || "postgresql://mocter_app:mocter_cell_dev_pass@127.0.0.1:5433/pg-cell-01",
    containerName: "mocter-cell-01-pg-cell-1",
  },

  // Cell PgBouncer transaction pooler
  cellPgbouncer: {
    host: process.env.CELL_PGBOUNCER_HOST || "127.0.0.1",
    port: parseInt(process.env.CELL_PGBOUNCER_PORT || "6432", 10),
    user: process.env.CELL_POSTGRES_USER || "mocter_app",
    password: process.env.CELL_POSTGRES_PASSWORD || "mocter_cell_dev_pass",
    database: process.env.CELL_POSTGRES_DB || "pg-cell-01",
    connectionString: "postgresql://mocter_app:mocter_cell_dev_pass@127.0.0.1:6432/pg-cell-01",
    containerName: "mocter-cell-01-pgbouncer-cell-1",
  },

  // S3 & imgproxy keys
  s3: {
    bucket: process.env.S3_BUCKET || "media",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "mocter_dev_access",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "mocter_dev_secret",
  },
  imgproxy: {
    keyHex: process.env.IMGPROXY_KEY || "9b8c2d1e0f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
    saltHex: process.env.IMGPROXY_SALT || "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  },

  // Timeouts
  timeouts: {
    defaultRequestMs: 10000,
    healthCheckMs: 5000,
    dbQueryMs: 5000,
  },
};
