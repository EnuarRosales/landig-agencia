import type { OrderWithDetails } from "../repositories/orders.repository.interface";
import { buildQrMatrix, renderQrMatrixToSvg } from "./breb-qr.service";

/**
 * Tamaño físico de papel soportado para la guía / remisión de envío (`SPEC-11`).
 */
export type OrderGuideSize = "10x15" | "letter";

/**
 * Formato de salida admitido para la guía logística (`SPEC-11`).
 */
export type OrderGuideFormat = "html" | "pdf";

/**
 * Datos del comercio remitente exhibidos en la cabecera de la guía.
 */
export interface OrderGuideMerchantInfo {
  businessName: string;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  documentNumber?: string | null;
  locale?: "es" | "en";
}

/**
 * Entrada para renderizar la guía logística o rótulo de envío de un pedido.
 */
export interface RenderOrderGuideInput {
  orderDetails: OrderWithDetails;
  merchant: OrderGuideMerchantInfo;
  size?: OrderGuideSize;
  format?: OrderGuideFormat;
  verificationBaseUrl?: string | null;
}

/**
 * Resultado renderizado de la guía listo para entrega HTTP en `/api/tenant/orders/[id]/guide`.
 */
export interface RenderedOrderGuide {
  contentType: "text/html; charset=utf-8" | "application/pdf";
  filename: string;
  body: string | Buffer;
  qrPayload: string;
}

/**
 * Escapa caracteres HTML especiales para prevenir inyección en plantillas HTML.
 */
function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formatea valores monetarios enteros en centavos de forma legible sin decimales flotantes.
 */
function formatMoneyCents(cents: number, currency: string, locale: "es" | "en"): string {
  const code = (currency || "COP").toUpperCase();
  const amount = Math.round(cents) / 100;
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "COP" || code === "CLP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${code}`;
  }
}

/**
 * Determina si el método de pago corresponde a cobro contraentrega.
 */
function isCashOnDeliveryMethod(paymentMethod: string): boolean {
  const normalized = paymentMethod.trim().toLowerCase();
  return (
    normalized.includes("contraentrega") ||
    normalized.includes("contra entrega") ||
    normalized.includes("cash_on_delivery") ||
    normalized === "cod"
  );
}

/**
 * Resuelve el bloque de recaudo o estado de pago de la guía según `RN-SPEC-11-06`.
 */
function resolveCollectionBanner(
  order: OrderWithDetails["order"],
  locale: "es" | "en",
): { label: string; amountText: string; isPaid: boolean; isCod: boolean } {
  const formattedTotal = formatMoneyCents(order.totalCents, order.currency, locale);
  if (order.paymentStatus === "paid") {
    return {
      label: locale === "en" ? "PAYMENT STATUS" : "ESTADO DE PAGO",
      amountText: locale === "en" ? "PAID" : "PAGADO",
      isPaid: true,
      isCod: false,
    };
  }
  const isCod = isCashOnDeliveryMethod(order.paymentMethod);
  if (isCod) {
    return {
      label: locale === "en" ? "COLLECT ON DELIVERY" : "VALOR A RECAUDAR",
      amountText: formattedTotal,
      isPaid: false,
      isCod: true,
    };
  }
  return {
    label: locale === "en" ? "PAYMENT PENDING" : "PENDIENTE DE PAGO",
    amountText: formattedTotal,
    isPaid: false,
    isCod: false,
  };
}

/**
 * Formatea los atributos dinámicos de una línea de producto para impresión.
 */
function formatItemAttributes(attrs: Record<string, string> | null | undefined): string {
  if (!attrs || typeof attrs !== "object") return "";
  const pairs = Object.entries(attrs)
    .filter(([k, v]) => k.trim().length > 0 && String(v ?? "").trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`);
  return pairs.join(" · ");
}

/**
 * Construye una cadena compatible con WinAnsiEncoding (ISO-8859-1) y escapada para literales PDF `(...)`.
 */
function encodePdfText(input: string): string {
  const cleaned = input
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, " ")
    .trim();
  const out: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out.push(`\\${cleaned[i]}`);
    } else if (code >= 0x20 && code <= 0x7e) {
      out.push(cleaned[i]!);
    } else if (code >= 0xa0 && code <= 0xff) {
      out.push(`\\${code.toString(8).padStart(3, "0")}`);
    } else {
      out.push(" ");
    }
  }
  return out.join("");
}

/**
 * Envuelve texto largo en líneas cortas por ancho aproximado de caracteres para PDF.
 */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.slice(0, maxChars);
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, maxChars);
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Construye un documento PDF 1.4 binario válido en TypeScript puro con dibujo vectorial de QR
 * y diseño adaptativo para rótulo térmico (`10x15`) o remisión (`letter`).
 */
function buildPureOrderGuidePdfBuffer(params: {
  orderDetails: OrderWithDetails;
  merchant: OrderGuideMerchantInfo;
  size: OrderGuideSize;
  qrMatrix: boolean[][];
}): Buffer {
  const { orderDetails, merchant, size, qrMatrix } = params;
  const { order, items } = orderDetails;
  const locale = merchant.locale === "en" ? "en" : "es";
  const isLabel = size === "10x15";

  // 100mm x 150mm = 283.46 x 425.20 pt; Letter = 612 x 792 pt
  const pageW = isLabel ? 283.46 : 612;
  const pageH = isLabel ? 425.2 : 792;
  const margin = isLabel ? 14 : 36;
  const contentW = pageW - margin * 2;
  const collection = resolveCollectionBanner(order, locale);

  const ops: string[] = [];

  const drawText = (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    bold: boolean = false,
    rgb: [number, number, number] = [0.06, 0.09, 0.16],
  ) => {
    ops.push(
      `BT ${rgb[0]} ${rgb[1]} ${rgb[2]} rg /${bold ? "F2" : "F1"} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${encodePdfText(text)}) Tj ET`,
    );
  };

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillRgb?: [number, number, number],
    strokeRgb?: [number, number, number],
    lineWidth: number = 0.75,
  ) => {
    if (fillRgb && strokeRgb) {
      ops.push(
        `q ${lineWidth} w ${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg ${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`,
      );
    } else if (fillRgb) {
      ops.push(
        `q ${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`,
      );
    } else if (strokeRgb) {
      ops.push(
        `q ${lineWidth} w ${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`,
      );
    }
  };

  const drawQr = (x: number, yBottom: number, boxSize: number) => {
    drawRect(x, yBottom, boxSize, boxSize, [1, 1, 1], [0.82, 0.85, 0.9], 0.5);
    const modCount = qrMatrix.length;
    const quiet = 2;
    const cell = boxSize / (modCount + quiet * 2);
    ops.push("q 0.06 0.09 0.16 rg");
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qrMatrix[r]![c]) {
          const rx = x + (c + quiet) * cell;
          const ry = yBottom + boxSize - (r + quiet + 1) * cell;
          ops.push(`${rx.toFixed(2)} ${ry.toFixed(2)} ${cell.toFixed(2)} ${cell.toFixed(2)} re f`);
        }
      }
    }
    ops.push("Q");
  };

  // Fondo blanco y marco exterior
  drawRect(0, 0, pageW, pageH, [1, 1, 1]);
  drawRect(margin, margin, contentW, pageH - margin * 2, undefined, [0.78, 0.82, 0.88], 0.8);

  // Encabezado oscuro del comercio remitente
  const headerH = isLabel ? 46 : 64;
  const headerY = pageH - margin - headerH;
  drawRect(margin, headerY, contentW, headerH, [0.06, 0.09, 0.16]);

  const titleSize = isLabel ? 11 : 16;
  const subSize = isLabel ? 7 : 9;
  drawText(merchant.businessName || "Mocter Commerce", margin + 10, headerY + headerH - (isLabel ? 18 : 24), titleSize, true, [1, 1, 1]);
  const senderLine = [merchant.city, merchant.phone, merchant.email].filter(Boolean).join(" · ");
  if (senderLine) {
    drawText(senderLine.slice(0, isLabel ? 48 : 80), margin + 10, headerY + (isLabel ? 11 : 16), subSize, false, [0.85, 0.89, 0.94]);
  }
  drawText(
    order.number,
    pageW - margin - (isLabel ? 84 : 130),
    headerY + headerH - (isLabel ? 18 : 24),
    isLabel ? 9 : 13,
    true,
    [0.98, 0.8, 0.2],
  );
  drawText(
    new Date(order.createdAt).toISOString().slice(0, 10),
    pageW - margin - (isLabel ? 62 : 95),
    headerY + (isLabel ? 11 : 16),
    subSize,
    false,
    [0.85, 0.89, 0.94],
  );

  let cursorY = headerY - (isLabel ? 8 : 14);

  // Bloque QR + Transportadora / Guía
  const qrBoxSize = isLabel ? 64 : 90;
  const qrY = cursorY - qrBoxSize;
  drawQr(margin + 8, qrY, qrBoxSize);

  const metaX = margin + 8 + qrBoxSize + 10;
  const carrierLabel = locale === "en" ? "CARRIER / TRACKING" : "TRANSPORTADORA / GUÍA";
  drawText(carrierLabel, metaX, cursorY - 11, isLabel ? 6.5 : 8, true, [0.39, 0.45, 0.55]);
  drawText(
    order.carrierName || (locale === "en" ? "Unassigned Carrier" : "Sin Transportadora Asignada"),
    metaX,
    cursorY - (isLabel ? 22 : 27),
    isLabel ? 8.5 : 11,
    true,
  );
  drawText(
    order.trackingCode ? `# ${order.trackingCode}` : locale === "en" ? "Tracking Pending" : "Guía Pendiente",
    metaX,
    cursorY - (isLabel ? 33 : 42),
    isLabel ? 8 : 10,
    true,
    [0.12, 0.25, 0.69],
  );
  const shipLabel =
    order.shippingMethod === "office"
      ? locale === "en"
        ? "Pickup At Carrier Office"
        : "Reclamo En Oficina"
      : locale === "en"
        ? "Home Delivery"
        : "Entrega A Domicilio";
  drawText(shipLabel, metaX, cursorY - (isLabel ? 45 : 58), isLabel ? 7 : 9);

  // Caja de cobro / pagado
  const payBoxY = qrY;
  const payBoxH = isLabel ? 18 : 24;
  drawRect(
    metaX,
    payBoxY,
    pageW - margin - 8 - metaX,
    payBoxH,
    collection.isPaid ? [0.92, 0.99, 0.94] : [1, 0.97, 0.9],
    collection.isPaid ? [0.1, 0.65, 0.35] : [0.85, 0.55, 0.05],
    0.8,
  );
  drawText(
    `${collection.label}: ${collection.amountText}`,
    metaX + 5,
    payBoxY + (isLabel ? 6 : 8),
    isLabel ? 7.2 : 9.5,
    true,
    collection.isPaid ? [0.07, 0.45, 0.24] : [0.65, 0.35, 0.02],
  );

  cursorY = qrY - (isLabel ? 10 : 16);

  // Bloque destinatario
  const recipientBoxH = isLabel ? 92 : 122;
  const recipientBoxY = cursorY - recipientBoxH;
  drawRect(margin + 8, recipientBoxY, contentW - 16, recipientBoxH, [0.98, 0.99, 1], [0.85, 0.88, 0.92], 0.6);

  drawText(
    locale === "en" ? "RECIPIENT / DESTINATION" : "DESTINATARIO / DESTINO",
    margin + 14,
    cursorY - 12,
    isLabel ? 6.5 : 8,
    true,
    [0.39, 0.45, 0.55],
  );
  drawText(order.customerName, margin + 14, cursorY - (isLabel ? 24 : 28), isLabel ? 9.5 : 12, true);
  const contactLine = [
    order.customerPhone,
    order.customerDocument ? `ID: ${order.customerDocument}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  drawText(contactLine, margin + 14, cursorY - (isLabel ? 35 : 43), isLabel ? 7.5 : 9.5);

  const fullAddr = [
    order.addressLine,
    order.addressComplement,
    order.neighborhood,
  ]
    .filter(Boolean)
    .join(", ");
  const cityStateLine = [order.city, order.state, order.countryCode, order.postalCode]
    .filter(Boolean)
    .join(" · ");

  let addrY = cursorY - (isLabel ? 47 : 59);
  for (const line of wrapText(fullAddr || (locale === "en" ? "No street address" : "Sin dirección física"), isLabel ? 44 : 82).slice(0, 2)) {
    drawText(line, margin + 14, addrY, isLabel ? 7.5 : 9.5);
    addrY -= isLabel ? 10 : 13;
  }
  if (cityStateLine) {
    drawText(cityStateLine.slice(0, isLabel ? 46 : 86), margin + 14, addrY, isLabel ? 7.5 : 9.5, true);
    addrY -= isLabel ? 10 : 13;
  }
  if (order.referenceNotes) {
    drawText(
      `${locale === "en" ? "Ref" : "Ref"}: ${order.referenceNotes}`.slice(0, isLabel ? 46 : 86),
      margin + 14,
      addrY,
      isLabel ? 6.8 : 8.5,
      false,
      [0.35, 0.41, 0.5],
    );
  }

  cursorY = recipientBoxY - (isLabel ? 10 : 16);

  // Tabla resumida de productos
  drawText(
    locale === "en" ? "ORDER ITEMS SUMMARY" : "RESUMEN DE PRODUCTOS",
    margin + 8,
    cursorY - 8,
    isLabel ? 6.5 : 8,
    true,
    [0.39, 0.45, 0.55],
  );
  cursorY -= isLabel ? 16 : 20;

  const rowH = isLabel ? 14 : 18;
  drawRect(margin + 8, cursorY - rowH, contentW - 16, rowH, [0.94, 0.96, 0.98]);
  drawText(locale === "en" ? "Qty" : "Cant", margin + 12, cursorY - (isLabel ? 10 : 13), isLabel ? 7 : 8.5, true);
  drawText(locale === "en" ? "Product" : "Producto", margin + (isLabel ? 36 : 52), cursorY - (isLabel ? 10 : 13), isLabel ? 7 : 8.5, true);
  drawText(locale === "en" ? "Subtotal" : "Subtotal", pageW - margin - (isLabel ? 56 : 88), cursorY - (isLabel ? 10 : 13), isLabel ? 7 : 8.5, true);
  cursorY -= rowH;

  const maxRows = isLabel ? 6 : 14;
  const visibleItems = items.slice(0, maxRows);
  for (const item of visibleItems) {
    const attrText = formatItemAttributes(item.selectedAttributes);
    const label = attrText ? `${item.productName} (${attrText})` : item.productName;
    drawText(String(item.quantity), margin + 14, cursorY - (isLabel ? 10 : 13), isLabel ? 7.2 : 9, true);
    drawText(
      label.slice(0, isLabel ? 30 : 62),
      margin + (isLabel ? 36 : 52),
      cursorY - (isLabel ? 10 : 13),
      isLabel ? 7.2 : 9,
    );
    drawText(
      formatMoneyCents(item.lineTotalCents, order.currency, locale),
      pageW - margin - (isLabel ? 58 : 90),
      cursorY - (isLabel ? 10 : 13),
      isLabel ? 7 : 8.5,
    );
    cursorY -= rowH;
    drawRect(margin + 8, cursorY, contentW - 16, 0.4, [0.88, 0.91, 0.94]);
  }
  if (items.length > maxRows) {
    drawText(
      `+${items.length - maxRows} ${locale === "en" ? "more item(s)" : "ítem(s) adicionales"}`,
      margin + 14,
      cursorY - 11,
      isLabel ? 6.8 : 8.5,
      false,
      [0.39, 0.45, 0.55],
    );
  }

  // Pie de página con totales
  const footerY = margin + 12;
  drawRect(margin + 8, footerY + 18, contentW - 16, 0.6, [0.78, 0.82, 0.88]);
  drawText(
    `${locale === "en" ? "Shipping" : "Envío"}: ${formatMoneyCents(order.shippingCents, order.currency, locale)}   |   ${locale === "en" ? "Total" : "Total"}: ${formatMoneyCents(order.totalCents, order.currency, locale)}`,
    margin + 10,
    footerY + 5,
    isLabel ? 7.5 : 9.5,
    true,
  );

  // Ensamblar objetos PDF 1.4
  const streamContent = ops.join("\n");
  const streamByteLen = Buffer.byteLength(streamContent, "latin1");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n",
    `6 0 obj\n<< /Length ${streamByteLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "latin1")];
  const offsets: number[] = [0];
  let currentOffset = chunks[0]!.length;

  for (const obj of objects) {
    offsets.push(currentOffset);
    const buf = Buffer.from(obj, "latin1");
    chunks.push(buf);
    currentOffset += buf.length;
  }

  const xrefOffset = currentOffset;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((off) => `${String(off).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ];
  chunks.push(Buffer.from(xrefLines.join(""), "latin1"));

  return Buffer.concat(chunks);
}

/**
 * Servicio de renderizado de guías y rótulos de envío imprimibles (`SPEC-11`, `PED-06`).
 *
 * Soporta formato térmico `10x15` (100mm x 150mm) y hoja `letter` (Carta), en salida
 * HTML print-ready con código QR SVG inline o PDF binario puro generado en TypeScript.
 */
export class OrderGuideRendererService {
  /**
   * Renderiza la guía logística del pedido en HTML imprimible o PDF binario.
   */
  render(input: RenderOrderGuideInput): RenderedOrderGuide {
    const size: OrderGuideSize = input.size === "letter" ? "letter" : "10x15";
    const format: OrderGuideFormat = input.format === "pdf" ? "pdf" : "html";
    const locale = input.merchant.locale === "en" ? "en" : "es";
    const { order, items } = input.orderDetails;

    const qrPayload = input.verificationBaseUrl
      ? `${input.verificationBaseUrl.replace(/\/+$/, "")}/verify/${order.number}`
      : `MOCTER-ORD|${order.number}|${order.trackingCode ?? "PENDING"}|${order.totalCents}|${order.currency}`;

    const qrMatrix = buildQrMatrix(qrPayload);
    const safeFileOrder = order.number.replace(/[^a-zA-Z0-9_-]/g, "_");

    if (format === "pdf") {
      const pdfBuffer = buildPureOrderGuidePdfBuffer({
        orderDetails: input.orderDetails,
        merchant: input.merchant,
        size,
        qrMatrix,
      });
      return {
        contentType: "application/pdf",
        filename: `guia-${safeFileOrder}-${size}.pdf`,
        body: pdfBuffer,
        qrPayload,
      };
    }

    const qrSvg = renderQrMatrixToSvg(
      qrMatrix,
      2,
      size === "10x15" ? 3 : 4,
      locale === "en" ? "Order Verification QR" : "Código QR de Verificación",
    );
    const collection = resolveCollectionBanner(order, locale);
    const isLabel = size === "10x15";
    const pageRule = isLabel ? "100mm 150mm" : "letter";

    const fullAddress = [
      order.addressLine,
      order.addressComplement,
      order.neighborhood,
    ]
      .filter(Boolean)
      .join(", ");
    const locationLine = [order.city, order.state, order.countryCode, order.postalCode]
      .filter(Boolean)
      .join(" · ");

    const itemRowsHtml = items
      .map((item) => {
        const attrText = formatItemAttributes(item.selectedAttributes);
        return `
          <tr>
            <td class="qty">${item.quantity}</td>
            <td class="name">
              <div>${escapeHtml(item.productName)}</div>
              ${attrText ? `<div class="attrs">${escapeHtml(attrText)}</div>` : ""}
            </td>
            <td class="amt">${escapeHtml(formatMoneyCents(item.lineTotalCents, order.currency, locale))}</td>
          </tr>
        `;
      })
      .join("");

    const logoHtml = input.merchant.logoUrl
      ? `<img src="${escapeHtml(input.merchant.logoUrl)}" alt="${escapeHtml(input.merchant.businessName)}" class="logo" />`
      : "";

    const html = `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(locale === "en" ? `Shipping Guide ${order.number}` : `Guía de Envío ${order.number}`)}</title>
  <style>
    @page { size: ${pageRule}; margin: ${isLabel ? "4mm" : "12mm"}; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: ${isLabel ? "4mm" : "16px"};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
    }
    .sheet {
      width: ${isLabel ? "92mm" : "100%"};
      max-width: ${isLabel ? "92mm" : "740px"};
      margin: 0 auto;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }
    .toolbar {
      max-width: ${isLabel ? "92mm" : "740px"};
      margin: 0 auto 10px auto;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .print-btn {
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .header {
      background: #0f172a;
      color: #ffffff;
      padding: ${isLabel ? "10px 12px" : "16px 20px"};
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .merchant { display: flex; align-items: center; gap: 10px; }
    .logo { max-height: ${isLabel ? "28px" : "40px"}; max-width: ${isLabel ? "64px" : "110px"}; object-fit: contain; background: #fff; border-radius: 4px; padding: 2px; }
    .merchant-name { font-size: ${isLabel ? "13px" : "18px"}; font-weight: 700; line-height: 1.2; }
    .merchant-meta { font-size: ${isLabel ? "9px" : "11px"}; color: #cbd5e1; margin-top: 2px; }
    .order-meta { text-align: right; }
    .order-num { font-family: monospace; font-size: ${isLabel ? "12px" : "15px"}; font-weight: 700; color: #facc15; }
    .order-date { font-size: ${isLabel ? "9px" : "11px"}; color: #cbd5e1; margin-top: 2px; }
    .section { padding: ${isLabel ? "8px 10px" : "14px 20px"}; border-bottom: 1px solid #e2e8f0; }
    .row { display: flex; gap: ${isLabel ? "10px" : "18px"}; align-items: stretch; }
    .qr-box { flex: 0 0 auto; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px; background: #fff; display: flex; align-items: center; justify-content: center; }
    .qr-box svg { width: ${isLabel ? "66px" : "96px"}; height: ${isLabel ? "66px" : "96px"}; display: block; }
    .carrier-box { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    .kicker { font-size: ${isLabel ? "8px" : "10px"}; font-weight: 700; letter-spacing: 0.04em; color: #64748b; text-transform: uppercase; }
    .carrier-name { font-size: ${isLabel ? "12px" : "15px"}; font-weight: 700; margin-top: 2px; }
    .tracking-code { font-family: monospace; font-size: ${isLabel ? "11px" : "13px"}; color: #1d4ed8; font-weight: 700; margin-top: 2px; }
    .collect-box {
      margin-top: 6px;
      padding: ${isLabel ? "5px 8px" : "8px 12px"};
      border-radius: 4px;
      border: 1px solid ${collection.isPaid ? "#16a34a" : "#d97706"};
      background: ${collection.isPaid ? "#f0fdf4" : "#fffbeb"};
      color: ${collection.isPaid ? "#166534" : "#92400e"};
      font-size: ${isLabel ? "10px" : "12px"};
      font-weight: 700;
    }
    .recipient-name { font-size: ${isLabel ? "12px" : "15px"}; font-weight: 700; margin-top: 3px; }
    .recipient-detail { font-size: ${isLabel ? "10px" : "12px"}; color: #1e293b; margin-top: 2px; line-height: 1.35; }
    .ref-notes { font-size: ${isLabel ? "9px" : "11px"}; color: #475569; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: ${isLabel ? "10px" : "12px"}; }
    th { text-align: left; font-size: ${isLabel ? "9px" : "10px"}; color: #475569; background: #f1f5f9; padding: 4px 6px; border-bottom: 1px solid #cbd5e1; }
    td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    td.qty { width: 32px; font-weight: 700; font-family: monospace; }
    td.amt, th.amt { text-align: right; font-family: monospace; white-space: nowrap; }
    .attrs { font-size: ${isLabel ? "8px" : "10px"}; color: #64748b; }
    .footer { padding: ${isLabel ? "8px 10px" : "12px 20px"}; display: flex; justify-content: space-between; font-size: ${isLabel ? "10px" : "12px"}; font-weight: 700; background: #f8fafc; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none !important; }
      .sheet { border: 1px solid #0f172a; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="print-btn" onclick="window.print()">${escapeHtml(locale === "en" ? "Print Guide" : "Imprimir Guía")}</button>
  </div>
  <main class="sheet">
    <header class="header">
      <div class="merchant">
        ${logoHtml}
        <div>
          <div class="merchant-name">${escapeHtml(input.merchant.businessName)}</div>
          <div class="merchant-meta">${escapeHtml([input.merchant.city, input.merchant.phone, input.merchant.email].filter(Boolean).join(" · "))}</div>
        </div>
      </div>
      <div class="order-meta">
        <div class="order-num">${escapeHtml(order.number)}</div>
        <div class="order-date">${escapeHtml(new Date(order.createdAt).toISOString().slice(0, 10))}</div>
      </div>
    </header>

    <section class="section">
      <div class="row">
        <div class="qr-box">${qrSvg}</div>
        <div class="carrier-box">
          <div>
            <div class="kicker">${escapeHtml(locale === "en" ? "Carrier & Tracking" : "Transportadora Y Guía")}</div>
            <div class="carrier-name">${escapeHtml(order.carrierName || (locale === "en" ? "Unassigned Carrier" : "Sin Transportadora Asignada"))}</div>
            <div class="tracking-code">${escapeHtml(order.trackingCode ? `# ${order.trackingCode}` : locale === "en" ? "Tracking Pending" : "Guía Pendiente")}</div>
            <div class="ref-notes">${escapeHtml(order.shippingMethod === "office" ? (locale === "en" ? "Pickup At Carrier Office" : "Reclamo En Oficina") : (locale === "en" ? "Home Delivery" : "Entrega A Domicilio"))}</div>
          </div>
          <div class="collect-box">${escapeHtml(`${collection.label}: ${collection.amountText}`)}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="kicker">${escapeHtml(locale === "en" ? "Recipient / Destination" : "Destinatario / Destino")}</div>
      <div class="recipient-name">${escapeHtml(order.customerName)}</div>
      <div class="recipient-detail">${escapeHtml([order.customerPhone, order.customerDocument ? `ID: ${order.customerDocument}` : null].filter(Boolean).join(" · "))}</div>
      <div class="recipient-detail">${escapeHtml(fullAddress || (locale === "en" ? "No street address" : "Sin dirección física"))}</div>
      ${locationLine ? `<div class="recipient-detail"><strong>${escapeHtml(locationLine)}</strong></div>` : ""}
      ${order.referenceNotes ? `<div class="ref-notes">${escapeHtml(`${locale === "en" ? "Notes" : "Indicaciones"}: ${order.referenceNotes}`)}</div>` : ""}
    </section>

    <section class="section">
      <div class="kicker">${escapeHtml(locale === "en" ? "Items Summary" : "Resumen De Productos")}</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(locale === "en" ? "Qty" : "Cant")}</th>
            <th>${escapeHtml(locale === "en" ? "Item" : "Producto")}</th>
            <th class="amt">${escapeHtml(locale === "en" ? "Total" : "Subtotal")}</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
        </tbody>
      </table>
    </section>

    <footer class="footer">
      <span>${escapeHtml(locale === "en" ? "Shipping" : "Envío")}: ${escapeHtml(formatMoneyCents(order.shippingCents, order.currency, locale))}</span>
      <span>${escapeHtml(locale === "en" ? "Total" : "Total")}: ${escapeHtml(formatMoneyCents(order.totalCents, order.currency, locale))}</span>
    </footer>
  </main>
</body>
</html>`;

    return {
      contentType: "text/html; charset=utf-8",
      filename: `guia-${safeFileOrder}-${size}.html`,
      body: html,
      qrPayload,
    };
  }
}
