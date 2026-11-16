import type { CountryIsoAlpha2, SubdivisionIsoCode } from "./country-profiles";
import { normalizeGeoText } from "./normalize-text";

/**
 * Representa una subdivisión territorial oficial bajo el estándar ISO 3166-2.
 */
export interface SubdivisionOption {
  /** Código ISO 3166-2 completo (ej. `"CO-ANT"`, `"AR-C"`, `"MX-CMX"`). */
  code: SubdivisionIsoCode;
  /** Código ISO 3166-1 alpha-2 del país padre. */
  countryCode: CountryIsoAlpha2;
  /** Nombre oficial o común de la subdivisión territorial. */
  name: string;
  /** Alias comunes o abreviaturas aceptadas en homologación determinística. */
  aliases?: string[];
}

type RawSubdivision = [code: string, name: string, aliases?: string[]];

const RAW_SUBDIVISIONS: Record<string, RawSubdivision[]> = {
  CO: [
    ["CO-AMA", "Amazonas"],
    ["CO-ANT", "Antioquia"],
    ["CO-ARA", "Arauca"],
    ["CO-ATL", "Atlántico", ["atlantico"]],
    ["CO-DC", "Bogotá, D.C.", ["bogota", "bogota dc", "bogota d c", "distrito capital"]],
    ["CO-BOL", "Bolívar", ["bolivar"]],
    ["CO-BOY", "Boyacá", ["boyaca"]],
    ["CO-CAL", "Caldas"],
    ["CO-CAQ", "Caquetá", ["caqueta"]],
    ["CO-CAS", "Casanare"],
    ["CO-CAU", "Cauca"],
    ["CO-CES", "Cesar"],
    ["CO-CHO", "Chocó", ["choco"]],
    ["CO-COR", "Córdoba", ["cordoba"]],
    ["CO-CUN", "Cundinamarca"],
    ["CO-GUA", "Guainía", ["guainia"]],
    ["CO-GUV", "Guaviare"],
    ["CO-HUI", "Huila"],
    ["CO-LAG", "La Guajira", ["guajira"]],
    ["CO-MAG", "Magdalena"],
    ["CO-MET", "Meta"],
    ["CO-NAR", "Nariño", ["narino"]],
    ["CO-NSA", "Norte de Santander"],
    ["CO-PUT", "Putumayo"],
    ["CO-QUI", "Quindío", ["quindio"]],
    ["CO-RIS", "Risaralda"],
    ["CO-SAP", "San Andrés y Providencia", ["san andres"]],
    ["CO-SAN", "Santander"],
    ["CO-SUC", "Sucre"],
    ["CO-TOL", "Tolima"],
    ["CO-VAC", "Valle del Cauca", ["valle"]],
    ["CO-VAU", "Vaupés", ["vaupes"]],
    ["CO-VID", "Vichada"],
  ],
  AR: [
    ["AR-C", "Ciudad Autónoma de Buenos Aires", ["caba", "capital federal", "bsas caba"]],
    ["AR-B", "Buenos Aires", ["provincia de buenos aires", "pba", "bs as"]],
    ["AR-K", "Catamarca"],
    ["AR-H", "Chaco"],
    ["AR-U", "Chubut"],
    ["AR-X", "Córdoba", ["cordoba"]],
    ["AR-W", "Corrientes"],
    ["AR-E", "Entre Ríos", ["entre rios"]],
    ["AR-P", "Formosa"],
    ["AR-Y", "Jujuy"],
    ["AR-L", "La Pampa"],
    ["AR-F", "La Rioja"],
    ["AR-M", "Mendoza"],
    ["AR-N", "Misiones"],
    ["AR-Q", "Neuquén", ["neuquen"]],
    ["AR-R", "Río Negro", ["rio negro"]],
    ["AR-A", "Salta"],
    ["AR-J", "San Juan"],
    ["AR-D", "San Luis"],
    ["AR-Z", "Santa Cruz"],
    ["AR-S", "Santa Fe"],
    ["AR-G", "Santiago del Estero"],
    ["AR-V", "Tierra del Fuego"],
    ["AR-T", "Tucumán", ["tucuman"]],
  ],
  MX: [
    ["MX-AGU", "Aguascalientes"],
    ["MX-BCN", "Baja California"],
    ["MX-BCS", "Baja California Sur"],
    ["MX-CAM", "Campeche"],
    ["MX-CHP", "Chiapas"],
    ["MX-CHH", "Chihuahua"],
    ["MX-CMX", "Ciudad de México", ["cdmx", "df", "distrito federal", "ciudad de mexico"]],
    ["MX-COA", "Coahuila"],
    ["MX-COL", "Colima"],
    ["MX-DUR", "Durango"],
    ["MX-GUA", "Guanajuato"],
    ["MX-GRO", "Guerrero"],
    ["MX-HID", "Hidalgo"],
    ["MX-JAL", "Jalisco"],
    ["MX-MEX", "Estado de México", ["edomex", "mexico"]],
    ["MX-MIC", "Michoacán", ["michoacan"]],
    ["MX-MOR", "Morelos"],
    ["MX-NAY", "Nayarit"],
    ["MX-NLE", "Nuevo León", ["nuevo leon", "nl"]],
    ["MX-OAX", "Oaxaca"],
    ["MX-PUE", "Puebla"],
    ["MX-QUE", "Querétaro", ["queretaro"]],
    ["MX-ROO", "Quintana Roo"],
    ["MX-SLP", "San Luis Potosí", ["san luis potosi"]],
    ["MX-SIN", "Sinaloa"],
    ["MX-SON", "Sonora"],
    ["MX-TAB", "Tabasco"],
    ["MX-TAM", "Tamaulipas"],
    ["MX-TLA", "Tlaxcala"],
    ["MX-VER", "Veracruz"],
    ["MX-YUC", "Yucatán", ["yucatan"]],
    ["MX-ZAC", "Zacatecas"],
  ],
  CL: [
    ["CL-AP", "Arica y Parinacota"],
    ["CL-TA", "Tarapacá", ["tarapaca"]],
    ["CL-AN", "Antofagasta"],
    ["CL-AT", "Atacama"],
    ["CL-CO", "Coquimbo"],
    ["CL-VS", "Valparaíso", ["valparaiso"]],
    ["CL-RM", "Región Metropolitana de Santiago", ["santiago", "rm", "metropolitana"]],
    ["CL-LI", "O'Higgins", ["libertador general bernardo ohiggins"]],
    ["CL-ML", "Maule"],
    ["CL-NB", "Ñuble", ["nuble"]],
    ["CL-BI", "Biobío", ["biobio"]],
    ["CL-AR", "La Araucanía", ["araucania"]],
    ["CL-LR", "Los Ríos", ["los rios"]],
    ["CL-LL", "Los Lagos"],
    ["CL-AI", "Aysén", ["aysen"]],
    ["CL-MA", "Magallanes"],
  ],
  PE: [
    ["PE-AMA", "Amazonas"],
    ["PE-ANC", "Áncash", ["ancash"]],
    ["PE-APU", "Apurímac", ["apurimac"]],
    ["PE-ARE", "Arequipa"],
    ["PE-AYA", "Ayacucho"],
    ["PE-CAJ", "Cajamarca"],
    ["PE-CAL", "Callao"],
    ["PE-CUS", "Cusco", ["cuzco"]],
    ["PE-HUV", "Huancavelica"],
    ["PE-HUC", "Huánuco", ["huanuco"]],
    ["PE-ICA", "Ica"],
    ["PE-JUN", "Junín", ["junin"]],
    ["PE-LAL", "La Libertad"],
    ["PE-LAM", "Lambayeque"],
    ["PE-LIM", "Lima"],
    ["PE-LOR", "Loreto"],
    ["PE-MDD", "Madre de Dios"],
    ["PE-MOQ", "Moquegua"],
    ["PE-PAS", "Pasco"],
    ["PE-PIU", "Piura"],
    ["PE-PUN", "Puno"],
    ["PE-SAM", "San Martín", ["san martin"]],
    ["PE-TAC", "Tacna"],
    ["PE-TUM", "Tumbes"],
    ["PE-UCA", "Ucayali"],
  ],
  EC: [
    ["EC-A", "Azuay"],
    ["EC-B", "Bolívar", ["bolivar"]],
    ["EC-F", "Cañar", ["canar"]],
    ["EC-C", "Carchi"],
    ["EC-H", "Chimborazo"],
    ["EC-X", "Cotopaxi"],
    ["EC-O", "El Oro"],
    ["EC-E", "Esmeraldas"],
    ["EC-W", "Galápagos", ["galapagos"]],
    ["EC-G", "Guayas"],
    ["EC-I", "Imbabura"],
    ["EC-L", "Loja"],
    ["EC-R", "Los Ríos", ["los rios"]],
    ["EC-M", "Manabí", ["manabi"]],
    ["EC-S", "Morona Santiago"],
    ["EC-N", "Napo"],
    ["EC-D", "Orellana"],
    ["EC-Y", "Pastaza"],
    ["EC-P", "Pichincha"],
    ["EC-SE", "Santa Elena"],
    ["EC-SD", "Santo Domingo de los Tsáchilas"],
    ["EC-U", "Sucumbíos", ["sucumbios"]],
    ["EC-T", "Tungurahua"],
    ["EC-Z", "Zamora Chinchipe"],
  ],
  US: [
    ["US-AL", "Alabama", ["al"]],
    ["US-AK", "Alaska", ["ak"]],
    ["US-AZ", "Arizona", ["az"]],
    ["US-AR", "Arkansas", ["ar"]],
    ["US-CA", "California", ["ca"]],
    ["US-CO", "Colorado", ["co"]],
    ["US-CT", "Connecticut", ["ct"]],
    ["US-DE", "Delaware", ["de"]],
    ["US-DC", "District of Columbia", ["dc", "washington dc"]],
    ["US-FL", "Florida", ["fl"]],
    ["US-GA", "Georgia", ["ga"]],
    ["US-HI", "Hawaii", ["hi"]],
    ["US-ID", "Idaho", ["id"]],
    ["US-IL", "Illinois", ["il"]],
    ["US-IN", "Indiana", ["in"]],
    ["US-IA", "Iowa", ["ia"]],
    ["US-KS", "Kansas", ["ks"]],
    ["US-KY", "Kentucky", ["ky"]],
    ["US-LA", "Louisiana", ["la"]],
    ["US-ME", "Maine", ["me"]],
    ["US-MD", "Maryland", ["md"]],
    ["US-MA", "Massachusetts", ["ma"]],
    ["US-MI", "Michigan", ["mi"]],
    ["US-MN", "Minnesota", ["mn"]],
    ["US-MS", "Mississippi", ["ms"]],
    ["US-MO", "Missouri", ["mo"]],
    ["US-MT", "Montana", ["mt"]],
    ["US-NE", "Nebraska", ["ne"]],
    ["US-NV", "Nevada", ["nv"]],
    ["US-NH", "New Hampshire", ["nh"]],
    ["US-NJ", "New Jersey", ["nj"]],
    ["US-NM", "New Mexico", ["nm"]],
    ["US-NY", "New York", ["ny", "nueva york"]],
    ["US-NC", "North Carolina", ["nc"]],
    ["US-ND", "North Dakota", ["nd"]],
    ["US-OH", "Ohio", ["oh"]],
    ["US-OK", "Oklahoma", ["ok"]],
    ["US-OR", "Oregon", ["or"]],
    ["US-PA", "Pennsylvania", ["pa"]],
    ["US-RI", "Rhode Island", ["ri"]],
    ["US-SC", "South Carolina", ["sc"]],
    ["US-SD", "South Dakota", ["sd"]],
    ["US-TN", "Tennessee", ["tn"]],
    ["US-TX", "Texas", ["tx"]],
    ["US-UT", "Utah", ["ut"]],
    ["US-VT", "Vermont", ["vt"]],
    ["US-VA", "Virginia", ["va"]],
    ["US-WA", "Washington", ["wa"]],
    ["US-WV", "West Virginia", ["wv"]],
    ["US-WI", "Wisconsin", ["wi"]],
    ["US-WY", "Wyoming", ["wy"]],
  ],
  CA: [
    ["CA-AB", "Alberta", ["ab"]],
    ["CA-BC", "British Columbia", ["bc", "columbia britanica"]],
    ["CA-MB", "Manitoba", ["mb"]],
    ["CA-NB", "New Brunswick", ["nb"]],
    ["CA-NL", "Newfoundland and Labrador", ["nl"]],
    ["CA-NS", "Nova Scotia", ["ns"]],
    ["CA-ON", "Ontario", ["on"]],
    ["CA-PE", "Prince Edward Island", ["pe"]],
    ["CA-QC", "Quebec", ["qc", "quebec"]],
    ["CA-SK", "Saskatchewan", ["sk"]],
  ],
  ES: [
    ["ES-MD", "Madrid", ["comunidad de madrid"]],
    ["ES-CT", "Cataluña", ["catalunya", "barcelona"]],
    ["ES-AN", "Andalucía", ["andalucia", "sevilla", "malaga"]],
    ["ES-VC", "Comunidad Valenciana", ["valencia"]],
    ["ES-GA", "Galicia"],
    ["ES-PV", "País Vasco", ["euskadi"]],
    ["ES-CL", "Castilla y León", ["castilla y leon"]],
    ["ES-CM", "Castilla-La Mancha"],
    ["ES-CN", "Canarias"],
    ["ES-IB", "Islas Baleares"],
    ["ES-AR", "Aragón", ["aragon"]],
    ["ES-MC", "Región de Murcia", ["murcia"]],
    ["ES-AS", "Asturias"],
    ["ES-NC", "Navarra"],
    ["ES-CB", "Cantabria"],
    ["ES-EX", "Extremadura"],
    ["ES-RI", "La Rioja"],
  ],
  PA: [
    ["PA-8", "Panamá", ["panama"]],
    ["PA-10", "Panamá Oeste"],
    ["PA-4", "Chiriquí", ["chiriqui"]],
    ["PA-3", "Colón", ["colon"]],
    ["PA-2", "Coclé", ["cocle"]],
    ["PA-6", "Herrera"],
    ["PA-7", "Los Santos"],
    ["PA-9", "Veraguas"],
    ["PA-1", "Bocas del Toro"],
    ["PA-5", "Darién", ["darien"]],
  ],
  CR: [
    ["CR-SJ", "San José", ["san jose"]],
    ["CR-A", "Alajuela"],
    ["CR-C", "Cartago"],
    ["CR-H", "Heredia"],
    ["CR-G", "Guanacaste"],
    ["CR-P", "Puntarenas"],
    ["CR-L", "Limón", ["limon"]],
  ],
  UY: [
    ["UY-MO", "Montevideo"],
    ["UY-CA", "Canelones"],
    ["UY-MA", "Maldonado"],
    ["UY-CO", "Colonia"],
    ["UY-SA", "Salto"],
    ["UY-PA", "Paysandú", ["paysandu"]],
    ["UY-RO", "Rocha"],
  ],
  BR: [
    ["BR-SP", "São Paulo", ["sao paulo", "sp"]],
    ["BR-RJ", "Rio de Janeiro", ["rj"]],
    ["BR-MG", "Minas Gerais", ["mg"]],
    ["BR-BA", "Bahia", ["ba"]],
    ["BR-PR", "Paraná", ["parana", "pr"]],
    ["BR-RS", "Rio Grande do Sul", ["rs"]],
    ["BR-SC", "Santa Catarina", ["sc"]],
    ["BR-DF", "Distrito Federal", ["df", "brasilia"]],
  ],
  DO: [
    ["DO-01", "Distrito Nacional", ["santo domingo"]],
    ["DO-32", "Santo Domingo"],
    ["DO-25", "Santiago"],
    ["DO-11", "La Altagracia", ["punta cana"]],
    ["DO-18", "Puerto Plata"],
  ],
  GT: [
    ["GT-01", "Guatemala"],
    ["GT-03", "Sacatepéquez", ["antigua"]],
    ["GT-09", "Quetzaltenango"],
    ["GT-05", "Escuintla"],
  ],
  SV: [
    ["SV-SS", "San Salvador"],
    ["SV-LI", "La Libertad"],
    ["SV-SA", "Santa Ana"],
    ["SV-SM", "San Miguel"],
  ],
  HN: [
    ["HN-FM", "Francisco Morazán", ["tegucigalpa"]],
    ["HN-CR", "Cortés", ["san pedro sula"]],
    ["HN-AT", "Atlántida"],
  ],
  NI: [
    ["NI-MN", "Managua"],
    ["NI-LE", "León", ["leon"]],
    ["NI-GR", "Granada"],
  ],
  BO: [
    ["BO-L", "La Paz"],
    ["BO-S", "Santa Cruz"],
    ["BO-C", "Cochabamba"],
  ],
  PY: [
    ["PY-ASU", "Asunción", ["asuncion"]],
    ["PY-11", "Central"],
    ["PY-10", "Alto Paraná", ["ciudad del este"]],
  ],
  VE: [
    ["VE-A", "Distrito Capital", ["caracas"]],
    ["VE-M", "Miranda"],
    ["VE-V", "Zulia", ["maracaibo"]],
    ["VE-G", "Carabobo", ["valencia"]],
  ],
};

const SUBDIVISION_CACHE = new Map<string, SubdivisionOption[]>();

/**
 * Retorna la lista de subdivisiones ISO 3166-2 registradas para un país alpha-2.
 *
 * @param countryCode - Código ISO 3166-1 alpha-2 del país (ej. `"CO"`, `"AR"`).
 * @returns Arreglo de subdivisiones ordenadas alfabéticamente o arreglo vacío si no hay catálogo estático.
 */
export function getCountrySubdivisions(countryCode: string): SubdivisionOption[] {
  const upper = countryCode.trim().toUpperCase();
  const cached = SUBDIVISION_CACHE.get(upper);
  if (cached) {
    return cached;
  }

  const raw = RAW_SUBDIVISIONS[upper] ?? [];
  const mapped: SubdivisionOption[] = raw.map(([code, name, aliases]) => ({
    code,
    countryCode: upper,
    name,
    aliases,
  }));

  SUBDIVISION_CACHE.set(upper, mapped);
  return mapped;
}

/**
 * Resuelve de forma determinística una entrada textual de subdivisión administrativa hacia ISO 3166-2.
 *
 * @param params - Parámetros con país ISO alpha-2 y texto ingresado (nombre o código).
 * @returns Estado `"resolved"`, `"ambiguous"` o `"unresolved"` junto con las coincidencias encontradas.
 */
export function resolveIsoSubdivision(params: {
  countryCode: string;
  input: string;
}): {
  status: "resolved" | "ambiguous" | "unresolved";
  matches: SubdivisionOption[];
} {
  const countryCode = params.countryCode.trim().toUpperCase();
  const catalog = getCountrySubdivisions(countryCode);
  const rawTrimmed = params.input.trim();
  if (!rawTrimmed || catalog.length === 0) {
    return { status: "unresolved", matches: [] };
  }

  const upperCode = rawTrimmed.toUpperCase();
  const byCode = catalog.filter(
    (item) =>
      item.code.toUpperCase() === upperCode ||
      item.code.toUpperCase() === `${countryCode}-${upperCode}`,
  );
  if (byCode.length === 1) {
    return { status: "resolved", matches: byCode };
  }

  const normalizedInput = normalizeGeoText(rawTrimmed);
  const exactMatches = catalog.filter((item) => {
    if (normalizeGeoText(item.name) === normalizedInput) {
      return true;
    }
    return item.aliases?.some((alias) => normalizeGeoText(alias) === normalizedInput) ?? false;
  });

  if (exactMatches.length === 1) {
    return { status: "resolved", matches: exactMatches };
  }
  if (exactMatches.length > 1) {
    return { status: "ambiguous", matches: exactMatches };
  }

  const partialMatches = catalog.filter((item) =>
    normalizeGeoText(item.name).includes(normalizedInput),
  );
  if (partialMatches.length === 1 && normalizedInput.length >= 4) {
    return { status: "resolved", matches: partialMatches };
  }
  if (partialMatches.length > 1 && normalizedInput.length >= 4) {
    return { status: "ambiguous", matches: partialMatches };
  }

  return { status: "unresolved", matches: [] };
}
