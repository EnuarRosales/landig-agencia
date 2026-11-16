import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { err, ok, type Result } from "../types/result";

/**
 * Resultado normalizado de un número telefónico validado contra E.164.
 */
export interface NormalizedE164Result {
  /** Número canónico en formato E.164 (ej. `"+573001234567"`). */
  e164: string;
  /** Código ISO 3166-1 alpha-2 detectado cuando no existe ambigüedad de prefijo. */
  countryCode?: string;
  /** Código de marcación internacional sin `+`. */
  callingCode: string;
  /** Número nacional sin prefijo de país ni ceros troncales innecesarios. */
  nationalNumber: string;
}

const CALLING_CODE_TO_COUNTRIES = buildCallingCodeIndex();

function buildCallingCodeIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const country of getCountries()) {
    try {
      const callingCode = getCountryCallingCode(country);
      const existing = index.get(callingCode) ?? [];
      existing.push(country);
      index.set(callingCode, existing);
    } catch {
      // Ignorar códigos no soportados en esta tabla.
    }
  }
  return index;
}

/**
 * Normaliza y valida un número telefónico hacia formato internacional E.164 (`+<código><número>`).
 *
 * - En modo estricto UI (`allowLocalWithDefaultCountry = false`, por defecto), exige prefijo `+`.
 * - En ingesta de chat o webhooks (`allowLocalWithDefaultCountry = true`), permite normalizar un
 *   número local usando `defaultCountryCode` si resulta válido según `libphonenumber-js`.
 *
 * @param params - Configuración de entrada de teléfono y país por defecto.
 * @returns {@link Result} con el número E.164 validado o código de error `"INVALID_PHONE_E164"`.
 */
export function normalizeAndValidatePhoneE164(params: {
  rawPhone: string;
  defaultCountryCode?: string;
  allowLocalWithDefaultCountry?: boolean;
}): Result<NormalizedE164Result> {
  const trimmed = params.rawPhone.trim();
  if (!trimmed) {
    return err("El número telefónico es obligatorio", "INVALID_PHONE_E164");
  }

  const normalizedChars = trimmed.replace(/[\s().-]+/g, "");
  const hasPlus = normalizedChars.startsWith("+");

  if (!hasPlus && !params.allowLocalWithDefaultCountry) {
    return err(
      "El número telefónico debe incluir código de país internacional en formato E.164 (ej. +573001234567)",
      "MISSING_E164_COUNTRY_CODE",
    );
  }

  const defaultCountry = params.defaultCountryCode?.trim().toUpperCase() as CountryCode | undefined;
  const parsed = hasPlus
    ? parsePhoneNumberFromString(normalizedChars)
    : parsePhoneNumberFromString(normalizedChars, defaultCountry);

  if (!parsed || !parsed.isValid()) {
    return err(
      "El número telefónico no es válido para el código de país indicado",
      "INVALID_PHONE_E164",
    );
  }

  return ok({
    e164: parsed.number,
    countryCode: parsed.country ?? undefined,
    callingCode: String(parsed.countryCallingCode),
    nationalNumber: String(parsed.nationalNumber),
  });
}

/**
 * Deduce todos los países ISO alpha-2 candidatos a partir del prefijo internacional E.164.
 *
 * Útil para resolver prefijos compartidos (como `+1` -> `US`, `CA`, `PR`, `DO`, etc.) sin
 * suponer un único país por defecto.
 *
 * @param e164Phone - Número en formato E.164 o con prefijo `+`.
 * @returns Arreglo de códigos ISO alpha-2 candidatos (vacío si el prefijo es inválido).
 */
export function inferCandidateCountriesFromE164(e164Phone: string): string[] {
  const cleaned = e164Phone.trim().replace(/[\s().-]+/g, "");
  if (!cleaned.startsWith("+")) {
    return [];
  }

  const parsed = parsePhoneNumberFromString(cleaned);
  if (parsed?.countryCallingCode) {
    const calling = String(parsed.countryCallingCode);
    const list = CALLING_CODE_TO_COUNTRIES.get(calling) ?? [];
    if (parsed.country && list.includes(parsed.country)) {
      return [parsed.country, ...list.filter((c) => c !== parsed.country)];
    }
    return list;
  }

  const digits = cleaned.slice(1).replace(/\D/g, "");
  for (let len = 3; len >= 1; len -= 1) {
    const prefix = digits.slice(0, len);
    const matches = CALLING_CODE_TO_COUNTRIES.get(prefix);
    if (matches && matches.length > 0) {
      return matches;
    }
  }

  return [];
}

/**
 * Separa un teléfono E.164 (o crudo legado) en país alpha-2 y número nacional para hidratar controles UI.
 *
 * @param rawPhone - Número almacenado (E.164 o legado).
 * @param fallbackCountryCode - País por defecto cuando no existe prefijo `+`.
 * @returns Par `{ countryCode, nationalNumber, isValidE164 }`.
 */
export function splitPhoneForInput(
  rawPhone: string | null | undefined,
  fallbackCountryCode = "CO",
): {
  countryCode: string;
  nationalNumber: string;
  isValidE164: boolean;
} {
  const fallback = fallbackCountryCode.trim().toUpperCase() || "CO";
  if (!rawPhone || !rawPhone.trim()) {
    return { countryCode: fallback, nationalNumber: "", isValidE164: false };
  }

  const cleaned = rawPhone.trim();
  const parsed = parsePhoneNumberFromString(cleaned, fallback as CountryCode);
  if (parsed && parsed.isValid()) {
    return {
      countryCode: parsed.country ?? fallback,
      nationalNumber: String(parsed.nationalNumber),
      isValidE164: cleaned.startsWith("+"),
    };
  }

  const digitsOnly = cleaned.replace(/[^\d]/g, "");
  return {
    countryCode: fallback,
    nationalNumber: digitsOnly,
    isValidE164: false,
  };
}
