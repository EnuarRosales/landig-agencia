import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { normalizeGeoText } from "./normalize-text";

/** Código de país ISO 3166-1 alpha-2 en mayúsculas (ej. `"CO"`, `"AR"`, `"MX"`). */
export type CountryIsoAlpha2 = string;

/** Código de subdivisión ISO 3166-2 (ej. `"CO-ANT"`, `"AR-C"`, `"MX-CMX"`). */
export type SubdivisionIsoCode = string;

/** Clasificación semántica de la división territorial de segundo nivel del país. */
export type AdminAreaKind = "department" | "province" | "state" | "region" | "none";

/** Clasificación semántica de la sublocalidad urbana o barrial del país. */
export type DependentLocalityKind = "neighborhood" | "colony" | "district" | "sector";

/**
 * Perfil internacional de dirección, teléfono y formato regional por país ISO 3166-1 alpha-2.
 */
export interface CountryAddressProfile {
  /** Código ISO 3166-1 alpha-2 canónico. */
  countryCode: CountryIsoAlpha2;
  /** Código numérico ISO 3166-1 (3 dígitos) para interoperabilidad con sistemas externos. */
  numericIsoCode: string;
  /** Código de marcación telefónica E.164 sin prefijo `+` (ej. `"57"`, `"54"`, `"1"`). */
  callingCode: string;
  /** Zona horaria IANA representativa del país usada como valor por defecto (`SPEC-10`). */
  defaultTimezone: string;
  /** Código de moneda ISO 4217 representativo por defecto. */
  defaultCurrency: string;
  /** Tipo semántico del segundo nivel territorial para etiqueta localizada en UI. */
  adminAreaKind: AdminAreaKind;
  /** Tipo semántico de la sublocalidad urbana (`Barrio`, `Colonia`, `Distrito`, `Sector`). */
  dependentLocalityKind: DependentLocalityKind;
  /** Indica si el país exige subdivisión administrativa en formularios estándar. */
  requireAdminArea: boolean;
  /** Indica si el código postal suele ser requerido en operación estándar o logística. */
  postalCodeRequired: boolean;
  /** Expresión regular opcional para validar formato estructural del código postal. */
  postalCodePattern?: string;
  /** Ejemplo ilustrativo para placeholder de código postal en formularios. */
  postalCodeExample?: string;
}

/**
 * Opción de país localizada lista para selectores de UI.
 */
export interface CountryOption {
  /** Código ISO 3166-1 alpha-2. */
  countryCode: CountryIsoAlpha2;
  /** Nombre localizado del país en `es` o `en`. */
  name: string;
  /** Prefijo telefónico internacional sin `+`. */
  callingCode: string;
  /** Etiqueta combinada para selectores telefónicos (ej. `CO +57`). */
  dialLabel: string;
}

interface CountryMetadataSeed {
  numericIsoCode: string;
  callingCode?: string;
  defaultTimezone: string;
  defaultCurrency: string;
  adminAreaKind: AdminAreaKind;
  dependentLocalityKind: DependentLocalityKind;
  requireAdminArea: boolean;
  postalCodeRequired: boolean;
  postalCodePattern?: string;
  postalCodeExample?: string;
  aliases?: string[];
  fallbackNames?: { es: string; en: string };
}

const COUNTRY_SEEDS: Record<string, CountryMetadataSeed> = {
  CO: {
    numericIsoCode: "170",
    callingCode: "57",
    defaultTimezone: "America/Bogota",
    defaultCurrency: "COP",
    adminAreaKind: "department",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{6}$",
    postalCodeExample: "110111",
    aliases: ["colombia", "republica de colombia", "col"],
    fallbackNames: { es: "Colombia", en: "Colombia" },
  },
  AR: {
    numericIsoCode: "032",
    callingCode: "54",
    defaultTimezone: "America/Argentina/Buenos_Aires",
    defaultCurrency: "ARS",
    adminAreaKind: "province",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^([A-Z]\\d{4}[A-Z]{3}|\\d{4})$",
    postalCodeExample: "C1425",
    aliases: ["argentina", "republica argentina", "arg"],
    fallbackNames: { es: "Argentina", en: "Argentina" },
  },
  MX: {
    numericIsoCode: "484",
    callingCode: "52",
    defaultTimezone: "America/Mexico_City",
    defaultCurrency: "MXN",
    adminAreaKind: "state",
    dependentLocalityKind: "colony",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "06700",
    aliases: ["mexico", "estados unidos mexicanos", "mex"],
    fallbackNames: { es: "México", en: "Mexico" },
  },
  US: {
    numericIsoCode: "840",
    callingCode: "1",
    defaultTimezone: "America/New_York",
    defaultCurrency: "USD",
    adminAreaKind: "state",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}(-\\d{4})?$",
    postalCodeExample: "10001",
    aliases: ["estados unidos", "united states", "usa", "eeuu", "ee uu"],
    fallbackNames: { es: "Estados Unidos", en: "United States" },
  },
  CA: {
    numericIsoCode: "124",
    callingCode: "1",
    defaultTimezone: "America/Toronto",
    defaultCurrency: "CAD",
    adminAreaKind: "province",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^[A-Za-z]\\d[A-Za-z][ -]?\\d[A-Za-z]\\d$",
    postalCodeExample: "M5V 2T6",
    aliases: ["canada"],
    fallbackNames: { es: "Canadá", en: "Canada" },
  },
  CL: {
    numericIsoCode: "152",
    callingCode: "56",
    defaultTimezone: "America/Santiago",
    defaultCurrency: "CLP",
    adminAreaKind: "region",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{7}$",
    postalCodeExample: "8320000",
    aliases: ["chile", "chl"],
    fallbackNames: { es: "Chile", en: "Chile" },
  },
  PE: {
    numericIsoCode: "604",
    callingCode: "51",
    defaultTimezone: "America/Lima",
    defaultCurrency: "PEN",
    adminAreaKind: "department",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "15001",
    aliases: ["peru", "per"],
    fallbackNames: { es: "Perú", en: "Peru" },
  },
  EC: {
    numericIsoCode: "218",
    callingCode: "593",
    defaultTimezone: "America/Guayaquil",
    defaultCurrency: "USD",
    adminAreaKind: "province",
    dependentLocalityKind: "sector",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{6}$",
    postalCodeExample: "170150",
    aliases: ["ecuador", "ecu"],
    fallbackNames: { es: "Ecuador", en: "Ecuador" },
  },
  PA: {
    numericIsoCode: "591",
    callingCode: "507",
    defaultTimezone: "America/Panama",
    defaultCurrency: "USD",
    adminAreaKind: "province",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodeExample: "0801",
    aliases: ["panama", "pan"],
    fallbackNames: { es: "Panamá", en: "Panama" },
  },
  CR: {
    numericIsoCode: "188",
    callingCode: "506",
    defaultTimezone: "America/Costa_Rica",
    defaultCurrency: "CRC",
    adminAreaKind: "province",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "10101",
    aliases: ["costa rica", "cri"],
    fallbackNames: { es: "Costa Rica", en: "Costa Rica" },
  },
  BR: {
    numericIsoCode: "076",
    callingCode: "55",
    defaultTimezone: "America/Sao_Paulo",
    defaultCurrency: "BRL",
    adminAreaKind: "state",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}-?\\d{3}$",
    postalCodeExample: "01310-100",
    aliases: ["brasil", "brazil", "bra"],
    fallbackNames: { es: "Brasil", en: "Brazil" },
  },
  UY: {
    numericIsoCode: "858",
    callingCode: "598",
    defaultTimezone: "America/Montevideo",
    defaultCurrency: "UYU",
    adminAreaKind: "department",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "11000",
    aliases: ["uruguay", "ury"],
    fallbackNames: { es: "Uruguay", en: "Uruguay" },
  },
  PY: {
    numericIsoCode: "600",
    callingCode: "595",
    defaultTimezone: "America/Asuncion",
    defaultCurrency: "PYG",
    adminAreaKind: "department",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{4,6}$",
    postalCodeExample: "1209",
    aliases: ["paraguay", "pry"],
    fallbackNames: { es: "Paraguay", en: "Paraguay" },
  },
  BO: {
    numericIsoCode: "068",
    callingCode: "591",
    defaultTimezone: "America/La_Paz",
    defaultCurrency: "BOB",
    adminAreaKind: "department",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodeExample: "0000",
    aliases: ["bolivia", "bol"],
    fallbackNames: { es: "Bolivia", en: "Bolivia" },
  },
  VE: {
    numericIsoCode: "862",
    callingCode: "58",
    defaultTimezone: "America/Caracas",
    defaultCurrency: "VES",
    adminAreaKind: "state",
    dependentLocalityKind: "sector",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{4}$",
    postalCodeExample: "1010",
    aliases: ["venezuela", "ven"],
    fallbackNames: { es: "Venezuela", en: "Venezuela" },
  },
  DO: {
    numericIsoCode: "214",
    callingCode: "1",
    defaultTimezone: "America/Santo_Domingo",
    defaultCurrency: "DOP",
    adminAreaKind: "province",
    dependentLocalityKind: "sector",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "10101",
    aliases: ["republica dominicana", "dominican republic", "dom"],
    fallbackNames: { es: "República Dominicana", en: "Dominican Republic" },
  },
  GT: {
    numericIsoCode: "320",
    callingCode: "502",
    defaultTimezone: "America/Guatemala",
    defaultCurrency: "GTQ",
    adminAreaKind: "department",
    dependentLocalityKind: "colony",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "01001",
    aliases: ["guatemala", "gtm"],
    fallbackNames: { es: "Guatemala", en: "Guatemala" },
  },
  SV: {
    numericIsoCode: "222",
    callingCode: "503",
    defaultTimezone: "America/El_Salvador",
    defaultCurrency: "USD",
    adminAreaKind: "department",
    dependentLocalityKind: "colony",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodeExample: "1101",
    aliases: ["el salvador", "salvador", "slv"],
    fallbackNames: { es: "El Salvador", en: "El Salvador" },
  },
  HN: {
    numericIsoCode: "340",
    callingCode: "504",
    defaultTimezone: "America/Tegucigalpa",
    defaultCurrency: "HNL",
    adminAreaKind: "department",
    dependentLocalityKind: "colony",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodeExample: "11101",
    aliases: ["honduras", "hnd"],
    fallbackNames: { es: "Honduras", en: "Honduras" },
  },
  NI: {
    numericIsoCode: "558",
    callingCode: "505",
    defaultTimezone: "America/Managua",
    defaultCurrency: "NIO",
    adminAreaKind: "department",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: false,
    postalCodeExample: "11001",
    aliases: ["nicaragua", "nic"],
    fallbackNames: { es: "Nicaragua", en: "Nicaragua" },
  },
  PR: {
    numericIsoCode: "630",
    callingCode: "1",
    defaultTimezone: "America/Puerto_Rico",
    defaultCurrency: "USD",
    adminAreaKind: "region",
    dependentLocalityKind: "sector",
    requireAdminArea: false,
    postalCodeRequired: true,
    postalCodePattern: "^00[679]\\d{2}$",
    postalCodeExample: "00901",
    aliases: ["puerto rico", "pri"],
    fallbackNames: { es: "Puerto Rico", en: "Puerto Rico" },
  },
  ES: {
    numericIsoCode: "724",
    callingCode: "34",
    defaultTimezone: "Europe/Madrid",
    defaultCurrency: "EUR",
    adminAreaKind: "province",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "28001",
    aliases: ["espana", "spain", "esp"],
    fallbackNames: { es: "España", en: "Spain" },
  },
  GB: {
    numericIsoCode: "826",
    callingCode: "44",
    defaultTimezone: "Europe/London",
    defaultCurrency: "GBP",
    adminAreaKind: "region",
    dependentLocalityKind: "district",
    requireAdminArea: false,
    postalCodeRequired: true,
    postalCodeExample: "SW1A 1AA",
    aliases: ["reino unido", "united kingdom", "uk", "inglaterra"],
    fallbackNames: { es: "Reino Unido", en: "United Kingdom" },
  },
  FR: {
    numericIsoCode: "250",
    callingCode: "33",
    defaultTimezone: "Europe/Paris",
    defaultCurrency: "EUR",
    adminAreaKind: "region",
    dependentLocalityKind: "district",
    requireAdminArea: false,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "75001",
    aliases: ["francia", "france"],
    fallbackNames: { es: "Francia", en: "France" },
  },
  DE: {
    numericIsoCode: "276",
    callingCode: "49",
    defaultTimezone: "Europe/Berlin",
    defaultCurrency: "EUR",
    adminAreaKind: "state",
    dependentLocalityKind: "district",
    requireAdminArea: false,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "10115",
    aliases: ["alemania", "germany"],
    fallbackNames: { es: "Alemania", en: "Germany" },
  },
  IT: {
    numericIsoCode: "380",
    callingCode: "39",
    defaultTimezone: "Europe/Rome",
    defaultCurrency: "EUR",
    adminAreaKind: "province",
    dependentLocalityKind: "district",
    requireAdminArea: true,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{5}$",
    postalCodeExample: "00184",
    aliases: ["italia", "italy"],
    fallbackNames: { es: "Italia", en: "Italy" },
  },
  PT: {
    numericIsoCode: "620",
    callingCode: "351",
    defaultTimezone: "Europe/Lisbon",
    defaultCurrency: "EUR",
    adminAreaKind: "district" as unknown as AdminAreaKind,
    dependentLocalityKind: "neighborhood",
    requireAdminArea: false,
    postalCodeRequired: true,
    postalCodePattern: "^\\d{4}-\\d{3}$",
    postalCodeExample: "1100-148",
    aliases: ["portugal"],
    fallbackNames: { es: "Portugal", en: "Portugal" },
  },
};

// Corregir PT a region para mantener el dominio estricto de AdminAreaKind
COUNTRY_SEEDS.PT.adminAreaKind = "region";

const NUMERIC_TO_ALPHA2 = new Map<string, string>();
for (const [alpha2, seed] of Object.entries(COUNTRY_SEEDS)) {
  NUMERIC_TO_ALPHA2.set(seed.numericIsoCode, alpha2);
}

const ALL_PROFILES_CACHE: CountryAddressProfile[] = buildAllProfiles();
const PROFILE_MAP = new Map<string, CountryAddressProfile>(
  ALL_PROFILES_CACHE.map((profile) => [profile.countryCode, profile]),
);

function buildAllProfiles(): CountryAddressProfile[] {
  const supportedCountries = getCountries();
  const seen = new Set<string>();
  const profiles: CountryAddressProfile[] = [];

  for (const code of supportedCountries) {
    const upper = code.toUpperCase();
    if (seen.has(upper)) {
      continue;
    }
    seen.add(upper);

    const seed = COUNTRY_SEEDS[upper];
    let callingCode = seed?.callingCode ?? "";
    if (!callingCode) {
      try {
        callingCode = getCountryCallingCode(upper as CountryCode);
      } catch {
        callingCode = "";
      }
    }
    if (!callingCode) {
      continue;
    }

    profiles.push({
      countryCode: upper,
      numericIsoCode: seed?.numericIsoCode ?? "",
      callingCode,
      defaultTimezone: seed?.defaultTimezone ?? "UTC",
      defaultCurrency: seed?.defaultCurrency ?? "USD",
      adminAreaKind: seed?.adminAreaKind ?? "region",
      dependentLocalityKind: seed?.dependentLocalityKind ?? "neighborhood",
      requireAdminArea: seed?.requireAdminArea ?? false,
      postalCodeRequired: seed?.postalCodeRequired ?? false,
      postalCodePattern: seed?.postalCodePattern,
      postalCodeExample: seed?.postalCodeExample,
    });
  }

  return profiles;
}

/**
 * Obtiene el perfil de dirección y formato regional para un código ISO 3166-1 alpha-2.
 *
 * Si el país recibido es nulo o desconocido, retorna el perfil internacional seguro por defecto (`US` o fallback neutro).
 *
 * @param countryCode - Código alpha-2 opcional (ej. `"CO"`, `"AR"`).
 * @returns Perfil estructurado del país.
 */
export function getCountryAddressProfile(countryCode?: string | null): CountryAddressProfile {
  const normalized = countryCode?.trim().toUpperCase();
  if (normalized && PROFILE_MAP.has(normalized)) {
    return PROFILE_MAP.get(normalized)!;
  }

  return {
    countryCode: normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : "CO",
    numericIsoCode: normalized && /^[A-Z]{2}$/.test(normalized) ? "" : "170",
    callingCode: "57",
    defaultTimezone: "UTC",
    defaultCurrency: "USD",
    adminAreaKind: "region",
    dependentLocalityKind: "neighborhood",
    requireAdminArea: false,
    postalCodeRequired: false,
  };
}

/**
 * Lista todos los perfiles de país soportados internacionalmente.
 */
export function getAllCountryAddressProfiles(): CountryAddressProfile[] {
  return ALL_PROFILES_CACHE;
}

/**
 * Obtiene el nombre localizado de un país a partir de su código ISO 3166-1 alpha-2.
 *
 * @param countryCode - Código ISO 3166-1 alpha-2.
 * @param locale - Idioma destino (`"es"` o `"en"`).
 * @returns Nombre legible del país en el idioma solicitado.
 */
export function getLocalizedCountryName(countryCode: string, locale = "es"): string {
  const upper = countryCode.trim().toUpperCase();
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "es";
  const seed = COUNTRY_SEEDS[upper];

  try {
    const displayNames = new Intl.DisplayNames([lang], { type: "region" });
    const resolved = displayNames.of(upper);
    if (resolved && resolved.toUpperCase() !== upper) {
      return resolved;
    }
  } catch {
    // Fallback al diccionario estático si el runtime no soporta Intl.DisplayNames para el locale.
  }

  return seed?.fallbackNames?.[lang] ?? upper;
}

/**
 * Lista todas las opciones de país localizadas y ordenadas alfabéticamente para selectores UI.
 *
 * @param locale - Idioma de ordenamiento y etiquetas (`"es"` o `"en"`).
 */
export function listCountryOptions(locale = "es"): CountryOption[] {
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "es";
  const options = ALL_PROFILES_CACHE.map((profile) => ({
    countryCode: profile.countryCode,
    name: getLocalizedCountryName(profile.countryCode, lang),
    callingCode: profile.callingCode,
    dialLabel: `${profile.countryCode} +${profile.callingCode}`,
  }));

  return options.sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * Traduce un código ISO 3166-1 alpha-2 a su código numérico ISO 3166-1 de 3 dígitos cuando esté disponible.
 *
 * @param alpha2 - Código ISO alpha-2 (ej. `"AR"`).
 * @returns Código numérico ISO (ej. `"032"`) o `null` si no aplica.
 */
export function toIsoNumericCountryCode(alpha2: string): string | null {
  const seed = COUNTRY_SEEDS[alpha2.trim().toUpperCase()];
  return seed?.numericIsoCode ?? null;
}

/**
 * Traduce un código numérico ISO 3166-1 (ej. `"032"`) a su código canónico alpha-2 (`"AR"`).
 *
 * @param numeric - Cadena o número ISO 3166-1 numérico.
 */
export function fromIsoNumericCountryCode(numeric: string): CountryIsoAlpha2 | null {
  const padded = numeric.trim().padStart(3, "0");
  return NUMERIC_TO_ALPHA2.get(padded) ?? null;
}

/**
 * Homologa una entrada textual libre (alpha-2, numérico o nombre en español/inglés) hacia ISO 3166-1 alpha-2.
 *
 * @param input - Texto de país ingresado en chat, importación o formulario heredado.
 * @returns Código ISO alpha-2 canónico o `null` si no existe coincidencia unívoca.
 */
export function resolveCountryAlpha2FromInput(input?: string | null): CountryIsoAlpha2 | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return PROFILE_MAP.has(upper) ? upper : null;
  }

  if (/^\d{1,3}$/.test(trimmed)) {
    return fromIsoNumericCountryCode(trimmed);
  }

  const normalized = normalizeGeoText(trimmed);

  for (const [alpha2, seed] of Object.entries(COUNTRY_SEEDS)) {
    if (seed.aliases?.some((alias) => alias === normalized)) {
      return alpha2;
    }
  }

  for (const profile of ALL_PROFILES_CACHE) {
    const esName = normalizeGeoText(getLocalizedCountryName(profile.countryCode, "es"));
    const enName = normalizeGeoText(getLocalizedCountryName(profile.countryCode, "en"));
    if (esName === normalized || enName === normalized) {
      return profile.countryCode;
    }
  }

  return null;
}
