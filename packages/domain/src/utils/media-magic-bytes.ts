/**
 * Valida los magic bytes de un archivo multimedia o comprobante para prevenir
 * extension spoofing y carga de archivos ejecutables binarios.
 *
 * @param buffer - Buffer binario del archivo recibido.
 * @returns Objeto indicando validez y MIME detectado (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`).
 */
export function validateMediaMagicBytes(
  buffer: Buffer,
): { valid: boolean; detectedMime?: string; error?: string } {
  if (buffer.length < 4) {
    return { valid: false, error: "Archivo demasiado pequeño o vacío." };
  }

  // Comprobar ejecutable DOS/PE (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: "Archivos ejecutables binarios no están permitidos." };
  }

  // Comprobar ejecutable ELF (0x7F 'E' 'L' 'F')
  if (
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { valid: false, error: "Binarios ELF no están permitidos." };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, detectedMime: "image/png" };
  }

  // GIF: 'G' 'I' 'F' '8'
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { valid: true, detectedMime: "image/gif" };
  }

  // WEBP: 'R' 'I' 'F' 'F' ... 'W' 'E' 'B' 'P'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: "image/webp" };
  }

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, detectedMime: "application/pdf" };
  }

  return {
    valid: false,
    error: "Formato no admitido. Formatos permitidos: JPEG, PNG, WEBP, GIF, PDF.",
  };
}
