# SPEC-05 · Perfil Completo del Comercio, Identidad Operativa, Idioma y Canales de Pago del Inquilino

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-05` |
| **Nombre** | Perfil Completo del Comercio, Identidad Operativa, Idioma y Canales de Pago del Inquilino |
| **Tipo de intervención** | Nuevo desarrollo de módulo funcional + Extensión de esquema del comercio |
| **Prioridad** | P0 — Crítica (base de datos comerciales del tenant para Onboarding, Shell y Bot) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`, `apps/web` (si aplica lectura de perfil público del catálogo) |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-01`, `ONB-02`, `ONB-03`, `ONB-04`, `ONB-05`, `ONB-06`, `PED-03` |
| **Specs previas relacionadas** | `ADM-001`, `TNT-001`, `CEL-001`, `ORD-001` |
| **Specs dependientes** | `SPEC-06` (Paso 1 de Onboarding captura email comercial, web, teléfono, idioma y logo opcional), `SPEC-07` (el shell muestra logo y nombre comercial del perfil), `SPEC-10` (bot responde con métodos de pago e idioma del comercio), `SPEC-11` (pedidos usan catálogo estructurado de canales de pago del comercio), `SPEC-17` (resolución de idioma UI desde `clients.locale`) |
| **Wave de ejecución sugerida** | Wave 2 — Monetización, Identidad y Onboarding |

---

## 3. Problema / Situación actual

Actualmente el Backoffice del Inquilino carece de una pantalla de configuración general del negocio y el modelo de datos actual tiene información dispersa o incompleta:

1. **Inexistencia del módulo «Perfil Del Comercio / Configuración General» (`GEN-01`):**
   - El menú del workspace únicamente expone `apps/admin/app/workspace/branding/page.tsx`, la cual está restringida a la capacidad Enterprise `custom_branding` y solo contiene un bloque estático vacío. Un comercio en cualquier plan no puede ver ni actualizar su razón/nombre comercial, correo comercial, correo de contacto/facturación, teléfono, página web, ubicación física, redes sociales, zona horaria, moneda o logo comercial básico.
2. **Atributos comerciales omitidos en Onboarding y esquema (`ONB-02`..`ONB-06`):**
   - `admin.clients` (`packages/domain/src/db/schemas/admin/clients.ts`) cuenta con `contactEmail`, `phone`, `websiteUrl`, `locale`, `logoMediaId` y `socialLinks`, pero **no diferencia el correo comercial público (`commercialEmail`)** del correo administrativo/contacto (`contactEmail`). Además, el Paso 1 de Onboarding actualmente solo pide nombre comercial, slug, moneda, zona horaria y plan, dejando por fuera `commercialEmail`, `websiteUrl`, `phone`, `locale` y carga opcional de `logo`.
3. **Canales de pago del comercio almacenados sin estructura (`PED-03`):**
   - `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` guarda `cellClientBusinessInfo.paymentMethods` como un arreglo plano de cadenas (`string[]`), y `packages/domain/src/db/schemas/tenant/orders.ts` no cuenta con una tabla dedicada para los **canales de pago informativos del comercio** (Nequi, Daviplata, Bancolombia, Contraentrega, PSE, Link de pago propio, Bre-B propio del comercio, etc.). Esto impide parametrizar si cada método está activo, cuál es su número/cuenta/llave e instrucciones de pago para el cliente final y el bot, o reutilizarlos estructuradamente en Pedidos (`SPEC-11`) y Onboarding Paso 4 (`SPEC-06`).

---

## 4. Objetivo y valor de negocio

Centralizar en el módulo **«Perfil Del Negocio» (`/workspace/profile`)** toda la identidad operativa, localización y canales de pago informativos del comercio (disponibles para **todos los planes**), sincronizados en tiempo real con el Paso 1 y Paso 4 del Onboarding, el encabezado del Backoffice (`TAB-01`) y las respuestas del asistente AI (`SPEC-10`).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión de `admin.clients` con `commercialEmail` (y verificación/normalización de campos existentes: `displayName`, `slug`, `phone`, `websiteUrl`, `locale`, `currency`, `timezone`, `country`, `state`, `city`, `addressLine`, `postalCode`, `industry`, `taxId`, `logoMediaId`, `socialLinks`).
- Creación de tabla estructurada en celda (`pg-cell-XX`): `tenant_payment_channels` (o `cell_tenant_payment_methods`) dentro de `packages/domain/src/db/schemas/tenant/orders.ts` (o `tenancy-catalog.ts`) con aislamiento estricto `client_id` + RLS.
- Creación de endpoints `/api/tenant/profile` (`GET`, `PATCH`) y `/api/tenant/payment-channels` (`GET`, `POST`, `PATCH`, `DELETE`) con manejo `Result` + RFC 9457.
- Flujo de carga del logo comercial del inquilino conectado a SeaweedFS + imgproxy (`SPEC-00`), disponible desde Onboarding Paso 1 y `/workspace/profile` **sin restricción al plan Enterprise** (diferenciado de la marca blanca avanzada en `/workspace/branding` de `SPEC-07`).
- Creación de la vista `/workspace/profile` (`apps/admin/app/workspace/profile/page.tsx` [Nuevo] + `profile-view.tsx` [Nuevo]) y entrada clara en navegación lateral del workspace para `tenancy_owner`.
- Propagación de `clients.locale` actualizado como idioma por defecto del comercio (afectando UI para usuarios sin preferencia individual y el idioma base de respuesta comercial).

### Fuera de alcance
- Personalización de paleta de colores global, eliminación del footer/marca Mocter (`removeMocterBranding`), favicon institucional y dominio propio (corresponde a `SPEC-07` — Marca Blanca Enterprise).
- Pasarelas de cobro de suscripciones SaaS hacia Mocter (corresponde a `SPEC-04`).
- Reglas de creación y estados de pedidos (corresponde a `SPEC-11`).
- Procesamiento real de pagos de compradores finales (restricción inicial del producto: Mocter no procesa pagos en nombre de inquilinos; solo informa sus canales configurados).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Consultar y editar todos los campos de perfil comercial, idioma, logo y canales de pago del comercio | Sí | Solo su `client_id` |
| `tenancy_users` (`tenant_agent`) | Consultar lectura operativa (ej. canales de pago activos para registrar pedidos) | Sí | Solo lectura no destructiva |
| `tenancy_users` (`tenant_agent`) | Modificar perfil del negocio, idioma base, logo o activar/eliminar canales de pago | No | Denegado (`403 Forbidden`) |
| `platform_owner` / `platform_admin` | Consultar datos básicos del comercio en `/admin/tenants` | Sí | Solo soporte/administración SaaS |

---

## 7. Modelo de datos

### 7.1 Actualización de `admin.clients` (`packages/domain/src/db/schemas/admin/clients.ts`)
- **`commercial_email`**: `VARCHAR(255)` nullable en BD (obligatorio en formulario de Onboarding Paso 1 y Perfil desde la remediación), formato email válido. Correo público comercial visible en catálogos, confirmaciones y pies de página hacia compradores finales (distinto de `contact_email` administrativo/facturación).
- Campos existentes aprovechados y validados:
  - `display_name`: `VARCHAR(160)` `NOT NULL`, min 2 caracteres.
  - `slug`: `VARCHAR(80)` único, formato `^[a-z0-9-]+$` (solo editable mientras no rompa enlaces activos o bajo regla controlada de slug).
  - `phone`: `VARCHAR(32)` (formato E.164 o teléfono nacional validado).
  - `website_url`: `TEXT` nullable (validación HTTP/HTTPS `https://...`).
  - `locale`: `VARCHAR(10)` `NOT NULL`, enum `'es' | 'en'`, default `'es'`.
  - `currency`: `VARCHAR(8)` `NOT NULL`, enum `'COP' | 'USD'` (extensible), default `'COP'`.
  - `timezone`: `VARCHAR(64)` `NOT NULL`, default `'America/Bogota'`.
  - `logo_media_id`: `UUID` FK nullable → `admin.media_catalog.id` (o referencia segura servida vía imgproxy).
  - `social_links`: `JSONB` `{ instagram?: string, facebook?: string, tiktok?: string, whatsapp?: string, youtube?: string }`.
  - `country`, `state`, `city`, `address_line`, `postal_code`, `industry`, `tax_id`.

### 7.2 Nueva tabla `tenant_payment_channels` en `pg-cell-XX` (`packages/domain/src/db/schemas/tenant/orders.ts`)
- `id`: `UUID` PK.
- `client_id`: `UUID` `NOT NULL`, indexado con política RLS obligatoria `app.current_client_id`.
- `channel_code`: `VARCHAR(48)` `NOT NULL` (catálogo sugerido: `'nequi'`, `'daviplata'`, `'bancolombia'`, `'bre_b'`, `'pse'`, `'card_link'`, `'cash_on_delivery'`, `'efecty'`, `'bank_transfer'`, `'other'`).
- `display_name`: `VARCHAR(120)` `NOT NULL` (ej. «Transferencia Nequi», «Contraentrega En Efectivo»).
- `account_identifier`: `VARCHAR(160)` nullable (número de celular/cuenta, llave Bre-B del comercio o enlace informativo).
- `account_holder_name`: `VARCHAR(160)` nullable (nombre del titular o empresa receptora).
- `instructions`: `TEXT` nullable (instrucciones claras que el bot y las confirmaciones envían al comprador, hasta 1,000 caracteres).
- `is_active`: `BOOLEAN` `NOT NULL`, default `true`.
- `sort_order`: `INTEGER` `NOT NULL`, default `0`.
- `created_at`, `updated_at`: `TIMESTAMPTZ` `NOT NULL`.
- **Estrategia de eliminación:** Si el canal ya fue referenciado históricamente por pedidos en `cell_orders`, solo se permite **inactivar (`is_active = false`)** o si nunca se ha usado se permite eliminación física previa confirmación modal `--dsn-*`; en todo caso `cell_orders` conserva snapshot de método usado (`payment_method`).
- **Sincronización transitoria:** Al guardar cambios en `tenant_payment_channels`, actualizar también la proyección resumida en `cell_client_business_info.payment_methods` para retrocompatibilidad inmediata con módulos que aún lean la lista resumida hasta migrar totalmente a esta tabla.

---

## 8. Reglas de negocio

- **RN-SPEC-05-01 (Logo comercial habilitado en todos los planes):** Cualquier inquilino en cualquier plan puede cargar opcionalmente su logotipo comercial desde el Paso 1 del Onboarding (`ONB-06`) y actualizarlo o quitarlo en `/workspace/profile` (`GEN-01`). Esta capacidad NO depende del flag `custom_branding` (que queda restringido únicamente a marca blanca avanzada en `SPEC-07`).
- **RN-SPEC-05-02 (Idioma del comercio como cascada de internacionalización):** Modificar `admin.clients.locale` (`'es'` o `'en'`) actualiza inmediatamente el idioma por defecto de la interfaz del Backoffice del Inquilino (`AGENTS.md §4.6`: preferencia de usuario → `clients.locale` → navegador → `'es'`) y establece el idioma por defecto sugerido para mensajes comerciales del bot si no tiene sobrescritura explícita.
- **RN-SPEC-05-03 (Validación estricta de contacto, web y unicidad de slug):**
  - `commercialEmail` debe ser un correo sintácticamente válido (requerido en onboarding nuevo y al guardar perfil completo).
  - `websiteUrl`, cuando se informe, debe iniciar por `https://` o `http://` y ser URL válida (opcionalmente vacía si el negocio no tiene sitio web propio).
  - `phone`, cuando se informe, debe tener entre 7 y 20 caracteres numéricos válidos (admitiendo prefijo `+`).
  - `displayName` obligatorio (`2..160` caracteres), prohibido truncar su visualización en shell o tarjetas (`TAB-01`).
- **RN-SPEC-05-04 (Canales de pago informativos únicamente — sin intermediación financiera):** Todo canal configurado en `tenant_payment_channels` es meramente informativo para que el bot y el comercio comuniquen al cliente final cómo pagar directamente al comercio. El sistema prohíbe capturar credenciales bancarias secretas (`passwords`, `tokens privados`, `CVV`) en estos campos y advierte explícitamente sobre ello.
- **RN-SPEC-05-05 (Fuente única de métodos de pago entre Onboarding, Perfil, Pedidos y Bot):** Al activar o editar canales en Onboarding Paso 4 (`SPEC-06`), se persisten directamente en `tenant_payment_channels`, quedando de inmediato disponibles en `/workspace/profile`, en el selector de creación de pedidos (`/workspace/orders`, `PED-03`) y en las respuestas del bot comercial (`SPEC-10`).
- **RN-SPEC-05-06 (Protección de archivos de logo):** Solo se admiten imágenes (`PNG`, `JPG`, `WEBP`, `SVG` sanitizado o preferiblemente raster `PNG`/`WEBP`/`JPG`) `<= 5 MiB`, procesadas por SeaweedFS + imgproxy (`SPEC-00`) para generar variantes optimizadas para header y ficha pública.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/profile` y `PATCH /api/tenant/profile` [Nuevos]
- **Autenticación:** Sesión autenticada (`GET`: `tenancy_owner` o `tenant_agent`; `PATCH`: exclusivo `tenancy_owner`).
- **Payload `PATCH` (parcial validado con Zod):**
  ```json
  {
    "displayName": "Comercializadora Andes S.A.S.",
    "commercialEmail": "ventas@comercializadoraandes.co",
    "contactEmail": "gerencia@comercializadoraandes.co",
    "phone": "+573001234567",
    "websiteUrl": "https://comercializadoraandes.co",
    "locale": "es",
    "currency": "COP",
    "timezone": "America/Bogota",
    "country": "CO",
    "city": "Medellín",
    "addressLine": "Cra 43A # 1-50",
    "taxId": "900123456-7",
    "industry": "retail",
    "logoMediaId": "uuid-o-null",
    "socialLinks": {
      "instagram": "https://instagram.com/andes",
      "whatsapp": "+573001234567"
    }
  }
  ```
- **Response `200 OK`:** Objeto consolidado del comercio incluyendo `logoResolvedUrl` generado vía imgproxy (`SPEC-00`). Si cambia `locale`, emite cookie/cabecera de sincronización UI en respuesta.

### 9.2 `GET / POST /api/tenant/payment-channels` y `PATCH / DELETE /api/tenant/payment-channels/[id]` [Nuevos]
- **Autenticación:** `GET` (`tenancy_owner` | `tenant_agent`), `POST`/`PATCH`/`DELETE` (`tenancy_owner`).
- **Payload `POST / PATCH`:**
  ```json
  {
    "channelCode": "nequi",
    "displayName": "Nequi Empresarial",
    "accountIdentifier": "3001234567",
    "accountHolderName": "Comercializadora Andes",
    "instructions": "Enviar comprobante por este mismo chat indicando tu número de pedido.",
    "isActive": true,
    "sortOrder": 1
  }
  ```
- **Errores RFC 9457:** `400 validation_error`, `403 forbidden`, `409 CHANNEL_USED_IN_ORDERS` al intentar borrar físicamente un canal ya usado en `cell_orders` (sugiere desactivar).

---

## 10. Especificación de UI/UX

- **Navegación (`tenant-workspace-shell.tsx`):** Agregar enlace accesible **«Perfil Del Negocio»** (`/workspace/profile`) en la zona de configuración del comercio, separado de «Marca Blanca» (`/workspace/branding`).
- **Secciones en `/workspace/profile` (Mobile First, cards con tokens `--dsn-*`, todos los labels en Title Case sin `uppercase`):**
  1. **Identidad Visual Y Datos Generales:** Carga/cambio/eliminación de **Logo Comercial** (preview instantáneo + botón «Subir Logo» / «Quitar Logo» con modal de confirmación `--dsn-*`), Nombre Comercial, URL Pública (`mocter.co/{slug}` solo lectura o edición segura), Correo Comercial, Teléfono De Contacto, Sitio Web, NIT/RUT/Tax ID, Industria.
  2. **Localización E Idioma:** Selector **Idioma Del Comercio** (`Español` / `English`), País, Ciudad, Dirección Física, Moneda y Zona Horaria. Al guardar nuevo idioma, refresca la interfaz en el idioma elegido (`router.refresh()`).
  3. **Redes Sociales:** Instagram, Facebook, TikTok, WhatsApp Comercial.
  4. **Canales De Pago Para Tus Clientes (`PED-03`):** Tabla/lista responsiva con activación rápida (`switch`), modal de creación/edición en Title Case («Canal De Pago», «Nombre Visible», «Número De Cuenta O Llave», «Titular», «Instrucciones Para El Cliente») y modal `--dsn-*` para eliminar/inactivar (cero `window.confirm`). Aviso informativo claro: *«Mocter no procesa ni retiene dinero de tus ventas; estos datos solo se muestran a tus clientes para que te paguen directamente.»*

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Perfil comercial del inquilino, idioma, logo y canales de pago

  Escenario: Propietario actualiza datos comerciales, sube logo y cambia el idioma del comercio a Inglés
    Dado que el propietario del comercio "Tienda Café" accede a "/workspace/profile"
    Cuando actualiza "Correo Comercial" a "ventas@tiendacafe.co", "Sitio Web" a "https://tiendacafe.co", cambia "Idioma Del Comercio" a "en" y sube un logo PNG válido de 400 KB
    Y pulsa "Guardar Cambios"
    Entonces el endpoint PATCH "/api/tenant/profile" responde HTTP 200
    Y el logo se almacena en SeaweedFS y queda asociado a "admin.clients.logo_media_id"
    Y el header del Backoffice muestra inmediatamente el nuevo logo y la UI aplica el idioma inglés por defecto del comercio

  Escenario: Propietario configura canales de pago informativos disponibles para Pedidos y Bot
    Dado que el propietario ingresa a la sección "Canales De Pago" en "/workspace/profile"
    Cuando agrega el canal "Nequi" con identificador "3105551234", titular "Tienda Café SAS" e instrucción "Envía tu captura al WhatsApp"
    Entonces el registro se crea en "tenant_payment_channels" de su celda aislado por "client_id"
    Y dicho canal queda disponible automáticamente al registrar pedidos en "/workspace/orders" y en respuestas del asistente AI
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de sitio web sin protocolo o correo comercial inválido
    Dado que el usuario ingresa "websiteUrl = tiendacafe" o "commercialEmail = correo-invalido"
    Cuando envía PATCH "/api/tenant/profile"
    Entonces el servidor retorna HTTP 400 Problem Details indicando los campos con formato incorrecto
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Protección histórica impide eliminar físicamente un canal de pago ya usado en pedidos
    Dado que el canal de pago "Bancolombia Ahorros" ya fue asociado a al menos un pedido en "cell_orders"
    Cuando el propietario intenta eliminarlo con DELETE "/api/tenant/payment-channels/[id]"
    Entonces el backend rechaza la eliminación física con HTTP 409 "CHANNEL_USED_IN_ORDERS"
    Y la UI sugiere inactivar el canal para conservar la trazabilidad de pedidos históricos
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Colaborador no puede modificar el perfil del negocio ni canales de pago
    Dado que un usuario con rol "tenant_agent" está autenticado
    Cuando envía PATCH "/api/tenant/profile" o POST "/api/tenant/payment-channels"
    Entonces el servidor responde HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Eliminación del logotipo revierte de forma limpia al icono predeterminado sin romper el shell
    Dado que el comercio tiene un logo personalizado configurado
    Cuando el propietario pulsa "Quitar Logo" y confirma en el modal del sistema de diseño
    Entonces "logo_media_id" pasa a null y tanto el shell como el dashboard renderizan el logotipo estándar sin enlaces rotos
```

---

## 12. Requisitos no funcionales

- **Aislamiento multi-tenant:** Toda consulta y mutación sobre `tenant_payment_channels` en `pg-cell-XX` se ejecuta dentro de transacción con `SET LOCAL app.current_client_id` + cláusula `WHERE client_id = session.clientId`.
- **Internacionalización (`AGENTS.md §4.6`):** Etiquetas de formulario, mensajes de validación y tooltips en diccionarios `es`/`en` sin literales incrustados en JSX.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino JSON `tenant.profile.updated` y `tenant.payment_channel.mutated` correlacionados por `requestId` con `after()`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (carga real de imagen de logo a SeaweedFS + entrega por imgproxy).
- **Riesgos:**
  - *Desincronización entre `cell_client_business_info.payment_methods` y `tenant_payment_channels`:* Mitigado haciendo de `tenant_payment_channels` la fuente maestra y sincronizando automáticamente el arreglo resumen al mutar canales mientras concluye la adopción en `SPEC-06`, `SPEC-10` y `SPEC-11`.

---

## 14. Definition of Done

- [ ] Columna `commercial_email` añadida a `admin.clients` + tabla `tenant_payment_channels` en esquema de celda + migraciones SQL generadas y aplicadas.
- [ ] Servicios y endpoints `/api/tenant/profile` y `/api/tenant/payment-channels` creados, validados con Zod, `handle()` RFC 9457 y pruebas unitarias/integración.
- [ ] Vista `/workspace/profile` implementada Mobile First en `es`/`en`, Title Case en labels, modal `--dsn-*` (cero `window.confirm`), accesible desde navegación del workspace.
- [ ] Carga y eliminación de logo funcionando extremo a extremo vía SeaweedFS/imgproxy para cualquier plan.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas pendientes; todas las definiciones de perfil comercial y canales informativos de pago fueron validadas dentro del catálogo aprobado.

