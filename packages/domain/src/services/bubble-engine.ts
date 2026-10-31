import { appLogger } from "../utils/logger";

/** Canal de atención que determina el perfil de burbujas (BOT-002 §3.1). */
export type BubbleChannel = "whatsapp" | "web_widget" | "email" | "other";

/** Preset de ritmo elegido por el inquilino. */
export type BubblePreset = "natural" | "fast" | "paused";

/** Separador de burbujas de plataforma. */
export const BUBBLE_SPLIT_TOKEN = "[[SPLIT]]";
/** Mínimo de pausa en milisegundos. */
export const BUBBLE_MIN_PAUSE_MS = 800;
/** Máximo de pausa en milisegundos. */
export const BUBBLE_MAX_PAUSE_MS = 5000;
/** Máximo de burbujas por turno. */
export const BUBBLE_MAX_PER_TURN = 4;
/** Milisegundos por carácter de la fórmula adaptativa. */
export const BUBBLE_MS_PER_CHAR = 35;

const PRESET_MULTIPLIER: Record<BubblePreset, number> = {
  natural: 1.0,
  fast: 0.7,
  paused: 1.3,
};

/**
 * Calcula la pausa previa a una burbuja: `clamp(800, 5000, 35 ms × caracteres × preset)`.
 *
 * El resultado siempre queda dentro del rango, también con presets.
 */
export function computeBubblePauseMs(text: string, preset: BubblePreset = "natural"): number {
  const raw = BUBBLE_MS_PER_CHAR * text.length * PRESET_MULTIPLIER[preset];
  return Math.round(Math.min(BUBBLE_MAX_PAUSE_MS, Math.max(BUBBLE_MIN_PAUSE_MS, raw)));
}

/**
 * Divide la salida del modelo en burbujas según el canal.
 *
 * WhatsApp y otros usan `[[SPLIT]]` (máx. 4; el excedente se une a la última). Widget web y
 * email devuelven un único mensaje sin separadores.
 */
export function splitIntoBubbles(output: string, channel: BubbleChannel): string[] {
  const clean = (s: string): string => s.trim();
  if (channel === "web_widget" || channel === "email") {
    const single = clean(output.split(BUBBLE_SPLIT_TOKEN).map(clean).filter(Boolean).join("\n\n"));
    return single ? [single] : [];
  }
  const parts = output.split(BUBBLE_SPLIT_TOKEN).map(clean).filter(Boolean);
  if (parts.length <= BUBBLE_MAX_PER_TURN) return parts;
  const head = parts.slice(0, BUBBLE_MAX_PER_TURN - 1);
  const tail = parts.slice(BUBBLE_MAX_PER_TURN - 1).join("\n\n");
  return [...head, tail];
}

/** Función de envío de una burbuja por el canal (Chatwoot). */
export type BubbleSender = (bubble: string, index: number) => Promise<void>;
/** Función de espera inyectable para pruebas. */
export type BubbleSleeper = (ms: number) => Promise<void>;

/** Resultado de la entrega del turno. */
export interface BubbleDeliveryReport {
  sent: number;
  failed: number;
  pausesMs: number[];
}

/**
 * Entrega las burbujas en orden con pausa adaptativa; el fallo de una no bloquea el resto
 * y se audita con logging estructurado (sin contenido de la conversación).
 */
export async function deliverBubbles(params: {
  bubbles: string[];
  channel: BubbleChannel;
  preset?: BubblePreset;
  send: BubbleSender;
  sleep: BubbleSleeper;
  requestContext?: Record<string, unknown>;
}): Promise<BubbleDeliveryReport> {
  const { bubbles, channel, preset = "natural", send, sleep, requestContext } = params;
  const report: BubbleDeliveryReport = { sent: 0, failed: 0, pausesMs: [] };
  const usePauses = channel !== "web_widget" && channel !== "email";

  for (let i = 0; i < bubbles.length; i += 1) {
    const bubble = bubbles[i]!;
    if (usePauses && i > 0) {
      const pause = computeBubblePauseMs(bubble, preset);
      report.pausesMs.push(pause);
      await sleep(pause);
    }
    try {
      await send(bubble, i);
      report.sent += 1;
    } catch (error) {
      report.failed += 1;
      appLogger.error("[BubbleEngine] Fallo al enviar una burbuja; el turno continúa", error, {
        ...requestContext,
        bubbleIndex: i,
        channel,
      });
    }
  }
  return report;
}

