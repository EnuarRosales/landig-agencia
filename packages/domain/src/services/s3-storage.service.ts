import { createHash, createHmac } from "node:crypto";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";

/**
 * Tiempo máximo de espera por intento HTTP hacia SeaweedFS S3 (SPEC-00 §12).
 */
const S3_REQUEST_TIMEOUT_MS = 10_000;

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
 *
 * @param params - Parámetros HTTP, ruta canónica, digest SHA-256 del cuerpo y credenciales S3.
 * @returns Cabeceras HTTP listas para enviar incluyendo `Authorization`, `x-amz-date` y `x-amz-content-sha256`.
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

  const normalizedInputHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.headers)) {
    normalizedInputHeaders[key.toLowerCase()] = value;
  }

  const rawHeaders: Record<string, string> = {
    ...normalizedInputHeaders,
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
 * Cliente de almacenamiento S3 de bajo nivel optimizado para SeaweedFS (CEL-RF-016, SPEC-00).
 *
 * Lee su configuración exclusivamente desde {@link env}, inicializa el bucket de forma idempotente
 * mediante {@link ensureBucketExists} y aplica reintentos exponenciales con timeout acotado.
 */
export class S3StorageService {
  private static initializedBuckets = new Set<string>();

  /**
   * Crea una instancia de {@link S3StorageService}.
   *
   * @param configOverrides - Sobreescritura parcial opcional (principalmente para pruebas unitarias).
   * @param fetchImpl - Implementación de `fetch` inyectable para pruebas.
   */
  constructor(
    private readonly configOverrides?: Partial<S3StorageConfig>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get endpoint(): string {
    return (this.configOverrides?.endpoint ?? env.S3_ENDPOINT ?? "http://seaweedfs:8333").replace(/\/+$/, "");
  }

  private get region(): string {
    return this.configOverrides?.region ?? env.S3_REGION ?? "us-east-1";
  }

  private get bucket(): string {
    return this.configOverrides?.bucket ?? env.S3_BUCKET ?? "media";
  }

  private get accessKeyId(): string {
    return this.configOverrides?.accessKeyId ?? env.S3_ACCESS_KEY_ID ?? "";
  }

  private get secretAccessKey(): string {
    return this.configOverrides?.secretAccessKey ?? env.S3_SECRET_ACCESS_KEY ?? "";
  }

  /**
   * Limpia la caché en memoria de buckets inicializados.
   */
  static clearBucketCache(): void {
    S3StorageService.initializedBuckets.clear();
  }

  /**
   * Ejecuta una sonda no bloqueante de conectividad contra el gateway S3 de SeaweedFS (`SPEC-00 §9.2`).
   *
   * @param timeoutMs - Tiempo máximo de espera en milisegundos (por defecto `1500`).
   * @returns `"ok"` si el gateway S3 responde con credenciales válidas (`200` o `404`), o `"degraded"` ante fallos/timeouts.
   */
  async checkConnectivity(timeoutMs: number = 1_500): Promise<"ok" | "degraded"> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return "degraded";
    }

    const path = `/${this.bucket}`;
    const targetUrl = `${this.endpoint}${path}`;
    const emptySha256 = createHash("sha256").update("").digest("hex");

    try {
      const headers = generateSigV4Headers({
        method: "HEAD",
        endpoint: this.endpoint,
        path,
        headers: {},
        payloadSha256: emptySha256,
        region: this.region,
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      });

      const res = await this.fetchImpl(targetUrl, {
        method: "HEAD",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      return res.ok || res.status === 404 ? "ok" : "degraded";
    } catch {
      return "degraded";
    }
  }

  /**
   * Garantiza de forma idempotente que el bucket configurado exista en SeaweedFS.
   *
   * Consulta `HEAD /{bucket}` firmado con SigV4; si responde `404`, crea el bucket con `PUT /{bucket}`
   * y cachea el resultado por proceso para evitar peticiones repetidas en cargas subsecuentes.
   *
   * @throws {Error} Si faltan credenciales S3 o SeaweedFS devuelve un error inesperado.
   */
  async ensureBucketExists(): Promise<void> {
    const cacheKey = `${this.endpoint}/${this.bucket}`;
    if (S3StorageService.initializedBuckets.has(cacheKey)) {
      return;
    }

    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error("Credenciales S3 (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) no configuradas.");
    }

    const path = `/${this.bucket}`;
    const targetUrl = `${this.endpoint}${path}`;
    const emptySha256 = createHash("sha256").update("").digest("hex");

    const headHeaders = generateSigV4Headers({
      method: "HEAD",
      endpoint: this.endpoint,
      path,
      headers: {},
      payloadSha256: emptySha256,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const headRes = await this.fetchImpl(targetUrl, {
      method: "HEAD",
      headers: headHeaders,
      signal: AbortSignal.timeout(S3_REQUEST_TIMEOUT_MS),
    });

    if (headRes.ok) {
      S3StorageService.initializedBuckets.add(cacheKey);
      return;
    }

    if (headRes.status !== 404) {
      const body = typeof headRes.text === "function" ? await headRes.text().catch(() => "") : "";
      throw new Error(
        `Error al verificar bucket "${this.bucket}": HTTP ${headRes.status}${body ? `: ${body}` : headRes.statusText ? `: ${headRes.statusText}` : ""}`,
      );
    }

    const putHeaders = generateSigV4Headers({
      method: "PUT",
      endpoint: this.endpoint,
      path,
      headers: {},
      payloadSha256: emptySha256,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const putRes = await this.fetchImpl(targetUrl, {
      method: "PUT",
      headers: putHeaders,
      signal: AbortSignal.timeout(S3_REQUEST_TIMEOUT_MS),
    });

    if (putRes.ok || putRes.status === 409) {
      S3StorageService.initializedBuckets.add(cacheKey);
      return;
    }

    const putBody = typeof putRes.text === "function" ? await putRes.text().catch(() => "") : "";
    throw new Error(
      `Error al crear bucket "${this.bucket}": HTTP ${putRes.status}${putBody ? `: ${putBody}` : putRes.statusText ? `: ${putRes.statusText}` : ""}`,
    );
  }

  /**
   * Sube un binario al bucket privado de SeaweedFS mediante PutObject S3 con reintentos exponenciales.
   *
   * Garantiza la existencia del bucket mediante {@link ensureBucketExists} antes de escribir el objeto.
   *
   * @param key - Clave relativa dentro del bucket (ej. `products/2026/img-123.webp`).
   * @param buffer - Contenido binario del archivo.
   * @param mimeType - Tipo MIME del contenido.
   * @param maxRetries - Número máximo de intentos ante fallos transitorios (por defecto `3`).
   * @returns Resultado tipado con `ok: true` o `ok: false` y detalle técnico del fallo.
   */
  async putObject(
    key: string,
    buffer: Buffer | Uint8Array,
    mimeType: string,
    maxRetries: number = 3,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return { ok: false, error: "Credenciales S3 (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) no configuradas." };
    }

    const cleanKey = key.replace(/^\/+/, "");
    const path = `/${this.bucket}/${cleanKey}`;
    const targetUrl = `${this.endpoint}${path}`;
    const payloadSha256 = createHash("sha256").update(buffer).digest("hex");

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startedAt = Date.now();
      try {
        await this.ensureBucketExists();

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
          body: new Uint8Array(buffer),
          signal: AbortSignal.timeout(S3_REQUEST_TIMEOUT_MS),
        });

        if (res.ok) {
          appLogger.info(`[S3StorageService.putObject] Objeto persistido en S3`, {
            bucket: this.bucket,
            key: cleanKey,
            sizeBytes: buffer.byteLength,
            attempt,
            latencyMs: Date.now() - startedAt,
          });
          return { ok: true };
        }

        const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
        lastError = `HTTP ${res.status}: ${body || res.statusText}`;
        appLogger.warn(`[S3StorageService.putObject] Intento ${attempt} falló para "${key}": ${lastError}`, {
          bucket: this.bucket,
          key: cleanKey,
          attempt,
          status: res.status,
          latencyMs: Date.now() - startedAt,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        appLogger.warn(`[S3StorageService.putObject] Excepción en intento ${attempt} para "${key}": ${lastError}`, {
          bucket: this.bucket,
          key: cleanKey,
          attempt,
          latencyMs: Date.now() - startedAt,
        });
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
   *
   * @param key - Clave relativa del objeto dentro del bucket.
   * @returns Resultado tipado indicando si la eliminación fue exitosa o idempotente (`404`).
   */
  async deleteObject(key: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return { ok: false, error: "Credenciales S3 (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) no configuradas." };
    }

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
        signal: AbortSignal.timeout(S3_REQUEST_TIMEOUT_MS),
      });

      if (res.ok || res.status === 204 || res.status === 404) {
        return { ok: true };
      }

      const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      return { ok: false, error: `HTTP ${res.status}: ${body || res.statusText}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Ejecuta una petición GET autenticada contra SeaweedFS S3 (con soporte opcional HTTP `Range`).
   */
  private async fetchObjectResponse(
    key: string,
    rangeHeader?: string | null,
  ): Promise<
    { ok: true; response: Response } | { ok: false; error: string; status?: number }
  > {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return {
        ok: false,
        error: "Credenciales S3 (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) no configuradas.",
      };
    }

    const cleanKey = key.replace(/^\/+/, "");
    const path = `/${this.bucket}/${cleanKey}`;
    const targetUrl = `${this.endpoint}${path}`;
    const emptySha256 = createHash("sha256").update("").digest("hex");
    const extraHeaders: Record<string, string> = {};
    if (rangeHeader && rangeHeader.trim().length > 0) {
      extraHeaders.range = rangeHeader.trim();
    }

    try {
      const headers = generateSigV4Headers({
        method: "GET",
        endpoint: this.endpoint,
        path,
        headers: extraHeaders,
        payloadSha256: emptySha256,
        region: this.region,
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      });

      const res = await this.fetchImpl(targetUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(S3_REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = typeof res.text === "function" ? await res.text().catch(() => "") : "";
        return {
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}: ${body || res.statusText}`,
        };
      }

      return { ok: true, response: res };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Transmite un objeto privado desde SeaweedFS S3 preservando cabeceras de streaming y HTTP `Range` (206).
   *
   * @param key - Clave relativa del objeto dentro del bucket.
   * @param rangeHeader - Cabecera `Range` opcional enviada por `<video>` o `<audio>`.
   * @returns Flujo binario, código HTTP (`200` o `206`) y metadatos de cabeceras.
   */
  async getObjectStream(
    key: string,
    rangeHeader?: string | null,
  ): Promise<
    | {
        ok: true;
        status: number;
        body: ReadableStream<Uint8Array> | null;
        bufferFallback?: Buffer;
        contentType: string;
        contentLength: string | null;
        contentRange: string | null;
        acceptRanges: string | null;
      }
    | { ok: false; error: string; status?: number }
  > {
    const fetched = await this.fetchObjectResponse(key, rangeHeader);
    if (!fetched.ok) return fetched;
    const res = fetched.response;
    const contentType = res.headers?.get("content-type") || "application/octet-stream";
    return {
      ok: true,
      status: res.status === 206 ? 206 : 200,
      body: res.body ?? null,
      contentType,
      contentLength: res.headers?.get("content-length") ?? null,
      contentRange: res.headers?.get("content-range") ?? null,
      acceptRanges: res.headers?.get("accept-ranges") || "bytes",
    };
  }

  /**
   * Descarga de forma autenticada un objeto binario desde el bucket privado de SeaweedFS.
   *
   * @param key - Clave relativa del objeto dentro del bucket.
   * @returns Buffer binario y tipo MIME si existe, o error con código HTTP asociado.
   */
  async getObject(
    key: string,
  ): Promise<
    { ok: true; buffer: Buffer; contentType: string } | { ok: false; error: string; status?: number }
  > {
    const fetched = await this.fetchObjectResponse(key);
    if (!fetched.ok) return fetched;

    const res = fetched.response;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers?.get("content-type") || "application/octet-stream";
    return {
      ok: true,
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }
}

