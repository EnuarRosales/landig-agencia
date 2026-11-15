# SPEC-20 · Estándar Geográfico Internacional, Teléfonos E.164 y Homologación Conversacional

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-20` |
| **Nombre** | Estándar Geográfico Internacional (ISO 3166-1/2), Teléfonos E.164 Obligatorios y Homologación Conversacional Multi-Conector |
| **Tipo de intervención** | Especificación transversal de modelo de datos, validación telefónica internacional, interfaz de captura y resolución determinística para Bot y conectores logísticos |
| **Prioridad** | P0 — Crítica (expansión internacional, integridad de WhatsApp/E.164 y desacoplamiento previo a conectores Dropi, Effi y MercadoLibre) |
| **Versión** | 1.0.0 |
| **Estado** | Borrador · Pendiente de aprobación del usuario |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`, `apps/web` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Specs previas relacionadas** | [SPEC-01](../spec-01-higiene-terminologica-ui-inquilino/requirements.md), [SPEC-05](../spec-05-perfil-negocio-identidad-canales-pago/requirements.md), [SPEC-06](../spec-06-rediseno-onboarding-cinco-pasos/requirements.md), [SPEC-09](../spec-09-crm-contactos-calificacion-direcciones-prospeccion/requirements.md), [SPEC-10](../spec-10-asistente-ai-bot-presets-politicas-mensajes/requirements.md), [SPEC-11](../spec-11-pedidos-crud-estados-guias-repetir/requirements.md), [SPEC-17](../spec-17-reglas-transversales-ui-i18n-tablas-guardado/requirements.md), [SPEC-19](../spec-19-arquitectura-prompts-ideal-comercializacion-clasificador/requirements.md), [BOT-002](../bot-002-motor-atencion-prompts/requirements.md), [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md), [ORD-001](../ord-001-pedidos-fulfillment/requirements.md), [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| **Insumo de investigación** | [Investigación Inicial MCP de Dropi](../../dropi-mcp-investigacion-inicial.md) (secciones de logística, campos condicionales por país y Anti-Corruption Layer) |
| **Directivas aplicables** | `.agents/AGENTS.md` (§4.2 Migraciones Drizzle, §4.4 TSDoc, §4.5 PostgreSQL + Drizzle, §4.6 i18n `es`/`en`, §4.8 Mobile First + Title Case, §4.11 Cero `@deprecated`, §4.12 `@t3-oss/env-nextjs`, §4.13 Logging estructurado sin PII completo, §4.14 Manejo de excepciones, §4.15 Cero códigos de spec en UI, §4.18 Compilación/reinicio/healthcheck, §4.19 Layout y modales) |

---

## 3. Problema y Motivación

Actualmente la plataforma presenta cinco brechas estructurales en captura geográfica y telefónica que limitan la operación internacional y elevan el riesgo de fallos al conectar operadores logísticos o ERPs:

1. **Ubicación geográfica como texto crudo acoplado a Colombia:**
   - En `admin.clients`, `admin.contacts`, `admin.contact_addresses` (con valor por defecto literal `"Colombia"`), `admin.orders` y `admin.conversation_state`, los campos `country`, `state` y `city` son columnas `text` libres sin estándar canónico.
   - En contraste, módulos recientes como `payment_gateways_config.supported_countries` ya emplean **ISO 3166-1 alpha-2** (`"CO"`), generando asimetría en el dominio.
2. **Heterogeneidad territorial y diccionarios incompatibles entre integraciones externas:**
   - **Dropi** requiere consultar dinámicamente `list_departments` y `search_cities`, maneja códigos DANE de 8 dígitos (`"11001000"`), presenta calidad heterogénea en su catálogo (p. ej. 7 departamentos de Colombia sin `department_code` y duplicados como `LA GUAJIRA` vs. `GUAJIRA`) y exige campos condicionales según país (`zip_code` obligatorio en Argentina y México, `colonia`/`neighborhood` en México y Costa Rica).
   - **Effi ERP** exige coincidencia exacta y código DANE de 5 dígitos (`"11001"`, `"05001"`).
   - **MercadoLibre** (`classified_locations`) utiliza ISO 3166-1 alpha-2 para países (`AR`, `CO`, `MX`), ISO 3166-2 para divisiones (`AR-C`, `CO-ANT`) e IDs propios codificados para ciudades.
   - A nivel mundial **no existe un estándar ISO para municipios/ciudades**, y la denominación territorial cambia por país (*Departamento*, *Provincia*, *Estado*, *Cantón*, *Barrio*, *Colonia*, *Distrito*). Acoplar el CRM a un diccionario externo o a un solo país rompería la expansión internacional.
3. **Ausencia de selector de código de país (E.164) en los formularios actuales:**
   - Todos los formularios implementados (`contacts-view.tsx`, `contact-detail-modal.tsx`, `step-business.tsx`, `profile-view.tsx`, `create-tenant-form.tsx`, `tenant-actions.tsx`, `new-order-dialog.tsx`, `demo-form.tsx`, `contacts-dashboard.tsx`) renderizan `<input type="tel">` o `<input type="text">` planos sin selector de indicativo internacional (`+57`, `+54`, `+52`, etc.).
   - En backend existe inconsistencia: `CrmService` valida un regex E.164 simple (`/^\+[1-9]\d{1,14}$/`) únicamente en `phoneMobile` (dejando fuera `phoneSecondary`, `phoneLandline`, `orders.customerPhone`, `clients.phone` y `leads.phone`), y dicho regex acepta secuencias numéricas imposibles para un país real (p. ej. `+57123`).
4. **Contrato incompleto de dirección en alta rápida, pedidos y bot:**
   - `neighborhood` (*Barrio / Colonia*) existe en la pestaña de direcciones de `contact-detail-modal.tsx`, pero falta en el modal de alta rápida de contactos (`contacts-view.tsx`), en `cell_orders`, en `cell_conversation_state` y en el contrato de `registrar_pedido` (`BotOrderCaptureService`).
   - No existe un atributo dedicado de **Complemento** (`address_complement` para apartamento, torre, piso, conjunto residencial, interior), mezclándose actualmente dentro de `reference_notes` junto con instrucciones al mensajero.
   - `core.order_flow` en `prompt-blocks.seed.ts` aún solicita `"Departamento"` acoplado al vocabulario colombiano y omite `País` y `Complemento`.
5. **Riesgo de alucinación al homologar direcciones desde chat por AI:**
   - Un cliente en WhatsApp escribe texto informal (*"Medallo"*, *"CABA, Palermo"*, *"Rionegro"*). Pedir al LLM que traduzca de memoria nombres a códigos ISO, DANE o IDs de transportadora provoca alucinaciones y errores silenciosos en homónimos.

---

## 4. Decisiones de Diseño (`/grill-me`)

### D-01 · Estándar Geográfico Canónico de 3 Niveles (Opción 1: Core Internacional + Validación Logística en Conector)
1. **Nivel 1 — País (`country_code`):** Se adopta **ISO 3166-1 alpha-2** en mayúsculas (`CHAR(2)`, p. ej. `"CO"`, `"AR"`, `"MX"`, `"US"`, `"ES"`) como llave canónica en todo Mocter.
   - **Descarte de ISO 3166-1 numérico (`032`, `170`):** El código numérico provoca pérdida de ceros a la izquierda en conversiones numéricas/CSV (`032` → `32`), carece de legibilidad en auditoría/logs y no coincide con APIs modernas (`Stripe`, `Shopify`, `MercadoLibre`, `Intl`, ni el propio `payment_gateways_config` de Mocter). Si un integrador externo futuro exige el código numérico o alpha-3, el adaptador correspondiente lo derivará determinísticamente 1:1 desde `alpha-2`.
   - Los nombres mostrados en UI se resuelven de forma localizada (`es`/`en`) mediante catálogo estándar e `Intl.DisplayNames`.
2. **Nivel 2 — Subdivisión Administrativa (`subdivision_code` + `state`):** Se adopta **ISO 3166-2** (p. ej. `"CO-ANT"`, `"AR-C"`, `"MX-JAL"`, `"US-NY"`) en selector autocompletable filtrado por país, sincronizando el nombre legible en `state`. Se permite fallback controlado a texto libre cuando un territorio o subdivisión no figure o el país carezca de primer nivel administrativo.
   - La etiqueta visual del formulario se adapta según metadata por país (*Departamento*, *Provincia*, *Estado*, *Región*).
3. **Nivel 3 — Ciudad / Localidad (`city` + `geo_resolution_status` + `raw_location_input`):** El núcleo CRM y Pedidos mantiene `city` flexible como texto normalizado para no bloquear ventas internacionales, servicios digitales ni localidades pequeñas cuando el inquilino opera manualmente. La exigencia estricta contra un catálogo cerrado de municipios o códigos DANE/ID se delega al **Anti-Corruption Layer (ACL)** del conector logístico cuando el inquilino tenga uno activo (`Dropi`, `Effi`, `MercadoLibre`).

### D-02 · Contrato Híbrido Fijo Mínimo de Dirección (`Barrio / Colonia` + `Complemento`)
Toda dirección física en CRM (`cell_contact_addresses`), Bot (`cell_conversation_state`, `core.order_flow`, `registrar_pedido`) y Pedidos (`cell_orders`) comparte el mismo contrato mínimo internacional:
- **Campos estándar base:**
  1. `countryCode` (ISO 3166-1 alpha-2)
  2. `subdivisionCode` (ISO 3166-2) + `state` (nombre legible)
  3. `city` (ciudad, municipio o localidad)
  4. `neighborhood` (**Barrio / Colonia / Distrito** — obligatorio exponer en captura de direcciones, pedidos y bot)
  5. `addressLine` (**Dirección Principal** — vía pública y numeración exterior)
  6. `addressComplement` (**Complemento** — **nuevo campo dedicado** para datos estructurales internos: apartamento, torre, piso, conjunto residencial, interior, oficina, local)
  7. `postalCode` (**Código Postal** — opcional por defecto en núcleo CRM y exigido dinámicamente cuando la metadata del país o el conector activo lo requiera, p. ej. AR 4 dígitos, MX 5 dígitos, US ZIP)
  8. `referenceNotes` (**Referencias de Entrega** — indicaciones operativas para el mensajero, p. ej. *"Casa esquinera portón blanco, llamar antes de llegar"*)

### D-03 · Teléfonos Internacionales E.164 Obligatorios en Todos los Formularios y Backend
- Todo campo telefónico de persona, contacto, comercio o pedido en `apps/admin` y `apps/web` debe capturar **código de marcación de país (`+57`, `+54`, `+52`, etc.) + número local** mediante un componente compartido (`<PhoneE164Input />`), emitiendo siempre formato estricto **E.164** (`+<código><número>`).
- La validación en backend (`@mocter/domain` + Zod en APIs/Actions) deja de usar únicamente un regex genérico y adopta validación real por país (`libphonenumber-js`) garantizando longitudes y prefijos válidos por nación, aplicada de forma uniforme a `phoneMobile`, `phoneSecondary`, `clients.phone`, `orders.customerPhone` y `leads.phone` (y validando teléfonos fijos con código de país cuando aplique).
- El país inicial del selector telefónico se preselecciona automáticamente desde el país del inquilino (`clients.country_code`), permitiendo al usuario cambiarlo libremente al capturar contactos de cualquier país.

### D-04 · Anti-Corruption Layer (ACL) de Catálogos Logísticos Externos
- Los catálogos geográficos de terceros (`Dropi`, `Effi`, `MercadoLibre`) viven aislados en una tabla de caché compartida en **BD Central** (`admin.geo_provider_locations`) alimentada por adaptadores por proveedor (`IGeoProviderCatalogPort`).
- Las anomalías de proveedores (departamentos sin código o duplicados en Dropi, DANE de 8 dígitos vs. 5 dígitos en Effi, IDs Base64 en MercadoLibre) se absorben dentro del adaptador y jamás se filtran a las tablas del dominio CRM.
- Las entidades operativas en **BD de Celda** (`cell_contact_addresses`, `cell_orders`, `cell_conversation_state`) almacenan únicamente la resolución resultante desacoplada en `provider_geo_refs` (JSONB indexado por proveedor, p. ej. `{ "dropi": { "cityId": 50, "daneCode": "11001000" } }`) y `geo_resolution_status`.

### D-05 · Homologación Conversacional Determinística en el Bot (`resolve_location`)
- **Separación de responsabilidades:** El LLM extrae únicamente lenguaje natural del comprador; **nunca** convierte nombres a códigos ISO, DANE ni IDs externos de memoria.
- **Inferencia determinística de contexto:** Si el usuario omite el país, el resolver combina: (1) el prefijo E.164 del teléfono del contacto cuando corresponde a un país unívoco (desempatando prefijos compartidos como `+1` mediante el país del comercio), y (2) `clients.country_code` del inquilino.
- **Tool determinística `resolve_location`:** Normaliza alias/tildes y consulta ISO 3166-1/2 + `admin.geo_provider_locations` (si el inquilino tiene conector activo), devolviendo exactamente uno de cuatro estados:
  1. `resolved`: coincidencia única confiable → persiste códigos canónicos y `provider_geo_refs` en `cell_conversation_state`.
  2. `soft_normalized`: inquilino sin conector logístico activo → normaliza texto, resuelve país/región cuando exista y guarda sin bloquear la conversación.
  3. `ambiguous`: 2 o más candidatos empatados (p. ej. *Rionegro, Antioquia* vs. *Rionegro, Santander*; *Bogotá* vs. *Puerto Bogotá*) → retorna lista acotada para que el bot realice **una sola pregunta de desambiguación**.
  4. `unresolved`: sin coincidencia en conector obligatorio → el bot solicita aclaración puntual o registra el contacto/pedido marcado como `unresolved` para revisión humana antes de emitir guía, sin perder el lead ni inventar un ID.
- El bloque de plataforma `core.order_flow` en `prompt-blocks.seed.ts` se actualiza a `version: 2` reflejando el set híbrido internacional (incluyendo País, División administrativa, Ciudad, Barrio/Colonia, Dirección, Complemento y Referencia/Código postal).

### D-06 · Estrategia de Migración Segura (Expandir → Convivir → Backfill)
- Cumpliendo `R-09` de `.agents/AGENTS.md`, no se editan migraciones previas; se generan nuevas migraciones aditivas para BD Central (`packages/domain/drizzle/`) y BD de Celda (`packages/domain/drizzle-cell/`).
- Las columnas existentes `country`, `state` y `city` permanecen sincronizadas con `country_code` y `subdivision_code` para evitar roturas en consumidores vigentes.
- El backfill convierte únicamente textos unívocos existentes (p. ej. `"Colombia"` → `"CO"`) y conserva valores legados ambiguos sin sobreescribirlos arbitrariamente.

---

## 5. Requisitos Funcionales

| ID | Requisito |
| --- | --- |
| **RF-SPEC-20-01** | `@mocter/domain` debe proveer un módulo geográfico estándar que exponga catálogo ISO 3166-1 alpha-2, catálogo ISO 3166-2 por país, perfiles de dirección por país (`CountryAddressProfile` con etiquetas localizadas `es`/`en` y reglas postales) y helper de conversión 1:1 hacia ISO numérico/alpha-3 exclusivamente para adaptadores que lo requieran. |
| **RF-SPEC-20-02** | `@mocter/domain` debe proveer un validador/normalizador telefónico internacional (`parseAndValidateE164`, `inferCountriesFromE164`) respaldado por `libphonenumber-js`, capaz de validar longitudes y rangos reales por país y extraer códigos ISO candidatos a partir de teléfonos E.164. |
| **RF-SPEC-20-03** | La BD Central (`admin.clients` y nueva tabla `admin.geo_provider_locations`) y las BDs de Celda (`admin.contacts`, `admin.contact_addresses`, `admin.conversation_state`, `admin.orders`) deben incorporar las columnas canónicas `country_code`, `subdivision_code`, `neighborhood` (donde falte), `address_complement`, `geo_resolution_status`, `raw_location_input` y `provider_geo_refs` con comentarios SQL (`COMMENT ON TABLE/COLUMN`), índices compuestos (`client_id, ...`) y políticas RLS vigentes. |
| **RF-SPEC-20-04** | Debe existir un componente UI reutilizable `<PhoneE164Input />` (Mobile First, i18n `es`/`en`, Title Case, tokens `--dsn-*`) con selector buscable/accesible de código de país E.164 e input numérico local que garantice formato E.164 válido al capturar o editar cualquier teléfono no vacío. |
| **RF-SPEC-20-05** | Todos los formularios implementados en `apps/admin` y `apps/web` que capturen teléfonos (`contacts-view.tsx`, `contact-detail-modal.tsx`, `step-business.tsx`, `profile-view.tsx`, `create-tenant-form.tsx`, `tenant-actions.tsx`, `new-order-dialog.tsx`, `demo-form.tsx`, `contacts-dashboard.tsx`) deben migrar a `<PhoneE164Input />` y sus endpoints/Server Actions deben rechazar teléfonos malformados con mensajes claros en `es`/`en`. |
| **RF-SPEC-20-06** | Debe existir un componente UI reutilizable `<GeoAddressFields />` que implemente selección estandarizada de **País** (ISO alpha-2), **División Administrativa** (ISO 3166-2 filtrada por país con etiqueta adaptativa y fallback), **Ciudad**, **Barrio / Colonia**, **Dirección**, **Complemento**, **Código Postal** (obligatoriedad/ayuda según país) y **Referencias de Entrega**, integrándose en el perfil del comercio (`/workspace/profile`), alta rápida de contacto (`/workspace/contacts`), libreta de direcciones (`contact-detail-modal.tsx`) y creación de pedidos. |
| **RF-SPEC-20-07** | El dominio debe implementar `LocationResolverService` y el puerto/repositorio ACL `IGeoProviderLocationsRepository` con adaptadores iniciales para homologación contra `Dropi`, `Effi` y `MercadoLibre` sobre `admin.geo_provider_locations`, resolviendo alias locales y reportando `resolved`, `soft_normalized`, `ambiguous` o `unresolved`. |
| **RF-SPEC-20-08** | El motor del bot debe incorporar la invocación determinística de `resolve_location` antes de persistir dirección o ejecutar `registrar_pedido`, actualizando `ConversationStateService`, `BotOrderCaptureService` (`countryCode`, `subdivisionCode`, `neighborhood`, `addressComplement`, `referenceNotes`, `geoResolutionStatus`, `providerGeoRefs`) y el bloque `core.order_flow` v2 en `prompt-blocks.seed.ts`. |
| **RF-SPEC-20-09** | `CrmService` y `OrdersService` deben propagar todos los campos del contrato híbrido entre la dirección predeterminada del contacto (`cell_contact_addresses`), `cell_contacts` y los snapshots de pedido (`cell_orders`). |
| **RF-SPEC-20-10** | La lógica de detección automática de pasarela de pago por país (`clients.country_code` → `payment_gateways_config.supported_countries`) debe consumir `country_code` ISO 3166-1 alpha-2 como fuente canónica primaria. |

---

## 6. Reglas de Negocio (Invariantes)

- **`RN-SPEC-20-01` (País canónico ISO 3166-1 alpha-2):** Todo país persistido como código canónico utiliza exactamente 2 letras mayúsculas (`^[A-Z]{2}$`). Ningún flujo nuevo persiste código numérico (`"032"`) como llave interna.
- **`RN-SPEC-20-02` (Separación estructural entre Complemento y Referencias):** `address_complement` almacena exclusivamente subunidades estructurales del inmueble (apartamento, torre, bloque, conjunto residencial, piso, local). `reference_notes` almacena indicaciones operativas de llegada o entrega.
- **`RN-SPEC-20-03` (Exigibilidad uniforme de E.164):** Ningún formulario ni endpoint admite guardar o modificar un teléfono móvil/principal o secundario sin código de país E.164 válido según reglas reales del país indicado. Los registros históricos sin formato E.164 anteriores a esta especificación pueden leerse sin error en listados, pero su edición exige completar el indicativo internacional.
- **`RN-SPEC-20-04` (No bloqueo del CRM sin conector activo):** Si el inquilino no tiene habilitado un conector logístico/ERP estricto, el CRM y el bot nunca rechazan una dirección válida porque la ciudad o vereda no figure en un catálogo externo.
- **`RN-SPEC-20-05` (Barrera logística en conectores activos):** Ningún adaptador de envío (`Dropi`, `Effi`, `MercadoLibre`) puede despachar una orden cuyo `provider_geo_refs` no haya sido resuelto contra el catálogo ACL del proveedor (`resolved`), exigiendo desambiguación o corrección previa.
- **`RN-SPEC-20-06` (Cero alucinación de códigos por LLM):** El prompt del asistente nunca solicita al LLM generar códigos ISO, DANE ni IDs numéricos de transportadoras; toda conversión es responsabilidad exclusiva de `LocationResolverService`.
- **`RN-SPEC-20-07` (Desempate en prefijos telefónicos compartidos):** Cuando un teléfono E.164 pertenece a un indicativo compartido por múltiples países (p. ej. `+1`), el resolver no asume un país único sin contrastar primero contra el texto del usuario y `clients.country_code`.
- **`RN-SPEC-20-08` (Higiene terminológica y formato UI):** Toda etiqueta de formulario sigue formato Title Case gramatical (`AGENTS.md §4.8`), traducción completa `es`/`en` y cero siglas de especificación o arquitectura (`SPEC-20`, `E.164`, `ISO 3166`, `DANE`, `ACL`) expuestas en badges o textos dirigidos al comercio usuario final (`SPEC-01`, `rules-for-no-spec-codes-in-ui.md`).

---

## 7. Requisitos No Funcionales

- **Rendimiento:** La resolución en memoria de países ISO, validaciones E.164 y búsquedas en `admin.geo_provider_locations` indexadas por `(provider, country_code, normalized_name)` deben completarse en `< 30 ms` p95 en servidor sin llamadas HTTP síncronas bloqueantes en formularios.
- **Seguridad y Privacidad (PII):** Cumpliendo `AGENTS.md §4.13`, los logs estructurados del resolver de ubicación y validación telefónica jamás registran números telefónicos completos ni direcciones físicas completas en texto plano (solo `clientId`, `countryCode`, `geoResolutionStatus` y código de resultado).
- **Aislamiento Multitenant:** Las tablas modificadas en celda mantienen `client_id NOT NULL`, índices compuestos encabezados por `client_id` y RLS estricto (`app.current_client_id`).
- **Accesibilidad e Internacionalización:** Selectores de país/subdivisión e indicativo navegables por teclado, etiquetas `htmlFor` explícitas, Mobile First, sin uso de `uppercase` forzado en labels y paridad 100 % `es`/`en`.

---

## 8. Criterios de Aceptación (Gherkin)

```gherkin
Característica: Estándar geográfico internacional, teléfonos E.164 obligatorios y homologación conversacional

  Escenario: Operador crea un contacto internacional en Argentina con E.164, ISO y Complemento
    Dado que un inquilino abre el modal "Nuevo Contacto" en "/workspace/contacts"
    Cuando selecciona el indicativo "+54" e ingresa el número local "1155551234"
    Y activa la dirección inicial seleccionando País "Argentina" ("AR"), Provincia "Buenos Aires" ("AR-B"), Ciudad "Ezeiza", Barrio "Canning", Dirección "Av. Mariano Castex 1200", Complemento "Torre Norte, Piso 3 Depto B" y Código Postal "1804"
    Entonces el sistema persiste "phone_mobile" como "+541155551234"
    Y guarda "country_code = 'AR'", "subdivision_code = 'AR-B'", "city = 'Ezeiza'", "neighborhood = 'Canning'", "address_complement = 'Torre Norte, Piso 3 Depto B'" y "postal_code = '1804'"

  Escenario: Rechazo de número telefónico inválido en onboarding y formularios sin importar longitud genérica
    Dado que un usuario completa el Paso 1 de Onboarding o el Perfil del Comercio
    Cuando selecciona código de país "+57" e ingresa un número local incompleto "123"
    Entonces el formulario y la API rechazan el guardado informando en el idioma activo que el número telefónico no es válido para el país seleccionado

  Escenario: Bot de WhatsApp homologa entrada informal sin bloquear comercio manual sin conector
    Dado que un comercio configurado en Colombia ("CO") no tiene conector logístico Dropi ni Effi activo
    Y un comprador escribe por WhatsApp desde "+573001112233": "Envíamelo a Medallo, barrio Laureles, circular 4 # 70-10 apto 301"
    Cuando el bot invoca la herramienta de resolución de ubicación
    Entonces el sistema resuelve determinísticamente "country_code = 'CO'", "subdivision_code = 'CO-ANT'", "city = 'Medellín'", "neighborhood = 'Laureles'", "address_line = 'Circular 4 # 70-10'" y "address_complement = 'Apto 301'"
    Y registra el pedido sin exigir ID de transportadora externa

  Escenario: Bot desambigua municipios homónimos cuando el comercio tiene conector logístico activo
    Dado que un comercio tiene conectado el catálogo logístico de Dropi Colombia
    Y un comprador escribe por WhatsApp que desea recibir su pedido en "Rionegro"
    Cuando "resolve_location" consulta el catálogo ACL de Dropi
    Entonces retorna estado "ambiguous" con los candidatos "Rionegro, Antioquia" y "Rionegro, Santander"
    Y el bot formula una única pregunta clara al comprador para confirmar a cuál de los dos municipios corresponde antes de registrar la orden

  Escenario: Validación de barrera logística antes de despachar por conector externo
    Dado que un pedido fue capturado previamente con ciudad en estado "unresolved"
    Cuando el operador intenta sincronizar el despacho hacia Dropi o Effi
    Entonces el adaptador del conector impide el envío y solicita confirmar la ciudad homologada del catálogo oficial del proveedor
```

---

## 9. Fuera de Alcance

- Autocompletado satelital de coordenadas GPS o mapas interactivos mediante APIs comerciales de pago (Google Places / Mapbox).
- Implementación completa del ciclo HTTP OAuth y emisión de guías en vivo contra las APIs productivas de Dropi, Effi o MercadoLibre (esta especificación deja listo el núcleo canónico, el esquema ACL de ubicaciones y el contrato de puertos).
- Eliminación física o destructiva de columnas legadas (`country`, `state`) en esta fase.
