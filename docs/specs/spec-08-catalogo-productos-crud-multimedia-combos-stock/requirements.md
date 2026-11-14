# SPEC-08 · Catálogo Completo de Productos: CRUD, Multimedia Multimodal, Prompts Maestros de Bot, Atributos Dinámicos, Combos y Alertas de Stock

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-08` |
| **Nombre** | Catálogo Completo de Productos: CRUD, Multimedia Multimodal, Prompt de Bot, Atributos Dinámicos, Combos y Stock Mínimo |
| **Tipo de intervención** | Evolución integral de núcleo comercial + Remediación de brechas funcional/esquema |
| **Prioridad** | P0 — Crítica (corazón comercial del comercio y conocimiento del bot) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`, `apps/web` (lectura catálogo si aplica) |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `PRD-03`, `PRD-04`, `PRD-05`, `PRD-06`, `PRD-07`, `PRD-08` |
| **Specs previas relacionadas** | `TNT-001`, `BOT-001`, `ORD-001`, `NTF-001` |
| **Specs dependientes / integradas** | `SPEC-00` (persistencia SeaweedFS + URLs imgproxy), `SPEC-01` (terminología sin jerga), `SPEC-02` («Mejorar con AI» real para descripción y `bot_master_prompt`), `SPEC-03` (límites de productos, imágenes, videos, audios, PDFs y storage), `SPEC-10` (el bot consulta `bot_master_prompt`, combos, atributos y precios), `SPEC-11` (pedidos descuentan stock y disparan verificación de umbral mínimo), `SPEC-14` (plantilla de email administrativo por alerta de stock mínimo), `SPEC-15` (clonación de productos líder → miembro conserva estructura) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

El análisis de `apps/admin/app/workspace/products/products-view.tsx`, `apps/admin/app/api/tenant/products/` y `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` muestra que el módulo de Productos actual es altamente incompleto frente a las necesidades operativas y del bot AI:

1. **CRUD parcial y sin lectura detallada ni inactivación (`PRD-03`):**
   - `apps/admin/app/api/tenant/products/[id]/route.ts` solo expone `PUT` y `DELETE`; falta `GET` completo para un modal **Ver** con ficha integral y multimedia asociada, no existe modal **Editar** completo en la UI, ni transición explícita para **Inactivar / Activar** un producto, y la multimedia por producto no soporta de forma integral **imágenes, videos, pistas de audio y documentos PDF** validados por cuota.
2. **Prompt maestro de producto sin estructura ni tamaño adecuado (`PRD-04`):**
   - `cell_products` tiene una columna simple `prompt`, pero no se edita cómodamente en la UI ni cuenta con guía estructurada ni especificación explícita de tipo `TEXT` amplio para prompts detallados de venta automatizada ni asistencia «Mejorar con AI» real.
3. **Atributos dinámicos no administrables en UI (`PRD-05`):**
   - Aunque `cell_products.attributes` existe como `JSONB`, la interfaz no ofrece un editor de atributos dinámicos (tallas, colores, sabores, pesos, variaciones con o sin impacto visual).
4. **Sin soporte de productos simples vs. compuestos / combos (`PRD-06`):**
   - No existe modelado de composición (`simple` vs `combo`) ni relación entre un combo y los productos simples que lo integran, su cantidad ni cálculo referencial de costo/precio.
5. **Sin selección de foto principal / cover (`PRD-07`):**
   - `cell_product_media` únicamente cuenta con `sort_order`; el usuario no puede marcar ni cambiar explícitamente qué imagen es la **portada / miniatura principal (`is_cover`)** mostrada en listados y catálogos.
6. **Sin control de inventario ni alerta de stock mínimo en productos físicos (`PRD-08`):**
   - `cell_products` carece de `stock_quantity`, `min_stock_threshold` y `last_low_stock_alert_at`, por lo cual no es posible gestionar existencias físicas ni emitir correo de alerta al alcanzar el mínimo.

---

## 4. Objetivo y valor de negocio

Entregar un **gestor completo de Catálogo de Productos** que habilite:
- Ciclo **Ver / Crear / Editar / Inactivar-Activar / Eliminar** con tabla paginada, filtrable y ordenable.
- Gestión multimedia integral (**imágenes, videos, audios y PDFs**) con selección explícita de **foto principal (cover)** dentro de las cuotas reales del plan (`SPEC-03`) sobre SeaweedFS + imgproxy (`SPEC-00`).
- **Prompt maestro por producto (`TEXT` amplio hasta 32,000 caracteres)** siguiendo mejores prácticas de ingeniería de prompts y asistido con «Mejorar con AI».
- **Atributos dinámicos** por producto (ej. Talla, Color, Sabor), **productos simples y combos**, y **control de stock vigente / stock mínimo** para productos físicos con notificación automática por email (`SPEC-14`).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión del esquema en `pg-cell-XX` (`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`):
  - En `cell_products`: `cost_price_cents`, `composition_type` (`'simple' | 'combo'`), `bot_master_prompt` (`TEXT` amplio), `stock_quantity` (`INTEGER` nullable), `min_stock_threshold` (`INTEGER` nullable), `low_stock_alert_sent_at` (`TIMESTAMPTZ` nullable), y soporte claro del estado `'inactive'` (o `'published' | 'inactive' | 'draft'` migrado desde `'archived'`).
  - Nueva tabla `cell_product_bundle_items` (relación combo → productos componentes + cantidad + orden).
  - En `cell_product_media`: columna `is_cover` (`BOOLEAN` `NOT NULL`, default `false`) + índice único parcial que garantice máximo 1 imagen cover activa por producto.
- Servicios en `packages/domain/src/services/tenant-products-and-media.service.ts` para CRUD completo, validación estricta por cuota de cada tipo de medio (`image`, `video`, `audio`, `pdf`) y storage total, gestión de combos sin ciclos recursivos, cálculo de utilidad (`calculateProductProfitability` de `SPEC-06`), cambio de cover atómico, inactivación con modal `--dsn-*` y evaluador de alerta de stock mínimo.
- API completa en `apps/admin/app/api/tenant/products/`:
  - `GET / POST /api/tenant/products`
  - `GET / PUT / PATCH / DELETE /api/tenant/products/[id]`
  - `PATCH /api/tenant/products/[id]/status` (activar / inactivar)
  - `POST /api/tenant/products/[id]/media/[mediaId]/cover` (definir miniatura principal) y `DELETE /api/tenant/products/[id]/media/[mediaId]`
- Rediseño completo de `apps/admin/app/workspace/products/products-view.tsx`:
  - Tabla con búsqueda, filtro por tipo/composición/estado, ordenamiento, paginación y badge visual de stock bajo.
  - Modal/Drawer **Ver Producto** (toda la ficha: precios, utilidad, atributos, componentes de combo, galería de imágenes/video/audio/PDF reproducibles y preview del prompt maestro).
  - Modal/Formulario **Crear / Editar Producto** organizado en pestañas/bloques claros Mobile First.
  - Modales de confirmación `--dsn-*` para **Inactivar / Activar** y **Eliminar** producto (prohibido `window.confirm`).
- Disparo del evento de notificación de **Stock Mínimo Alcanzado** al crear/editar stock o al confirmar/descontar pedidos (`SPEC-11`), conectado al catálogo de plantillas configurables en `/admin/settings/notifications` (`SPEC-14`).

### Fuera de alcance
- Definición o edición visual de la plantilla de correo de stock mínimo en administración SaaS (pertenece a `SPEC-14`).
- Lógica de clonación de catálogo entre líder y miembros de comunidad (pertenece a `SPEC-15`).
- Manejo avanzado de inventario multi-bodega o kardex por lotes/vencimientos (fase futura).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Ver, crear, editar, inactivar, eliminar productos, gestionar multimedia, atributos, combos, stock y `bot_master_prompt` | Sí | Solo en su `client_id` y dentro de cuotas del plan |
| `tenancy_users` (`tenant_agent`) | Ver fichas completas, crear/editar productos y stock si el comercio habilita permiso de catálogo | Sí | Según política del comercio; bloqueado en borrado permanente si se restringe |
| `tenancy_users` (`tenant_agent`) | Eliminar productos permanentemente | Condicionado | Permitido solo con confirmación modal `--dsn-*` o restricción configurable al owner según `TENANT_RBAC` (`SPEC-12`) |

---

## 7. Modelo de datos

### 7.1 Actualización de `cell_products` (`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`)
- `cost_price_cents`: `BIGINT` `NOT NULL`, default `0`. Precio de costo unitario para cálculo de utilidad (`SPEC-06`).
- `price_cents`: `BIGINT` `NOT NULL` (`> 0`). Precio de venta al público.
- `sale_price_cents`: `BIGINT` nullable (precio promocional opcional `< price_cents`).
- `kind`: `VARCHAR(24)` (`'physical' | 'digital' | 'service'`).
- `composition_type`: `VARCHAR(16)` (`'simple' | 'combo'`), `NOT NULL`, default `'simple'`.
- `status`: `VARCHAR(24)` (`'active' | 'inactive' | 'draft'`), `NOT NULL`, default `'active'` *(manteniendo mapeo limpio de `'published'` → `'active'` y `'archived'` → `'inactive'`)*.
- `bot_master_prompt`: **`TEXT`** `NOT NULL`, default `''` (tipo PostgreSQL `TEXT` de gran capacidad sin truncado de 255/1000 chars; validación de aplicación `<= 32,000` caracteres).
- `attributes`: `JSONB` `Array<{ name: string; values: string[]; requiredForOrder?: boolean }>`, default `[]`.
- `stock_quantity`: `INTEGER` nullable (`>= 0`, obligatorio solo cuando `kind === 'physical'` y `composition_type === 'simple'`; para combos puede ser calculado del stock de sus componentes o definido explícitamente).
- `min_stock_threshold`: `INTEGER` nullable (`>= 0`, aplicable solo cuando `kind === 'physical'`).
- `low_stock_alert_sent_at`: `TIMESTAMPTZ` nullable (para evitar spam de alertas repetidas mientras siga bajo el mínimo sin reabastecerse).
- `deleted_at`: `TIMESTAMPTZ` nullable (**eliminación lógica** cuando existen pedidos históricos o referencias de combos/clonación; limpieza física permitida en borradores sin historial).

### 7.2 Nueva tabla `cell_product_bundle_items` (en `pg-cell-XX`)
- `id`: `UUID` PK.
- `client_id`: `UUID` `NOT NULL`, indexado con RLS `app.current_client_id`.
- `bundle_product_id`: `UUID` FK → `cell_products.id` (`ON DELETE CASCADE`).
- `component_product_id`: `UUID` FK → `cell_products.id` (`ON DELETE RESTRICT` — impide borrar un producto simple si forma parte activa de un combo).
- `quantity`: `INTEGER` `NOT NULL` (`> 0`).
- `sort_order`: `INTEGER` `NOT NULL`, default `0`.
- `UNIQUE (bundle_product_id, component_product_id)`.

### 7.3 Actualización de `cell_product_media`
- `media_kind`: `'image' | 'video' | 'audio' | 'pdf'`.
- `is_cover`: `BOOLEAN` `NOT NULL`, default `false`.
- Índice único parcial por producto: máximo una fila con `is_cover = true` por `product_id` (`CREATE UNIQUE INDEX ... WHERE is_cover = true`).
- Restricción lógica: solo filas con `media_kind = 'image'` pueden tener `is_cover = true`.

---

## 8. Reglas de negocio

- **RN-SPEC-08-01 (Cuotas estrictas por tipo de archivo y almacenamiento total):** Al adjuntar un archivo a un producto, el sistema valida mediante `SPEC-03` que: (a) el cupo del tipo específico (`images_per_product`, `videos_per_product`, **`audios_per_product`**, `pdfs_per_product`) sea `> 0` y no haya alcanzado el límite para ese producto; y (b) el peso sumado al consumo actual en `cell_client_usage.storage_used_bytes` no supere `storage_bytes` del plan.
- **RN-SPEC-08-02 (Foto principal `is_cover` única e invariante de imagen):** Todo producto con al menos una imagen tiene exactamente una imagen marcada con `is_cover = true`. Si se sube la primera imagen y no hay portada, se marca automáticamente como `is_cover = true`. Videos, audios y PDFs nunca pueden marcarse como `is_cover`. Si se elimina la imagen portada actual, el sistema promueve automáticamente la siguiente imagen disponible por `sort_order`.
- **RN-SPEC-08-03 (Prompt maestro estructurado de gran tamaño para el Bot `PRD-04`):** El atributo `bot_master_prompt` se almacena como `TEXT` sin límite corto, admitiendo hasta `32,000` caracteres en validación Zod. La UI proporciona guía estructurada recomendada (Qué resuelve el producto / Beneficios clave / Público objetivo / Objeciones frecuentes y respuestas / Políticas aplicables / Llamado al cierre) más botón «Mejorar Con AI» real (`SPEC-02`, campo `product.bot_master_prompt`) sin autoguardado silencioso.
- **RN-SPEC-08-04 (Atributos dinámicos normalizados `PRD-05`):** Cada producto puede definir múltiples grupos de atributos dinámicos (ej. `Color`: `["Negro", "Blanco"]`, `Talla`: `["S", "M", "L"]`). Se validan nombres no vacíos sin duplicados por producto y valores no vacíos (máximo 20 atributos por producto, 50 valores por atributo) para que tanto la tienda web como el bot AI y los pedidos (`SPEC-11`) puedan exigir o capturar la variante exacta.
- **RN-SPEC-08-05 (Combos / productos compuestos sin ciclos `PRD-06`):** Un producto con `composition_type = 'combo'` debe incluir al menos 1 producto componente (`composition_type = 'simple'` del mismo `client_id`) con cantidad `>= 1`. Queda prohibido agregar el mismo combo dentro de sí mismo o incluir otro combo como hijo (sin anidamiento cíclico) y prohibido eliminar físicamente un producto simple mientras pertenezca a un combo activo (`409 PRODUCT_USED_IN_COMBO`).
- **RN-SPEC-08-06 (Stock y alerta de umbral mínimo exclusiva de productos físicos `PRD-08`):** Los campos `stock_quantity` y `min_stock_threshold` aplican y se validan únicamente cuando `kind === 'physical'` (para `'digital'` o `'service'` permanecen `null` y ocultos en UI). Cuando en un producto físico activo `stock_quantity <= min_stock_threshold` y `low_stock_alert_sent_at IS NULL`, el sistema emite el evento de notificación por email `inventory.low_stock` (`SPEC-14`) al correo comercial/de alertas del comercio y marca `low_stock_alert_sent_at = NOW()`. Al reponer stock por encima del mínimo (`stock_quantity > min_stock_threshold`), `low_stock_alert_sent_at` se restablece a `null` para rearmar futuras alertas.
- **RN-SPEC-08-07 (Estado Inactivo vs Eliminación `PRD-03`):** Un producto marcado como `inactive` deja de ser ofrecido por el bot AI y de mostrarse en catálogo público, pero conserva íntegros sus pedidos históricos, multimedia y métricas; puede reactivarse en cualquier momento. Su cambio de estado o eliminación se confirma siempre con modal accesible `--dsn-*`.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/products` y `POST /api/tenant/products`
- `GET`: Soporta filtros `?q=...&status=active|inactive|draft&kind=physical|digital|service&compositionType=simple|combo&lowStock=true&page=1&limit=20&sort=...`. Retorna paginación + resumen `coverImageUrl` vía imgproxy (`SPEC-00`) + conteo de medios por tipo.
- `POST`: Valida cuota total de productos (`SPEC-03`), utilidad (`costPriceCents` vs `priceCents`), atributos dinámicos, `botMasterPrompt` (`<= 32,000` chars), items de combo si `compositionType = 'combo'` y stock si `kind = 'physical'`.

### 9.2 `GET / PUT / DELETE /api/tenant/products/[id]` [Extensión con `GET` completo]
- `GET`: Retorna ficha completa del producto, todos sus archivos multimedia agrupados (`images`, `videos`, `audios`, `pdfs`) con `isCover` y URLs firmadas/imgproxy, sus componentes de combo (si aplica) con precios e imágenes, e historial básico de disponibilidad.
- `PUT`: Actualiza atributos completos validando transición de simple ↔ combo, cuotas y regla de stock mínimo (disparando alerta `after()` si corresponde).
- `DELETE`: Si está en un combo activo retorna `409 PRODUCT_USED_IN_COMBO`; si tiene pedidos asociados aplica eliminación lógica (`deleted_at = NOW()`) liberando cupo activo en `products.used` y conservando trazabilidad de órdenes.

### 9.3 `PATCH /api/tenant/products/[id]/status` [Nuevo]
- Request: `{ status: "active" | "inactive" | "draft" }`.

### 9.4 `POST /api/tenant/products/[id]/media/[mediaId]/cover` y `DELETE /api/tenant/products/[id]/media/[mediaId]` [Nuevos]
- `POST .../cover`: Transacción que desmarca el cover anterior y fija `is_cover = true` en `mediaId` (solo si `media_kind === 'image'`).
- `DELETE .../media/[mediaId]`: Remueve registro, descuenta `file_size_bytes` de `cell_client_usage` e invoca limpieza en SeaweedFS (`SPEC-00`); si era cover, promueve otra imagen existente.

---

## 10. Especificación de UI/UX

- **Vista Principal `/workspace/products`:**
  - Subtítulo limpio para el comercio (`SPEC-01`, sin mencionar tecnologías) + `<CatalogQuotaBanner />` (`SPEC-03`).
  - Tabla paginada, ordenable y filtrable (con vista tarjeta adaptada Mobile First en `< 768px`) mostrando: miniatura (`is_cover`), SKU/Nombre, Tipo (`Físico`/`Digital`/`Servicio` + badge `Combo` si aplica), Costo / Venta / Utilidad, Stock (con badge rojo/ámbar «Stock Bajo» si `<= mínimo`), Resumen multimedia (`Img/Vid/Aud/PDF`), Estado (`Activo` / `Inactivo` / `Borrador`) y acciones: **Ver**, **Editar**, **Inactivar/Activar**, **Eliminar**.
- **Modal «Ver Producto»:** Muestra toda la ficha, cálculo de rentabilidad, badges de atributos dinámicos, lista de productos si es Combo, reproductor nativo de imagen/video/audio y link a PDF, y bloque colapsable con el Prompt Maestro completo.
- **Formulario «Crear / Editar Producto» (Modal ancho o página/drawer Mobile First por pestañas):**
  1. **Información Y Precios:** Nombre, SKU, Categoría, Tipo (`Físico`, `Digital`, `Servicio`), Composición (`Simple`, `Combo`), Precio De Costo, Precio De Venta, Precio Oferta opcional, indicador vivo de Utilidad ($ y %), Descripción corta con `<AiEnhanceTextarea fieldKey="product.description" />`.
  2. **Stock (solo si Tipo = Físico):** Stock Actual, Umbral De Stock Mínimo (con texto explicativo sobre alerta automática por email).
  3. **Atributos Dinámicos Y Combo:** Constructor visual de atributos (ej. añadir grupo `Talla` + chips `S`, `M`, `L`) y, si es `Combo`, buscador para agregar productos simples con selector de cantidad y comparador de precio del combo vs suma individual.
  4. **Multimedia Del Producto:** Zonas diferenciadas por tipo (Imágenes, Videos, Audios, PDFs) mostrando cupo usado/máximo según el plan (`SPEC-03`); en cada imagen subida, botón visible **«Definir Como Portada» / badge «Foto Principal»**.
  5. **Prompt Maestro Del Asistente AI:** Editor `textarea` amplio (con contador hasta 32,000 caracteres), plantilla guía colapsable de mejores prácticas y `<AiEnhanceTextarea fieldKey="product.bot_master_prompt" />`.
- Todos los labels en **Title Case**, idioma `es`/`en`, y confirmaciones de inactivación/eliminación con modal `--dsn-*`.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: CRUD completo de productos, multimedia con cover, atributos, combos y stock

  Escenario: Propietario crea producto físico con atributos, audios, foto principal, prompt maestro largo y stock
    Dado que el plan del comercio permite 10 imágenes, 2 audios, 1 video y 2 PDFs por producto
    Cuando crea el producto físico "Café De Origen 500g" con costo "$22.000", venta "$45.000", stock vigente "25", stock mínimo "5"
    Y añade el atributo dinámico "Molienda" con valores "Grano, Espresso, Prensa"
    Y redacta un prompt maestro de 3.500 caracteres mejorado con AI real
    Y sube 2 imágenes y 1 audio MP3 marcando la segunda imagen como foto principal (cover)
    Entonces el backend guarda el producto, sus atributos y medios en SeaweedFS
    Y el modal Ver muestra exactamente las 2 imágenes con la segunda como portada, el reproductor de audio, los atributos y el prompt completo

  Escenario: Creación de producto compuesto (combo) a partir de dos productos simples
    Dado que existen los productos simples "Cafetera V60" y "Café 500g"
    Cuando el comercio crea el producto "Kit Barista Inicial" con composition_type "combo" agregando 1 unidad de "Cafetera V60" y 2 unidades de "Café 500g"
    Entonces el sistema persiste las filas en "cell_product_bundle_items"
    Y al abrir el modal Ver del combo muestra ambos componentes con sus cantidades respectivas

  Escenario: Envío único de alerta por email al alcanzar stock mínimo en producto físico
    Dado que el producto físico "Camiseta Negra" tiene stock actual "6" y umbral mínimo "5"
    Cuando un pedido confirmado o edición manual reduce el stock vigente a "5"
    Entonces el sistema dispara una notificación por correo al comercio mediante el evento de stock mínimo
    Y establece "low_stock_alert_sent_at" para no reenviar correos repetidos si baja a "4" antes de reponer stock
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de marca de foto principal sobre un archivo PDF o audio
    Dado que un producto tiene adjunto un documento PDF "ficha.pdf"
    Cuando el cliente invoca POST "/api/tenant/products/[id]/media/[mediaId]/cover" sobre el ID del PDF
    Entonces el backend responde HTTP 400 o 422 indicando que únicamente archivos de imagen pueden definirse como portada
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo de eliminación de producto simple que pertenece a un combo activo
    Dado que el producto "Café 500g" forma parte del combo activo "Kit Barista Inicial"
    Cuando el usuario confirma eliminar "Café 500g"
    Entonces el servidor retorna HTTP 409 "PRODUCT_USED_IN_COMBO" indicando el combo dependiente y recomendando inactivar o desvincular primero

  Escenario: Bloqueo de intento de incluir un combo dentro de otro combo
    Dado que el producto B es de tipo "combo"
    Cuando el comercio intenta agregar el producto B como componente de un combo C
    Entonces el backend rechaza la relación con HTTP 422 "NESTED_COMBO_NOT_ALLOWED"
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Aislamiento multi-tenant al consultar detalle o editar producto o componente de combo
    Dado que el producto P pertenece al comercio A en la celda
    Cuando el comercio B solicita GET "/api/tenant/products/P" o intenta agregar P como componente de un combo de B
    Entonces el servidor responde HTTP 404 / 403 impidiendo acceso o referencia cruzada
```

### (e) Escenarios de borde

```gherkin
  Escenario: Promoción automática de nueva portada si se elimina la imagen principal actual
    Dado que un producto tiene imagen A (cover = true) e imagen B (cover = false, sort_order = 2)
    Cuando el usuario elimina la imagen A
    Entonces el sistema borra la imagen A en BD y SeaweedFS y promueve automáticamente la imagen B a "is_cover = true"
```

---

## 12. Requisitos no funcionales

- **Rendimiento:** Paginación obligatoria en listados (`limit <= 50`); las URLs de miniaturas usan presets optimizados de imgproxy (`w:240,h:240,fit`) evitando descargar archivos originales de megabytes en el catálogo.
- **Almacenamiento seguro:** El prompt maestro admite hasta `32,000` caracteres (`TEXT`); índice GIN opcional sobre `cell_products` solo si se requiere búsqueda avanzada manteniendo tamaño compacto de fila en listados.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino JSON `tenant.product.created`, `tenant.product.status_changed`, `tenant.product.low_stock_triggered` con `requestId`, `clientId`, `productId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (SeaweedFS/imgproxy), `SPEC-02` (AI enhance), `SPEC-03` (cuota `audios_per_product` y `countProductMediaByKind` corregido), `SPEC-14` (plantilla de email de alerta de stock).
- **Riesgos:**
  - *Descuadre contable de `storage_used_bytes` si falla subida tras insertar fila:* Mitigado actualizando cuotas dentro del flujo transaccional de confirmación de subida (`SPEC-00`) y ofreciendo botón administrativo de recálculo si se requiere.

---

## 14. Definition of Done

- [ ] Esquema `cell_products`, `cell_product_bundle_items` y `cell_product_media.is_cover` migrados con RLS y comentarios SQL.
- [ ] `GET`/`PUT`/`PATCH status`/`DELETE` + endpoints de `cover` y `media` implementados en `/api/tenant/products*` con Zod, `handle()` RFC 9457 y pruebas de aislamiento.
- [ ] UI `/workspace/products` completa: tabla paginada, Modal Ver, Modal Crear/Editar multimodal + cover + atributos dinámicos + combos + stock físico + prompt maestro 32k chars con AI real, e inactivación/eliminación con modales `--dsn-*`.
- [ ] Alerta automática por stock mínimo probada de extremo a extremo.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todas las aclaraciones solicitadas (`audios_per_product` en `PRD-03`, tipo `TEXT` de gran capacidad y estructura de mejores prácticas en `PRD-04`, foto principal `PRD-07`, combos `PRD-06` y alerta de stock físico `PRD-08`) quedaron cerradas.

