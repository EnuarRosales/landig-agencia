/**
 * Tipo canónico de archivo multimedia admitido en catálogo y archivos de inquilino.
 */
export type MediaMagicKind = "image" | "video" | "audio" | "pdf";

/**
 * Resultado de inspección por firma binaria (magic bytes) de un archivo recibido.
 */
export interface MediaMagicValidationResult {
  valid: boolean;
  detectedMime?: string;
  mediaKind?: MediaMagicKind;
  ext?: string;
  error?: string;
}

/**
 * Límites máximos de peso binario por tipo de archivo multimedia (`SPEC-00`, `SPEC-08 §8.2`).
 */
export const MAX_UPLOAD_BYTES_BY_KIND: Record<MediaMagicKind, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  audio: 25 * 1024 * 1024, // 25 MB
  pdf: 25 * 1024 * 1024, // 25 MB
  video: 100 * 1024 * 1024, // 100 MB
};

/**
 * Valida los magic bytes de un archivo multimedia o comprobante para prevenir
 * spoofing de extensiones, scripts activos (SVG) y ejecutables binarios.
 *
 * Admite:
 * - Imágenes: JPEG, PNG, WEBP, AVIF (rechaza GIF y SVG).
 * - Video: MP4, WEBM, MOV.
 * - Audio: MP3, OGG/Opus, WAV, M4A.
 * - Documentos: PDF.
 *
 * @param buffer - Buffer binario del archivo recibido.
 * @returns Resultado con tipo lógico (`mediaKind`), MIME real y extensión canónica.
 */
export function validateMediaMagicBytes(buffer: Buffer): MediaMagicValidationResult {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: "Archivo demasiado pequeño o vacío." };
  }

  // Bloqueo de ejecutables DOS/PE (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: "Archivos ejecutables binarios no están permitidos." };
  }

  // Bloqueo de ejecutables ELF (0x7F 'ELF')
  if (
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { valid: false, error: "Binarios ELF no están permitidos." };
  }

  // Bloqueo explícito de SVG por riesgo de XSS / scripts activos
  const headText = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (
    headText.startsWith("<svg") ||
    (headText.startsWith("<?xml") && headText.includes("<svg"))
  ) {
    return {
      valid: false,
      error: "Archivos SVG rechazados por seguridad. Usa PNG, JPEG o WebP.",
    };
  }

  // Rechazo explícito de GIF ('GIF8')
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return {
      valid: false,
      error: "Archivos GIF no están permitidos. Usa PNG, JPEG, WebP o video MP4/WebM.",
    };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg", mediaKind: "image", ext: "jpg" };
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, detectedMime: "image/png", mediaKind: "image", ext: "png" };
  }

  // Contenedores RIFF ('RIFF' .... 'WEBP' | 'WAVE')
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    const fourCc = buffer.subarray(8, 12).toString("ascii");
    if (fourCc === "WEBP") {
      return { valid: true, detectedMime: "image/webp", mediaKind: "image", ext: "webp" };
    }
    if (fourCc === "WAVE") {
      return { valid: true, detectedMime: "audio/wav", mediaKind: "audio", ext: "wav" };
    }
  }

  // PDF: %PDF
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, detectedMime: "application/pdf", mediaKind: "pdf", ext: "pdf" };
  }

  // WebM / EBML: 1A 45 DF A3
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { valid: true, detectedMime: "video/webm", mediaKind: "video", ext: "webm" };
  }

  // OGG (Opus / Vorbis): 'OggS'
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return { valid: true, detectedMime: "audio/ogg", mediaKind: "audio", ext: "ogg" };
  }

  // ISO Base Media File Format: ....ftyp<brand>
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brandRaw = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    const brand = brandRaw.trim();
    if (brand === "avif" || brand === "avis") {
      return { valid: true, detectedMime: "image/avif", mediaKind: "image", ext: "avif" };
    }
    if (brand === "m4a" || brand === "m4b" || brand === "m4p") {
      return { valid: true, detectedMime: "audio/mp4", mediaKind: "audio", ext: "m4a" };
    }
    if (brand === "qt") {
      return { valid: true, detectedMime: "video/quicktime", mediaKind: "video", ext: "mov" };
    }
    if (
      brand.startsWith("mp4") ||
      brand === "isom" ||
      brand === "iso2" ||
      brand === "iso5" ||
      brand === "iso6" ||
      brand === "avc1" ||
      brand === "m4v" ||
      brand === "f4v"
    ) {
      return { valid: true, detectedMime: "video/mp4", mediaKind: "video", ext: "mp4" };
    }
  }

  // MP3: etiqueta ID3 o sync frame MPEG-1/2 Audio (FF E0..FF excluyendo reservados)
  if (
    buffer.subarray(0, 3).toString("ascii") === "ID3" ||
    (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0 && (buffer[1]! & 0x06) !== 0x00)
  ) {
    return { valid: true, detectedMime: "audio/mpeg", mediaKind: "audio", ext: "mp3" };
  }

  return {
    valid: false,
    error:
      "Formato no admitido. Formatos permitidos: PNG, JPEG, WEBP, AVIF, MP4, WEBM, MOV, MP3, OGG, WAV, M4A, PDF.",
  };
}
