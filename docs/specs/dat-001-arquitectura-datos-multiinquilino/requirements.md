# DAT-001 · Requisitos · Arquitectura de datos multi-inquilino basada en celdas

| Atributo | Valor |
|---|---|
| ID | DAT-001 |
| Versión | 1.3 |
| Estado | Aprobada |
| Fecha | 2026-10-20 · actualizado 2026-10-26 |
| Documentos | `requirements.md` (este) · `design.md` · `tasks.md` |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` |

## 1. Propósito

`DAT-001` define la arquitectura de datos de la plataforma Mocter: persistencia, enrutamiento, aislamiento, particionado, búsqueda vectorial y operación. Es la referencia técnica que consumen `ADM-001`, `AUTH-001` y `CHW-001`, y la base de las especificaciones de implementación que vendrán.

No reemplaza los requisitos de producto. `ADM-001` define **qué** debe hacer `mocter-admin`; `DAT-001` define **cómo** se organizan y protegen sus datos.

## 2. Alcance

### Incluye

- Los tres planos lógicos: soporte aislado (instancias únicas de plataforma `pg-chatwoot` y `pg-n8n` compartidas transversalmente por todos los inquilinos), control global (`pg-control-plane`) y datos en celdas autónomas (App + DB).
- PostgreSQL 18 con pgvector en todas las instancias, incluida Chatwoot.
- Catálogo de celdas, enrutamiento, alta, capacidad y migración de inquilinos.
- Aislamiento con RLS forzado, roles separados y PgBouncer en modo `transaction`.
- Particionado selectivo de exactamente 3 tablas (`contacts`, `product_embeddings`, `contact_memories`) y tablas compartidas con RLS (`products`, `users`, `audit_logs`).
- Búsqueda vectorial con HNSW y `halfvec(1536)` para catálogo y memorias de contacto (`profile` y `episode`).
- Planes, cuotas y catálogo global de archivos.
- Módulo global de Comunidades (Líderes y Members) para comunicación transversal entre inquilinos de distintas celdas.
- Backup, observabilidad, disparadores de escalado y perfiles de configuración.

### Excluye

- **Esquema interno y código de Chatwoot y n8n**: son **instancias únicas de plataforma para todos los inquilinos** (no se replican por celda ni por inquilino). Chatwoot aísla multi-tenencia internamente mediante `Account` y mantiene su base de datos propia (`pg-chatwoot`); n8n mantiene su persistencia independiente (`pg-n8n`). Los mensajes y notificaciones omnicanal viven en la base de datos de Chatwoot, no en la celda. n8n interactúa exclusivamente en el borde vía APIs y webhooks autenticados; no accede directamente a las bases celulares ni de control.
- **Kubernetes y CloudNativePG**: se documentan como evolución futura, no como implementación actual.
- **Código de aplicación y migraciones**: pertenecen a especificaciones de implementación posteriores.
- **Funcionalidad de la landing page**: permanece pública y fuera de este alcance.

## 3. Actores

| Actor | Rol |
|---|---|
| Inquilino | Consume las capacidades de su plan dentro de su celda autónoma |
| Administrador de plataforma | Opera planes, cuotas, comunidades y restricciones |
| SRE / Plataforma | Aprovisiona celdas, ejecuta migraciones y monitorea |
| Chatwoot | Sistema de soporte; **instancia única de plataforma compartida para todos los inquilinos** (multi-account) con su propia base independiente `pg-chatwoot` |
| n8n | Orquestador externo; **instancia única de plataforma compartida para todos los inquilinos** con su propia base independiente `pg-n8n` y consumo exclusivo por API |
| Consumidor de API | `mocter-admin`, la landing y servicios internos que resuelven la celda antes de consultar |

## 4. Requisitos funcionales

### RF-01 · Planos y motores

| ID | Requisito |
|---|---|
| RF-01.1 | La plataforma separa tres planos lógicos: soporte aislado, control global y datos en celdas autónomas. |
| RF-01.2 | **Celda Autónoma (Data Plane):** Cada celda agrupa entre 50 y 100 inquilinos e incluye **tanto la base de datos (`pg-cell-XX` + PgBouncer en modo `transaction`) como su capa de aplicación (Backend/Admin del inquilino)** para evitar cuellos de botella en el router global. |
| RF-01.3 | **Control Plane Global (`pg-control-plane`):** Aloja el enrutador de celdas (`client_id -> cell_id`), facturación (`BILL-001`), referidos (`REF-001`) y el **módulo de Comunidades (Líderes y Members)**, permitiendo que inquilinos alojados en distintas celdas pertenezcan a una misma comunidad y se comuniquen transversalmente. |
| RF-01.4 | **Plano de Soporte Aislado (Instancias Únicas Centralizadas):** Chatwoot (`pg-chatwoot`) y n8n (`pg-n8n`) son **instancias únicas de plataforma (centralizadas y compartidas transversalmente por todos los inquilinos)**. No se despliega una instancia de soporte por celda ni por inquilino. Mantienen sus propias bases de datos PostgreSQL independientes. Los mensajes y notificaciones omnicanal viven en la base de datos de Chatwoot (aislados lógicamente por `account_id`), no en la celda. |
| RF-01.5 | Toda instancia PostgreSQL de la plataforma usa PostgreSQL 18 con pgvector (`pgvector/pgvector:pg18`). El esquema de Chatwoot sigue siendo propiedad de Chatwoot y se sincroniza con upstream. |
| RF-01.6 | No existen claves foráneas entre bases. Las referencias entre planos son identificadores lógicos. |
| RF-01.7 | Redis 7+ se usa en dos instancias separadas: la de Chatwoot (cola de trabajos y caché) y la del plano de control (enrutamiento, Pub/Sub, rate limiting y revocación de sesión). |
| RF-01.8 | n8n opera como **instancia única de soporte para todos los inquilinos** con persistencia independiente en `pg-n8n`; tiene estrictamente prohibido el acceso directo a las bases de las celdas o del plano de control, interactuando únicamente vía REST API y webhooks autenticados por inquilino. |
| RF-01.9 | El Router Global se mantiene como plano de control mientras comparta instancia con la landing. La separación a `pg-control-plane` dedicado sigue los disparadores de `design.md` §3.6. |

### RF-02 · Tenencia y claves

| ID | Requisito |
|---|---|
| RF-02.1 | `client_id` es la clave canónica de tenencia. El valor se origina en `clients.id`, generado con `uuidv7()` de PostgreSQL 18; las tablas hijas lo copian. |
| RF-02.2 | La entidad inquilino se materializa en `clients`, con PK `id` (UUIDv7). Las tablas hijas no generan un `client_id` nuevo: copian el valor de `clients.id` en su columna `client_id`, que es la FK. En el plano de control la FK es física; en las celdas es lógica porque no hay FK entre bases. |
| RF-02.3 | Toda tabla con datos de inquilino lleva `client_id NOT NULL` e índice compuesto que comienza por `client_id`, se particione o no. |
| RF-02.4 | Las correlaciones con sistemas externos viven en tablas propias. `chatwoot_account_id` no se almacena en la fila del inquilino. |
| RF-02.5 | El módulo de Comunidades (Líderes y Members: `communities` y `community_members`) reside en el plano de control global (`pg-control-plane`), permitiendo que inquilinos alojados en distintas celdas pertenezcan a una misma comunidad y se comuniquen transversalmente. |
| RF-02.6 | El ciclo de vida del inquilino (`alta`, `activo`, `suspendido`, `baja`) se separa del estado de enrutamiento (`pending`, `active`, `draining`, `readonly`, `maintenance`, `migrating`, `failed`). |
| RF-02.7 | En tablas particionadas por `client_id`, la PK es `(client_id, id)` porque PostgreSQL exige la clave de partición en la PK. En tablas no particionadas, la PK es `id` o `(client_id, id)`. En ambos casos `client_id` es la clave de tenencia y `id` es la identidad de la fila. |

**Ejemplo.** `clients.id = 019...` (UUIDv7). Una fila de `contacts`, que está particionada, tiene `(client_id, id)` como PK; en `products`, que es no particionada (esquema compartido), la PK es `id` (con índice B-Tree liderado por `client_id`) y `client_id` es la clave de tenencia protegida con RLS.

### RF-03 · Catálogo de celdas y alta

| ID | Requisito |
|---|---|
| RF-03.1 | `cells` registra las celdas disponibles con código, tier, estado, endpoint de PgBouncer, base de datos, capacidad máxima, ocupación actual y región. |
| RF-03.2 | `client_routing` mapea cada `client_id` a su `cell_id`, con estado de enrutamiento y versión de enrutamiento. |
| RF-03.3 | El alta de un inquilino asigna, en una transacción atómica del plano de control, la celda activa con menor ocupación dentro de su tier. Si no hay capacidad, falla con un error explícito o requiere aprovisionar una celda nueva. |
| RF-03.4 | El alta es una saga: el plano de control crea el inquilino en estado pendiente, la celda prepara las 3 particiones (`contacts`, `product_embeddings`, `contact_memories`) y sus políticas con `create_client_partitions`, y el plano de control activa el enrutamiento. Un fallo intermedio se compensa y se registra. |
| RF-03.5 | `client_migrations` audita cada movimiento de inquilino entre celdas con origen, destino, estado y marcas de tiempo. |
| RF-03.6 | El contador de ocupación de cada celda se reconcilia periódicamente contra la realidad. Una deriva se corrige con un proceso de reconciliación. |
| RF-03.7 | Una celda deja de recibir altas cuando alcanza su capacidad máxima o cuando se cumple un disparador de escalado. |

### RF-04 · Enrutamiento

| ID | Requisito |
|---|---|
| RF-04.1 | Toda petición de datos de inquilino resuelve primero su celda antes de abrir una conexión. |
| RF-04.2 | La resolución sigue una jerarquía: caché local, caché compartida y Router Global como fallback. |
| RF-04.3 | La sesión de servidor o el JWT de API resuelven `client_id` y `routing_version`; la cookie opaca solo transporta el `sid`. Ninguno contiene un `cell_id` permanente. |
| RF-04.4 | Un cambio de `routing_version` obliga a re-resolver la celda. La invalidación se propaga a las cachés locales; el TTL por sí solo no es suficiente durante una migración. |
| RF-04.5 | Un inquilino suspendido, dado de baja o en migración se rechaza antes de abrir la conexión, salvo la ventana controlada de cutover. |
| RF-04.6 | Cada celda expone un pool de conexiones propio; PgBouncer multiplexa en modo transacción. |

### RF-05 · Aislamiento

| ID | Requisito |
|---|---|
| RF-05.1 | RLS está habilitado y forzado (`FORCE ROW LEVEL SECURITY`) en toda tabla de inquilino de las celdas y en las tablas hijas con `client_id` consultadas por la aplicación de inquilino en el Router Global (`client_plan_overrides`, `chatwoot_accounts`, `organization_members`). Las tablas operativas del Router Global (`cells`, `clients`, `client_routing`, `client_migrations`, `plans`, `plan_limits`, `media_catalog`, `communities`, `community_members`) se protegen con roles y permisos, no con RLS de inquilino. |
| RF-05.2 | La aplicación fija `app.current_client_id` con `SET LOCAL` dentro de la transacción. Si el valor falta, la política falla cerrada y no devuelve filas. |
| RF-05.3 | Existen roles separados: un rol de migración o propietario con DDL y un rol de aplicación con DML, sin DDL y sin `BYPASSRLS`. |
| RF-05.4 | RLS es defensa en profundidad. Las consultas siguen filtrando por `client_id`; RLS no reemplaza el filtro explícito. |
| RF-05.5 | Las tablas de identidad y sesión del Router Global (`users`, `identities`, `sessions`) son globales y no usan RLS por `client_id`. `users` no tiene `client_id`; lleva `active_client_id` nullable como puntero de membresía única. `identities` no tiene tenencia; `sessions` puede registrar el `client_id` activo, pero no es una tabla de tenencia. La membresía y su historial viven en `tenant_users`, que lleva `client_id` y usa RLS. Un usuario tiene como máximo una membresía activa. La tabla `users` de cada celda es una proyección de usuarios del inquilino, lleva `client_id` y usa RLS. |
| RF-05.6 | `mocter-admin` no accede directamente a la base de Chatwoot. La integración es exclusivamente por sus APIs. |

### RF-06 · Particionado selectivo en la Celda (Exactamente 3 Tablas)

| ID | Requisito |
|---|---|
| RF-06.1 | Se aplica una regla estricta de particionamiento selectivo en la celda: **solo 3 tablas** se particionan mediante `PARTITION BY LIST (client_id)` + RLS: 1) `contacts` (crecimiento exponencial de leads multicanal); 2) `product_embeddings` (separada de `products` para que stock o precio no ensucien el índice HNSW, múltiples chunks por producto, re-indexación asíncrona, `halfvec(1536)`); 3) `contact_memories` (separada de `contacts` para evitar que actualizaciones operativas como `last_seen_at` o tags degraden el índice HNSW). |
| RF-06.2 | Las 3 tablas particionadas usan `PARTITION BY LIST (client_id)`; al llegar a 100 inquilinos se abre una celda nueva. Con 100 inquilinos y 3 tablas particionadas, la celda genera exactamente 300 particiones físicas, muy por debajo del techo operativo de 10.000. |
| RF-06.3 | El total de particiones físicas por instancia no supera 10.000, contando todas las tablas particionadas por todos los inquilinos de la celda. |
| RF-06.4 | **Tablas No Particionadas (Esquema Compartido + RLS Forzado):** `products` (catálogo transaccional: óptimo con índices B-Tree liderados por `client_id` para catálogos de 1.000 a 5.000+ productos por comercio), `users` (usuarios del inquilino: volumen bajo y altamente cacheable), `audit_logs` y tablas operativas (`orders`, `roles`, `configs`). |
| RF-06.5 | Las tablas no particionadas cumplen obligatoriamente: PK `(client_id, id)` o `id` + índice B-Tree liderado por `client_id`, `FORCE ROW LEVEL SECURITY` e inyección de contexto por transacción con `SELECT set_config('app.current_client_id', $client_id, true)`. |
| RF-06.6 | La creación de particiones es una operación privilegiada de alta ejecutada por `create_client_partitions(p_client_id)`. |
| RF-06.7 | En tablas particionadas, la PK, las claves únicas y las FK incluyen la clave de partición `client_id`. |

### RF-07 · Búsqueda vectorial, Perfilamiento y Memoria de Contactos

| ID | Requisito |
|---|---|
| RF-07.1 | Las celdas habilitan la extensión `vector`. Los embeddings vectoriales se almacenan en `product_embeddings` y en `contact_memories`. |
| RF-07.2 | La dimensión del embedding es canónica a 1536 dimensiones (compatible con modelos OpenAI text-embedding-3-small, Gemini o Vertex AI correspondientes). |
| RF-07.3 | Los índices HNSW usan `m=16` y `ef_construction=64` como punto de partida; se ajustan con datos reales. |
| RF-07.4 | Se estandariza el uso de `halfvec(1536)` (PostgreSQL 18 + pgvector 0.8+) con la clase de operadores `halfvec_cosine_ops`, reduciendo el consumo de RAM en índices HNSW en un 50% con recall > 99%. |
| RF-07.5 | Las consultas con filtros adicionales usan `hnsw.iterative_scan=relaxed_order` y un `hnsw.ef_search` explícito. |
| RF-07.6 | El tamaño de los índices HNSW se monitorea. Si supera el 65% de la RAM de la celda, se abre una celda nueva o se escala. |
| RF-07.7 | Un cambio de modelo o dimensión de embedding exige reindexar y versionar el contrato del modelo. |
| RF-07.8 | **Diseño de Perfilamiento y Memoria (`contact_memories`):** Tabla única particionada por inquilino con índice HNSW local (`halfvec(1536)`) y columna discriminadora `memory_type`: a) `profile` (1:1 por contacto, ficha viva evolutiva con preferencias, presupuesto y objeciones actualizada por UPSERT, permitiendo hiper-segmentación y cruce inverso con `product_embeddings`); b) `episode` (1:N por contacto, resúmenes cortos generados asíncronamente al resolver conversaciones en Chatwoot o cerrar pedidos, otorgando memoria a largo plazo al bot de IA). |

### RF-08 · Planes y cuotas

| ID | Requisito |
|---|---|
| RF-08.1 | El plan se modela en dos capas: catálogo de planes (públicos y privados) y asignación por inquilino con overrides por dimensión. |
| RF-08.2 | El tope efectivo se lee desde un único punto: override del inquilino, si existe; si no, plan; si no, default. |
| RF-08.3 | Las dimensiones sobrescribibles son: retención de chats en días, almacenamiento en bytes, productos, usuarios por cuenta, imágenes por producto, audios, videos y PDF. |
| RF-08.4 | El almacenamiento facturado es la suma de tamaños de archivos distintos referenciados por el inquilino, contando los bytes almacenados (original de imagen/audio/PDF o canónico de video). El almacenamiento físico es el de objetos distintos en SeaweedFS; las variantes de imagen generadas por imgproxy no suman. La diferencia es margen del proveedor. |
| RF-08.5 | La cuota se controla en el acto de vincular el archivo, de forma atómica con el insert y con lock sobre el contador. Si otro productor puede escribir sin pasar por el vínculo, la cuota es decorativa. |
| RF-08.6 | Los topes negociados se guardan con vigencia (inicio y fin) y auditoría de quién los negoció y quién los cambió. La retención puede tener un piso legal mínimo. |

### RF-09 · Archivos

| ID | Requisito |
|---|---|
| RF-09.1 | Existen dos dominios de archivos: multimedia de producto, propiedad de Mocter, con catálogo global, SeaweedFS v4.51 S3 interno + imgproxy v4.0.20 para entrega firmada (servicios de plataforma ya aprovisionados), deduplicación por hash, cuota y borrado por ausencia de referencias; y adjuntos de conversación, propiedad de Chatwoot ActiveStorage, sin deduplicación, sin cuota de producto y con política propia. |
| RF-09.2 | El catálogo global vive en el Router Global y contiene solo la ficha técnica: hash, clave de almacenamiento, tamaño y tipo. No contiene `client_id` ni atributos de negocio. |
| RF-09.3 | El vínculo producto–archivo vive en la celda del producto. |
| RF-09.4 | El borrado físico se decide por ausencia de referencias en todas las celdas, nunca por un contador. |
| RF-09.5 | El GC de producto verifica solo catálogos propios (Router Global y celdas), nunca Chatwoot. |
| RF-09.6 | SeaweedFS se usa como almacenamiento S3 compatible con path-style, en la red interna y sin endpoint público. La entrega al navegador se hace por `media.mocter.co` (imgproxy) con URL firmada; el navegador nunca recibe credenciales S3. |
| RF-09.7 | Los adjuntos de Chatwoot no se cuentan en la cuota de producto y no se eliminan desde el GC de producto. |
| RF-09.8 | El catálogo guarda la clave de almacenamiento, no una URL pública. La entrega de imágenes se firma con HMAC-SHA256 y se genera bajo demanda; las variantes de imagen no se almacenan. El hash de deduplicación corresponde a los bytes almacenados: original de imagen/audio/PDF, canónico de video o URL normalizada en externos. |

### RF-10 · Operación

| ID | Requisito |
|---|---|
| RF-10.1 | Cada instancia tiene backup y restore probado. El destino, la retención y la frecuencia de prueba se fijan en OPS-001; DAT-001 exige que el backup sea S3 compatible, offsite, cifrado, versionado y con restore probado. |
| RF-10.2 | La observabilidad expone métricas de conexiones, uso de pool, tamaño de índices HNSW, cantidad de particiones, hit rate de caché, errores de enrutamiento y lag de migración. |
| RF-10.3 | Los disparadores de apertura de celda son: 100 inquilinos, 8.000 relaciones en `pg_class`, índices HNSW que superan el 65% de la RAM, o CPU P95 sostenida por encima del 70%. |
| RF-10.8 | La capacidad nominal de una celda es 100 inquilinos; la capacidad efectiva es la primera condición de RF-10.3 que se cumpla. HNSW puede reducirla; se mide con el modelo y la dimensión reales. |
| RF-10.4 | La migración de un inquilino entre celdas sigue un protocolo con copia inicial, cutover corto, verificación de lag cero y limpieza sin bloat. |
| RF-10.5 | Cada tipo de instancia tiene un perfil de configuración propio (`shared_buffers`, `work_mem`, `maintenance_work_mem`, `max_connections`, autovacuum, WAL). |
| RF-10.6 | Los secretos se gestionan fuera del repositorio. |
| RF-10.7 | Kubernetes con CloudNativePG es una evolución futura; la implementación actual es Docker Compose sobre el VPS con Traefik. |
| RF-10.9 | Toda tabla propia del sistema lleva las columnas de auditoría mínimas `created_at`, `updated_at`, `created_by` y `updated_by`, y `deleted_at`/`deleted_by` donde aplica soft delete, según la directiva de base de datos. Las columnas de ciclo de vida ya documentadas no se duplican. |
| RF-10.10 | La composición del texto vectorizado es administrable por la plataforma (`vectorization_config` de ADM-001); el default vectoriza nombre, descripción, categoría y marca, y excluye el prompt de venta. |

### RF-11 · Versiones y compatibilidad

| ID | Requisito |
|---|---|
| RF-11.1 | Todas las instancias usan PostgreSQL 18 con pgvector, incluida Chatwoot. |
| RF-11.2 | Chatwoot se fija en la versión 4.19.1 documentada en CHW-001. Su esquema no se modifica. |
| RF-11.3 | La versión de pgvector se verifica en la imagen. `halfvec` e `iterative_scan` requieren pgvector 0.7+ y 0.8+, respectivamente. |
| RF-11.4 | Chatwoot requiere Redis 7+ y Sidekiq; ambos forman parte del plano de soporte. |
| RF-11.5 | La ejecución de Chatwoot 4.19.1 sobre PostgreSQL 18 se valida en T-01A/T-17/T-18; la evidencia previa de 4.19.0 se conserva. Se mantiene el rollback como precaución operativa; su procedimiento está documentado en `design.md` §9.7. |

## 5. Criterios de aceptación

1. Todas las instancias responden `SELECT version()` con PostgreSQL 18 y tienen pgvector disponible.
2. Chatwoot 4.19.1 corre sobre PostgreSQL 18 con su esquema intacto y sincronizado con upstream (validación en T-01A/T-17/T-18).
3. `client_id` es UUIDv7 en todas las tablas de inquilino y su valor se origina en `clients.id` (`uuidv7()`); las tablas hijas lo copian.
4. Existen `cells`, `clients`, `client_routing` y `client_migrations` en el Router Global.
5. El alta de un inquilino es una saga con compensación y respeta la capacidad de la celda.
6. Ninguna petición de datos de inquilino abre una conexión sin resolver antes su celda.
7. La sesión de servidor o el JWT de API resuelven `client_id` y `routing_version`; la cookie opaca solo transporta el `sid`. Ninguno contiene un `cell_id` permanente.
8. RLS está habilitado y forzado; una consulta sin `app.current_client_id` no devuelve filas.
9. El rol de aplicación no tiene DDL ni `BYPASSRLS`; el rol de migración está separado.
10. El total de particiones físicas por instancia es menor o igual a 10.000.
11. `contacts`, `product_embeddings` y `contact_memories` están particionadas por `client_id`; `products` y las demás tablas de inquilino no se particionan, residen en esquema compartido y usan RLS e índices B-Tree liderados por `client_id`.
12. Los índices HNSW existen y su tamaño se monitorea contra la RAM de la celda.
13. La cuota se aplica de forma atómica en el vínculo producto–archivo.
14. Un archivo compartido se elimina solo después de verificar la ausencia de referencias en todas las celdas.
15. El backup y el restore de cada instancia están probados.
16. Los disparadores de escalado y el protocolo de migración están documentados.
17. N8N no accede a las bases de celda ni de control; mantiene su base aislada `pg-n8n` y se integra exclusivamente por APIs.
18. No existen claves foráneas entre bases.
19. Redis 7+ y Sidekiq están documentados para Chatwoot; el plano de control tiene un Redis 7+ dedicado y separado.
20. El laboratorio de Chatwoot sobre PostgreSQL 18 está registrado como validado (migraciones exitosas); el procedimiento de rollback está documentado en `design.md` §9.7.
21. El Router Global se mantiene como plano de control; la separación de `pg-control-plane` tiene disparadores documentados y no se implementa en esta especificación.
22. Las tablas de identidad y sesión globales no usan RLS por `client_id`; la membresía (`tenant_users`) y la proyección `users` de cada celda sí. `users.active_client_id` es un puntero nullable, no una política RLS.
23. Las 3 tablas particionadas usan `LIST` por `client_id`; al llegar a 100 inquilinos se abre una celda nueva (generando exactamente 300 particiones por celda).
24. La representación vectorial utiliza `halfvec(1536)` con índices HNSW para optimizar RAM y latencia en `product_embeddings` y `contact_memories`.
25. El rollback de Chatwoot a PostgreSQL 16 está documentado en `design.md` §9.7 y se ensaya en laboratorio antes de producción.
26. El destino, la retención y la prueba de restore se fijan en OPS-001; DAT-001 exige S3 compatible, offsite, cifrado, versionado y restore probado.
27. La capacidad nominal es 100 inquilinos por celda; la efectiva se determina por el primer disparador de escalado de RF-10.3.
28. `media_catalog` no expone URLs públicas; la entrega de imágenes se resuelve con URL firmada de imgproxy y SeaweedFS no responde desde Internet.
29. Existe un test automatizado en CI/CD para validar aislamiento RLS entre inquilinos mediante pruebas de intrusión cruzada (Verification Gate).
30. El módulo de Comunidades reside en el plano de control permitiendo relacionar líderes y miembros de diferentes celdas sin consultas distribuidas entre celdas.

## 6. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Disponibilidad | 99.9% del Router Global y del enrutamiento. |
| RNF-02 | Latencia de enrutamiento | P95 ≤ 50 ms con caché; P95 ≤ 150 ms contra PostgreSQL. |
| RNF-03 | Aislamiento | 0 filas cross-tenant en pruebas de RLS; toda consulta de tenant filtra por `client_id`. |
| RNF-04 | Continuidad | RPO ≤ 15 min; RTO ≤ 2 h Router Global y ≤ 4 h celdas/Chatwoot (OPS-001). |
| RNF-05 | Capacidad | 100 inquilinos nominales por celda; alerta al 80% y apertura de celda al primer disparador. |
| RNF-06 | Migraciones | Una línea por base; migración sin pérdida de datos y con ventana de mantenimiento declarada. |
| RNF-07 | i18n | Sin strings de UI en el dominio; errores de API con códigos estables traducidos por la capa web. |

## 7. Criterios de Aceptación (BDD)

### CA-DAT-01 · Aislamiento RLS
- **Dado** un usuario del inquilino A,
- **Cuando** consulta una tabla de su celda sin `client_id = A`,
- **Entonces** no recibe filas de B y la consulta falla cerrada.

### CA-DAT-02 · Enrutamiento por cliente
- **Dado** un `client_id` con `client_routing` vigente,
- **Cuando** la aplicación resuelve su celda,
- **Entonces** usa la celda correcta y respeta `routing_version`; un cambio invalida la caché.

### CA-DAT-03 · Capacidad de celda
- **Dado** una celda con 100 inquilinos,
- **Cuando** llega un alta nueva,
- **Entonces** se rechaza en esa celda y se aprovisiona/enruta a una celda nueva.

### CA-DAT-04 · Restore PITR
- **Dado** un punto dentro de la retención,
- **Cuando** se restaura una instancia,
- **Entonces** el RPO/RTO se cumplen y la verificación de integridad pasa.

### CA-DAT-05 · Cuotas efectivas
- **Dado** un plan con `plan_limits` y un override,
- **Cuando** se calcula el tope efectivo,
- **Entonces** se aplica el override vigente y `quota_version` se incrementa al cambiar.

## 8. Decisiones

| ID | Decisión | Justificación |
|---|---|---|
| D-01 | PostgreSQL 18 con pgvector en todas las instancias, incluida Chatwoot. | Decisión del usuario. La versión canónica es Chatwoot 4.19.1; su validación se registra en T-01A/T-17/T-18 y la evidencia previa de 4.19.0 se conserva. El rollback queda como precaución operativa; procedimiento en `design.md` §9.7. |
| D-02 | N8N fuera de alcance. | El usuario lo define como referencia de existencia; no se documenta su persistencia ni su correlación. |
| D-03 | `clients.id` UUIDv7 con `uuidv7()` nativo; `client_id` lo copia en las tablas hijas. | PostgreSQL 18 lo soporta; evita el UUIDv4 aleatorio y mejora la localidad de índices. |
| D-04 | Router Global como plano de control. | RF-10.1 de ADM-001. Se puede separar en el futuro si el tráfico lo justifica. |
| D-05 | Correlaciones externas en tablas propias. | D-02 de CHW-001 y RF-03.2 de ADM-001. |
| D-06 | Organizaciones separadas del inquilino. | RF-08 de ADM-001. |
| D-07 | Planes en dos capas con overrides. | Decisión registrada en Engram (#30). |
| D-08 | Archivos en dos dominios. | Decisión registrada en Engram (#29). |
| D-09 | Particionado híbrido: `products` y `product_embeddings` particionadas por `client_id`; el resto de las tablas de inquilino sin particionar y con RLS. | Directiva de base de datos §5.5 y presupuesto de particiones. |
| D-10 | RLS, PgBouncer y roles separados. | Defensa en profundidad y cierre de O-11 de ADM-001. |
| D-11 | `routing_version` en lugar de `cell_id` permanente. | Evita rutas obsoletas durante migraciones. |
| D-12 | Kubernetes y CloudNativePG como fase futura. | La operación actual es Docker Compose sobre el VPS con Traefik. |
| D-13 | Particionado `LIST` por `client_id` con 100 inquilinos por celda; al llegar al límite se abre una celda nueva. `HASH` queda diferido con trigger. | `LIST` aísla por inquilino y simplifica drop/migración; el presupuesto de 10.000 particiones no es el límite inmediato. |
| D-14 | Representación vectorial por defecto `vector(d)`; `halfvec(d)` queda diferido con trigger de recall/memoria. | Sin el modelo y el dataset reales no se puede validar la pérdida de recall; la dimensión la define el contrato de embedding. |
| D-15 | Rollback de Chatwoot a PostgreSQL 16 con la imagen anterior, documentado en `design.md` §9.7. | La validación en laboratorio fue exitosa; el rollback es una precaución operativa con RPO/RTO explícitos. |
| D-16 | Backup: destino, retención y prueba se fijan en OPS-001; DAT-001 exige S3 compatible, offsite, cifrado, versionado y restore probado. | Evita duplicar la decisión operativa en dos especificaciones; OPS-001 gobierna la continuidad y CD-001 solo el despliegue. |
| D-17 | Capacidad nominal de 100 inquilinos por celda; la efectiva es el primer disparador de RF-10.3. | HNSW, CPU o relaciones pueden reducir la capacidad; fijar un número menor sin medición sería arbitrario. |
| D-18 | Las cuatro columnas de auditoría (`created_at`, `updated_at`, `created_by`, `updated_by`) son obligatorias en todas las tablas; el soft delete (`deleted_at`, `deleted_by`) se aplica solo donde corresponde. Las columnas de ciclo de vida ya documentadas cumplen ese rol y no se duplican. | Un solo mecanismo de baja por tabla evita dos fuentes de verdad sobre el mismo hecho y mantiene el historial de `tenant_users` intacto. |

## 9. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|

## 10. Trazabilidad

- 2026-10-20: análisis del SDD externo de arquitectura multi-inquilino basada en celdas y alineación con `ADM-001`, `AUTH-001` y `CHW-001`.
- 2026-10-20, corrección del usuario: "Correccion todo en Postgresql 18 + pgvector eso incluye Chatwoot, N8N se tiene como referencia de existencia como orquestador de flujos pero no es relevante para esta documentación. A la pregunta crea una nueva spec".
- 2026-10-20, corrección del usuario sobre la clave de tenencia: «No entiendo esto "- client_id UUIDv7; clients.id es PK y las tablas hijas usan client_id." es necesario reviar explicitamente esta indicacion.» Se explicita en RF-02 que `clients.id` es la PK del inquilino y que `client_id` es el valor copiado en las tablas hijas; en tablas particionadas la PK es `(client_id, id)`.
- 2026-10-20, corrección del usuario sobre particionado, Chatwoot e índice: «En cuanto a "Particionado híbrido: products sin particionar; product_embeddings particionada por client_id; audit_logs solo si el volumen lo justifica." Regla el objeto products se particiona por que es el opcionado #1 para vectorizacion, el concepto de Particionado Hibrido es correcto desde el punto de vista en el que abrian objetos (tabla) sin particionamiento con Row-Level Security (RLS).Ya se realizo el laboratorio y chatwoot funciona perfecto en Postgresql 18 + vgVector 18, las migraciones pasaron satisfactoriamente. Agrega los indices nuevos al AGENTS.md».
- 2026-10-20, decisión O-01: el plano de control usa un Redis 7+ dedicado, separado del Redis de Chatwoot, para caché de enrutamiento, Pub/Sub, rate limiting y revocación de sesión.
- 2026-10-20, decisión O-02: el Router Global se mantiene como plano de control; la separación de `pg-control-plane` queda diferida con disparadores documentados en `design.md` §3.6.
- 2026-10-20, decisión O-03: RLS solo en tablas de tenencia; identidad y sesión globales del Router Global usan rol dedicado y filtros de aplicación. AUTH-001 debe reflejarlo en T-13.
- 2026-10-20, decisión O-04: se mantiene `LIST` por `client_id` y se abre una celda nueva al llegar a 100 inquilinos; `HASH` queda diferido con trigger y requiere rediseñar el ciclo de vida por tenant.
- 2026-10-20, decisión O-05: la representación vectorial por defecto es `vector(d)`; `halfvec(d)` queda diferido hasta medir recall y memoria con el modelo real.
- 2026-10-20, decisión O-06: se documenta el rollback de Chatwoot a PostgreSQL 16 con la imagen anterior en `design.md` §9.7, con disparadores, backup, restore, verificación y RPO/RTO.
- 2026-10-20, decisión O-07: el destino, la retención y la prueba de backup se difieren a CD-001; DAT-001 exige S3 compatible, offsite, cifrado, versionado y restore probado.
- 2026-10-20, decisión O-08: la capacidad nominal es 100 inquilinos por celda; la efectiva es el primer disparador de RF-10.3 (inquilinos, relaciones, HNSW o CPU).
- 2026-10-22: alineación con AUTH-D-06 y corrección de membresía 1:0..1. La cookie del panel transporta solo un `sid` opaco; la sesión de servidor guarda `client_id` y `routing_version`. `users.active_client_id` es el guardián global de una única membresía activa. JWT queda para APIs futuras. Se unifica el nombre físico `tenant_users` y se elimina `client_users`.
- 2026-10-22: revisión de control del plan SDD. La decisión O-07 quedó superada por OPS-001 (creada el 2026-10-21, dueña de destino, retención y prueba de restore). `design.md` §9.1 ahora delega en OPS-001 y nombra la instancia actual `pg-portal`; la separación `pg-control-plane` sigue diferida (O-02, RF-01.9).
- 2026-10-23: se agregan RF-10.9 y D-18 por decisión del usuario: columnas de auditoría obligatorias en todas las tablas (`created_at`, `updated_at`, `created_by`, `updated_by`), soft delete donde aplique y sin duplicar las columnas de ciclo de vida ya documentadas. La regla global vive en la directiva de base de datos (§8).
- 2026-10-23: RF-10.10 - vectorización administrable por la plataforma con default nombre + descripción + categoría + marca; el prompt de venta queda fuera del embedding (alineado con ADM-001 RF-05.5 a RF-05.7).
- 2026-10-25: modelo canónico de `plans` (`id uuid`, `code` slug único, `name`/`description`/`marketing_features` JSONB `{es,en}`, `status`, precios mensual/anual en centavos, `currency`) y FKs `plan_id` uuid en DAT/BILL/ADM; la landing usa `plans.code` y resuelve a UUID.
- 2026-10-25: **DAT-001 1.2.** Se agregan RNF medibles, criterios BDD y anexo de códigos de error para i18n.
- 2026-10-26: **DAT-001 1.3.** Revisión del subsistema de multimedia: `content_hash` identifica los bytes almacenados (original de imagen/audio/PDF, canónico de video), la entrega usa imgproxy con URL firmada y SeaweedFS queda en la red interna sin endpoint público. SeaweedFS v4.51 e imgproxy v4.0.20 son servicios de plataforma ya aprovisionados; DAT-001 solo define su uso. RF-08.4, RF-09.1, RF-09.6 y RF-09.8 actualizados; las variantes de imagen no se almacenan.

## 11. Anexo i18n · Códigos de error

DAT-001 no expone UI. La capa web traduce estos códigos estables; el dominio no emite strings visibles.

| Código | Español | Inglés |
|---|---|---|
| `DAT_TENANT_NOT_FOUND` | Inquilino no encontrado | Tenant not found |
| `DAT_CELL_CAPACITY_EXCEEDED` | Capacidad de celda agotada | Cell capacity exceeded |
| `DAT_ROUTING_VERSION_MISMATCH` | Versión de enrutamiento desactualizada | Routing version mismatch |
| `DAT_RLS_DENIED` | Acceso no autorizado a datos del inquilino | Unauthorized tenant data access |
