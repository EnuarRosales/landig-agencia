import { err, ok, type Result } from "../types/result";

/**
 * Configuración mínima requerida del canal Bre-B para construir un QR dinámico.
 */
export interface BreBChannelConfig {
  isEnabled: boolean;
  supportedCountries: string[];
  breBKeyType: "phone" | "email" | "document" | "alphanumeric" | "merchant_code" | string | null;
  breBKeyValue: string | null;
  breBRecipientName: string | null;
}

/**
 * Entrada para la generación determinística de payload y QR dinámico Bre-B (SPEC-04 §3.1).
 */
export interface BuildDynamicBreBPaymentInput {
  config: BreBChannelConfig;
  country: string | null | undefined;
  currency: string;
  amountCents: number;
  invoiceNumber: string;
  referenceCode?: string;
}

/**
 * Salida estructurada del payload EMVCo/Bre-B y representación SVG Data URL escaneable.
 */
export interface DynamicBreBPaymentPayload {
  payload: string;
  qrSvg: string;
  qrSvgDataUrl: string;
  recipientName: string;
  keyType: string;
  keyValue: string;
  amountCents: number;
  amountFormattedCop: string;
  currency: "COP";
  invoiceNumber: string;
  referenceCode: string;
}

/**
 * Formatea un tag EMVCo TLV (`ID` + longitud de 2 dígitos + valor).
 */
function formatEmvTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

/**
 * Normaliza cadenas ASCII imprimibles exigidas por EMVCo Merchant-Presented QR.
 */
function sanitizeEmvAscii(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, maxLength);
}

/**
 * Calcula CRC-16/CCITT-FALSE (polinomio `0x1021`, semilla `0xFFFF`) exigido en el tag `63` de EMVCo.
 *
 * @param data - Cadena ASCII completa incluyendo el prefijo `6304`.
 * @returns Checksum hexadecimal en mayúsculas de 4 caracteres.
 */
export function computeEmvCrc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ─────────────────────────────────────────────────────────────────────────────
// Codificador QR puro ISO/IEC 18004 (Byte Mode, EC Level M, Versiones 1..12)
// Sin dependencias externas para garantizar seguridad y determinismo.
// ─────────────────────────────────────────────────────────────────────────────

interface QrVersionSpec {
  version: number;
  dataCodewords: number;
  ecPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
  alignmentCenters: number[];
}

// Especificación oficial ISO/IEC 18004 Nivel M para Versiones 1 a 12 (soporta > 280 bytes)
const QR_VERSION_SPECS_M: readonly QrVersionSpec[] = [
  { version: 1, dataCodewords: 16, ecPerBlock: 10, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [] },
  { version: 2, dataCodewords: 28, ecPerBlock: 16, group1Blocks: 1, group1DataCodewords: 28, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 18] },
  { version: 3, dataCodewords: 44, ecPerBlock: 26, group1Blocks: 1, group1DataCodewords: 44, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 22] },
  { version: 4, dataCodewords: 64, ecPerBlock: 18, group1Blocks: 2, group1DataCodewords: 32, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 26] },
  { version: 5, dataCodewords: 86, ecPerBlock: 24, group1Blocks: 2, group1DataCodewords: 43, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 30] },
  { version: 6, dataCodewords: 108, ecPerBlock: 16, group1Blocks: 4, group1DataCodewords: 27, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 34] },
  { version: 7, dataCodewords: 124, ecPerBlock: 18, group1Blocks: 4, group1DataCodewords: 31, group2Blocks: 0, group2DataCodewords: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, dataCodewords: 154, ecPerBlock: 22, group1Blocks: 2, group1DataCodewords: 38, group2Blocks: 2, group2DataCodewords: 39, alignmentCenters: [6, 24, 42] },
  { version: 9, dataCodewords: 182, ecPerBlock: 22, group1Blocks: 3, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37, alignmentCenters: [6, 26, 46] },
  { version: 10, dataCodewords: 216, ecPerBlock: 26, group1Blocks: 4, group1DataCodewords: 43, group2Blocks: 1, group2DataCodewords: 44, alignmentCenters: [6, 28, 50] },
  { version: 11, dataCodewords: 254, ecPerBlock: 30, group1Blocks: 1, group1DataCodewords: 50, group2Blocks: 4, group2DataCodewords: 51, alignmentCenters: [6, 30, 54] },
  { version: 12, dataCodewords: 290, ecPerBlock: 22, group1Blocks: 6, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37, alignmentCenters: [6, 32, 58] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function buildRsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!;
      next[j + 1]! ^= gfMul(poly[j]!, factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGeneratorPoly(ecCount);
  const work = new Uint8Array(data.length + ecCount);
  work.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = work[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        work[i + j]! ^= gfMul(gen[j]!, coef);
      }
    }
  }
  return work.slice(data.length);
}

function encodeQrDataBits(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode indicator 0100 (Byte)
  pushBits(0b0100, 4);
  // Character count indicator (8 bits para V1-9, 16 bits para V10+)
  pushBits(bytes.length, spec.version >= 10 ? 16 : 8);

  for (const b of bytes) {
    pushBits(b, 8);
  }

  const totalBitsCapacity = spec.dataCodewords * 8;
  const terminatorLen = Math.min(4, totalBitsCapacity - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(spec.dataCodewords);
  let idx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    codewords[idx++] = byte;
  }

  let padToggle = 0;
  while (idx < spec.dataCodewords) {
    codewords[idx++] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: Uint8Array, spec: QrVersionSpec): number[] {
  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let b = 0; b < spec.group1Blocks; b++) {
    const slice = dataCodewords.slice(offset, offset + spec.group1DataCodewords);
    offset += spec.group1DataCodewords;
    blocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecPerBlock));
  }
  for (let b = 0; b < spec.group2Blocks; b++) {
    const slice = dataCodewords.slice(offset, offset + spec.group2DataCodewords);
    offset += spec.group2DataCodewords;
    blocks.push(slice);
    ecBlocks.push(computeRsRemainder(slice, spec.ecPerBlock));
  }

  const result: number[] = [];
  const maxDataLen = Math.max(spec.group1DataCodewords, spec.group2DataCodewords);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of blocks) {
      if (i < blk.length) result.push(blk[i]!);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) result.push(ec[i]!);
    }
  }
  return result;
}

function computeFormatBits(maskPattern: number): number {
  // EC level M = 00 -> 5 bits: 00 + mask (3 bits)
  const data = (0b00 << 3) | (maskPattern & 0b111);
  let rem = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= gen << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= gen << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function buildQrMatrix(text: string): boolean[][] {
  const bytes = Buffer.from(text, "utf8");
  const spec = QR_VERSION_SPECS_M.find((s) => {
    const countBits = s.version >= 10 ? 16 : 8;
    const overheadBytes = Math.ceil((4 + countBits) / 8);
    return bytes.length + overheadBytes <= s.dataCodewords;
  });

  if (!spec) {
    throw new Error("El payload Bre-B supera la capacidad máxima soportada para el QR.");
  }

  const size = 17 + spec.version * 4;
  const dataCodewords = encodeQrDataBits(bytes, spec);
  const fullStream = interleaveCodewords(dataCodewords, spec);

  // Construir mapa base de módulos fijos + bitmap reservado
  const baseModules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFixed = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      baseModules[r]![c] = dark;
      reserved[r]![c] = true;
    }
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const isSep = dr === -1 || dr === 7 || dc === -1 || dc === 7;
        const isDark =
          !isSep &&
          (dr === 0 ||
            dr === 6 ||
            dc === 0 ||
            dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFixed(r, c, isDark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (const rCenter of centers) {
    for (const cCenter of centers) {
      if (reserved[rCenter]![cCenter]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFixed(rCenter + dr, cCenter + dc, isDark);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }

  // Dark module
  setFixed(4 * spec.version + 9, 8, true);

  // Reservar áreas de formato
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8]![i] = true;
      reserved[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8]![size - 1 - i] = true;
  }
  for (let i = 0; i < 7; i++) {
    reserved[size - 1 - i]![8] = true;
  }

  // Version info (para V >= 7)
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vBits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      setFixed(a, b, dark);
      setFixed(b, a, dark);
    }
  }

  // Colocar flujo de datos en zig-zag vertical
  const streamBits: number[] = [];
  for (const cw of fullStream) {
    for (let b = 7; b >= 0; b--) {
      streamBits.push((cw >> b) & 1);
    }
  }

  const rawDataMatrix: boolean[][] = baseModules.map((row) => [...row]);
  let bitIdx = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol--;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [rightCol, rightCol - 1]) {
        if (!reserved[r]![c]) {
          const bit = bitIdx < streamBits.length ? streamBits[bitIdx++]! : 0;
          rawDataMatrix[r]![c] = bit === 1;
        }
      }
    }
    upward = !upward;
  }

  // Evaluar máscaras 0..7 para minimizar penalizaciones ISO 18004
  const maskPredicate = (mask: number, r: number, c: number): boolean => {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };

  let bestMatrix = rawDataMatrix;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = rawDataMatrix.map((row, r) =>
      row.map((val, c) => (reserved[r]![c] ? val : maskPredicate(mask, r, c) ? !val : val)),
    );

    // Escribir bits de formato de la máscara elegida
    const fmt = computeFormatBits(mask);
    for (let i = 0; i < 6; i++) candidate[8]![i] = ((fmt >> i) & 1) === 1;
    candidate[8]![7] = ((fmt >> 6) & 1) === 1;
    candidate[8]![8] = ((fmt >> 7) & 1) === 1;
    candidate[7]![8] = ((fmt >> 8) & 1) === 1;
    for (let i = 9; i < 15; i++) candidate[14 - i]![8] = ((fmt >> i) & 1) === 1;

    for (let i = 0; i < 8; i++) candidate[8]![size - 1 - i] = ((fmt >> (14 - i)) & 1) === 1;
    for (let i = 0; i < 7; i++) candidate[size - 1 - i]![8] = ((fmt >> i) & 1) === 1;

    const penalty = evaluateQrPenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatrix = candidate;
    }
  }

  return bestMatrix;
}

function evaluateQrPenalty(matrix: boolean[][], size: number): number {
  let penalty = 0;

  // Regla 1: corridas de 5+ módulos iguales en filas y columnas
  for (let r = 0; r < size; r++) {
    let runColor = matrix[r]![0]!;
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r]![c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c++) {
    let runColor = matrix[0]![c]!;
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r]![c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Regla 2: bloques 2x2 del mismo color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = matrix[r]![c]!;
      if (matrix[r]![c + 1] === color && matrix[r + 1]![c] === color && matrix[r + 1]![c + 1] === color) {
        penalty += 3;
      }
    }
  }

  // Regla 4: balance de proporción oscuro/claro
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]![c]) darkCount++;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const deviation = Math.abs(Math.round(percent) - 50);
  penalty += Math.floor(deviation / 5) * 10;

  return penalty;
}

/**
 * Renderiza una matriz booleana QR en un documento SVG de alto contraste con zona tranquila (quiet zone) blanca.
 */
function renderQrMatrixToSvg(matrix: boolean[][], quietZone: number = 4, modulePx: number = 6): string {
  const size = matrix.length;
  const totalModules = size + quietZone * 2;
  const dimension = totalModules * modulePx;
  const pathParts: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]![c]) {
        const x = (c + quietZone) * modulePx;
        const y = (r + quietZone) * modulePx;
        pathParts.push(`M${x},${y}h${modulePx}v${modulePx}h-${modulePx}z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension}" height="${dimension}" role="img" aria-label="Código QR Dinámico Bre-B">`,
    `<rect width="100%" height="100%" fill="#FFFFFF"/>`,
    `<path d="${pathParts.join("")}" fill="#0F172A"/>`,
    `</svg>`,
  ].join("");
}

/**
 * Servicio de generación determinística de payloads y Códigos QR Dinámicos para **Bre-B Colombia**
 * (`SPEC-04 T-02`, `RN-SPEC-04-02`, `RN-SPEC-04-03`).
 */
export class BreBQrService {
  /**
   * Construye el payload EMVCo/Bre-B con el monto exacto en COP y genera su representación SVG escaneable.
   *
   * Reglas:
   * - Solo permitido para comercios en Colombia (`country === "CO"`) y facturación en `COP`.
   * - Exige que la llave Bre-B y el nombre del receptor estén configurados en el panel de administración.
   * - Usa código monetario ISO 4217 `170` correspondiente a Pesos Colombianos (`COP`) e indicador dinámico `01=12`.
   *
   * @param input - Configuración del canal Bre-B, país, moneda, importe en centavos y referencia de factura.
   * @returns `Result` con el payload EMVCo exacto, SVG y Data URL base64, o error de dominio tipado.
   */
  buildDynamicBreBPaymentPayload(
    input: BuildDynamicBreBPaymentInput,
  ): Result<DynamicBreBPaymentPayload> {
    const normalizedCountry = (input.country || "").trim().toUpperCase();
    const normalizedCurrency = (input.currency || "").trim().toUpperCase();

    if (normalizedCountry !== "CO" || normalizedCurrency !== "COP") {
      return err(
        "El método de pago inmediato Bre-B está disponible exclusivamente para comercios en Colombia (CO) con facturación en COP.",
        "BRE_B_COLOMBIA_ONLY",
      );
    }

    if (!input.config.isEnabled) {
      return err(
        "El canal de cobro Bre-B se encuentra deshabilitado en la plataforma.",
        "GATEWAY_DISABLED",
      );
    }

    const supportedCountries = input.config.supportedCountries || [];
    if (
      supportedCountries.length > 0 &&
      !supportedCountries.includes("*") &&
      !supportedCountries.map((c) => c.toUpperCase()).includes("CO")
    ) {
      return err(
        "Bre-B solo admite cobertura geográfica en Colombia (CO).",
        "BRE_B_COLOMBIA_ONLY",
      );
    }

    const keyValue = (input.config.breBKeyValue || "").trim();
    const keyType = (input.config.breBKeyType || "").trim();
    const recipientName = (input.config.breBRecipientName || "").trim();

    if (!keyValue || !keyType || !recipientName) {
      return err(
        "La configuración de llave Bre-B o titular receptor está incompleta en el panel de administración.",
        "BRE_B_NOT_CONFIGURED",
      );
    }

    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return err(
        "El monto para generar un Código QR Dinámico Bre-B debe ser mayor a cero.",
        "INVALID_AMOUNT",
      );
    }

    const amountCopNumeric = input.amountCents / 100;
    const amountCopStr = Number.isInteger(amountCopNumeric)
      ? String(amountCopNumeric)
      : amountCopNumeric.toFixed(2);
    const amountFormattedCop = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amountCopNumeric);

    const referenceCode = sanitizeEmvAscii(input.referenceCode || input.invoiceNumber, 25) || "MOCTER";
    const safeInvoice = sanitizeEmvAscii(input.invoiceNumber, 25) || referenceCode;
    const safeRecipient = sanitizeEmvAscii(recipientName, 25) || "MOCTER";
    const safeKey = sanitizeEmvAscii(keyValue, 64);

    // Estándar EMVCo Merchant-Presented QR Dinámico para Bre-B Colombia:
    // Sub-etiqueta 00 = identificador de red Bre-B; sub-etiqueta 01 = valor exacto de la llave destino.
    const merchantAccountInfo = [
      formatEmvTlv("00", "CO.COM.BANREP.BREB"),
      formatEmvTlv("01", safeKey),
    ].join("");

    const additionalData = [
      formatEmvTlv("01", safeInvoice),
      formatEmvTlv("05", referenceCode),
    ].join("");

    const unsignedPayload = [
      formatEmvTlv("00", "01"), // Payload Format Indicator
      formatEmvTlv("01", "12"), // Point of Initiation Method: 12 = QR Dinámico
      formatEmvTlv("26", merchantAccountInfo), // Red Bre-B Banco de la República
      formatEmvTlv("52", "5734"), // MCC Software / SaaS
      formatEmvTlv("53", "170"), // ISO 4217 COP (Colombia)
      formatEmvTlv("54", amountCopStr), // Monto exacto en COP
      formatEmvTlv("58", "CO"), // País Colombia
      formatEmvTlv("59", safeRecipient),
      formatEmvTlv("60", "BOGOTA"),
      formatEmvTlv("62", additionalData),
      "6304",
    ].join("");

    const crc = computeEmvCrc16Ccitt(unsignedPayload);
    const finalPayload = `${unsignedPayload}${crc}`;

    const matrix = buildQrMatrix(finalPayload);
    const qrSvg = renderQrMatrixToSvg(matrix, 4, 6);
    const qrSvgDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg, "utf8").toString("base64")}`;

    return ok({
      payload: finalPayload,
      qrSvg,
      qrSvgDataUrl,
      recipientName,
      keyType,
      keyValue,
      amountCents: input.amountCents,
      amountFormattedCop,
      currency: "COP",
      invoiceNumber: safeInvoice,
      referenceCode,
    });
  }
}

export const defaultBreBQrService = new BreBQrService();
