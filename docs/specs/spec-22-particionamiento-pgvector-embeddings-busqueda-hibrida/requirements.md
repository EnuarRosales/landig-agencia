# SPEC-22 · Particionamiento Físico `pgvector` en Celda, Pipeline Automático de Embeddings y Motor de Búsqueda Híbrida (RRF) con Hidratación Determinista

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-22` |
| **Nombre** | Particionamiento Físico `PARTITION BY LIST (client_id)` para Tablas Vectoriales en Celda, Pipeline de Vectorización Canónica `halfvec(1536)` y Motor de Búsqueda Híbrida (Semántica HNSW + Léxica FTS) con Hidratación Determinista en Tiempo Real |
| **Tipo de intervención** | Evolución de arquitectura de datos celular (`pg-cell-XX`), indexación vectorial HNSW por inquilino y servicio de dominio RAG/Catálogo para el ecosistema `mocter-core` ↔ `mocter-engine` (Python / LangGraph) |
| **Prioridad** | P0 — Crítica (cimiento de persistencia, aislamiento físico vectorial y recuperación fiable para el Gateway REST/MCP y el agente conversacional `mocter-engine`) |
| **Versión** | 1.1.0 (Post Spec Review — todos los hallazgos técnicos cerrados sin ambigüedades) |
| **Estado** | Aprobada · Lista para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Specs previas relacionadas** | [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) (§6.1–§7.3 Particionamiento y HNSW `halfvec(1536)`), [ADM-001](../adm-001-mocter-admin/requirements.md) (RF-05.7 `vectorization_config`), [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md), [BOT-002](../bot-002-motor-atencion-prompts/requirements.md) (§5.1 Memoria RAG `contact_memories`), [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md), [SPEC-08](../spec-08-catalogo-productos-crud-multimedia-combos-stock/requirements.md), [SPEC-18](../spec-18-motor-promociones-descuentos-campanas/requirements.md), [SPEC-19](../spec-19-arquitectura-prompts-ideal-comercializacion-clasificador/requirements.md) |
| **Spec complementaria dependiente** | [SPEC-23](../spec-23-gateway-hibrido-rest-mcp-agente-langgraph/requirements.md) (Gateway Híbrido REST OpenAPI 3.1 + MCP Server y Entrega Multimedia para `mocter-engine`) |
| **Directivas aplicables** | `.agents/AGENTS.md` (§3 R-08/R-09 Inmutabilidad de migraciones, §4.2 Estándar Drizzle, §4.4 TSDoc en español, §4.5 PostgreSQL + Drizzle, §4.12 `@t3-oss/env-nextjs`, §4.13 Logging estructurado con `after()`, §4.14 Manejo funcional `Result`, §4.16 Compatibilidad Traefik/DNS y cero puertos hardcodeados, §4.18 Recompilación y Health Check) |

---

## 3. Diagnóstico del Estado Actual y Contexto de Infraestructura

### 3.1 Estado Verificado de la Celda (`packages/domain/drizzle-cell/`)
Tras auditar las migraciones versionadas en `packages/domain/drizzle-cell/` y los servicios en `packages/domain/src/`:

1. **Lo que ya existe en la celda:**
   - La extensión `pgvector` (`CREATE EXTENSION IF NOT EXISTS vector;`) está habilitada desde `0002_cell_phase2_tenancy_products_media.sql`.
   - Las tablas `admin.product_embeddings` y `admin.contact_memories` existen con llave primaria compuesta `(client_id, id)`, columna `embedding halfvec(1536)` y políticas `ENABLE + FORCE ROW LEVEL SECURITY` basadas en `NULLIF(current_setting('app.current_client_id', true), '')::uuid`.
   - `DrizzleCrmRepository` ya implementa `upsertContactProfile` (utilizando `ON CONFLICT (client_id, contact_id) WHERE kind = 'profile'`) y `appendContactEpisode`.
2. **Brechas verificadas que esta especificación resuelve:**
   - **Brecha 1 — Ausencia de particionamiento físico e índices HNSW:** En `0002_cell_phase2_tenancy_products_media.sql` y `0004_cell_phase3_crm_prospects.sql`, `admin.product_embeddings` y `admin.contact_memories` fueron creadas como **tablas ordinarias no particionadas** (`relkind = 'r'`), **sin índices `HNSW`** y sin las funciones `admin.create_client_embedding_partition`, `admin.create_client_memory_partition` ni `admin.create_client_partitions`.
   - **Brecha 2 — Roles de ejecución en celda:** `CellDatabasePoolManager` (`packages/domain/src/db/cell-client.ts`) y `CellMigrationService` conectan a la celda con el rol `mocter_app`, mientras que las migraciones celulares conceden permisos al rol de grupo `mocter_admin` y `mocter_migrator`. La migración de particionamiento debe garantizar permisos consistentes para ambos (`mocter_admin` y `mocter_app` cuando exista) y propiedad adecuada de las funciones.
   - **Brecha 3 — Ausencia de pipeline de embeddings de productos y campos semánticos sin exponer en CRUD:** `TenantProductsAndMediaService` no escribe en `admin.product_embeddings`, y su contrato `TenantProductInput` todavía no expone las columnas ya existentes en `admin.products`: `media_term`, `keywords` y `benefits` (dejando `media_term = null` en todos los productos nuevos).
   - **Brecha 4 — Riesgo de contaminación en `admin.ai_platform_keys`:** `AiCredentialResolverService.findActivePlatformTrialKeys()` no filtra hoy por `purpose`, por lo que almacenar una llave de embeddings dentro de `admin.ai_platform_keys` podría provocar que el bot conversacional intente usar un modelo de embeddings para chat.

### 3.2 Topología de Despliegue y Preparación para Escalado Horizontal (Docker → Kubernetes)
- **Topología actual:** `mocter-core`, `mocter-engine` (Python + LangGraph) y `mocter-chatwoot` operan en una **red interna privada de Docker** sin exposición de bases celulares al exterior (`R-10`). Cada celda (`pg-cell-01`) agrupa 50–100 inquilinos detrás de PgBouncer en modo `transaction`.
- **Evolución a múltiples celdas y Kubernetes:** Al habilitar una segunda o tercera celda (`pg-cell-02`, `pg-cell-03`) sobre Kubernetes + CloudNativePG (`DAT-001 §9.6`), el particionamiento físico por `LIST (client_id)` en `product_embeddings` y `contact_memories` permite:
  1. Mantener los índices HNSW acotados por inquilino en memoria sin interferencia entre comercios.
  2. Ejecutar migraciones de inquilinos entre celdas copiando o descartando particiones atómicamente (`DETACH PARTITION` / `DROP TABLE`).
  3. Garantizar que el servicio `CatalogHybridSearchService` sea **100 % stateless**, resolviendo siempre el destino físico vía `client_routing` del Control Plane.

---

## 4. Decisiones de Diseño (`/grill-me` + Spec Review)

### D-01 · Particionamiento Físico `PARTITION BY LIST (client_id)` en `product_embeddings` y `contact_memories` con Índices `UNIQUE` en Tabla Padre
- Respetando `R-09` de `.agents/AGENTS.md` (prohibido editar migraciones previas), se crea una nueva pareja de migraciones en `packages/domain/drizzle-cell/` (`0027` y `0028`) que convierte de forma idempotente y sin pérdida de datos `admin.product_embeddings` y `admin.contact_memories` en tablas padre particionadas (`relkind = 'p'`) mediante `PARTITION BY LIST (client_id)`.
- **Índices `UNIQUE` obligatorios en la tabla padre particionada (PostgreSQL 18):**
  - En `admin.product_embeddings`: `CREATE UNIQUE INDEX product_embeddings_chunk_unique ON admin.product_embeddings (client_id, product_id, chunk_index);`
  - En `admin.contact_memories`: `CREATE UNIQUE INDEX contact_memories_profile_unique ON admin.contact_memories (client_id, contact_id) WHERE kind = 'profile';` y `CREATE INDEX contact_memories_by_contact_idx ON admin.contact_memories (client_id, contact_id, kind);`
  - Dado que ambos índices incluyen la clave de partición (`client_id`), PostgreSQL 18 los propaga automáticamente a cada partición hija y permite que los `UPSERT` (`ON CONFLICT ... DO UPDATE`) de `DrizzleCrmRepository.upsertContactProfile` y `DrizzleTenantProductsRepository.upsertProductEmbedding` funcionen sin errores en todas las particiones.
- **Preservación de `admin.contacts` como tabla relacional no particionada:** Debido a las claves foráneas activas desde `admin.contact_addresses` y `admin.contact_ratings` (`0015_cell_phase7_crm_spec09.sql`) y a que `admin.contacts` no almacena vectores HNSW, `admin.contacts` permanece como tabla compartida con PK compuesta `(client_id, id)`, índices B-Tree liderados por `client_id` y `FORCE ROW LEVEL SECURITY`.

### D-02 · Aprovisionamiento de Particiones Sin Bloqueo en Camino Caliente (Enmienda Controlada a `DAT-001 §6.4`)
- Para evitar que `CREATE TABLE IF NOT EXISTS ... PARTITION OF` tome un `ACCESS EXCLUSIVE LOCK` sobre la tabla padre en cada escritura (bloqueando búsquedas concurrentes de otros inquilinos en la misma celda):
  1. **Momento primario de creación:** Las particiones físicas del inquilino (`product_embeddings_c_<hex>` y `contact_memories_c_<hex>`) se crean durante el **alta y reconciliación del inquilino** en la celda (`TenancyService` / `reconcileProvisionedTenantsInCells`) y durante el backfill de la migración `0027` para todos los `client_id` existentes.
  2. **Fast-Path sin lock en funciones PL/pgSQL:** Tanto `admin.create_client_embedding_partition(p_client_id uuid)` como `admin.create_client_memory_partition(p_client_id uuid)` ejecutan como primera instrucción `IF to_regclass(format('admin.%I', v_partition)) IS NOT NULL THEN RETURN; END IF;`. Esta lectura de catálogo **no toma ningún lock sobre la tabla padre**.
  3. **Serialización controlada solo cuando falta la partición:** Únicamente si `to_regclass(...) IS NULL`, la función adquiere `PERFORM pg_advisory_xact_lock(hashtext('mocter:partition:' || v_partition));`, vuelve a comprobar `to_regclass(...)` (double-check) y crea la partición, su política `FORCE ROW LEVEL SECURITY`, su índice `HNSW (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)` y sus índices GIN.
  4. **Seguridad de roles:** Las funciones se crean con `SECURITY DEFINER SET search_path = admin, public` y conceden `EXECUTE` a `mocter_migrator`, `mocter_admin` y (si existe en `pg_roles`) `mocter_app`, y otorgan `SELECT, INSERT, UPDATE, DELETE` sobre cada partición hija creada tanto a `mocter_admin` como a `mocter_app` (si existe).

### D-03 · Frontera Estricta entre Atributos Semánticos (No-Deterministas) y Datos Transaccionales (Deterministas)
1. **Atributos admitidos en el texto semántico (`composed_text` y `lexical_text`) de `admin.product_embeddings`:**
   - Solo campos reales existentes en `admin.products` y `admin.product_bundle_items`:
     - `name` (nombre comercial)
     - `category` y `brand` (categoría y marca)
     - `kind` (`physical`, `digital`, `service`) y `compositionType` (`simple`, `combo` + nombres de los productos componentes del combo)
     - `description` (descripción comercial y técnica)
     - `benefits` (`string[]`, beneficios clave)
     - `keywords` (`string[]`, palabras clave y sinónimos de búsqueda)
     - `mediaTerm` (`text`, término identificador multimedia normalizado)
     - `attributes` (`ProductDynamicAttribute[]`: nombres y opciones de variantes disponibles, p. ej. `"Color: Negro, Blanco | Talla: S, M, L"`)
   - *(Nota explícita: las tablas conceptuales `product_price_tiers` y `product_faqs` mencionadas en specs históricas como `BOT-002` NO existen en el esquema celular actual y quedan fuera de este alcance; no se referencian en código ni SQL de `SPEC-22`.)*
2. **Atributos estrictamente prohibidos en el vector (`RN-SPEC-22-01`):**
   - `price_cents`, `sale_price_cents`, `cost_price_cents`, promociones (`admin.promotions`) y descuentos.
   - `stock_quantity`, `min_stock_threshold` y `availability`.
   - `prompt` y `bot_master_prompt`.
3. **Normalización Léxica Insensible a Tildes (`lexical_text`) y Control `semantic_hash`:**
   - Cada fila en `admin.product_embeddings` persiste `composed_text` (texto original legible), `lexical_text` (normalización Unicode NFD en minúsculas sin diacríticos para que `"maquina"` coincida con `"máquina"` y `"camara"` con `"cámara"` en un índice GIN `to_tsvector('simple', lexical_text)` 100 % `IMMUTABLE`) y `semantic_hash` (SHA-256 de `composed_text`).
   - **Cero re-vectorización innecesaria:** Cuando se actualiza un producto o un pedido descuenta stock, si `semantic_hash` no cambió, el pipeline hace `No-Op` y no invoca la API de embeddings ni modifica el índice HNSW.
   - **Propagación a Combos padres (`M-01`):** Cuando cambia el `name` de un producto simple que pertenece a uno o más combos (`findActiveBundleParentsForComponent`), el servicio recalcula automáticamente `composed_text`, `lexical_text` y `semantic_hash` de esos combos padres.

### D-04 · Estandarización del Modelo Canónico de Embeddings (`1536d`) Aislado de `admin.ai_platform_keys`
- Para garantizar un único espacio vectorial `halfvec(1536)` en toda la celda (independiente del LLM de chat que cada comercio elija: Anthropic, DeepSeek, Google, OpenAI, OpenRouter) y evitar contaminar `admin.ai_platform_keys`:
  1. La credencial canónica de embeddings de plataforma se configura exclusivamente mediante variables de entorno validadas en `packages/domain/src/utils/env.ts` y `.env.example`:
     - `MOCTER_EMBEDDING_API_KEY` (opcional en dev/test; obligatoria en producción para activar vectorización)
     - `MOCTER_EMBEDDING_BASE_URL` (default `"https://api.openai.com/v1"`)
     - `MOCTER_EMBEDDING_MODEL` (default `"text-embedding-3-small"`)
     - `MOCTER_EMBEDDING_DIMENSIONS` (constante fija `1536` para coincidir con `halfvec(1536)`)
     - `MOCTER_EMBEDDING_TIMEOUT_MS` (default `5000`)
  2. Como salvaguarda adicional, `DrizzleAiCredentialResolverRepository.findActivePlatformTrialKeys()` en `packages/domain/src/services/ai-credential-resolver.service.ts` agregará filtro explícito excluyendo `purpose = 'embeddings'`.
  3. **Modo Fail-Soft Léxico (`RN-SPEC-22-04`):** Si `MOCTER_EMBEDDING_API_KEY` no está configurada o el proveedor de embeddings falla o agota el timeout de `5.000 ms`, el CRUD de productos **nunca falla**: persiste `composed_text`, `lexical_text` y `semantic_hash` con `embedding = NULL` para que la búsqueda híbrida degrade transparentemente al ranking léxico (GIN `tsvector` + SKU + nombre) y un proceso de reconciliación (`reindexTenantProductEmbeddings`) complete los vectores pendientes posteriormente.

### D-05 · Exposición de `mediaTerm`, `keywords` y `benefits` en `TenantProductInput` con Autogeneración de `mediaTerm`
- `TenantProductInput` en `TenantProductsAndMediaService` se amplía con campos opcionales retrocompatibles:
  - `mediaTerm?: string | null`
  - `keywords?: string[]`
  - `benefits?: string[]`
- Al crear un producto (o al editarlo si `mediaTerm` es `null`/vacío), si no se suministra `mediaTerm`, el dominio autogenera un slug canónico estable a partir de `name` (en minúsculas, sin tildes, espacios reemplazados por `_`, máx. 64 caracteres, p. ej. `"Hidrolavadora a Vapor"` → `"hidrolavadora_a_vapor"`), garantizando que el compilador de marcadores `[[MEDIA:termino:...]]` de `SPEC-19` / `SPEC-23` siempre disponga de un término válido.

### D-06 · Motor de Búsqueda Híbrida RRF (`k = 60`) + Hidratación Determinista en Tiempo Real
- `CatalogHybridSearchService.searchCatalogHybrid` ejecuta en la misma transacción de celda (`withTenantCellTransaction(clientId, ...)`):
  1. **Rama Semántica (HNSW en partición del inquilino):** Cuando `queryVector` está disponible, ejecuta `SET LOCAL hnsw.iterative_scan = relaxed_order; SET LOCAL hnsw.ef_search = 60;` y obtiene los Top 25 `product_id` por `embedding <=> queryVector::halfvec(1536)` con filtro `WHERE client_id = $1 AND embedding IS NOT NULL`.
  2. **Rama Léxica y Exacta:** Normaliza la consulta quitando tildes (`normalizeLexicalText(query)`) y obtiene los Top 25 `product_id` combinando coincidencia exacta de `sku`/`gtin`/`media_term` (boost prioritario), `name` y `ts_rank_cd(to_tsvector('simple', pe.lexical_text), websearch_to_tsquery('simple', $normalizedQuery))`.
  3. **Fusión RRF ($k = 60$):**
     $$\text{score}_{\text{RRF}}(p) = \frac{1.0}{60 + r_{\text{sem}}(p)} + \frac{1.0}{60 + r_{\text{lex}}(p)} + \text{exactBoost}(p)$$
  4. **Hidratación Determinista en Vivo:** Para los Top `limit` (default `5`, máx. `20`) `product_id` activos (`status = 'active' AND deleted_at IS NULL`), lee en tiempo real `admin.products`, `admin.product_bundle_items`, `admin.product_media` y `resolveEffectivePromotionsForProducts` (`SPEC-18`), construyendo `DeterministicCatalogProductDto` con precios exactos en centavos, promoción vigente, stock efectivo real (incluyendo combos), atributos obligatorios (`requiredForOrder`), resumen multimedia y `botMasterPrompt` IDEAL.

---

## 5. Requisitos Funcionales

| ID | Requisito |
| --- | --- |
| **RF-SPEC-22-01** | Actualizar `cellProductEmbeddings` en `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` añadiendo las columnas `attributeKey` (`text NOT NULL DEFAULT 'composite'`), `lexicalText` (`text NOT NULL DEFAULT ''`), `semanticHash` (`text NOT NULL DEFAULT ''`) y `metadata` (`jsonb NOT NULL DEFAULT '{}'::jsonb`), manteniendo PK compuesta `(client_id, id)` y `embedding halfvec(1536)`. |
| **RF-SPEC-22-02** | Crear las migraciones celulares `0027_cell_phase12_pgvector_partitions_hnsw_spec22.sql` y `0028_cell_phase12_rls_grants_comments_spec22.sql` (con sincronización de `meta/_journal.json` y `meta/0027_snapshot.json` / `0028_snapshot.json` para que `db:check:cell` pase en CI) que conviertan sin pérdida de datos `admin.product_embeddings` y `admin.contact_memories` en tablas particionadas `PARTITION BY LIST (client_id)`, instalen los índices `UNIQUE` en ambas tablas padre (`product_embeddings_chunk_unique` y `contact_memories_profile_unique`), creen las funciones fast-path sin lock `admin.create_client_embedding_partition(uuid)`, `admin.create_client_memory_partition(uuid)` y `admin.create_client_partitions(uuid)` con índices `HNSW (halfvec_cosine_ops)` y GIN `to_tsvector('simple', lexical_text)`, concedan permisos a `mocter_migrator`, `mocter_admin` y `mocter_app` (si existe), y ejecuten el backfill para todos los inquilinos ya presentes en la celda. |
| **RF-SPEC-22-03** | Integrar la invocación de `ensureTenantVectorPartitions(tx, clientId)` en el alta/reconciliación del inquilino (`TenancyService` / `reconcileProvisionedTenantsInCells`) y como guard fast-path previo a escrituras vectoriales. |
| **RF-SPEC-22-04** | Exponer `mediaTerm`, `keywords` y `benefits` en `TenantProductInput`, `DrizzleTenantProductsRepository` e `InMemoryTenantProductsRepository` (autogenerando el slug `mediaTerm` desde `name` cuando venga vacío) y crear `product-semantic-composer.ts` (`composeProductSemanticText`, `normalizeLexicalText`, `computeProductSemanticHash`, `slugifyMediaTerm`) excluyendo estrictamente precios, costos, stock, promociones y `botMasterPrompt`. |
| **RF-SPEC-22-05** | Implementar `EmbeddingProviderService` (`packages/domain/src/services/embedding-provider.service.ts`) gobernado por `MOCTER_EMBEDDING_API_KEY`, `MOCTER_EMBEDDING_BASE_URL`, `MOCTER_EMBEDDING_MODEL` y `MOCTER_EMBEDDING_TIMEOUT_MS` en `env.ts` / `.env.example`, validando estrictamente longitud `1536` con valores finitos, timeout `5.000 ms`, redacción de la API key en `logger.ts`, y añadir filtro defensivo `purpose != 'embeddings'` en `DrizzleAiCredentialResolverRepository.findActivePlatformTrialKeys()`. |
| **RF-SPEC-22-06** | Integrar sincronización automática de `admin.product_embeddings` en `TenantProductsAndMediaService` (`createProduct`, `updateProduct`, `updateProductStatus`, `deleteProduct`, `importProducts`): omitir re-vectorización cuando `semantic_hash` no cambie, eliminar embeddings cuando el producto pase a `inactive`/`draft` o se borre, re-sincronizar combos padres cuando cambie el `name` de un componente simple (`M-01`), y proveer `reindexTenantProductEmbeddings(clientId, options)`. |
| **RF-SPEC-22-07** | Implementar `CatalogHybridSearchService` (`searchCatalogHybrid`) en `packages/domain/src/services/catalog-hybrid-search.service.ts` combinando HNSW + GIN `lexical_text` + coincidencia exacta de `sku`/`gtin`/`media_term` vía RRF ($k = 60$) e hidratando determinísticamente en tiempo real desde `admin.products`, `admin.product_bundle_items`, `admin.product_media` y `resolveEffectivePromotionsForProducts`. |
| **RF-SPEC-22-08** | Implementar en `DrizzleCrmRepository` y `CrmService` los métodos `getContactMemoryContextForTurn` (`UNION ALL` sobre la partición `admin.contact_memories` recuperando la ficha `kind = 'profile'` 1:1 + los Top 3 `kind = 'episode'` por distancia coseno HNSW o por recencia en fallback léxico) y `consolidateContactMemory` (asegurando partición, vectorizando `halfvec(1536)` y haciendo `UPSERT` de `profile` o `INSERT` de `episode`). |

---

## 6. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
| --- | --- | --- |
| **RNF-SPEC-22-01** | Latencia de consulta celular | Búsqueda híbrida RRF + hidratación determinista en PostgreSQL 18 (excluyendo red externa de embeddings): **P95 ≤ 120 ms** para celdas de hasta 100 inquilinos. |
| **RNF-SPEC-22-02** | Timeout de vectorización | Llamada HTTP a API de embeddings acotada estrictamente a **5.000 ms** (`AbortSignal.timeout`); al expirar degrada a modo léxico sin error 500. |
| **RNF-SPEC-22-03** | Aislamiento multi-inquilino | 100 % de consultas y escrituras verificadas mediante test de intrusión cruzada (`client_alpha` vs. `client_beta`) con `FORCE ROW LEVEL SECURITY` y *partition pruning* verificado en `EXPLAIN`. |
| **RNF-SPEC-22-04** | Presupuesto de particiones | Máximo `2 × 100 = 200` particiones vectoriales físicas por celda (`product_embeddings` + `contact_memories`), muy por debajo del tope de `8.000` relaciones de `DAT-001 §9.2`. |
| **RNF-SPEC-22-05** | Escalabilidad horizontal / Kubernetes | Servicios `CatalogHybridSearchService` y `EmbeddingProviderService` **100 % stateless**; compatibles con múltiples réplicas en Docker y futura migración a Kubernetes + CloudNativePG. |

---

## 7. Reglas de Negocio (Invariantes)

- **`RN-SPEC-22-01` (Prohibición absoluta de precios, stock y prompts en vectores):** Ningún registro en `admin.product_embeddings` contiene precios (`price_cents`, `sale_price_cents`, `cost_price_cents`), inventario (`stock_quantity`), promociones ni `bot_master_prompt`. Modificar precio o stock debe producir el mismo `semantic_hash` exacto y `0` llamadas a `EmbeddingProviderService`.
- **`RN-SPEC-22-02` (Hidratación determinista obligatoria):** Todo resultado devuelto por `CatalogHybridSearchService` proviene de cruzar los `product_id` candidatos contra `admin.products` (`status = 'active' AND deleted_at IS NULL`) y `resolveEffectivePromotionsForProducts` en la misma transacción.
- **`RN-SPEC-22-03` (Cero `ACCESS EXCLUSIVE LOCK` en operaciones rutinarias):** `create_client_partitions` ejecuta el fast-path `to_regclass(...) IS NOT NULL` antes de tomar advisory locks o DDL, evitando bloqueos globales sobre la tabla padre.
- **`RN-SPEC-22-04` (Resiliencia Fail-Soft Léxica):** Un fallo del proveedor externo de embeddings nunca bloquea la creación/edición de un producto ni la búsqueda del catálogo; el registro conserva `lexical_text` indexado por GIN para servir resultados deterministas por vía léxica.

---

## 8. Criterios de Aceptación (Gherkin)

```gherkin
Característica: Particionamiento Físico pgvector, Vectorización Canónica y Búsqueda Híbrida RRF con Hidratación Determinista

  Escenario: Conversión idempotente a tablas particionadas conservando ON CONFLICT y aislamiento RLS
    Dado una celda PostgreSQL 18 con productos y memorias de contacto existentes para dos inquilinos A y B
    Cuando se aplican las migraciones celulares "0027" y "0028"
    Entonces "admin.product_embeddings" y "admin.contact_memories" tienen relkind = 'p' en pg_class
    Y existen particiones individuales con índice local "_hnsw_idx" (halfvec_cosine_ops) y "_fts_gin_idx" para A y B
    Y ejecutar "upsertContactProfile" (ON CONFLICT (client_id, contact_id) WHERE kind = 'profile') y "upsertProductEmbedding" funciona sin errores
    Y el test de intrusión cruzada confirma 0 filas visibles del inquilino B bajo contexto RLS del inquilino A

  Escenario: Cambio de precio o stock preserva semantic_hash y no re-vectoriza
    Dado un producto activo "Hidrolavadora a Vapor" ya indexado en su partición "product_embeddings_c_<id>"
    Cuando el comercio cambia priceCents de 15600000 a 14000000 o un pedido descuenta stockQuantity
    Entonces computeProductSemanticHash produce exactamente el mismo hash SHA-256
    Y EmbeddingProviderService no es invocado ni se escribe en "admin.product_embeddings"

  Escenario: Búsqueda híbrida RRF insensible a tildes con hidratación determinista en vivo y fallback léxico
    Dado un producto activo "Máquina de Vapor Industrial" con precio regular 156.000 COP, promoción activa del 10% (140.400 COP) y 8 unidades en stock
    Cuando se consulta searchCatalogHybrid con "maquina para limpiar tapiceria con calor"
    Entonces el producto es recuperado mediante fusión RRF (HNSW + lexical_text sin tildes)
    Y el DTO retornado contiene regularPriceCents = 15600000, effectivePriceCents = 14040000, effectiveStock = 8 y activePromotion vigente
    Y si EmbeddingProviderService responde con error o timeout, la búsqueda degrada a modo "lexical_fallback" devolviendo el producto hidratado sin error 500
```
