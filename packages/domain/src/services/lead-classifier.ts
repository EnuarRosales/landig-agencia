/** Etiquetas reservadas del clasificador de leads (BOT-002 §6). */
export const LEAD_LABELS = ["lead-frio", "lead-tibio", "lead-caliente", "compra-realizada"] as const;

export type LeadLabel = (typeof LEAD_LABELS)[number];

/** Turno de conversación para el clasificador. */
export interface ClassifierTurn {
  role: "user" | "assistant";
  text: string;
}

/** Cantidad de turnos considerados por el clasificador. */
export const CLASSIFIER_TURN_WINDOW = 10;

/**
 * Selecciona los últimos 10 turnos para la llamada de inferencia del clasificador.
 */
export function selectClassifierWindow(turns: ClassifierTurn[]): ClassifierTurn[] {
  return turns.slice(-CLASSIFIER_TURN_WINDOW);
}

/**
 * Valida la salida del modelo contra los 4 slugs reservados.
 *
 * - Una salida fuera de los slugs se descarta y se conserva la etiqueta previa (RF-04.2).
 * - `compra-realizada` solo se acepta con evidencia de registro de pedido.
 *
 * @param rawOutput Texto devuelto por el modelo.
 * @param previous Etiqueta vigente (fallback).
 * @param hasOrderEvidence Verdadero si existe un pedido registrado para la conversación.
 */
export function resolveLeadLabel(
  rawOutput: string,
  previous: LeadLabel | null,
  hasOrderEvidence: boolean,
): { label: LeadLabel | null; changed: boolean; discarded: boolean } {
  const candidate = rawOutput.trim().toLowerCase();
  const match = LEAD_LABELS.find((l) => l === candidate);
  if (!match) return { label: previous, changed: false, discarded: true };
  if (match === "compra-realizada" && !hasOrderEvidence) {
    return { label: previous, changed: false, discarded: true };
  }
  return { label: match, changed: match !== previous, discarded: false };
}

