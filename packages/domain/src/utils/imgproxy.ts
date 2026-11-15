import { createHmac } from "node:crypto";
import { env } from "./env";

/**
 * Configuración dinámica de firma y límites de `imgproxy` leída desde variables de entorno validadas.
 * Se resuelven por getter para reflejar cambios de entorno en runtime/test sin valores fijos inseguros.
 */
export const IMGPROXY_DEFAULTS = {
  maxDimensionPx: 4096,
  get bucket(): string {
    return env.S3_BUCKET ?? "media";
  },
  get keyHex(): string {
    return env.IMGPROXY_KEY ?? "";
  },
  get saltHex(): string {
    return env.IMGPROXY_SALT ?? "";
  },
  get baseUrl(): string {
    return (env.IMGPROXY_PUBLIC_URL || env.IMGPROXY_BASE_URL || "").replace(/\/+$/, "");
  },
};

/**
 * Genera la firma HMAC-SHA256 URL-safe en base64 para un path de imgproxy (`CEL-RF-019`, `D-T1.4`).
 *
 * @param path - Ruta relativa de transformación de imgproxy (debe iniciar con `/`).
 * @param keyHex - Clave HMAC hexadecimal; por defecto se lee desde `IMGPROXY_KEY`.
 * @param saltHex - Sal HMAC hexadecimal; por defecto se lee desde `IMGPROXY_SALT`.
 * @returns Firma codificada en Base64 URL-safe sin relleno `=`.
 */
export function signImgproxyPath(
  path: string,
  keyHex: string = IMGPROXY_DEFAULTS.keyHex,
  saltHex: string = IMGPROXY_DEFAULTS.saltHex,
): string {
  if (!keyHex || !saltHex) {
    throw new Error(
      "Configuración incompleta de imgproxy: IMGPROXY_KEY e IMGPROXY_SALT son obligatorios.",
    );
  }

  const keyBin = Buffer.from(keyHex, "hex");
  const saltBin = Buffer.from(saltHex, "hex");
  const pathBin = Buffer.from(path, "utf8");

  const hmac = createHmac("sha256", keyBin);
  hmac.update(saltBin);
  hmac.update(pathBin);

  return hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Construye la URL pública completa y firmada para servir recursos mediante imgproxy.
 *
 * @param storageKey - Clave del objeto almacenado en el bucket S3.
 * @param options - Opciones de redimensionamiento y formato de salida.
 * @returns URL firmada lista para consumo del navegador.
 */
export function buildImgproxyUrl(
  storageKey: string,
  options: {
    width?: number;
    height?: number;
    resizingType?: "fit" | "fill" | "auto";
    format?: "webp" | "png" | "jpg";
  } = {},
): string {
  const width = options.width || 400;
  const height = options.height || 400;
  if (
    width > IMGPROXY_DEFAULTS.maxDimensionPx ||
    height > IMGPROXY_DEFAULTS.maxDimensionPx
  ) {
    throw new Error(
      `Dimensiones (${width}x${height}) exceden el límite máximo de ${IMGPROXY_DEFAULTS.maxDimensionPx}px.`,
    );
  }

  const baseUrl = IMGPROXY_DEFAULTS.baseUrl;
  if (!baseUrl) {
    throw new Error(
      "Configuración incompleta de imgproxy: IMGPROXY_PUBLIC_URL es obligatorio.",
    );
  }

  const resizingType = options.resizingType || "fit";
  const format = options.format || "webp";
  const cleanKey = storageKey.replace(/^\/+/, "");
  const path = `/resize:${resizingType}:${width}:${height}:0/plain/s3://${IMGPROXY_DEFAULTS.bucket}/${cleanKey}@${format}`;
  const signature = signImgproxyPath(path);
  return `${baseUrl}/${signature}${path}`;
}
