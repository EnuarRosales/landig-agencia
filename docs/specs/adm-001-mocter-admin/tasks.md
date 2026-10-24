# ADM-001 · Tareas · mocter-admin — núcleo administrativo de inquilinos

| Atributo | Valor |
|---|---|
| ID | ADM-001 |
| Versión | 1.0 |
| Fecha | 2026-10-21 · actualizado 2026-10-22 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) · CHW-001 · DAT-001 · AUTH-001 · OPS-001 |
| Estado | Aprobada |

## Convenciones

- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan en laboratorio antes de producción.
- Toda tarea de código incluye su prueba; ningún cambio se cierra sin la verificación indicada.

## Fase 0 · Fundaciones

- [ ] **T-01 · Confirmar el estado del repositorio y la app**
  - Verificar `apps/`, `packages/`, pnpm 12 + Turborepo y scripts raíz.
  - Verificación: `pnpm turbo run build` existe y `apps/admin` no existe todavía.
  - Evidencia: salida de `pnpm -v`, `turbo --version` y `git status`.

- [ ] **T-02 · Crear `apps/admin` y su entrega**
  - Paquete propio del monorepo, `Dockerfile`, router de Traefik y entradas en `cd.yml`/`deploy.yml`.
  - Verificación: la imagen se construye y el router responde en un entorno local.
  - No se alteran routers existentes (D-10).

- [ ] **T-03 · Crear schemas y roles de base**
  - Schema `admin` en Router y celdas; roles `mocter_migrator`, `mocter_admin`, `mocter_landing`, `mocter_auth`. Todas las tablas llevan `created_at`, `updated_at`, `created_by`, `updated_by` (y `deleted_at`/`deleted_by` donde aplica soft delete) según la directiva de base de datos y DAT-001 RF-10.9.
  - Verificación: `mocter_admin` no tiene DDL ni `BYPASSRLS`; `mocter_landing` solo inserta solicitudes de contacto y no accede al schema `admin`; en una celda dedicada, `mocter_auth` solo accede a `users` e `identities`.
  - Criterios 26 y RF-09.3 (D-25).

- [ ] **T-04 · Definir las dos líneas de migración**
  - Una para el Router Global y otra para las celdas; esquema idéntico entre celdas.
  - Verificación: aplicar la línea de celda dos veces es idempotente; el Router y la celda no comparten historia.
  - RF-10.9 y RF-10.10.

## Fase 1 · Identidad, tenencia y alta

- [ ] **T-05 · Implementar el ancla de identidad**
  - `users` global con correo único, `email_verified_at`, `identity_location` y `active_client_id` nullable.
  - Verificación: Google entra verificado; correo/contraseña queda pendiente hasta confirmar; el login resuelve la ubicación antes de verificar; un usuario sin inquilino tiene `active_client_id` nulo.
  - RF-01.10, RF-14.6, AUTH-D-01, AUTH-D-05, D-29.

- [ ] **T-06 · Implementar `clients` y `owner_user_id`**
  - `owner_user_id` no nulo y único entre clientes no dados de baja, `contact_email`, `locale` (por defecto `es`), `currency` (ISO 4217, por defecto `COP`), `phone`, `website_url`, `tax_id`, dirección, `industry`, `timezone`, `logo_media_id`, `social_links`, ciclo de vida y `client_routing`.
  - Verificación: insertar un cliente sin dueño falla; un usuario no puede ser dueño de dos inquilinos no dados de baja; el alta manual crea o vincula el usuario en la misma operación; el alta se completa sin `phone`, NIT ni dirección.
  - RF-01.6, RF-01.10, RF-01.11, RF-11.5, RF-05.9, criterio 31, D-29.

- [ ] **T-07 · Implementar onboarding guiado**
  - Asistente de menos de 5 minutos, interrumpible, reejecutable; crea el cliente al completar los datos del negocio.
  - Verificación: el avance se recupera tras interrumpir; el cliente no existe antes de completar el paso de negocio; un usuario con membresía activa o dueño de un cliente no dado de baja no crea otro inquilino.
  - RF-14.1 a RF-14.4, RF-14.6.

- [ ] **T-08 · Implementar invitaciones**
  - Invitación a inquilino existente y a comunidad; token con vencimiento.
  - Verificación: una invitación vencida no crea membresía; el invitado entra como `tenant_agent`; se rechaza si ya tiene una membresía activa en otro inquilino; el `tenant_owner` es único.
  - RF-08.6, RF-08.4, RF-14.7, D-31.

- [ ] **T-09 · Implementar aprovisionamiento de celdas**
  - Alta de instancia, migración, registro en `cells` y `client_routing`, y caché en Redis.
  - Verificación: la celda 101 abre una nueva; una consulta sin resolución de celda se rechaza.
  - RF-10.5, RF-10.7, RF-10.15.

## Fase 2 · Planes y Chatwoot

- [ ] **T-10 · Implementar planes y límites**
  - `plans`, `plan_limits`, `client_plan_overrides`, `client_plans`; `clients.plan_id` vigente; validación antes de persistir. `tenant_owner` único y `tenant_agent` según `max_tenant_agents`; free con 1 owner y 0 agents.
  - Verificación: un exceso de productos, `tenant_agent` o bytes se rechaza con mensaje explícito; la venta manual asigna el plan y el autoservicio parte del free.
  - RF-04.1 a RF-04.4, RF-04.7.

- [ ] **T-11 · Implementar el aprovisionamiento de Chatwoot**
  - Correlación `client_id` ↔ cuenta, usuario de servicio, token cifrado, SSO y máquina de estados.
  - Verificación: reintentar no duplica cuenta ni usuario; `failed` vuelve a `provisioning`; `active` habilita SSO.
  - RF-02.2, RF-03.1 a RF-03.5.

- [ ] **T-12 · Implementar la correlación y el estado**
  - `chatwoot_accounts` con idempotencia, último error y marca de sincronización.
  - `tenant_labels`: espejo de las etiquetas de Chatwoot con upsert idempotente por `(client_id, chatwoot_label_id)`, origen (`chatwoot_default`/`chatwoot_custom`/`mocter_custom`) y gestión desde Mocter (crear, editar, archivar) con escritura por API a Chatwoot.
  - Verificación: dos llamadas concurrentes con la misma clave producen una sola cuenta; dos sincronizaciones de la misma etiqueta producen una sola fila; una etiqueta creada en Mocter aparece en Chatwoot y una borrada en Chatwoot queda archivada en el espejo.
  - RF-03.2, RF-03.6.

## Fase 3 · Productos, archivos y sincronización

- [ ] **T-13 · Implementar productos y embeddings**
  - `products` y `product_embeddings` particionadas por `client_id`; atributos ERP y de feed de §9.0; `product_media` con RLS y unicidad por producto y archivo.
  - `vectorization_config` en el Router con el default de §9.0 (nombre, descripción, categoría y marca).
  - Verificación: una consulta sin `SET LOCAL app.current_client_id` no devuelve filas; la partición de 100 inquilinos se crea; la tabla expone `sku`, `gtin`, `mpn`, `condition`, `availability`, `brand` y variantes; un producto se crea solo con nombre, descripción y precio, hereda la moneda del inquilino y el resto hereda defaults (RF-05.8, RF-05.9); cambiar un atributo de la config re-embebe los productos afectados; el `prompt` nunca entra al embedding.
  - RF-05, RF-10.11, RF-10.12.

- [ ] **T-14 · Implementar el catálogo global de archivos**
  - `media_catalog` con ficha extendida (§11.2), `media_variants`, `client_media`, `product_media` (con `alt_text`), `client_usage`, SeaweedFS y deduplicación por hash; el vínculo y la cuota viven en la celda.
  - Validación restrictiva de formatos por `media_kind` (§11.1) por contenido, no por extensión; tamaño máximo por archivo (video 100 MB, imágenes 10 MB).
  - Canonicalización (§11.4): imágenes a `webp` y videos a `webm`; el origen se descarta en `ready`; variantes de canal bajo demanda.
  - Enlaces externos (§11.5): videos embed de plataformas admitidas e imágenes por URL con importación perezosa; catálogo `external_media_providers` gobernado por la plataforma.
  - Verificación: dos productos que referencian el mismo archivo comparten una sola ficha y un solo objeto; el archivo se cuenta una vez por inquilino; un `svg`, `gif` o formato no listado se rechaza con mensaje explícito; una imagen `png` subida queda almacenada como `webp` canónico y el origen se descarta; un video `mp4` genera el `webm` canónico; el hash de dedup corresponde a los bytes canónicos; un enlace externo no consume cuota y una URL con `http`, credenciales o IP privada se rechaza; la imagen externa se importa y canonicaliza en la primera entrega por canal; el `alt_text` es independiente por vínculo.
  - RF-07.1 a RF-07.6, RF-07.12 a RF-07.18.

- [ ] **T-15 · Implementar el GC por última referencia**
  - Dos fases: marcar, consultar todas las celdas, eliminar.
  - Verificación: con una celda caída no se borra; con la última referencia eliminada, el objeto se borra.
  - RF-07.7, RF-07.8.

- [ ] **T-16 · Implementar publicaciones de producto**
  - `product_shares`, versiones y estado; cualquier inquilino puede compartir.
  - Verificación: un miembro sin rol de liderazgo comparte; la publicación queda visible para su comunidad.
  - RF-08.11, RF-08.14, D-18.

- [ ] **T-17 · Implementar clonación**
  - Copia de todos los atributos, identificador nuevo, medios opcionales, adopción y política manual por defecto.
  - Verificación: el clon vive en la celda del adoptante; sin medios, no se enlaza ningún archivo; el clon sobrevive a la baja del origen.
  - RF-06.1 a RF-06.7, RF-08.16, RF-08.17.

- [ ] **T-18 · Implementar notificación y sincronización por atributo**
  - Versión nueva, notificación a adoptantes, `auto_sync` por atributo, `sync_runs`, outbox e idempotencia.
  - Verificación: con `auto_sync` apagado solo llega la notificación; con `auto_sync` encendido se actualiza solo el atributo elegido; reintentar no duplica.
  - RF-08.15, RF-08.16, D-21, D-22.

## Fase 4 · Comunidades y feed

- [ ] **T-19 · Implementar organizaciones y membresías**
  - Organización, roles (`originator`, `co_leader`, `member`), historial, índice único de membresía activa, asignación de líder por `platform_admin` y promociones en `organization_promotions`.
  - Verificación: un inquilino no puede tener dos membresías activas; un usuario no puede tener dos membresías de inquilino activas; un solo originador activo por comunidad; salir y reingresar conserva el historial; solo `platform_admin` asigna líder; una promoción no se activa sin aceptación del `tenant_owner` promovido.
  - RF-08.1 a RF-08.5, RF-08.18, D-14, D-15, D-31.

- [ ] **T-20 · Implementar admisión y gobierno**
  - Solo el `tenant_owner` del originador acepta solicitudes y promueve co-líderes; los co-líderes moderan y no admiten ni promueven. El inquilino #1 puede ser la SaaS y su `tenant_owner` puede tener rol de plataforma.
  - Verificación: un co-líder no puede aceptar una solicitud ni promover; el originador sí; un usuario con rol de plataforma y `tenant_owner` del inquilino #1 no obtiene permisos cruzados.
  - RF-01.8, RF-08.6, D-14, D-31.

- [ ] **T-21 · Implementar perfiles de compartición**
  - Nombre y correo visibles por defecto; resto opt-in; autoría del feed según el perfil.
  - Verificación: un miembro que oculta su nombre publica pseudónimamente; el liderazgo no ve chats ni clientes.
  - RF-08.9, RF-08.10, D-16, D-20.

- [ ] **T-22 · Implementar el feed y la moderación**
  - Publicaciones, estados, modos `pre`/`post`/`none`, historial de moderación, orden cronológico y por relevancia; publican `tenant_owner` y `tenant_agent`, moderan los del líder o co-líder.
  - Verificación: en `pre` nada se publica sin aprobación; en `post` se oculta o retira; solo el `tenant_owner` del originador cambia el modo; un miembro no modera.
  - RF-08.7, RF-08.8, RF-08.13, RF-08.19, D-17.

- [ ] **T-23 · Implementar métricas del liderazgo**
  - Agregación por API desde cada celda, por miembro y agregada; sin Chatwoot; `tenant_owner` del líder/co-líder ve la comunidad y `tenant_agent` solo sus propias métricas.
  - Verificación: el liderazgo ve ventas y desempeño; no ve chats, clientes ni datos operativos; el agent no ve métricas agregadas.
  - RF-08.9, D-19.

## Fase 5 · Retención y operación

- [ ] **T-24 · Implementar la retención de chats**
  - Job por plan y piso legal; borrado por API de Chatwoot; auditoría.
  - Verificación: una conversación vencida se elimina; no queda copia en Mocter; el piso legal no se puede bajar.
  - RF-04.5, RF-04.6, D-27.

- [ ] **T-25 · Implementar la purga de adjuntos**
  - Borrado de blobs al eliminar la conversación; limpieza de huérfanos si Chatwoot no los borra.
  - Verificación: no queda blob huérfano en ActiveStorage.
  - RF-07.11, D-28, criterio 30.

- [ ] **T-26 · Implementar archivo legal opcional**
  - Exportación cifrada a R2, retención propia y clave fuera del bucket.
  - Verificación: el archivo se restaura con la clave; sin plan de archivo legal no se exporta nada.
  - D-27.

## Fase 6 · Interfaz

- [ ] **T-27 · Implementar i18n y temas**
  - Textos fuera de componentes; idioma por usuario, por inquilino (`clients.locale`) y región; conjunto inicial ES/EN; tema claro/oscuro con preferencia persistida.
  - Verificación: ningún texto visible incrustado; ambos temas cumplen contraste; un inquilino sin preferencia de usuario resuelve `clients.locale`; la cuenta de Chatwoot recibe el locale solo si la API 4.19 lo expone (se valida en laboratorio).
  - RF-11, RF-12.

- [ ] **T-28 · Implementar marca blanca**
  - Tokens de identidad visual por plan; validación de contraste; restauración en una acción.
  - Verificación: un color inválido se rechaza con mensaje; sin plan no se accede a la personalización.
  - RF-15.

- [ ] **T-29 · Implementar la simplicidad de las vistas**
  - Una acción principal por vista; estados vacío, carga y error con recuperación.
  - Verificación: revisión de cada pantalla contra RF-13; ninguna reproduce la densidad de Chatwoot.
  - RF-13.

## Fase 7 · Verificación y aceptación

- [ ] **T-30 · Verificar seguridad de roles y RLS**
  - `mocter_admin` sin DDL ni `BYPASSRLS`; landing sin acceso al schema `admin`; celdas con `SET LOCAL`; roles de plataforma sin acceso rutinario a chats ni datos operativos, con break-glass auditado.
  - Verificación: pruebas negativas por rol y por tabla; `platform_sales` no accede a chats; todo break-glass deja registro en `audit_log`; una segunda membresía activa por usuario se rechaza aunque esté en otra celda o llegue en paralelo.
  - Criterio 26, RF-01.10, RF-10.11, D-25, D-31.

- [ ] **T-31 · Verificar el aislamiento entre celdas**
  - Sin FK entre planos; referencias solo por identificador; consultas siempre resueltas por routing.
  - Verificación: ninguna consulta cruza celdas; una celda no puede leer datos de otra.
  - RF-10.7, RF-10.8.

- [ ] **T-32 · [LAB] Verificar la API de borrado de Chatwoot**
  - Determinar si borra mensajes sueltos o solo conversaciones completas.
  - Verificación: el resultado se documenta en `design.md` §16; si no borra mensajes, se ajusta el job a conversación completa.
  - D-27.

- [ ] **T-33 · [LAB] Prueba de carga de RLS y particiones**
  - 100 inquilinos por celda, consultas típicas y GC.
  - Verificación: latencia y planes de ejecución dentro del objetivo; sin scans completos por falta de índice.
  - RF-10.11, RF-10.12, RF-10.15.

- [ ] **T-34 · Verificar los criterios de aceptación**
  - Recorrer los 38 criterios de `requirements.md` §5.
  - Verificación: cada criterio tiene evidencia de prueba o queda marcado como pendiente con motivo.
  - §5 completo.

- [x] **T-35 · [HUMANO] Aprobar ADM-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; aprobar o registrar correcciones.
  - Verificación: estado `Aprobada` en `.agents/AGENTS.md` §6 y en la cabecera de la spec.
