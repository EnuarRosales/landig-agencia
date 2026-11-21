# SPEC-22 · Plan de Tareas · Particionamiento Físico `pgvector` en Celda, Pipeline Automático de Embeddings y Motor de Búsqueda Híbrida (RRF)

| Atributo | Valor |
| --- | --- |
| **ID** | `SPEC-22` |
| **Versión** | `1.1.0` (Post Spec Review) |
| **Depende de** | [`requirements.md`](requirements.md), [`design.md`](design.md) |
| **Estado** | Aprobada · Lista para implementación |

---

## Tareas de Implementación

### `T-01` · Esquema Drizzle y Migraciones Celulares de Particionamiento `PARTITION BY LIST (client_id)` + Índices `UNIQUE` y `HNSW` (`@mocter/domain`)
- [ ] **T-01.1**: Actualizar `cellProductEmbeddings` en `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` agregando `attributeKey` (`default('composite')`), `lexicalText` (`default('')`), `semanticHash` (`default('')`) y `metadata` (`jsonb`), preservando PK compuesta `(client_id, id)` y `product_embeddings_chunk_unique` sobre `(client_id, product_id, chunk_index)`.
- [ ] **T-01.2**: Crear `packages/domain/drizzle-cell/0027_cell_phase12_pgvector_partitions_hnsw_spec22.sql` y `0028_cell_phase12_rls_grants_comments_spec22.sql`, actualizando `packages/domain/drizzle-cell/meta/_journal.json` y generando sus snapshots (`meta/0027_snapshot.json`, `meta/0028_snapshot.json`) sin modificar migraciones previas (`R-09`):
  - Conversión idempotente sin pérdida de datos de `admin.product_embeddings` y `admin.contact_memories` a `PARTITION BY LIST (client_id)`.
  - Creación de índices `UNIQUE` sobre las tablas padre (`product_embeddings_chunk_unique` y `contact_memories_profile_unique WHERE kind = 'profile'`) para compatibilidad con `ON CONFLICT`.
  - Funciones `SECURITY DEFINER` con fast-path `to_regclass(...)` sin lock + `pg_advisory_xact_lock`: `admin.create_client_embedding_partition(uuid)`, `admin.create_client_memory_partition(uuid)` y `admin.create_client_partitions(uuid)` creando `FORCE ROW LEVEL SECURITY`, índice `HNSW (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)`, índice GIN `to_tsvector('simple', lexical_text)` y `GRANT` a `mocter_migrator`, `mocter_admin` y `mocter_app` (si existe).
  - Backfill automático para todos los `client_id` existentes en la celda y comentarios SQL (`COMMENT ON TABLE/COLUMN/FUNCTION`).
- [ ] **T-01.3**: Añadir el helper `ensureTenantVectorPartitions(tx, clientId)` en `packages/domain/src/db/cell-client.ts` e invocarlo en el alta/reconciliación del inquilino (`TenancyService` / `reconcileProvisionedTenantsInCells`).
- [ ] **T-01.4**: Actualizar pruebas de esquema (`catalog-spec08-schema.test.ts` y `crm-schema.test.ts`) validando las nuevas columnas, los índices de tabla padre y el archivo SQL de migración.
- **Verificación:** `pnpm --filter @mocter/domain db:check:cell`, `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain lint`.

### `T-02` · Compositor Semántico (`lexical_text` sin tildes + `mediaTerm`) y `EmbeddingProviderService` (`@mocter/domain`)
- [ ] **T-02.1**: Registrar y documentar en `packages/domain/src/utils/env.ts` y `.env.example` (`AGENTS.md §4.12`): `MOCTER_EMBEDDING_API_KEY`, `MOCTER_EMBEDDING_BASE_URL`, `MOCTER_EMBEDDING_MODEL` (default `'text-embedding-3-small'`) y `MOCTER_EMBEDDING_TIMEOUT_MS` (default `5000`).
- [ ] **T-02.2**: Añadir filtro defensivo `ne(aiPlatformKeys.purpose, "embeddings")` en `DrizzleAiCredentialResolverRepository.findActivePlatformTrialKeys()` (`packages/domain/src/services/ai-credential-resolver.service.ts`) para garantizar que nunca se seleccione una llave de embeddings como modelo de chat.
- [ ] **T-02.3**: Crear `packages/domain/src/services/product-semantic-composer.ts` con `composeProductSemanticText`, `normalizeLexicalText`, `computeProductSemanticHash` y `slugifyMediaTerm`, garantizando por contrato la exclusión total de precios, costos, stock, promociones y `botMasterPrompt` (`RN-SPEC-22-01`).
- [ ] **T-02.4**: Crear `packages/domain/src/services/embedding-provider.service.ts` implementando `IEmbeddingProviderPort` y `EmbeddingProviderService` (validación estricta `dimensions === 1536` con valores finitos, `AbortSignal.timeout(5000)` y retorno tipado `Result` fail-soft sin excepciones).
- [ ] **T-02.5**: Agregar pruebas unitarias en `product-semantic-composer.test.ts` y `embedding-provider.service.test.ts` (verificando invarianza de `semantic_hash` ante cambios de precio/stock, normalización `"máquina" === "maquina"` y comportamiento fail-soft).
- **Verificación:** `pnpm --filter @mocter/domain test`.

### `T-03` · Exposición de `mediaTerm`/`keywords`/`benefits` y Sincronización Automática de `product_embeddings` (`@mocter/domain`)
- [ ] **T-03.1**: Ampliar `TenantProductInput`, `InMemoryTenantProductsRepository` y `DrizzleTenantProductsRepository` en `packages/domain/src/services/tenant-products-and-media.service.ts` para aceptar y persistir `mediaTerm`, `keywords` y `benefits`, autogenerando `mediaTerm` con `slugifyMediaTerm(name)` cuando no se provea explícitamente.
- [ ] **T-03.2**: Agregar a `ITenantProductsRepository` y sus implementaciones los métodos `getProductEmbeddingRecord(clientId, productId)`, `upsertProductEmbedding(clientId, input)` (invocando `ensureTenantVectorPartitions` + `ON CONFLICT (client_id, product_id, chunk_index)`) y `deleteProductEmbeddings(clientId, productId)`.
- [ ] **T-03.3**: Integrar la sincronización semántica en `createProduct`, `updateProduct`, `updateProductStatus`, `deleteProduct` e `importProducts`:
  - `inactive`/`draft`/borrado → elimina filas de `admin.product_embeddings`.
  - `active` → calcula `semanticHash`; si coincide con el existente hace `No-Op`; si cambia genera vector fuera de la transacción SQL (fail-soft a `null` si el proveedor no responde) y persiste `composedText`, `lexicalText`, `semanticHash`, `metadata` y `embedding`.
  - Si se editó el `name` de un producto simple que forma parte de combos (`findActiveBundleParentsForComponent`), re-sincroniza también los combos padres afectados (`M-01`).
- [ ] **T-03.4**: Implementar `reindexTenantProductEmbeddings(clientId, options?: { force?: boolean })` para indexación por lote y reconciliación de registros con `embedding IS NULL`.
- [ ] **T-03.5**: Ampliar `tenant-products-and-media.service.test.ts` cubriendo `No-Op` ante cambio de precio/stock, actualización de combo padre al renombrar componente y fallback léxico.
- **Verificación:** `pnpm --filter @mocter/domain test`.

### `T-04` · Motor `CatalogHybridSearchService` (RRF + Hidratación Determinista) y RAG `contact_memories` (`@mocter/domain`)
- [ ] **T-04.1**: Crear `packages/domain/src/services/catalog-hybrid-search.service.ts` implementando `searchCatalogHybrid(input)`:
  - Vectorización de `query` fuera de la transacción de PgBouncer + `normalizeLexicalText(query)`.
  - Transacción RLS `withTenantCellTransaction(clientId, ...)` con `SET LOCAL hnsw.iterative_scan = relaxed_order; SET LOCAL hnsw.ef_search = 60;`.
  - Fusión RRF ($k = 60$) entre rama HNSW (partición `product_embeddings_c_<hex>`), rama léxica GIN (`to_tsvector('simple', lexical_text)`) y coincidencia exacta de `sku`/`gtin`/`media_term`.
  - Hidratación determinista en tiempo real con `admin.products`, `admin.product_bundle_items`, `admin.product_media` y `resolveEffectivePromotionsForProducts` (`SPEC-18`).
- [ ] **T-04.2**: Implementar en `DrizzleCrmRepository` y `CrmService` los métodos `getContactMemoryContextForTurn(cellId, clientId, contactId, queryText)` (`UNION ALL` de `profile` 1:1 + Top 3 `episode` por distancia coseno HNSW o recencia en fallback) y `consolidateContactMemory` (asegurando partición + vectorización fuera de la transacción SQL + `UPSERT`/`INSERT`).
- [ ] **T-04.3**: Exportar todos los tipos, helpers y servicios desde `packages/domain/src/index.ts` con TSDoc completo en español.
- [ ] **T-04.4**: Crear `catalog-hybrid-search.service.test.ts` y ampliar `crm.service.test.ts` cubriendo RRF, hidratación de precios/promociones/stock en vivo, degradación léxica y RAG `contact_memories`.
- **Verificación:** `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain build`.

### `T-05` · Aplicación de Migración en Celda, Verificación SQL y Reinicio de Contenedores (`AGENTS.md §4.18`)
- [ ] **T-05.1**: Ejecutar las migraciones celulares `0027` y `0028` en la celda activa (`CellMigrationService` / `db:migrate:cell`) y verificar mediante SQL en PostgreSQL 18:
  - `relkind = 'p'` para `admin.product_embeddings` y `admin.contact_memories`.
  - Existencia de particiones hijas, índices `_hnsw_idx` y `_fts_gin_idx`, índices `UNIQUE` en tablas padre y test de intrusión cruzada (`0` filas visibles entre inquilinos).
- [ ] **T-05.2**: Ejecutar `pnpm lint`, `pnpm test`, `pnpm --filter @mocter/domain db:check:cell`, recompilar y reiniciar los contenedores Docker (`mocter-core-admin-portal-1`, `mocter-core-web-portal-1`) verificando respuesta HTTP `200` y logs sin errores.
- **Verificación:** Comprobación SQL en `pg_partitioned_table` / `pg_indexes` y health check HTTP `200` en ambos portales.
