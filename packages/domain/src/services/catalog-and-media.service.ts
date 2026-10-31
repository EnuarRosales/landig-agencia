import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { err, ok, type Result } from "../types/result";

/**
 * Configuración por defecto de los atributos del producto que componen el texto vectorizado (`ADM-001 T-13, RF-05.7, §9.0`).
 *
 * El atributo `prompt` está estrictamente prohibido en los embeddings.
 */
export const DEFAULT_VECTORIZATION_CONFIG = [
  { attributeKey: "name", enabled: true, position: 1 },
  { attributeKey: "description", enabled: true, position: 2 },
  { attributeKey: "category", enabled: true, position: 3 },
  { attributeKey: "brand", enabled: true, position: 4 },
] as const;

/**
 * Límites de tamaño admisibles por archivo definidos por plataforma (`ADM-001 RF-07.16, T-14`).
 */
export const MEDIA_MAX_SIZE_BYTES = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 100 * 1024 * 1024, // 100 MB
  audio: 25 * 1024 * 1024, // 25 MB
  pdf: 25 * 1024 * 1024, // 25 MB
} as const;

/**
 * Límites de transformación de imgproxy (`ADM-001 RF-07.21, T-14A`).
 */
export const IMGPROXY_PLATFORM_LIMITS = {
  bucket: "media",
  maxSourceBytes: 100 * 1024 * 1024, // 100 MB
  maxResultDimensionPx: 4096,
  maxQueueSize: 100,
  maxAnimationFrames: 1,
  allowedFormats: ["webp", "avif", "png", "jpeg"] as const,
  allowedResizingTypes: ["fit", "fill", "auto"] as const,
} as const;

/**
 * Plataformas externas admitidas por defecto (`ADM-001 T-14, §11.5`).
 */
export const DEFAULT_EXTERNAL_MEDIA_PROVIDERS = [
  { code: "youtube", hostPattern: /(^|\.)(youtube\.com|youtu\.be)$/i, embeddable: true },
  { code: "tiktok", hostPattern: /(^|\.)tiktok\.com$/i, embeddable: true },
  { code: "vimeo", hostPattern: /(^|\.)vimeo\.com$/i, embeddable: true },
  { code: "instagram", hostPattern: /(^|\.)instagram\.com$/i, embeddable: true },
  { code: "facebook", hostPattern: /(^|\.)(facebook\.com|fb\.watch)$/i, embeddable: true },
] as const;

/**
 * Registro de producto en la celda del inquilino (`ADM-001 T-13, §9.0`).
 */
export interface ProductRecord {
  id: string;
  clientId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  sku: string | null;
  gtin: string | null;
  mpn: string | null;
  itemGroupId: string | null;
  brand: string | null;
  category: string | null;
  googleProductCategory: string | null;
  kind: "physical" | "digital" | "service";
  condition: "new" | "refurbished" | "used";
  availability: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  status: "draft" | "published" | "archived";
  color: string | null;
  size: string | null;
  material: string | null;
  gender: string | null;
  ageGroup: string | null;
  pattern: string | null;
  prompt: string | null;
  composedEmbeddingText: string;
  embeddingVersion: number;
}

/**
 * Ficha técnica en el catálogo global `media_catalog` (`ADM-001 T-14, §11.2`).
 */
export interface MediaCatalogEntry {
  id: string;
  contentHash: string;
  storagePoolId: string;
  storageKey: string;
  sizeBytes: number | null;
  mediaKind: "image" | "audio" | "video" | "pdf";
  mimeType: string;
  sourceFormat: string;
  originalFilename: string;
  processingStatus: "uploaded" | "processing" | "ready" | "failed" | "external";
  storageType: "internal" | "external";
  sourceUrl: string | null;
  provider: string | null;
  gcCandidate: boolean;
}

/**
 * Servicio de catálogo de productos, vectorización gobernada, multimedia deduplicada por hash,
 * validación por magic bytes, enlaces externos con protección SSRF, firma HMAC-SHA256 de imgproxy
 * y recolector de basura (GC) en dos fases (`ADM-001 T-13, T-14, T-14A, T-15`).
 */
export class CatalogAndMediaService {
  private vectorizationAttrs: Array<{
    attributeKey: string;
    enabled: boolean;
    position: number;
  }> = [...DEFAULT_VECTORIZATION_CONFIG];

  private readonly productsByClient = new Map<string, Map<string, ProductRecord>>();
  private readonly mediaById = new Map<string, MediaCatalogEntry>();
  private readonly mediaByHash = new Map<string, MediaCatalogEntry>();
  private readonly clientMediaRefs = new Map<string, Set<string>>(); // clientId -> Set<mediaId>
  private readonly productMediaLinks = new Map<
    string,
    { clientId: string; productId: string; mediaId: string; altText: string | null }
  >();

  constructor(
    private readonly imgproxyKeyPairs: Array<{ keyHex: string; saltHex: string }> = [
      {
        keyHex: "30".repeat(32),
        saltHex: "31".repeat(32),
      },
    ],
    private readonly imgproxyBaseUrl: string = "https://media.mocter.co",
  ) {}

  /**
   * Crea un producto exigiendo únicamente `name`, `description` y `priceCents`, heredando la moneda
   * del inquilino (`clients.currency`, por defecto `COP`) y defaults ERP (`kind = 'physical'`,
   * `condition = 'new'`, `availability = 'in_stock'`, `status = 'draft'`) sin incluir jamás `prompt` en el embedding (`ADM-001 T-13, RF-05.8, RF-05.9`).
   */
  createProduct(params: {
    clientId: string;
    tenantCurrency?: string;
    rlsCurrentClientId: string | null;
    name: string;
    description: string;
    priceCents: number;
    currency?: string;
    sku?: string;
    gtin?: string;
    mpn?: string;
    brand?: string;
    category?: string;
    kind?: "physical" | "digital" | "service";
    condition?: "new" | "refurbished" | "used";
    availability?: "in_stock" | "out_of_stock" | "preorder" | "backorder";
    status?: "draft" | "published" | "archived";
    prompt?: string;
  }): Result<ProductRecord> {
    if (!params.rlsCurrentClientId || params.rlsCurrentClientId !== params.clientId) {
      return err(
        "RLS violation: app.current_client_id must be set to the owning client_id before accessing products (ADM-001 T-13, RF-10.11).",
        "RLS_CONTEXT_MISSING_OR_MISMATCH",
      );
    }

    if (!params.name.trim() || !params.description.trim() || params.priceCents < 0) {
      return err(
        "Product name, description and non-negative price_cents are required (ADM-001 RF-05.8).",
        "INVALID_PRODUCT_INPUT",
      );
    }

    const id = `019a0000-0000-7000-8005-${String(Date.now() % 1e12).padStart(12, "0")}-${Math.floor(Math.random() * 1000)}`;
    const record: ProductRecord = {
      id,
      clientId: params.clientId,
      name: params.name.trim(),
      description: params.description.trim(),
      priceCents: params.priceCents,
      currency: (params.currency ?? params.tenantCurrency ?? "COP").toUpperCase(),
      sku: params.sku ?? null,
      gtin: params.gtin ?? null,
      mpn: params.mpn ?? null,
      itemGroupId: null,
      brand: params.brand ?? null,
      category: params.category ?? null,
      googleProductCategory: null,
      kind: params.kind ?? "physical",
      condition: params.condition ?? "new",
      availability: params.availability ?? "in_stock",
      status: params.status ?? "draft",
      color: null,
      size: null,
      material: null,
      gender: null,
      ageGroup: null,
      pattern: null,
      prompt: params.prompt ?? null,
      composedEmbeddingText: "",
      embeddingVersion: 1,
    };

    record.composedEmbeddingText = this.composeVectorizationText(record);

    let clientProducts = this.productsByClient.get(params.clientId);
    if (!clientProducts) {
      clientProducts = new Map();
      this.productsByClient.set(params.clientId, clientProducts);
    }
    clientProducts.set(record.id, record);

    return ok(record);
  }

  /**
   * Consulta los productos bajo aislamiento RLS (`SET LOCAL app.current_client_id`).
   * Sin contexto RLS devuelve `[]` (`ADM-001 T-13`).
   */
  queryProductsWithRls(rlsCurrentClientId: string | null | undefined): ProductRecord[] {
    if (!rlsCurrentClientId) {
      return [];
    }
    const clientProducts = this.productsByClient.get(rlsCurrentClientId);
    return clientProducts ? Array.from(clientProducts.values()) : [];
  }

  /**
   * Actualiza la configuración de vectorización (`vectorization_config`), rechazando incluir `prompt`,
   * y re-embebe automáticamente los productos afectados (`ADM-001 T-13, RF-05.7`).
   */
  updateVectorizationConfig(
    newAttrs: Array<{ attributeKey: string; enabled: boolean; position: number }>,
  ): Result<{ reembeddedCount: number }> {
    if (newAttrs.some((a) => a.attributeKey.trim().toLowerCase() === "prompt")) {
      return err(
        "Sales prompt ('prompt') must never be included in product embeddings (ADM-001 RF-05.7, T-13).",
        "PROMPT_FORBIDDEN_IN_VECTORIZATION",
      );
    }

    this.vectorizationAttrs = [...newAttrs].sort((a, b) => a.position - b.position);
    let reembeddedCount = 0;

    for (const clientProducts of this.productsByClient.values()) {
      for (const product of clientProducts.values()) {
        product.composedEmbeddingText = this.composeVectorizationText(product);
        product.embeddingVersion += 1;
        reembeddedCount += 1;
      }
    }

    return ok({ reembeddedCount });
  }

  private composeVectorizationText(product: ProductRecord): string {
    const enabledKeys = this.vectorizationAttrs
      .filter((a) => a.enabled && a.attributeKey !== "prompt")
      .sort((a, b) => a.position - b.position)
      .map((a) => a.attributeKey);

    const parts: string[] = [];
    for (const key of enabledKeys) {
      const val = (product as unknown as Record<string, unknown>)[key];
      if (typeof val === "string" && val.trim().length > 0) {
        parts.push(val.trim());
      }
    }
    return parts.join(" | ");
  }

  /**
   * Detecta el formato real de un archivo por sus magic bytes (no por extensión) y rechaza
   * formatos prohibidos como `svg` o `gif` (`ADM-001 T-14, RF-07.12, §11.1`).
   */
  detectAndValidateMediaContent(
    buffer: Buffer,
    originalFilename: string,
  ): Result<{
    mediaKind: "image" | "audio" | "video" | "pdf";
    sourceFormat: string;
    mimeType: string;
  }> {
    const headAscii = buffer.subarray(0, 64).toString("utf8").trimStart().toLowerCase();

    // Rechazo explícito de SVG y GIF (ADM-001 §11.1, T-14)
    if (headAscii.startsWith("<svg") || headAscii.includes("<svg")) {
      return err(
        "SVG files are rejected for security reasons (active scripts risk). Use WebP, AVIF, PNG or JPEG (ADM-001 RF-07.12).",
        "UNSUPPORTED_MEDIA_FORMAT_SVG",
      );
    }
    if (headAscii.startsWith("gif87a") || headAscii.startsWith("gif89a")) {
      return err(
        "GIF files are rejected. Use animated WebP or MP4/WebM video instead (ADM-001 RF-07.12).",
        "UNSUPPORTED_MEDIA_FORMAT_GIF",
      );
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "image",
        sourceFormat: "png",
        mimeType: "image/png",
      });
    }

    // JPEG: FF D8 FF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "image",
        sourceFormat: "jpeg",
        mimeType: "image/jpeg",
      });
    }

    // RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "image",
        sourceFormat: "webp",
        mimeType: "image/webp",
      });
    }

    // ISO BMFF (ftypavif / ftypmp4 / ftypisom)
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
      const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
      if (brand === "avif" || brand === "avis") {
        return this.checkMaxSize(buffer.length, {
          mediaKind: "image",
          sourceFormat: "avif",
          mimeType: "image/avif",
        });
      }
      if (brand.startsWith("mp4") || brand === "isom" || brand === "m4v ") {
        return this.checkMaxSize(buffer.length, {
          mediaKind: "video",
          sourceFormat: "mp4",
          mimeType: "video/webm", // Video se transcodifica a webm canónico (RF-07.15)
        });
      }
    }

    // WebM (EBML: 1A 45 DF A3)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "video",
        sourceFormat: "webm",
        mimeType: "video/webm",
      });
    }

    // PDF: %PDF-
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "pdf",
        sourceFormat: "pdf",
        mimeType: "application/pdf",
      });
    }

    // Audio Ogg Opus: OggS
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "OggS") {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "audio",
        sourceFormat: "opus",
        mimeType: "audio/opus",
      });
    }

    // Audio MP3: ID3 o FF FB
    if (
      (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0)
    ) {
      return this.checkMaxSize(buffer.length, {
        mediaKind: "audio",
        sourceFormat: "mp3",
        mimeType: "audio/mpeg",
      });
    }

    return err(
      `Unsupported or unrecognized file content for '${originalFilename}'. Only WebP, AVIF, PNG, JPEG, Opus, AAC, MP3, MP4, WebM and PDF are allowed (ADM-001 RF-07.12).`,
      "UNSUPPORTED_MEDIA_FORMAT",
    );
  }

  private checkMaxSize(
    sizeBytes: number,
    detected: {
      mediaKind: "image" | "audio" | "video" | "pdf";
      sourceFormat: string;
      mimeType: string;
    },
  ): Result<{
    mediaKind: "image" | "audio" | "video" | "pdf";
    sourceFormat: string;
    mimeType: string;
  }> {
    const maxAllowed = MEDIA_MAX_SIZE_BYTES[detected.mediaKind];
    if (sizeBytes > maxAllowed) {
      return err(
        `File size (${sizeBytes} bytes) exceeds maximum allowed for ${detected.mediaKind} (${maxAllowed} bytes) (ADM-001 RF-07.16).`,
        "MEDIA_FILE_TOO_LARGE",
      );
    }
    return ok(detected);
  }

  /**
   * Sube y vincula un archivo multimedia a un producto, deduplicando globalmente por hash en `media_catalog`
   * y contando la cuota de almacenamiento una sola vez por inquilino en `client_media` (`ADM-001 T-14`).
   *
   * - Si es imagen (`png`, `jpeg`, `webp`, `avif`), se conserva el original validado y se sirve por imgproxy.
   * - Si es video (`mp4`), genera el `webm` canónico y calcula el hash sobre los bytes almacenados.
   * - El `alt_text` se guarda en el vínculo `product_media`, de forma independiente por producto.
   */
  ingestAndLinkProductMedia(params: {
    clientId: string;
    productId: string;
    buffer: Buffer;
    originalFilename: string;
    altText?: string | null;
  }): Result<{
    media: MediaCatalogEntry;
    deduplicatedGlobal: boolean;
    billedBytesForClient: number;
    altText: string | null;
  }> {
    const detectedRes = this.detectAndValidateMediaContent(
      params.buffer,
      params.originalFilename,
    );
    if (!detectedRes.ok) {
      return detectedRes;
    }
    const detected = detectedRes.data;

    // Para video mp4 simulamos el payload canónico webm; para imagen/audio/pdf se conserva el original intacto (RF-07.15)
    const storedBytes =
      detected.mediaKind === "video" && detected.sourceFormat === "mp4"
        ? Buffer.concat([Buffer.from("WEBM_CANONICAL:"), params.buffer])
        : params.buffer;

    const contentHash = createHash("sha256").update(storedBytes).digest("hex");
    let media = this.mediaByHash.get(contentHash);
    let deduplicatedGlobal = true;

    if (!media) {
      deduplicatedGlobal = false;
      const id = `019a0000-0000-7000-8006-${String(this.mediaById.size + 1).padStart(12, "0")}`;
      const ext = detected.mediaKind === "video" ? "webm" : detected.sourceFormat;
      media = {
        id,
        contentHash,
        storagePoolId: "seaweedfs-main",
        storageKey: `objects/${contentHash.slice(0, 2)}/${contentHash}.${ext}`,
        sizeBytes: storedBytes.length,
        mediaKind: detected.mediaKind,
        mimeType: detected.mimeType,
        sourceFormat: detected.sourceFormat,
        originalFilename: params.originalFilename.replace(/[\\/]/g, "_"),
        processingStatus: "ready",
        storageType: "internal",
        sourceUrl: null,
        provider: null,
        gcCandidate: false,
      };
      this.mediaById.set(media.id, media);
      this.mediaByHash.set(contentHash, media);
    }

    // Registrar referencia única del inquilino (client_media)
    let clientSet = this.clientMediaRefs.get(params.clientId);
    if (!clientSet) {
      clientSet = new Set();
      this.clientMediaRefs.set(params.clientId, clientSet);
    }
    clientSet.add(media.id);

    // Registrar vínculo producto-archivo con alt_text propio (product_media)
    const linkKey = `${params.clientId}:${params.productId}:${media.id}`;
    this.productMediaLinks.set(linkKey, {
      clientId: params.clientId,
      productId: params.productId,
      mediaId: media.id,
      altText: params.altText ?? null,
    });

    return ok({
      media,
      deduplicatedGlobal,
      billedBytesForClient: this.getClientBilledStorageBytes(params.clientId),
      altText: params.altText ?? null,
    });
  }

  /**
   * Calcula los bytes facturados al inquilino sumando cada archivo distinto referenciado una sola vez (`ADM-001 RF-04.4, T-14`).
   */
  getClientBilledStorageBytes(clientId: string): number {
    const clientSet = this.clientMediaRefs.get(clientId);
    if (!clientSet) return 0;
    let total = 0;
    for (const mediaId of clientSet) {
      const m = this.mediaById.get(mediaId);
      if (m && m.storageType === "internal" && m.sizeBytes) {
        total += m.sizeBytes;
      }
    }
    return total;
  }

  /**
   * Registra un enlace multimedia externo validando `https` obligatorio, ausencia de credenciales y
   * protección anti-SSRF contra loopback/IPs privadas (`ADM-001 T-14, RF-07.17, RF-07.18, §11.5`).
   *
   * Un enlace externo no consume cuota de almacenamiento (`sizeBytes = null`, `billedBytes = 0`).
   */
  registerExternalMediaLink(params: {
    clientId: string;
    productId: string;
    url: string;
    mediaKind: "video" | "image";
    altText?: string | null;
  }): Result<{ media: MediaCatalogEntry; billedBytesForClient: number }> {
    let parsed: URL;
    try {
      parsed = new URL(params.url);
    } catch {
      return err("Invalid URL format.", "EXTERNAL_MEDIA_INVALID_URL");
    }

    if (parsed.protocol !== "https:") {
      return err(
        "External media URLs must use https:// (ADM-001 RF-07.18, T-14).",
        "EXTERNAL_MEDIA_HTTPS_REQUIRED",
      );
    }

    if (parsed.username || parsed.password) {
      return err(
        "External media URLs must not contain embedded credentials (ADM-001 RF-07.18, T-14).",
        "EXTERNAL_MEDIA_CREDENTIALS_FORBIDDEN",
      );
    }

    const host = parsed.hostname.toLowerCase();
    if (this.isPrivateOrLoopbackHost(host)) {
      return err(
        "External media URLs pointing to loopback or private IP ranges are rejected (SSRF protection, ADM-001 RF-07.18).",
        "EXTERNAL_MEDIA_PRIVATE_IP_FORBIDDEN",
      );
    }

    let providerCode: string | null = null;
    if (params.mediaKind === "video") {
      const matched = DEFAULT_EXTERNAL_MEDIA_PROVIDERS.find((p) =>
        p.hostPattern.test(host),
      );
      if (!matched) {
        return err(
          `External video host '${host}' is not in the admissible external_media_providers catalog (ADM-001 RF-07.17).`,
          "EXTERNAL_VIDEO_PROVIDER_NOT_ALLOWED",
        );
      }
      providerCode = matched.code;
    }

    const normalizedUrl = parsed.toString();
    const contentHash = createHash("sha256").update(normalizedUrl).digest("hex");
    let media = this.mediaByHash.get(contentHash);

    if (!media) {
      const id = `019a0000-0000-7000-8006-${String(this.mediaById.size + 1).padStart(12, "0")}`;
      media = {
        id,
        contentHash,
        storagePoolId: "external",
        storageKey: normalizedUrl,
        sizeBytes: null,
        mediaKind: params.mediaKind,
        mimeType: params.mediaKind === "video" ? "text/html" : "image/external",
        sourceFormat: "external_url",
        originalFilename: parsed.pathname.split("/").pop() || "external",
        processingStatus: "external",
        storageType: "external",
        sourceUrl: normalizedUrl,
        provider: providerCode,
        gcCandidate: false,
      };
      this.mediaById.set(media.id, media);
      this.mediaByHash.set(contentHash, media);
    }

    let clientSet = this.clientMediaRefs.get(params.clientId);
    if (!clientSet) {
      clientSet = new Set();
      this.clientMediaRefs.set(params.clientId, clientSet);
    }
    clientSet.add(media.id);

    const linkKey = `${params.clientId}:${params.productId}:${media.id}`;
    this.productMediaLinks.set(linkKey, {
      clientId: params.clientId,
      productId: params.productId,
      mediaId: media.id,
      altText: params.altText ?? null,
    });

    return ok({
      media,
      billedBytesForClient: this.getClientBilledStorageBytes(params.clientId),
    });
  }

  /**
   * Importa perezosamente una imagen externa sin recodificarla cuando se entrega por primera vez en un canal (`ADM-001 T-14, RF-07.18, §11.5`).
   */
  lazyImportExternalImageOnChannelDelivery(
    mediaId: string,
    downloadedBytes: Buffer,
  ): Result<MediaCatalogEntry> {
    const media = this.mediaById.get(mediaId);
    if (!media || media.mediaKind !== "image") {
      return err("External image media entry not found.", "MEDIA_NOT_FOUND");
    }

    const detected = this.detectAndValidateMediaContent(
      downloadedBytes,
      media.originalFilename,
    );
    if (!detected.ok) {
      media.processingStatus = "failed";
      return detected;
    }

    const newHash = createHash("sha256").update(downloadedBytes).digest("hex");
    media.contentHash = newHash;
    media.storageType = "internal";
    media.storagePoolId = "seaweedfs-main";
    media.storageKey = `objects/${newHash.slice(0, 2)}/${newHash}.${detected.data.sourceFormat}`;
    media.sizeBytes = downloadedBytes.length;
    media.mimeType = detected.data.mimeType;
    media.sourceFormat = detected.data.sourceFormat;
    media.processingStatus = "ready";

    return ok(media);
  }

  /**
   * Genera una URL firmada con HMAC-SHA256 para imgproxy (`media.mocter.co`) apuntando exclusivamente
   * al bucket interno `s3://media/<storageKey>` (`ADM-001 T-14A, RF-07.19 a RF-07.21`).
   */
  signImgproxyUrl(params: {
    storageKey: string;
    width: number;
    height: number;
    resizingType?: "fit" | "fill" | "auto";
    format?: "webp" | "avif" | "png" | "jpeg";
    expiresUnixSec?: number;
    keyPairIndex?: number;
  }): Result<{ signedUrl: string; pathAndSource: string; signature: string }> {
    if (
      params.width <= 0 ||
      params.height <= 0 ||
      params.width > IMGPROXY_PLATFORM_LIMITS.maxResultDimensionPx ||
      params.height > IMGPROXY_PLATFORM_LIMITS.maxResultDimensionPx
    ) {
      return err(
        `Requested dimensions (${params.width}x${params.height}) exceed imgproxy maximum dimension of ${IMGPROXY_PLATFORM_LIMITS.maxResultDimensionPx}px (ADM-001 T-14A, RF-07.21).`,
        "IMGPROXY_DIMENSION_LIMIT_EXCEEDED",
      );
    }

    const resizingType = params.resizingType ?? "fit";
    const format = params.format ?? "webp";
    const optionsParts = [`rs:${resizingType}:${params.width}:${params.height}:0`];
    if (params.expiresUnixSec !== undefined) {
      optionsParts.push(`exp:${params.expiresUnixSec}`);
    }

    const pathAndSource = `/${optionsParts.join("/")}/plain/s3://${IMGPROXY_PLATFORM_LIMITS.bucket}/${params.storageKey}@${format}`;
    const pair = this.imgproxyKeyPairs[params.keyPairIndex ?? 0]!;
    const signature = this.computeImgproxyHmac(pair.keyHex, pair.saltHex, pathAndSource);

    return ok({
      signedUrl: `${this.imgproxyBaseUrl}/${signature}${pathAndSource}`,
      pathAndSource,
      signature,
    });
  }

  /**
   * Simula la verificación de puerta de enlace de imgproxy (`media.mocter.co`) para validar firmas,
   * rotación de claves (`keyPairs`), caducidad (`exp`), cola de 100 solicitudes (`429`) y límites (`ADM-001 T-14A`).
   */
  verifyImgproxyRequest(params: {
    signature: string;
    pathAndSource: string;
    nowUnixSec?: number;
    currentQueueDepth?: number;
    sourceFileBytes?: number;
    isAnimated?: boolean;
  }): { status: 200 | 403 | 404 | 422 | 429; format?: string; framesDelivered?: number; reason?: string } {
    if ((params.currentQueueDepth ?? 0) >= IMGPROXY_PLATFORM_LIMITS.maxQueueSize) {
      return { status: 429, reason: "IMGPROXY_QUEUE_FULL" };
    }

    // Validar firma contra cualquiera de los pares vigentes (soporta rotación de claves sin invalidar el par anterior)
    const validSignature = this.imgproxyKeyPairs.some((pair) => {
      const expected = this.computeImgproxyHmac(
        pair.keyHex,
        pair.saltHex,
        params.pathAndSource,
      );
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(params.signature, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    });

    if (!validSignature) {
      return { status: 403, reason: "INVALID_OR_MISSING_SIGNATURE" };
    }

    if (!params.pathAndSource.includes(`/plain/s3://${IMGPROXY_PLATFORM_LIMITS.bucket}/`)) {
      return { status: 403, reason: "SOURCE_BUCKET_NOT_ALLOWED" };
    }

    const expMatch = params.pathAndSource.match(/\/exp:(\d+)\//);
    if (expMatch) {
      const exp = Number(expMatch[1]);
      const now = params.nowUnixSec ?? Math.floor(Date.now() / 1000);
      if (now > exp) {
        return { status: 404, reason: "URL_EXPIRED" };
      }
    }

    if (
      params.sourceFileBytes !== undefined &&
      params.sourceFileBytes > IMGPROXY_PLATFORM_LIMITS.maxSourceBytes
    ) {
      return { status: 422, reason: "SOURCE_FILE_TOO_LARGE" };
    }

    const formatMatch = params.pathAndSource.match(/@(webp|avif|png|jpeg)$/);
    return {
      status: 200,
      format: formatMatch ? formatMatch[1] : "webp",
      framesDelivered: IMGPROXY_PLATFORM_LIMITS.maxAnimationFrames,
    };
  }

  /**
   * Desvincula un archivo de un producto y ejecuta el GC en dos fases consultando todas las celdas (`ADM-001 T-15, RF-07.7, RF-07.8`).
   *
   * - Si alguna celda está caída (`unreachableCells > 0`), aborta el borrado físico.
   * - Solo cuando todas las celdas responden y ninguna referencia el archivo, se elimina de `media_catalog`/SeaweedFS.
   */
  unlinkProductMediaAndRunTwoPhaseGc(params: {
    clientId: string;
    productId: string;
    mediaId: string;
    allCellsHealthy: boolean;
  }): { deletedFromStorage: boolean; remainingReferences: number; abortedByUnhealthyCell: boolean } {
    const linkKey = `${params.clientId}:${params.productId}:${params.mediaId}`;
    this.productMediaLinks.delete(linkKey);

    // Verificar si al inquilino le queda algún otro producto usando ese mediaId
    const stillUsedByClient = Array.from(this.productMediaLinks.values()).some(
      (l) => l.clientId === params.clientId && l.mediaId === params.mediaId,
    );
    if (!stillUsedByClient) {
      this.clientMediaRefs.get(params.clientId)?.delete(params.mediaId);
    }

    // Fase 1: marcar candidato
    const media = this.mediaById.get(params.mediaId);
    if (media) {
      media.gcCandidate = true;
    }

    // Fase 2: consultar todas las celdas
    if (!params.allCellsHealthy) {
      return {
        deletedFromStorage: false,
        remainingReferences: -1,
        abortedByUnhealthyCell: true,
      };
    }

    const totalRemaining = Array.from(this.productMediaLinks.values()).filter(
      (l) => l.mediaId === params.mediaId,
    ).length;

    if (totalRemaining === 0 && media) {
      this.mediaById.delete(params.mediaId);
      this.mediaByHash.delete(media.contentHash);
      return {
        deletedFromStorage: true,
        remainingReferences: 0,
        abortedByUnhealthyCell: false,
      };
    }

    if (media) {
      media.gcCandidate = false;
    }
    return {
      deletedFromStorage: false,
      remainingReferences: totalRemaining,
      abortedByUnhealthyCell: false,
    };
  }

  private computeImgproxyHmac(
    keyHex: string,
    saltHex: string,
    pathAndSource: string,
  ): string {
    const key = Buffer.from(keyHex, "hex");
    const salt = Buffer.from(saltHex, "hex");
    return createHmac("sha256", key)
      .update(salt)
      .update(pathAndSource)
      .digest("base64url");
  }

  private isPrivateOrLoopbackHost(host: string): boolean {
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".internal") ||
      host === "::1" ||
      host === "[::1]"
    ) {
      return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 127 ||
      a === 10 ||
      a === 0 ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
}
