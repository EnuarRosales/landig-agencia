import { createHash, createHmac } from "node:crypto";
import { appLogger } from "../utils/logger";

/**
 * Configuración para el cliente de almacenamiento compatible con S3 (CEL-RF-016).
 */
export interface S3StorageConfig {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

/**
 * Genera la firma AWS SigV4 para una petición HTTP hacia el gateway S3 de SeaweedFS.
 */
export function generateSigV4Headers(params: {
  method: string;
  endpoint: string;
  path: string;
  headers: Record<string, string>;
  payloadSha256: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  timestamp?: Date;
}): Record<string, string> {
  const date = params.timestamp || new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(params.endpoint);
  const host = url.host;

  const rawHeaders: Record<string, string> = {
    ...params.headers,
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": params.payloadSha256,
  };

  // Canonical headers (en minúscula y ordenados alfabéticamente)
  const sortedHeaderKeys = Object.keys(rawHeaders)
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${rawHeaders[k]!.trim().replace(/\s+/g, " ")}\n`)
    .join("");

  const signedHeaders = sortedHeaderKeys.join(";");

  // Canonical URI (codificada)
  const canonicalUri = params.path.startsWith("/") ? params.path : `/${params.path}`;

  const canonicalRequest = [
    params.method.toUpperCase(),
    canonicalUri,
    "", // CanonicalQueryString
    canonicalHeaders,
    signedHeaders,
    params.payloadSha256,
  ].join("\n");

  const canonicalRequestHash = createHash("sha256").update(canonicalRequest).digest("hex");

  const credentialScope = `${dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  // Derivación de claves de firma SigV4
  const kDate = createHmac("sha256", `AWS4${params.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(params.region).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();

  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...rawHeaders,
    Authorization: authorizationHeader,
  };
}

/**
 * Cliente de almacenamiento S3 de bajo nivel optimizado para SeaweedFS (CEL-RF-016).
 *
 * Aplica reintentos exponenciales para tolerancia a fallos transitorios en el stack local y productivo.
 */
export class S3StorageService {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(
    config?: Partial<S3StorageConfig>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.endpoint = (config?.endpoint || process.env.S3_ENDPOINT || "http://localhost:8333").replace(/\/+$/, "");
    this.region = config?.region || process.env.S3_REGION || "us-east-1";
    this.bucket = config?.bucket || process.env.S3_BUCKET || "media";
    this.accessKeyId = config?.accessKeyId || process.env.S3_ACCESS_KEY_ID || "";
    this.secretAccessKey = config?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || "";
  }

  /**
   * Sube un binario al bucket privado de SeaweedFS mediante PutObject S3 con reintentos exponenciales.
   *
   * @param key - Clave relativa dentro del bucket (ej. `products/2026/img-123.webp`).
   * @param buffer - Contenido binario del archivo.
   * @param mimeType - Tipo MIME del contenido.
   */
  async putObject(
    key: string,
    buffer: Buffer | Uint8Array,
    mimeType: string,
    maxRetries: number = 3,
  ): Promise<{ ok: boolean; error?: string }> {
    const cleanKey = key.replace(/^\/+/, "");
    const path = `/${this.bucket}/${cleanKey}`;
    const targetUrl = `${this.endpoint}${path}`;
    const payloadSha256 = createHash("sha256").update(buffer).digest("hex");

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const headers = generateSigV4Headers({
          method: "PUT",
          endpoint: this.endpoint,
          path,
          headers: {
            "content-type": mimeType,
            "content-length": String(buffer.byteLength),
          },
          payloadSha256,
          region: this.region,
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        });

        const res = await this.fetchImpl(targetUrl, {
          method: "PUT",
          headers,
          body: buffer as any,
        });

        if (res.ok) {
          return { ok: true };
        }

        const body = await res.text().catch(() => "");
        lastError = `HTTP ${res.status}: ${body || res.statusText}`;
        appLogger.warn(`[S3StorageService.putObject] Intento ${attempt} falló para "${key}": ${lastError}`);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        appLogger.warn(`[S3StorageService.putObject] Excepción en intento ${attempt} para "${key}": ${lastError}`);
      }

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt - 1) * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    return { ok: false, error: lastError || "Error desconocido al escribir en SeaweedFS S3." };
  }

  /**
   * Elimina un objeto del bucket privado de SeaweedFS.
   */
  async deleteObject(key: string): Promise<{ ok: boolean; error?: string }> {
    const cleanKey = key.replace(/^\/+/, "");
    const path = `/${this.bucket}/${cleanKey}`;
    const targetUrl = `${this.endpoint}${path}`;
    const emptySha256 = createHash("sha256").update("").digest("hex");

    try {
      const headers = generateSigV4Headers({
        method: "DELETE",
        endpoint: this.endpoint,
        path,
        headers: {},
        payloadSha256: emptySha256,
        region: this.region,
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      });

      const res = await this.fetchImpl(targetUrl, {
        method: "DELETE",
        headers,
      });

      if (res.ok || res.status === 204 || res.status === 404) {
        return { ok: true };
      }

      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body || res.statusText}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

