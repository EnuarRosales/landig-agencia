# SPEC-18 · Central de Promociones y Descuentos Comerciales Automáticos

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-18` |
| **Nombre** | Central de Promociones y Descuentos Comerciales Automáticos (`/workspace/promotions`) |
| **Tipo de intervención** | Nueva funcionalidad de negocio + Evolución del motor de precios de catálogo, Bot AI y pedidos |
| **Prioridad** | P1 — Alta (reemplaza el atributo estático de precio promocional por un motor completo de campañas) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación (`D-01` a `D-04` cerradas en `/grill-me`) |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Origen** | Verificación funcional de `SPEC-08` (evolución de «Precio Promocional (Opcional)» hacia una zona dedicada de promociones) |
| **Specs previas relacionadas** | `SPEC-08` (Catálogo, combos, costos y stock), `BOT-002` / `SPEC-10` (Motor de atención y prompts dinámicos), `ORD-001` / `SPEC-11` (Pedidos y fulfillment), `SPEC-17` (Tablas, i18n y guardado), `DSN-001` (Sistema de diseño y tokens `--dsn-*`) |
| **Directivas vinculantes** | `.agents/AGENTS.md` (§4.4 TSDoc, §4.5 PostgreSQL/Drizzle, §4.6 i18n `es`/`en`, §4.7 Asistencia AI, §4.8 Title Case y Mobile First, §4.13 Logging, §4.14 Problem Details RFC 9457, §4.15 Cero códigos de spec en UI, §4.17 Modales de confirmación, §4.19 Layout perimetral ~1 cm y botones canónicos) |

---

## 3. Problema y Benchmark del Sector (Shopify · Mercado Libre · PrestaShop)

### 3.1 Limitación del atributo estático en el producto
Modelar una promoción como un simple campo numérico estático (`sale_price_cents`) dentro del formulario individual de cada producto genera cuatro problemas operativos reales para el comercio:
1. **Sin vigencia temporal explícita:** El comerciante olvida desactivar manualmente el precio rebajado al terminar un fin de semana o campaña, erosionando su margen indefinidamente.
2. **Fricción masiva por categoría o temporada:** Para aplicar un `15% OFF` en toda la categoría «Calzado» o durante una campaña de aniversario, el operador tendría que editar producto por producto manualmente y luego revertirlos uno por uno.
3. **Sin control de cupo promocional:** No permite limitar una oferta relámpago a las primeras `N` unidades vendidas sin agotar la totalidad del stock físico.
4. **Ceguera conversacional del Bot AI:** Sin fechas de inicio/fin ni nombre de campaña, el asistente autónomo no puede comunicar sentido de urgencia real (*«Aprovecha el 20% de descuento válido hasta el domingo a las 11:59 p.m. o hasta agotar las 15 unidades en oferta»*).

### 3.2 Síntesis de mejores prácticas de la industria

| Plataforma | Mecanismo clave analizado | Qué adoptamos en Mocter (`SPEC-18`) | Qué simplificamos para conservar agilidad SaaS |
| --- | --- | --- | --- |
| **Shopify** (*Automatic Discounts*) | Descuentos automáticos aplicados sin código en catálogo y checkout; segmentación por colecciones/categorías o productos específicos; programación con fecha/hora de inicio y fin. | Promociones 100% automáticas sin fricción de cupones; alcance por **Producto/Combo exacto**, **Categoría** o **Todo el Catálogo**; programación explícita `starts_at` y `ends_at`. | Un solo flujo unificado sin separar motores complejos de carrito vs. scripts de checkout. |
| **PrestaShop** (*Catalog Price Rules*) | Reglas de precio aplicadas directamente sobre el catálogo antes del carrito; cálculo automático de precio tachado y `%` de ahorro; jerarquía de especificidad y exclusión de acumulación. | Resolución en lectura del catálogo con precio base tachado, precio promocional efectivo y `% OFF`; **no acumulación entre campañas** ganando la regla más específica (`Producto > Categoría > Catálogo`). | Evitamos matrices combinatorias por grupo de cliente/país/moneda múltiple que complejizan la operación diaria. |
| **Mercado Libre** (*Central de Promociones*) | Hub dedicado con métricas de campañas activas/programadas, *Ofertas Relámpago* con ventana horaria explícita, **cupo máximo de unidades en oferta** y validación de precio real. | Vista dedicada **Central de Promociones** (`/workspace/promotions`), cupo opcional de unidades con descuento (`max_discounted_units`) y **Semáforo de Rentabilidad en Vivo** contra `cost_price_cents`. | Sin requisitos burocráticos de reputación; el comercio controla sus campañas con alertas preventivas de margen. |

---

## 4. Objetivo y Valor de Negocio

Dotar al Backoffice del Inquilino de una **Central de Promociones (`/workspace/promotions`)** conectada en tiempo real con el **Catálogo de Productos (`/workspace/products`)**, el **Motor de Atención AI (`BOT-002`)** y el **Módulo de Pedidos (`SPEC-11`)**, permitiendo:
1. Crear, programar, pausar, editar y finalizar promociones automáticas con referencias de tiempo explícitas (`starts_at`, `ends_at`).
2. Definir el alcance por **Todo el Catálogo**, **Por Categoría(s)** o **Por Producto(s) / Combo(s) Exactos**.
3. Configurar el beneficio como **Porcentaje de Descuento (`% OFF`)**, **Monto Fijo de Descuento** o **Precio Promocional Fijo** (para producto/combo puntual).
4. Proteger la utilidad del negocio mediante cálculo de rentabilidad en tiempo real contra `cost_price_cents` (`SPEC-08`) y límite opcional de unidades promocionales (`max_discounted_units`).
5. Visualizar indicadores directos de promoción activa en cada fila de `/workspace/products` y dotar al Bot AI de argumentos de cierre con vigencia explícita.

---

## 5. Alcance y Fuera de Alcance

### Dentro del alcance
- Retiro del input manual estático «Precio Promocional (Opcional)» del modal de creación/edición de producto (`SPEC-08`), delegando toda gestión de ofertas a la Central de Promociones.
- Esquema de base de datos celular (`packages/domain/src/db/schemas/tenant/promotions.ts`):
  - Tabla `admin.promotions` (cabecera de campaña, tipo de beneficio, alcance, vigencia `starts_at`/`ends_at`, estado, cupo de unidades y descripción comercial para el Bot AI).
  - Tabla `admin.promotion_targets` (vínculo con productos/combos específicos o nombres de categoría normalizados).
- Servicio de dominio `TenantPromotionsService` y motor determinístico de resolución de precio efectivo (`resolveEffectiveProductPromotion`).
- Endpoints REST en `apps/admin/app/api/tenant/promotions/*` protegidos por sesión de inquilino y envueltos en `handle()` (RFC 9457).
- Módulo de interfaz `/workspace/promotions` (enlace en el menú lateral de `TenantWorkspaceShell` justo debajo de «Productos y Catálogo») con tarjetas de métricas, listado filtrable/paginado Mobile First, modal de creación/edición con previsualización de margen y modales de confirmación `--dsn-*`.
- Indicadores directos en cada fila de `/workspace/products` (badge con nombre de campaña y `% OFF`, precio original tachado, vigencia restante y margen recalculado sobre el precio en oferta).
- Integración con el contexto del Bot AI (`BOT-002`) y con el registro de pedidos (`SPEC-11`) para aplicar el precio promocional vigente e incrementar `discounted_units_sold`.

### Fuera de alcance
- Códigos de cupón alfanuméricos manuales ingresados por el comprador (ej. `CUPON10`) o promociones `2x1 / Lleva X Paga Y` de estructura cruzada en carrito (previstos para una iteración futura si el comercio lo demanda).
- Promociones co-financiadas por el marketplace o multi-moneda dentro de un mismo comercio.

---

## 6. Actores y Permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenant_owner` | Listar, ver detalle, crear, editar, pausar/activar y eliminar promociones | Sí | Acceso completo al módulo `/workspace/promotions` |
| `tenant_agent` | Listar, ver detalle, crear, editar y pausar/activar promociones | Sí | Tiene bloqueado `DELETE` definitivo (`403 Forbidden` y botón oculto en UI, homólogo a `SPEC-08 D-06`) |

---

## 7. Modelo de Datos (`pg-cell-XX` · Esquema `admin`)

### 7.1 Tabla `admin.promotions`
| Columna | Tipo PostgreSQL | Restricciones | Comentario SQL obligatorio |
| --- | --- | --- | --- |
| `id` | `UUID` | `PK DEFAULT gen_random_uuid()` | Identificador único de la promoción comercial. |
| `client_id` | `UUID` | `NOT NULL` (RLS por `app.current_client_id`) | Identificador del inquilino propietario de la promoción. |
| `name` | `VARCHAR(140)` | `NOT NULL` | Nombre comercial de la campaña o promoción (ej. Oferta Fin de Semana). |
| `description` | `TEXT` | `NULL` | Argumento comercial o condiciones visibles para el asistente AI y el equipo. |
| `scope_type` | `VARCHAR(24)` | `NOT NULL CHECK (scope_type IN ('all_catalog', 'category', 'product'))` | Alcance de selección: todo el catálogo, por categorías o por productos/combos exactos. |
| `discount_type` | `VARCHAR(24)` | `NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed_price'))` | Tipo de beneficio: porcentaje, descuento fijo en moneda o precio final fijo. |
| `discount_value` | `INTEGER` | `NOT NULL CHECK (discount_value > 0)` | Valor del beneficio: puntos básicos/porcentaje (1-95) para `percentage`, o centavos (`> 0`) para `fixed_amount` / `fixed_price`. |
| `starts_at` | `TIMESTAMPTZ` | `NOT NULL` | Fecha y hora exacta de inicio de vigencia de la promoción. |
| `ends_at` | `TIMESTAMPTZ` | `NULL CHECK (ends_at IS NULL OR ends_at > starts_at)` | Fecha y hora exacta de finalización; NULL indica vigencia abierta hasta pausa manual. |
| `max_discounted_units` | `INTEGER` | `NULL CHECK (max_discounted_units IS NULL OR max_discounted_units > 0)` | Tope opcional de unidades totales que pueden venderse con esta promoción antes de agotarse. |
| `discounted_units_sold` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (discounted_units_sold >= 0)` | Acumulado de unidades vendidas bajo esta promoción en pedidos confirmados. |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Indicador administrativo para activar o pausar manualmente la promoción. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Marca temporal de creación del registro. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Marca temporal de última actualización del registro. |

### 7.2 Tabla `admin.promotion_targets`
| Columna | Tipo PostgreSQL | Restricciones | Comentario SQL obligatorio |
| --- | --- | --- | --- |
| `id` | `UUID` | `PK DEFAULT gen_random_uuid()` | Identificador único del objetivo vinculado a la promoción. |
| `client_id` | `UUID` | `NOT NULL` (RLS por `app.current_client_id`) | Identificador del inquilino propietario del vínculo. |
| `promotion_id` | `UUID` | `NOT NULL REFERENCES admin.promotions(id) ON DELETE CASCADE` | Promoción a la que pertenece este objetivo. |
| `target_type` | `VARCHAR(24)` | `NOT NULL CHECK (target_type IN ('product', 'category'))` | Tipo de objetivo: producto/combo puntual o categoría de catálogo. |
| `product_id` | `UUID` | `NULL REFERENCES admin.products(id) ON DELETE CASCADE` | Producto o combo objetivo cuando `target_type = 'product'`. |
| `category_name` | `VARCHAR(120)` | `NULL` | Nombre de la categoría objetivo cuando `target_type = 'category'`. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Marca temporal de creación del vínculo. |

**Índices obligatorios:**
- `idx_promotions_client_active_window` en `admin.promotions (client_id, is_active, starts_at, ends_at)`.
- `idx_promotion_targets_promotion` en `admin.promotion_targets (client_id, promotion_id)`.
- `idx_promotion_targets_product` en `admin.promotion_targets (client_id, product_id)` donde `product_id IS NOT NULL`.
- `idx_promotion_targets_category` en `admin.promotion_targets (client_id, lower(category_name))` donde `category_name IS NOT NULL`.

---

## 8. Reglas de Negocio

- **RN-SPEC-18-01 (Estado Derivado en Tiempo Real):** El estado operativo de una promoción se evalúa determinísticamente en función de `is_active`, `NOW()`, `starts_at`, `ends_at` y el cupo de unidades:
  - `paused`: `is_active = false`.
  - `depleted`: `is_active = true` y `max_discounted_units IS NOT NULL` y `discounted_units_sold >= max_discounted_units`.
  - `scheduled`: `is_active = true` y `NOW() < starts_at`.
  - `expired`: `is_active = true` y `ends_at IS NOT NULL` y `NOW() > ends_at`.
  - `active`: `is_active = true`, `NOW() >= starts_at`, `(ends_at IS NULL OR NOW() <= ends_at)` y `(max_discounted_units IS NULL OR discounted_units_sold < max_discounted_units)`.
- **RN-SPEC-18-02 (Prioridad sin Acumulación — Protección de Margen):** Las promociones **nunca se acumulan entre sí** sobre un mismo producto. Si un producto coincide con múltiples promociones en estado `active` simultáneamente:
  1. Gana la regla de **mayor especificidad**: `product` (Prioridad 1) > `category` (Prioridad 2) > `all_catalog` (Prioridad 3).
  2. Si existen dos promociones activas del mismo nivel de especificidad, gana la que otorgue el **mayor ahorro monetario al comprador** (menor `effectivePriceCents`).
  3. En caso de empate exacto en precio final, gana la de creación más reciente (`created_at DESC`).
- **RN-SPEC-18-03 (Restricción de `fixed_price`):** El tipo de descuento `fixed_price` (precio promocional fijo) solo es válido cuando `scope_type = 'product'`, y exige que el precio fijo sea estrictamente menor al `price_cents` regular de cada producto seleccionado. Para `category` y `all_catalog` se permiten `percentage` (`1%` a `95%`) y `fixed_amount`.
- **RN-SPEC-18-04 (Piso de Seguridad y Semáforo de Rentabilidad):** Ninguna promoción puede producir un `effectivePriceCents <= 0`. Al configurar una promoción en el modal, el sistema calcula en vivo para los productos alcanzados la utilidad neta proyectada (`effectivePriceCents - costPriceCents`) y el margen (`marginPct`), mostrando:
  - **Verde (`>= 20%`)**: Margen saludable.
  - **Ámbar (`0% a < 20%`)**: Margen estrecho.
  - **Rojo (`< 0%`, venta a pérdida)**: Alerta explícita de advertencia indicando cuántos productos quedarían por debajo del costo unitario de adquisición.
- **RN-SPEC-18-05 (Inyección en Bot AI `BOT-002`):** Cuando el motor de prompts construye el catálogo activo para responder en WhatsApp o webchat, cada producto con promoción `active` incluye: precio regular, precio promocional vigente, porcentaje/monto de ahorro, nombre de la campaña, fecha/hora límite (`ends_at` formateada en la zona horaria del comercio) y unidades restantes en oferta (si `max_discounted_units` está definido).

---

## 9. Contratos de Interfaz (API & UI)

### 9.1 Endpoints HTTP (`/api/tenant/promotions*`)
- `GET /api/tenant/promotions`: Lista paginada (`page`, `limit`, `status`, `scopeType`, `q`) + resumen de contadores (`activeCount`, `scheduledCount`, `pausedCount`, `expiredOrDepletedCount`).
- `POST /api/tenant/promotions`: Crea una promoción validando alcance, vigencias y objetivos (`productIds` o `categories`).
- `GET /api/tenant/promotions/[id]`: Retorna el detalle completo de la promoción junto con la lista de productos alcanzados y su simulación de precios/márgenes.
- `PUT /api/tenant/promotions/[id]`: Actualiza una promoción existente y reemplaza transaccionalmente sus objetivos en `admin.promotion_targets`.
- `PATCH /api/tenant/promotions/[id]/status`: Alterna `is_active` (`true` / `false`) previa confirmación en modal `--dsn-*`.
- `DELETE /api/tenant/promotions/[id]`: Exclusivo para `tenant_owner`; elimina la promoción previa confirmación en modal `--dsn-*`.

### 9.2 Navegación y Vistas en Backoffice (`apps/admin`)
1. **Menú Lateral (`TenantWorkspaceShell`):** Nuevo ítem `Promociones y Ofertas` (`/workspace/promotions`, icono `Tag` o `Percent`) ubicado inmediatamente debajo de `Productos y Catálogo`.
2. **Vista `/workspace/promotions`:**
   - Contenedor raíz con espaciado perimetral obligatorio `className="w-full space-y-6 p-4 md:px-8 md:py-6"` (`AGENTS.md §4.19`).
   - Cabecera con botones canónicos «Actualizar» (`bg-[var(--dsn-surface)]` + icono `text-[var(--dsn-accent)]`) y «Crear Nueva Promoción» (`bg-[var(--dsn-accent)] text-white`).
   - 4 tarjetas KPI: *Promociones Activas*, *Programadas*, *Productos en Oferta Hoy* y *Pausadas / Finalizadas*.
   - Tabla/tarjetas Mobile First con filtros por estado (`Activa`, `Programada`, `Pausada`, `Finalizada`, `Cupo Agotado`), alcance y búsqueda por nombre.
   - Modal de creación/edición con asistencia AI (`AiEnhanceTextarea`) para el argumento comercial de la campaña y previsualización en vivo del impacto en margen de los productos seleccionados.
3. **Indicadores directos en `/workspace/products`:**
   - En cada fila de producto (y tarjeta móvil) alcanzado por una promoción `active`, la columna **Precio y Margen** muestra el precio promocional vigente, el precio regular tachado, un badge esmeralda con el `% OFF` y el nombre de la campaña activa, y el margen recalculado sobre el precio promocional.

---

## 10. Criterios de Aceptación (Gherkin)

```gherkin
Característica: Central de Promociones y Descuentos Comerciales Automáticos (SPEC-18)

  Escenario: Creación de promoción por categoría con vigencia explícita e impacto automático en catálogo
    Dado que el comercio tiene 3 productos activos en la categoría "Hidrolavadoras"
    Cuando el propietario crea la promoción "Semana del Hogar" con alcance "category" ("Hidrolavadoras"), descuento "15%" e inicio hoy y fin en 5 días
    Entonces el modal se cierra automáticamente al guardar y la promoción aparece como "Activa" en "/workspace/promotions"
    Y en "/workspace/products" los 3 productos de "Hidrolavadoras" muestran el precio con 15% de descuento, el precio base tachado, el badge "-15% · Semana del Hogar" y el margen recalculado

  Escenario: Resolución sin acumulación por especificidad (Producto Exacto gana sobre Categoría)
    Dado que la categoría "Hidrolavadoras" tiene una promoción activa del 10%
    Y el producto "Hidrolavadora Vapor Pro" (que pertenece a "Hidrolavadoras") tiene además una promoción activa por producto exacto del 25%
    Cuando se consulta el catálogo o el Bot AI cotiza "Hidrolavadora Vapor Pro"
    Entonces el sistema aplica únicamente el 25% de la promoción por producto exacto sin sumar ambos descuentos

  Escenario: Finalización automática por agotamiento de cupo de unidades promocionales
    Dado que una Oferta Relámpago tiene "max_discounted_units = 10" y "discounted_units_sold = 9"
    Cuando se confirma un pedido que incluye 1 unidad del producto bajo esa promoción
    Entonces "discounted_units_sold" pasa a 10, el estado derivado de la promoción cambia a "Cupo Agotado" ("depleted")
    Y el producto vuelve inmediatamente a su precio de venta regular en el catálogo y en el Bot AI
```

---

## 11. Decisiones de Diseño Aprobadas (`/grill-me`)

| ID | Decisión | Justificación |
| --- | --- | --- |
| `D-01` | Numerar la especificación como `SPEC-18` (dado que `SPEC-17` corresponde a Gobernanza Transversal UI/UX) y retirar de inmediato el campo estático «Precio Promocional (Opcional)» del formulario de creación/edición de producto (`SPEC-08`), conservando `sale_price_cents` en BD por compatibilidad. | Evita colisión documental con `SPEC-17` y elimina la ambigüedad de precios rebajados estáticos sin fecha de expiración. |
| `D-02` | Ubicar la gestión en un módulo propio del menú lateral (`/workspace/promotions` · «Promociones y Ofertas») justo debajo de «Productos y Catálogo», complementado con indicadores directos en cada fila de producto en `/workspace/products`. | Otorga jerarquía de primera clase a las campañas comerciales (estilo *Central de Promociones* de Mercado Libre) manteniendo visibilidad directa en el inventario. |
| `D-03` | Enfocarse 100% en **Promociones Automáticas de Catálogo y Tiempo** (alcance por Producto/Combo exacto, Categoría o Todo el Catálogo; descuento en `%`, monto fijo o precio final fijo; vigencia `starts_at`/`ends_at`, cupo opcional de unidades en oferta y semáforo de margen contra costo), sin códigos de cupón manuales en esta fase. | Maximiza la conversión sin fricción tanto en catálogo como en ventas asistidas por el Bot AI en WhatsApp. |
| `D-04` | Regla de prioridad sin acumulación entre campañas: gana la regla más específica (`Producto/Combo Exacto > Categoría > Todo el Catálogo`) y, a igual especificidad, el mayor descuento monetario; inyectando automáticamente la oferta activa y su fecha límite en el contexto del Bot AI (`BOT-002`). | Protege la rentabilidad del comercio frente a descuentos superpuestos y convierte la vigencia temporal en un argumento real de cierre para el asistente AI. |
