/**
 * Short text stored as JSONB with one key per supported locale (Spanish default, English).
 */
export interface LocalizedText {
  es: string;
  en: string;
}

/**
 * List of short strings stored as JSONB with one array per supported locale.
 */
export interface LocalizedList {
  es: string[];
  en: string[];
}
