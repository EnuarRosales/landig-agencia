# ADM-001 · Requisitos · mocter-admin — núcleo administrativo de inquilinos

| Atributo | Valor |
|---|---|
| ID | ADM-001 |
| Versión | 1.4 |
| Estado | Aprobada |
| Fecha | 2026-10-21 · actualizado 2026-10-27 |
| Documentos | `requirements.md` (este) · `design.md` · `tasks.md` |
| Depende de | CHW-001 (inventario técnico de Chatwoot) · DAT-001 (arquitectura de datos) · AUTH-001 (autenticación) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |

## 1. Propósito

`mocter-admin` reemplaza a Appsmith y pasa a ser el núcleo administrativo de los inquilinos de Mocter. Es el **único punto de entrada** del usuario: inicia sesión una vez y desde un menú accede a todas las capacidades que le corresponden, incluidas las de Chatwoot habilitadas según su plan. Los inquilinos se crean manualmente por un gestor de ventas o por **autogestión** del propio inquilino.

La landing page no forma parte de esta aplicación: permanece pública, sin autenticación y optimizada para tráfico orgánico.

## 2. Alcance

### Incluye

- Identidad del inquilino y su ciclo de vida.
- Alta manual (gestor de ventas) y alta por autogestión.
- Aprovisionamiento y sincronización hacia Chatwoot por sus APIs.
- Entrada única con SSO hacia Chatwoot.
- Habilitación de capacidades por plan.
- Usuarios, roles y acceso del inquilino.
- Productos con atributos vectorizados.
- Clonación y sincronización de productos entre inquilinos.
- Archivos multimedia con referencia compartida y borrado por última referencia.
- Topología de comunidades u organizaciones: liderazgo plural, pertenencia única por inquilino, admisión y reingreso, feed moderado y producto compartido con configuración.
- Restricciones de plan.

### Excluye

- La operación de conversaciones de Chatwoot (bandeja, mensajes, contactos operativos); Mocter la presenta embebida en un iframe, no la implementa.
- Código y capacidades enterprise de Chatwoot.
- Modificación del esquema o de la base de datos de Chatwoot.
- Mensajería privada entre miembros: el feed es el único canal de interacción de esta versión.
- La landing page y su tráfico orgánico. El acceso a `mocter-admin` (para SaaS e inquilinos) se realiza desde un nuevo botón en el header de la landing contiguo a «Solicitar demo».

## 3. Actores

| Actor | Rol |
|---|---|
| Gestor de ventas | Crea inquilinos manualmente |
| Inquilino | Se auto-registra y administra su propia cuenta |
| Inquilino originador (líder principal) | Crea y administra la comunidad, admite miembros y designa co-líderes |
| Co-líder de comunidad | Ejecuta la moderación del feed según la política del originador |
| Miembro de comunidad | Decide qué datos comparte, publica en el feed, comparte y adopta productos |
| Administrador de plataforma | Opera planes y restricciones |
| Contacto final | Cliente del inquilino; su maestro de datos pertenece a `mocter-core`, no a Chatwoot |

## 4. Requisitos funcionales

### RF-01 · Identidad y tenencia

| ID | Requisito |
|---|---|
| RF-01.1 | Cada inquilino tiene un `client_id` (UUIDv7) como clave de tenencia, originado en `clients.id` y copiado en las tablas hijas; no se genera un `client_id` nuevo por tabla. |
| RF-01.2 | El inquilino tiene ciclo de vida explícito con estados de alta, activo, suspendido y baja. |
| RF-01.3 | El alta por gestor de ventas y el alta por autogestión producen el mismo resultado. |
| RF-01.4 | Chatwoot mantiene su propia instancia PostgreSQL y `mocter-admin` la suya. La correlación entre ambos se limita a identificadores y no hay clave foránea entre bases. La distribución interna de `mocter-admin` se define en RF-10. |
| RF-01.5 | Toda tabla con datos de inquilino lleva `client_id` no nulo e índice compuesto que comienza por esa columna. |
| RF-01.6 | El inquilino tiene un usuario dueño obligatorio, referenciado por `owner_user_id`. No existe inquilino sin dueño. El alta manual por un usuario administrativo de la SaaS exige crear y vincular ese usuario en la misma operación. |
| RF-01.7 | El usuario dueño es el ancla de identidad del inquilino: el Router Global conserva su correo y el puntero de ubicación, y los roles y permisos se resuelven por la relación con el inquilino. Las credenciales y secretos viven donde AUTH-D-01 define. |
| RF-01.8 | El inquilino #1 es la propia SaaS: sus canales de atención y su comunidad se operan con la misma plataforma que se ofrece a los demás. Un usuario con rol de plataforma puede ser simultáneamente `tenant_owner` de ese inquilino y líder de su comunidad; los scopes de plataforma, inquilino y comunidad son independientes. |
| RF-01.9 | La plataforma separa funciones: `platform_owner` define RBAC y el catálogo de planes; `platform_sales` crea inquilinos por venta manual, crea el `tenant_owner` inicial y asigna el plan; `platform_admin` opera el ciclo de vida, gestiona usuarios de plataforma con rol `platform_sales` y asigna líderes de comunidad. Ningún rol de plataforma accede rutinariamente a chats ni a datos operativos; ese acceso es break-glass auditado. |
| RF-01.10 | Un usuario tiene como máximo una membresía activa de inquilino. `users.active_client_id` es el puntero global nullable que la garantiza; el alta de una segunda membresía se rechaza. La reserva del puntero es atómica y una segunda alta concurrente también se rechaza. La membresía y su historial viven en `tenant_users`; el puntero se actualiza en la misma operación de alta, salida o baja. |

### RF-02 · Entrada única y acceso

| ID | Requisito |
|---|---|
| RF-02.1 | El usuario inicia sesión una sola vez en `mocter-admin` y accede desde un menú a todas las capacidades que le corresponden, incluidas las de Chatwoot. |
| RF-02.2 | El tránsito hacia Chatwoot se realiza por SSO nativo, sin compartir credenciales entre sistemas. Chatwoot se presenta **embebido en un iframe** dentro de la shell de `mocter-admin`; el usuario nunca abandona el dominio de Mocter y no existe redirección de nivel superior. |
| RF-02.3 | La zona del inquilino expone solo las capacidades habilitadas por su plan; no reproduce la densidad de opciones de la interfaz de Chatwoot. |
| RF-02.4 | La modalidad de acceso es **iframe same-site**: Chatwoot se publica en un subdominio del mismo dominio de la plataforma (por ejemplo, `chat.mocter.co`) y la shell lo embebe. Se prohíbe abrir Chatwoot en pestaña nueva, redirigir el nivel superior o reconstruir su bandeja. La UI embebida conserva la operación de Chatwoot; Mocter no la replica. |
| RF-02.5 | El iframe solo es admisible si Chatwoot 4.19 permite ser enmarcado por los orígenes de Mocter y la sesión SSO se establece dentro del iframe. La validación de cabeceras, cookies y SSO es condición de aceptación (CHW-001 T-17/T-18, AUTH-001 T-38/T-39). |

### RF-03 · Aprovisionamiento y sincronización con Chatwoot

| ID | Requisito |
|---|---|
| RF-03.1 | El aprovisionamiento usa exclusivamente las APIs de Chatwoot. Se prohíbe escribir en su base de datos o modificar su esquema. |
| RF-03.2 | Existe una tabla de correlación `client_id` ↔ `chatwoot_account_id` con estado, clave de idempotencia, último error y marca de sincronización. |
| RF-03.3 | Cada inquilino tiene su propio usuario de servicio con token, usado para las operaciones que la Platform API no cubre. |
| RF-03.4 | La escritura es unidireccional desde `mocter-admin`. De Chatwoot solo regresan identificadores y estado. |
| RF-03.5 | Las capacidades de pago de Chatwoot no se habilitan ni se usan; el directorio `enterprise/` se conserva en el fork sin activarse. |
| RF-03.6 | Las etiquetas de Chatwoot se sincronizan con un objeto de propiedad del inquilino (`tenant_labels`, en su celda) que hereda `id`, `title`, `description`, `color` y `show_on_sidebar`. El inquilino agrega etiquetas personalizadas además de las predeterminadas de Chatwoot y las gestiona desde Mocter (crear, editar, archivar), y el sistema configura Chatwoot por detrás. La sincronización es idempotente y marca el origen de cada etiqueta (`chatwoot_default`, `chatwoot_custom`, `mocter_custom` o `mocter_default`). |
| RF-03.7 | Mocter siembra por inquilino un conjunto mínimo de etiquetas reservadas para la clasificación de leads, con `origin = mocter_default`: `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`. No se renombran ni se eliminan; el clasificador de BOT-002 devuelve exactamente uno de esos slugs. |
| RF-03.8 | El inquilino configura el **contexto de atención de su negocio**: métodos de pago, política de devoluciones, garantía, política de envío (gratis o costo por defecto), tiempos de entrega por ciudad y grupo de producto, transportadoras admitidas, preguntas frecuentes y mensaje de cierre. El bot lo consume como contexto en sus atenciones (BOT-002). |

### RF-04 · Planes y restricciones

| ID | Requisito |
|---|---|
| RF-04.1 | El plan define límites de: cantidad de productos, cantidad de usuarios del inquilino (un `tenant_owner` fijo y `tenant_agent` según el plan), cantidad de imágenes por producto, cantidad de audios, cantidad de videos, cantidad de archivos PDF, retención de chats en días y almacenamiento en bytes. |
| RF-04.2 | Los límites se validan en `mocter-admin` antes de persistir o replicar. Chatwoot no los hace cumplir sin código enterprise. |
| RF-04.3 | Un consumo que supera un límite se rechaza, no se persiste y se informa con un mensaje explícito. |
| RF-04.4 | El almacenamiento facturado es la suma de tamaños de archivos distintos referenciados por el inquilino, contando los bytes almacenados (original de imagen/audio/PDF o canónico de video). El almacenamiento físico es el de objetos distintos en SeaweedFS; las variantes de imagen generadas por imgproxy no suman. La diferencia es margen del proveedor. |
| RF-04.5 | La retención de chats puede tener un piso legal mínimo; un override no puede reducirlo. |
| RF-04.6 | La retención se ejecuta desde `mocter-admin` por la API de Chatwoot: al vencer, las conversaciones y sus mensajes se eliminan. No hay archivo por defecto; un plan con archivo legal exporta cifrado a R2 con retención propia. |
| RF-04.7 | El `tenant_owner` es único por inquilino en todos los planes. El plan free incluye un solo `tenant_owner` y ningún `tenant_agent`; los demás planes definen la cantidad de `tenant_agent` en su oferta. En venta manual, `platform_sales` asigna el plan; en autogestión, el `tenant_owner` elige del catálogo y el plan free es el valor por defecto. |
| RF-04.8 | Los planes separan **límites numéricos** (`plan_limits`) de **capacidades** (`plan_features`). Las dimensiones y las capacidades se definen en catálogos de plataforma (`plan_dimensions`, `plan_features`); cada plan declara sus valores en `plan_feature_values` y los overrides por inquilino aplican a ambos. |
| RF-04.9 | El catálogo `plans` tiene `id` UUID, `code` único (slug estable), `name`/`description` y `marketing_features` en JSONB `{es,en}`, `status` (`draft`/`active`/`retired`), `is_public`, `is_popular`, `sort_order`, `trial_days`, `grace_days`, `billing_cycles`, `price_monthly_cents`, `price_annual_cents` y `currency`. `marketing_features` es solo presentación; el enforcement usa `plan_limits`/`plan_feature_values`. Las capacidades iniciales incluyen marca blanca por niveles, dominio custom, archivo legal, comunidad/feed, exportación y acceso API; la **asistencia AI es transversal y no se gatea** (AI-001 D-05). |

### RF-05 · Productos

| ID | Requisito |
|---|---|
| RF-05.1 | Los atributos del producto se vectorizan. |
| RF-05.2 | La tabla de productos se particiona por `client_id` con `PARTITION BY LIST`. |
| RF-05.3 | Los objetos que no requieren vectorización no se particionan y solo llevan `client_id`. |
| RF-05.4 | Un producto pertenece a un único inquilino. |
| RF-05.5 | Los atributos del producto son de tipo ERP y siguen el vocabulario de los feeds de Google Merchant Center y Meta: identificadores (`sku`, `gtin`, `mpn`, `item_group_id`), condición y disponibilidad con los valores soportados por los feeds, marca, precio con moneda ISO 4217, categoría propia y `google_product_category`, variantes nombradas (`color`, `size`, `material`, `gender`, `age_group`, `pattern`) y atributos libres en JSONB. |
| RF-05.6 | Cada producto registra su origen de ingesta (`source_system`, `source_external_id`, `source_url`) para las integraciones futuras (Droppi, Shopify, Effi, MercadoLibre y similares); la dupla `(client_id, source_system, source_external_id)` es única cuando el origen no es manual. |
| RF-05.7 | La composición del texto que se vectoriza es administrable por el equipo Mocter (`vectorization_config`) y parte con una vectorización por defecto: nombre, descripción, categoría y marca. El prompt de venta no se vectoriza. |
| RF-05.8 | Los únicos atributos obligatorios de un producto son nombre, descripción y precio de venta. El resto es opcional o tiene valor por defecto (`kind = physical`, `condition = new`, `availability = in_stock`, `status = draft`); no se genera fricción de ingreso. |
| RF-05.9 | La moneda del catálogo se define por inquilino: `clients.currency` en ISO 4217, por defecto `COP` para la operación inicial en Colombia y editable en el onboarding. El producto hereda esa moneda y puede sobrescribirla solo para vender en otra moneda. |
| RF-01.11 | El perfil del inquilino lleva sus datos de contacto y comerciales: `phone` (E.164), `website_url`, `tax_id` (NIT), dirección (`country`, `state`, `city`, `address_line`, `postal_code`), `industry`, `timezone` (por defecto `America/Bogota`), `logo_media_id` y `social_links` JSONB. Son opcionales para no generar fricción de alta; el `phone` es un dato de contacto del negocio usado en la comunidad y no es el registro del canal de WhatsApp, que vive en Chatwoot (CHW-001). |

### RF-06 · Clonación y sincronización de productos

| ID | Requisito |
|---|---|
| RF-06.1 | Un inquilino puede clonar un producto de otro inquilino. El clon es un producto nuevo, con identificador nuevo y propio. |
| RF-06.2 | El clon guarda referencia al producto de origen para habilitar la sincronización de atributos. |
| RF-06.3 | La clonación es opcional: el inquilino decide si clona. |
| RF-06.4 | Conservar el vínculo con el origen es opcional: puede clonarse sin referencia. |
| RF-06.5 | La sincronización de atributos desde el origen es opcional y desactivable en cualquier momento. |
| RF-06.6 | El origen puede clonarse con sus archivos multimedia o sin ellos, a elección del inquilino. |
| RF-06.7 | La baja del producto de origen no elimina los clones ni interrumpe su operación. |

### RF-07 · Archivos multimedia

| ID | Requisito |
|---|---|
| RF-07.1 | El almacenamiento no duplica archivos: los productos que comparten un archivo comparten una referencia única. |
| RF-07.2 | Al desvincular un archivo de un producto, el sistema verifica si otro producto lo sigue referenciando. |
| RF-07.3 | El archivo se elimina del almacenamiento únicamente cuando no queda ningún producto que lo referencie. |
| RF-07.4 | El borrado físico se decide por ausencia de referencias, no por un contador de uso. |
| RF-07.5 | El catálogo de archivos es global y vive en el Router Global. Contiene solo la ficha técnica: hash de contenido, clave de almacenamiento, tamaño y tipo. No contiene inquilino ni atributos de negocio. |
| RF-07.6 | El vínculo entre un producto y un archivo vive en la celda del producto. |
| RF-07.7 | La verificación de referencias previa a un borrado consulta todas las celdas que puedan referenciar el archivo. Ninguna celda decide sola el borrado de un archivo compartido. |
| RF-07.8 | El borrado no es inmediato: se ejecuta solo cuando la verificación global confirma que no queda ninguna referencia. |
| RF-07.9 | Existen dos dominios de archivos: multimedia de producto, propiedad de Mocter, con catálogo global, **SeaweedFS v4.51** (S3 interno) + **imgproxy v4.0.20** para entrega optimizada con URLs firmadas, deduplicación por hash, cuota y borrado por ausencia de referencias; y adjuntos de conversación, propiedad de Chatwoot ActiveStorage, sin deduplicación, sin cuota de producto y con política propia. SeaweedFS e imgproxy son **servicios de plataforma ya aprovisionados** en desarrollo, pruebas y producción; esta spec solo define su uso. |
| RF-07.10 | Los adjuntos de Chatwoot no se cuentan en la cuota de producto y no se eliminan desde el GC de producto. |
| RF-07.11 | Los adjuntos de Chatwoot siguen la retención de su conversación y no tienen plazo propio. Al borrarse la conversación se purgan sus blobs de ActiveStorage; si Chatwoot no los elimina, `mocter-admin` completa la limpieza. |
| RF-07.12 | Los formatos de archivo admitidos como **ingreso** son restrictivos por tipo de medio: imágenes `webp`, `avif`, `png`, `jpeg`; audio `opus`, `aac`, `mp3`; video `mp4` (H.264 + AAC) y `webm` (VP9/AV1 + Opus); documentos `pdf`. Todo otro formato se rechaza al subir con mensaje explícito; la validación es por contenido, no por extensión. |
| RF-07.13 | La ficha técnica del catálogo agrega `mime_type`, `original_filename`, `source_format`, dimensiones (`width`, `height`) para imágenes, `duration_ms` para audio y video, y `processing_status` (`uploaded`/`processing`/`ready`/`failed`/`external`). El peso máximo por archivo se configura por plataforma. |
| RF-07.14 | El texto alternativo (`alt_text`) es del vínculo producto-archivo (`product_media`), no del catálogo global: un mismo archivo puede tener distinto alt text por producto. Las variantes de imagen (thumbnail, preview, WebP/AVIF a medida) se generan **al vuelo con imgproxy**; `media_variants` queda solo para variantes que requieren transcodificación (p. ej. `mp4_compat`). |
| RF-07.15 | **Preservación y procesamiento:** las imágenes se guardan como **original validado** (sin conversión irreversible) y se optimizan al vuelo con imgproxy; los videos se convierten al canónico `webm` (VP9 + Opus) en worker asíncrono y el origen se descarta al llegar a `ready`; audio y PDF se guardan en su formato admitido. La deduplicación usa el hash de los bytes almacenados (original de imagen; canónico de video; original de audio/PDF). `mp4_compat` se genera bajo demanda para canales que no aceptan WebM. |
| RF-07.16 | El tamaño máximo admisible por archivo se define por plataforma: video 100 MB e imágenes 10 MB por defecto. Se valida antes de aceptar la subida. |
| RF-07.17 | En lugar de cargar un archivo, el inquilino puede definir un enlace (URL `https`) para videos de plataformas admitidas (YouTube, TikTok, Vimeo, Instagram, Facebook) o para imágenes de cualquier fuente pública. El enlace no consume cuota de almacenamiento. Las plataformas admisibles viven en un catálogo gobernado por la plataforma (`external_media_providers`). |
| RF-07.18 | Los enlaces externos se validan: `https` obligatorio, sin credenciales en la URL, sin IPs privadas ni loopback. El video externo se entrega como embed o enlace, sin transcodificar. La imagen externa se muestra por enlace y se importa (validación por contenido, sin recodificación) solo cuando un canal la entrega; desde entonces se sirve vía imgproxy y consume cuota. Si la fuente falla, el vínculo queda `failed` con aviso visible. |
| RF-07.19 | **Entrega firmada:** las imágenes públicas de producto se sirven desde `media.mocter.co` (imgproxy) con URL firmada HMAC-SHA256; el backend elige las transformaciones permitidas (tamaño/formato/calidad y `expires`). Una petición sin firma o con firma inválida recibe 403 sin procesar la imagen. Las claves las provee la plataforma y rotan con pares key/salt. Las imágenes públicas pueden usar firma de larga duración; los medios privados fuera de Chatwoot usan `expires` corto y autorización del backend. |
| RF-07.20 | **S3 interno:** SeaweedFS no se publica en Internet; solo el backend, los workers e imgproxy lo alcanzan por la red interna. El bucket `media` y las credenciales de mínimo privilegio los provee la plataforma; el navegador nunca recibe credenciales S3. |
| RF-07.21 | **Límites de transformación:** imgproxy debe operar con allowlist de opciones y estos límites de plataforma: bucket `media`, origen máximo 100 MB, dimensión resultante máxima 4096 px, cola de 100 solicitudes (al llenarse responde 429) y máximo 1 frame de animación. Con 1 frame, una imagen animada se entrega como primer frame; si se requiere animación, se sube el límite y se valida. El backend solo firma las transformaciones permitidas. |

### RF-08 · Comunidades y organizaciones

| ID | Requisito |
|---|---|
| RF-08.1 | Una organización la inicia un inquilino originador, que la administra y ejerce el liderazgo principal. El `platform_admin` asigna el rol de líder de comunidad a un inquilino; si el inquilino ya pertenece a otra comunidad, primero debe desvincularse. |
| RF-08.2 | El `tenant_owner` del originador puede promover otros inquilinos a co-líderes; el resto de los integrantes son miembros. La promoción requiere aceptación expresa del `tenant_owner` del inquilino promovido. El liderazgo es plural: originador y co-líderes. |
| RF-08.3 | Un inquilino pertenece a una sola comunidad, sin importar su rol. La restricción aplica al inquilino. Un usuario con membresía de inquilino pertenece a un solo inquilino y, por lo tanto, como máximo a la comunidad de ese inquilino; no administra varios inquilinos. |
| RF-08.4 | Quien quiera operar simultáneamente en otra comunidad necesita otra identidad de usuario y crea un inquilino nuevo con datos propios; no reutiliza ni copia los datos del inquilino activo. Un usuario no puede crear un segundo inquilino con la misma identidad. |
| RF-08.5 | El retiro de una comunidad no borra el negocio, sus datos ni los productos ya clonados. El inquilino puede reingresar por vinculación del originador o por solicitud aceptada. |
| RF-08.6 | Solo el `tenant_owner` del inquilino originador acepta solicitudes de unión y reingreso, y promueve inquilinos a co-líderes. La promoción requiere aceptación expresa del `tenant_owner` del inquilino promovido. Los co-líderes no admiten miembros ni promueven a otros. |
| RF-08.7 | El originador configura el modo de moderación del feed: previa, posterior o sin moderación. Por defecto se aplica la moderación previa. |
| RF-08.8 | El feed publica contenido de la comunidad con orden cronológico o por relevancia, y es el espacio de interacción entre miembros. |
| RF-08.9 | El liderazgo accede a métricas estadísticas de desempeño de productos activos y ventas efectivas, por miembro y agregadas. No accede a chats, clientes del inquilino ni datos operativos del negocio. |
| RF-08.10 | Cada inquilino, sin importar su rol, decide qué datos comparte con la comunidad. Por defecto comparte el nombre del inquilino y su correo electrónico de contacto; cualquier otro dato requiere habilitación explícita. La autoría en el feed sigue ese mismo perfil. |
| RF-08.11 | Cualquier inquilino puede compartir un producto con todos sus atributos y su configuración; el miembro que lo clona o sincroniza lo recibe con esos valores. |
| RF-08.12 | Toda adopción de una propuesta registra la propuesta de origen, el inquilino, el producto resultante y la fecha. |
| RF-08.13 | En modo previa, una publicación no es visible hasta que el originador o un co-líder la apruebe. En modo posterior, se publica y el liderazgo puede ocultarla o retirarla. En modo sin moderación, se publica sin revisión. |
| RF-08.14 | Compartir un producto es una decisión de cada inquilino, sin importar su rol. No todos los productos se comparten y la capacidad no es exclusiva del liderazgo. |
| RF-08.15 | Cuando quien comparte ajusta un producto compartido, los inquilinos que lo clonaron reciben una notificación. |
| RF-08.16 | La sincronización es voluntaria por defecto. Por cada producto clonado, el inquilino decide si admite actualización automática y qué atributos se actualizan; la sincronización manual permite la misma selección por atributo. La política cubre todos los atributos del producto, no solo el prompt. |
| RF-08.17 | Quien clona decide si incorpora los archivos multimedia del producto de origen. La sincronización posterior los trata como un grupo seleccionable, con la misma política por atributo. |
| RF-08.18 | Un co-líder que quiera formar su propia comunidad debe desvincularse de la comunidad actual, lo que puede hacer en cualquier momento, y solicitar su promoción a líder por los canales de atención. La promoción la resuelve `platform_admin`. |
| RF-08.19 | Publicar en el feed es una capacidad de `tenant_owner` y `tenant_agent` de cualquier inquilino. Moderar corresponde a `tenant_owner` y `tenant_agent` del inquilino líder o co-líder. |

### RF-09 · Base de datos

| ID | Requisito |
|---|---|
| RF-09.1 | Todo objeto de base de datos de `mocter-admin` cumple la directiva de PostgreSQL y Drizzle. |
| RF-09.2 | La directiva no aplica a la base de datos de Chatwoot. |
| RF-09.3 | `mocter-admin` concentra sus objetos en un schema PostgreSQL propio dentro de cada base donde escribe; el schema es la unidad de privilegios y la landing no accede a él. |

### RF-10 · Arquitectura de datos por celdas

| ID | Requisito |
|---|---|
| RF-10.1 | Existe una base PostgreSQL principal (Router Global) que es la base actual de la landing y conserva los datos del formulario de solicitud de contacto. |
| RF-10.2 | El Router Global es el plano de control: información base del inquilino, tabla de planes y los objetos de dominio global del negocio SaaS. |
| RF-10.3 | El Router Global mantiene la tabla de enrutamiento que indica en qué celda residen los datos de cada inquilino y dónde reside su identidad. |
| RF-10.4 | El plano de datos son celdas: instancias PostgreSQL independientes (`pg-celda1`, `pg-celda2`, …) que contienen los datos puntuales del inquilino, incluidos la proyección de usuarios, los productos y los vínculos de archivos multimedia. |
| RF-10.5 | Cada celda admite como máximo 100 inquilinos. Al alcanzar el límite se aprovisiona una celda nueva y las altas siguientes se enrutan a ella. |
| RF-10.6 | Un inquilino con requisito normativo de aislamiento puede recibir una celda dedicada y exclusiva. |
| RF-10.7 | Toda consulta de datos de inquilino resuelve primero su celda en el Router Global. |
| RF-10.8 | Las referencias entre planos se limitan a identificadores. No hay clave foránea entre el Router Global y una celda, ni entre celdas. |
| RF-10.9 | Todas las celdas comparten el mismo esquema, versionado por una única línea de migraciones. |
| RF-10.10 | El Router Global y las celdas tienen líneas de migración separadas: una por base, no una por aplicación. |
| RF-10.11 | Cada celda usa RLS habilitado y forzado (`FORCE ROW LEVEL SECURITY`) con `SET LOCAL app.current_client_id`; el rol de aplicación no tiene DDL ni `BYPASSRLS`. |
| RF-10.12 | `products` y `product_embeddings` se particionan por `client_id` con `PARTITION BY LIST`; el resto de las tablas de inquilino no se particiona y usa RLS. |
| RF-10.13 | La identidad global vive en el Router Global, salvo la celda dedicada por aislamiento (RF-10.6), y no usa RLS por `client_id`; las tablas de tenencia y la proyección `users` de cada celda sí. El rol de autenticación es dedicado. |
| RF-10.14 | El Router Global tiene un Redis 7+ dedicado para caché de enrutamiento, Pub/Sub, rate limiting y revocación de sesión; no comparte instancia con Chatwoot. |
| RF-10.15 | La capacidad nominal de una celda es 100 inquilinos; la efectiva es el primer disparador de DAT-001 (inquilinos, relaciones, HNSW o CPU). |
| RF-10.16 | La separación de `pg-control-plane` es una decisión diferida; mientras tanto, la landing y `mocter-admin` usan esquemas y roles separados en el Router Global. |

### RF-11 · Internacionalización

| ID | Requisito |
|---|---|
| RF-11.1 | La interfaz está internacionalizada desde el inicio. Ningún texto visible se escribe directamente en un componente. |
| RF-11.2 | El idioma se resuelve en este orden: preferencia del usuario; en su ausencia, el idioma del inquilino (`clients.locale`); en su ausencia, la configuración regional del navegador; con un idioma por defecto explícito. |
| RF-11.3 | Los formatos de fecha, número y moneda se resuelven según la configuración regional activa. |
| RF-11.4 | Agregar un idioma no exige reestructurar componentes; el conjunto soportado se valida por la aplicación, sin `CHECK` en la base. El conjunto inicial es Español e Inglés (`es`, `en`). |
| RF-11.5 | El idioma es un atributo del cliente: `clients.locale`, por defecto `es`, elegido en el onboarding. |

### RF-12 · Tema claro y oscuro

| ID | Requisito |
|---|---|
| RF-12.1 | La interfaz soporta tema claro y oscuro. |
| RF-12.2 | El tema por defecto sigue la preferencia del sistema operativo. |
| RF-12.3 | El usuario puede fijar su preferencia y esta se conserva entre sesiones. |
| RF-12.4 | Ningún componente se aprueba con un solo tema. Ambos cumplen contraste accesible. |
| RF-12.5 | Los colores del tema son gobernados por la marca blanca cuando el plan la habilita. |

### RF-13 · Simplicidad e intuitividad

Primera ley para el desarrollo de componentes visuales.

| ID | Requisito |
|---|---|
| RF-13.1 | Toda vista se diseña partiendo de la acción principal del usuario. Lo que no la sirve no se muestra. |
| RF-13.2 | Un componente no se aprueba si exige explicación externa, ayuda contextual permanente o más de un concepto nuevo por pantalla. |
| RF-13.3 | Se prohíbe reproducir la densidad de opciones de Chatwoot. Sus capacidades se exponen como entradas de menú y la operación ocurre en su interfaz **embebida**; la shell no reimplementa la bandeja. |
| RF-13.4 | Toda pantalla declara estado vacío, estado de carga y estado de error con acción de recuperación. |

### RF-14 · Onboarding guiado

| ID | Requisito |
|---|---|
| RF-14.1 | El alta orgánica de un usuario ejecuta un asistente guiado que configura los datos del negocio y crea el inquilino. |
| RF-14.2 | El asistente se completa en menos de 5 minutos. |
| RF-14.3 | El asistente es reejecutable desde la ayuda del sistema. |
| RF-14.4 | El avance se registra por usuario y, cuando existe, por inquilino. |
| RF-14.5 | El asistente no bloquea la navegación: puede interrumpirse y retomarse. |
| RF-14.6 | Con autenticación de Google el correo se considera verificado y el asistente puede crear el inquilino. Con registro por correo, el inquilino no se crea hasta que se confirme el correo. |
| RF-14.7 | La invitación a un inquilino existente es un canal alternativo de alta, previsto para programas de fidelización y para que el liderazgo vincule miembros. |
| RF-14.8 | **Time-to-value:** al finalizar el asistente el inquilino queda **operativo**: negocio, un producto, bot con preset y canal de atención activo. Los 5 minutos son una guía de diseño, no un SLA. **WhatsApp es el canal preferido** y su conexión puede extenderse sin bloquear la operación; el widget web permite operar de inmediato. Políticas, FAQs, catálogo completo y configuración avanzada se completan después. |
| RF-14.9 | El alta se siembra con defaults de plataforma: `COP`, `es`, `America/Bogota`, etiquetas reservadas de leads, bot en ritmo natural, recordatorios apagados y políticas base. El inquilino solo edita lo que difiere del default. |
| RF-14.10 | Al cerrar el asistente se muestra una lista de **pendientes opcionales** (conectar WhatsApp, completar políticas, cargar más productos); ningún pendiente bloquea la operación ni el acceso al panel. |
| RF-14.11 | El onboarding recibe el `plan_code` elegido en la landing, resuelve `plans.code` → `plans.id` (UUID) y asigna el plan al crear el inquilino. Si el usuario abandona, el avance se conserva y puede retomarse sin crear un inquilino vacío. |

### RF-15 · Marca blanca (white-labeling)

| ID | Requisito |
|---|---|
| RF-15.1 | El motor de marca blanca permite al inquilino personalizar la identidad visual de su espacio. |
| RF-15.2 | La capacidad se habilita por plan. Un inquilino sin la capacidad no accede a la personalización. |
| RF-15.3 | La personalización altera los tokens de identidad visual, no la estructura ni el comportamiento de los componentes. |
| RF-15.4 | Todo valor personalizado se valida contra las reglas de contraste accesible antes de aplicarse. Un valor inválido se rechaza con mensaje explícito. |
| RF-15.5 | La configuración visual por defecto de la plataforma se restaura con una acción única. |

### RF-16 · Bandeja de contactos de la landing

| ID | Requisito |
|---|---|
| RF-16.1 | `platform_sales` y `platform_admin` acceden a `/admin/leads` para gestionar los contactos capturados por el formulario público de la landing. |
| RF-16.2 | La bandeja lista los `leads` con paginación, búsqueda, filtros por fecha/estado y ordenamiento; muestra nombre, email, teléfono, mensaje, origen y fecha. |
| RF-16.3 | El detalle permite cambiar estado (`new`/`contacted`/`qualified`/`discarded`), asignar a un usuario de plataforma y registrar notas. |
| RF-16.4 | Cada cambio de estado, asignación o nota se audita con actor y fecha; el `lead` conserva el historial. |
| RF-16.5 | La bandeja permite exportar el listado filtrado a CSV con los campos visibles. |
| RF-16.6 | El rol `mocter_landing` sigue limitado a `INSERT`; solo `platform_sales`/`platform_admin` leen y actualizan. Un usuario de inquilino recibe 403. |
| RF-16.7 | La UI cumple i18n es/en y DSN-001 (tabla estándar y estados vacíos/error). |

## 5. Criterios de aceptación

1. Ninguna operación de `mocter-admin` escribe en la base de datos de Chatwoot ni altera su esquema.
2. Existe la tabla de correlación con estado, idempotencia y marca de sincronización.
3. Un archivo compartido por varios productos, incluso de celdas distintas, se elimina del almacenamiento solo después de desvincularse del último.
4. Los límites de plan definidos en RF-04.1 se validan antes de persistir y su exceso se rechaza.
5. `products` y `product_embeddings` están particionadas por `client_id`; el resto de las tablas de inquilino no se particiona y usa RLS; toda tabla de inquilino tiene `client_id` no nulo.
6. Toda tabla y toda columna no evidente tienen comentario en la base.
7. Un clon sin referencia sobrevive a la baja del origen.
8. La clonación puede realizarse con y sin archivos multimedia.
9. Ninguna consulta de datos de inquilino se ejecuta sin haber resuelto antes su celda en el Router Global.
10. Una celda con 100 inquilinos no recibe altas nuevas: la siguiente alta se enruta a una celda nueva o a una celda dedicada; también se abre una celda si se cumple antes otro disparador de DAT-001 (relaciones, HNSW o CPU).
11. Ningún componente visual se aprueba con un solo tema ni con texto literal incrustado.
12. El onboarding se completa en menos de 5 minutos y puede retomarse tras interrumpirse.
13. La personalización de marca blanca se rechaza íntegra cuando el plan no la habilita.
14. Los adjuntos de Chatwoot no se cuentan en la cuota de producto ni se eliminan desde el GC de Mocter.
15. Un inquilino no puede tener dos vínculos activos de comunidad; un usuario con membresía de inquilino pertenece a un solo inquilino y, como máximo, a su comunidad. Un usuario de plataforma puede ser `tenant_owner` de un único inquilino, por ejemplo el #1, pero no de dos.
16. Solo el originador acepta solicitudes de unión y reingreso; un co-líder no puede admitir miembros.
17. Ningún miembro del liderazgo accede a chats, clientes ni datos operativos del negocio; solo métricas y datos compartidos por el inquilino.
18. El modo de moderación del feed se aplica por comunidad, por defecto es previa y solo el originador puede cambiarlo. En previa, nada se publica sin aprobación; en posterior, el liderazgo puede ocultar o retirar; en sin moderación, se publica directamente.
19. Un producto compartido conserva todos sus atributos y su configuración al clonarse o sincronizarse.
20. Por defecto, la comunidad ve el nombre del inquilino y su correo electrónico de contacto; cualquier otro dato exige habilitación explícita.
21. Cualquier inquilino puede compartir productos; la capacidad no es exclusiva del liderazgo.
22. Al ajustarse un producto compartido, los inquilinos que lo clonaron reciben notificación.
23. La sincronización de un clon es voluntaria por defecto y respeta la selección de atributos, tanto en la actualización automática como en la manual.
24. La incorporación y la sincronización de archivos multimedia son decisiones explícitas de quien clona.
25. `mocter-core` se ejecuta dentro de `mocter-admin`; no existe una tercera instancia de base ni un servicio separado para el maestro de contactos.
26. `mocter-admin` escribe solo en su schema; su rol de ejecución no tiene DDL y la landing no puede leer ni escribir en ese schema.
27. El alta con Google crea el inquilino durante el onboarding sin confirmación adicional de correo; el alta por correo no lo crea hasta confirmar el correo.
28. La invitación sigue disponible como canal alternativo de alta para fidelización y vinculación de miembros.
29. Al vencer la retención, la conversación y sus mensajes se eliminan de Chatwoot por API; no queda copia en Mocter salvo el archivo legal cifrado del plan, con su propia retención.
30. Al borrarse una conversación, sus adjuntos se eliminan con ella; no queda blob huérfano en ActiveStorage.
31. Ningún inquilino existe sin usuario dueño; el alta manual falla si no se crea y vincula el usuario.
32. El `tenant_owner` es único por inquilino; el plan define la cantidad de `tenant_agent`; el plan free no admite `tenant_agent`.
33. Solo `platform_admin` asigna el rol de líder de comunidad; la promoción a co-líder requiere aceptación del `tenant_owner` del inquilino promovido.
34. Un co-líder que quiera formar comunidad se desvincula y solicita la promoción por los canales de atención; la promoción la resuelve `platform_admin`.
35. Un usuario con rol de plataforma puede ser `tenant_owner` del inquilino #1 y líder de su comunidad sin conflicto de scopes.
36. Publican el feed `tenant_owner` y `tenant_agent` de cualquier inquilino; moderan los del inquilino líder o co-líder.
37. Los roles de plataforma separan ventas, operación y gobierno: `platform_sales` no asigna líderes ni accede a chats, y `platform_admin` no asigna planes comerciales.
38. Un usuario tiene como máximo una membresía activa de inquilino; `users.active_client_id` se anula al salir y una segunda alta con la misma identidad se rechaza.
39. `platform_sales` y `platform_admin` ven los leads de la landing en `/admin/leads`, con filtros, detalle y exportación CSV.
40. Un lead puede pasar por `new` → `contacted` → `qualified`/`discarded`, con asignación y notas auditadas.
41. Un usuario de inquilino no accede a la bandeja de leads; `mocter_landing` solo inserta y no lee.
42. Las imágenes de producto se sirven con URL firmada de imgproxy; una solicitud sin firma o con opciones alteradas recibe 403; SeaweedFS no responde desde Internet.

## 6. Decisiones

### Heredadas de CHW-001

Rigen las decisiones D-01 a D-09: doble autoridad de tenencia, correlación en tabla propia, marcador de idempotencia opcional, Chatwoot como dueño del dominio operativo, sin enterprise, maestro de contactos en `mocter-core`, token de servicio por inquilino, instancias PostgreSQL separadas y la lógica de comunidades confinada a `mocter-admin`.

### Propias de ADM-001

| ID | Decisión | Justificación verificada |
|---|---|---|
| D-10 | `mocter-admin` se construye como aplicación del monorepo actual. | Verificado el 2026-10-20 sobre el repositorio: pnpm 12.14.0 con Turborepo 2.5, `apps/` y `packages/` ya organizados por paquete, y scripts raíz que despachan con `turbo run`. No hay impedimento técnico. Lo que exige trabajo nuevo es la entrega: un `Dockerfile` propio, una imagen propia, entradas propias en `cd.yml` y `deploy.yml`, y un router nuevo en Traefik. R-03 prohíbe alterar la imagen y los routers existentes, no crear nuevos, de modo que la adición no la viola. |
| D-11 | El esquema se organiza por base de datos, no por aplicación. | El Router Global es la base que ya usa la landing, y `mocter-admin` también escribe en ella. Dos aplicaciones sobre una misma base no pueden tener dos historias de migración: se genera una línea para el Router Global y otra para las celdas (RF-10.9, RF-10.10). |
| D-12 | El almacén de identidad vive en el Router Global. Un inquilino con requisito normativo de aislamiento recibe una celda dedicada que además contiene su identidad; el Router Global conserva solo el puntero de enrutamiento, sin credenciales ni secretos. | El correo único global, la vinculación de cuentas y un solo camino de autenticación se resuelven en un único lugar. La ubicación se resuelve antes de autenticar, de modo que el módulo de identidad debe soportar ambas ubicaciones desde el diseño y no como excepción posterior. Corresponde a AUTH-D-01. |
| D-13 | El catálogo de archivos es global y vive en el Router Global, con la ficha técnica únicamente. El vínculo producto–archivo vive en la celda del producto. | Permite que dos inquilinos de celdas distintas compartan el mismo archivo sin duplicar almacenamiento y sin que ninguna celda pueda borrar un archivo que otra sigue usando. La ficha no atribuye el archivo a un inquilino, de modo que el plano de control no conoce el volumen de ninguno. Consecuencia asumida: el router participa en el ciclo de vida de cada archivo. |
| D-14 | El liderazgo de una comunidad es plural: el `platform_admin` asigna el rol de líder al inquilino originador; el `tenant_owner` del originador promueve co-líderes con aceptación expresa del `tenant_owner` del inquilino promovido. Solo el originador admite miembros y promueve roles; los co-líderes moderan contenido, no admiten ni promueven. Un co-líder que quiera formar comunidad debe desvincularse y solicitar la promoción por los canales de atención. | Separa la operación de la gobernanza. La asignación inicial queda en la plataforma para evitar que un inquilino se autoproclame líder; la promoción posterior queda en el originador con consentimiento del promovido, porque cambia la gobernanza de ambos negocios. Los co-líderes sostienen el feed y el acompañamiento sin poder alterar la composición de la comunidad. |
| D-15 | La pertenencia única es del inquilino y del usuario. Un usuario con membresía de inquilino pertenece a un solo inquilino y, por lo tanto, como máximo a la comunidad de ese inquilino. Un usuario de plataforma puede ser `tenant_owner` de un único inquilino, por ejemplo el #1; no puede ser miembro de otro inquilino. Si una persona quiere operar otro negocio, necesita otra identidad. El reingreso es libre por vinculación o solicitud aceptada. `users.active_client_id` es el guardián global de la regla. | La lógica de negocio de Mocter restringe la multipertenencia, aunque Chatwoot la permita técnicamente. La restricción protege la atribución de métricas y la privacidad de cada negocio, sin excepciones de scope. Un segundo inquilino nace con datos propios y otra identidad: no se copian datos del primero. |
| D-16 | La privacidad se resuelve por consentimiento del inquilino: cada uno decide qué datos comparte con la comunidad, incluidos nombre y correo electrónico de contacto. Chats, clientes del inquilino y datos operativos del negocio quedan siempre fuera del alcance del liderazgo. | Corrige la lectura anterior que prohibía incluso el nombre. La comunidad necesita identificar y contactar a sus miembros para operar y ofrecer apoyo; el límite duro sigue siendo la conversación y la cartera de clientes. La autoría del feed usa el mismo perfil, de modo que moderación y privacidad no se contradicen. |
| D-17 | El feed de comunidad es parte del alcance y su moderación es configurable por el originador: previa, posterior o sin moderación. Por defecto se aplica la previa; los co-líderes ejecutan el modo vigente. | Es el segundo mecanismo de valor, junto con el producto compartido: permite interacción entre miembros sin abrir un canal de mensajería privada. La previa por defecto protege la calidad mientras la comunidad arranca; el originador puede relajarla cuando el volumen o la confianza lo justifiquen, sin que un co-líder cambie la política. |
| D-18 | Cualquier inquilino puede compartir un producto; el clon recibe todos sus atributos y su configuración. La capacidad de compartir no es exclusiva del liderazgo. | El valor de la comunidad no depende de la jerarquía: un miembro puede aportar un producto tan valioso como el líder. No todos los productos se comparten; la decisión es de cada inquilino y el catálogo de la comunidad no se llena por obligación. |
| D-19 | La lectura del liderazgo se resuelve por agregación en `mocter-admin` con tokens de servicio por inquilino. No se crean membresías `AccountUser` en cuentas subordinadas de Chatwoot. | Cierra O-04. La opción de membresía cruzada daría lectura total de la cuenta y cruzaría planos entre celdas, contra D-09 de CHW-001 y el aislamiento de DAT-001. La agregación permite métricas y datos compartidos sin abrir chats ni clientes. |
| D-20 | Por defecto, el inquilino comparte con su comunidad el nombre y el correo electrónico de contacto. Cualquier otro dato requiere habilitación explícita. | Da un punto de partida operativo: el liderazgo puede identificar y contactar al miembro sin exponer teléfono, dirección ni datos operativos. El correo es el canal mínimo para el acompañamiento; el resto queda bajo decisión del inquilino. |
| D-21 | Toda modificación de un producto compartido notifica a los inquilinos que lo clonaron. | El clon es una copia de trabajo y el aviso permite decidir si conviene traer la mejora sin interrumpir la operación. Sin notificación, la sincronización voluntaria quedaría a ciegas y el miembro no sabría que existe una versión mejor. |
| D-22 | La sincronización de un clon es voluntaria por defecto y se define por atributo. El inquilino puede habilitar la actualización automática solo para los atributos que elija; la sincronización manual ofrece la misma selección. | El producto clonado es del miembro y puede tener personalizaciones locales. La granularidad evita que una mejora del prompt pise precios, textos o medios que el miembro ajustó. Cierra O-16 en su dimensión de producto; el mecanismo entre celdas queda para el diseño. |
| D-23 | Quien clona decide si incorpora los archivos multimedia del producto de origen. La sincronización posterior los trata como un grupo seleccionable, con la misma política por atributo. | No todos los miembros quieren asumir el almacenamiento y la operación de los medios del origen. El catálogo global deduplica por hash (D-13), así que incluir un archivo no duplica almacenamiento, pero la decisión sigue siendo del clon. Cierra O-08. |
| D-24 | `mocter-core` es la capa de dominio de `mocter-admin`: mismo despliegue y misma base. No se crea un servicio aparte ni una tercera instancia. | El único consumidor del maestro de contactos es `mocter-admin`; Chatwoot recibe una proyección. Un servicio aparte agregaría despliegue, red y consistencia distribuida sin necesidad actual. El límite se mantiene como módulo para poder extraerlo con API si aparece otro consumidor. Cierra O-05. |
| D-25 | Dentro de cada base, `mocter-admin` concentra sus objetos en un schema PostgreSQL propio. El schema es la unidad de privilegios: el rol de ejecución de admin no tiene DDL y el rol de la landing solo tiene `INSERT` sobre la tabla de solicitudes de contacto. La historia de migración sigue siendo una por base (D-11). | La separación de roles necesita una frontera que PostgreSQL imponga sin enumerar tablas una por una. Un schema propio permite conceder o revocar por namespace, deja la landing fuera de los objetos de admin y evita que un `GRANT` nuevo abra una tabla por descuido. No contradice D-11: una base puede tener varios schemas y una sola línea de migración. Cierra O-11. |
| D-26 | El alta orgánica crea primero el usuario y crea el inquilino dentro del onboarding, cuando el usuario configura los datos de su negocio. Con Google el correo se considera verificado; con correo y contraseña, el inquilino no se crea hasta confirmar el correo. La invitación queda como canal alternativo, no como requisito. | El autoservicio no debe depender de una invitación: bloquearía el canal de crecimiento. Crear el inquilino al final del recorrido evita inquilinos vacíos y asignación de recursos antes de que el negocio exista. Google ya validó el correo; el registro manual necesita la confirmación para no crear inquilinos de correos ajenos. La invitación conserva su valor para fidelización y para que el liderazgo vincule miembros. Cierra O-12. |
| D-27 | La retención de chats se ejecuta desde `mocter-admin` por la API de Chatwoot y termina en borrado, sin archivo por defecto. Un plan con archivo legal exporta cifrado a R2 con retención propia. | Chatwoot no hace cumplir la retención sin enterprise; Mocter es el dueño de la política. Anonimizar texto libre no es confiable —nombres, teléfonos y direcciones quedan en el mensaje— y archivar por defecto extiende la retención de datos personales justo cuando la política pide lo contrario. El archivo legal es una excepción contratada, cifrada y con retención propia. Queda para el diseño verificar la granularidad de borrado que expone la API. Cierra O-13. |
| D-28 | Los adjuntos de Chatwoot siguen la retención de su conversación y no tienen plazo propio. Al borrarse la conversación se purgan sus blobs de ActiveStorage; si Chatwoot no los elimina, `mocter-admin` completa la limpieza. | Un adjunto no tiene sentido sin su mensaje y conservarlo más tiempo mantiene datos personales que la política ya pidió borrar. Tampoco consumen cuota de producto (RF-07.10), porque su dominio y su ciclo de vida son de Chatwoot. Cierra O-14. |
| D-29 | El inquilino hereda como atributo obligatorio el ID del usuario dueño (`owner_user_id`). La relación permite recuperar correo, roles y permisos sin un índice adicional. El alta manual por un administrativo de la SaaS exige crear y vincular el usuario en la misma operación. | Evita complejizar el modelo con un índice HMAC separado y elimina el inquilino huérfano: todo inquilino tiene un responsable identificable. El correo y el puntero de ubicación del usuario permiten resolver la identidad antes del login; las credenciales siguen en el almacén que define AUTH-D-01. Cierra O-15. |
| D-30 | El Router Global aloja las comunidades, el feed y las publicaciones de producto compartido. Las celdas conservan los productos, los embeddings, los vínculos de archivos y los usuarios del inquilino. | La comunidad cruza inquilinos y celdas; RF-10.2 asigna al Router los objetos de dominio global y RF-10.4 deja al inquilino como dueño de sus datos. Una comunidad en la celda del originador obligaría a consultas cross-cell (RF-10.7, RF-10.8) y ataría la disponibilidad de la comunidad a una celda. Aprobada por el usuario el 2026-10-21. |
| D-31 | Los roles se separan en tres scopes independientes: plataforma (`platform_owner`, `platform_admin`, `platform_sales`), inquilino (`tenant_owner` único y `tenant_agent` según plan) y comunidad (`originator`, `co_leader`, `member`). Un usuario puede tener roles en varios scopes, pero como máximo en un inquilino; los permisos se evalúan contra el vínculo activo. El inquilino #1 es la SaaS y puede estar administrado por un usuario con rol de plataforma. | Cierra A-04: el `tenant_owner` es único y `tenant_agent` es el rol operativo del inquilino; el límite de asientos es una característica del plan. La separación impide que un rol de plataforma otorgue acceso rutinario a chats o datos de negocio: ese acceso es break-glass auditado. El caso del inquilino #1 valida el modelo multi-scope sin excepciones. |
| D-32 | Chatwoot se embebe en un **iframe same-site** dentro de `mocter-admin`; es la única modalidad de acceso. No hay redirección de nivel superior, pestaña nueva ni reimplementación de la bandeja. | El requisito del usuario es que el inquilino trabaje en una sola plataforma. El iframe conserva la operación nativa de Chatwoot (RF-13.3) y evita duplicar su UI; el SSO se completa dentro del iframe. La condición técnica es publicar Chatwoot en un subdominio del mismo dominio y validar framing, cookies y SSO en 4.19 (CHW-001 T-17/T-18, AUTH-001 T-38/T-39). |
| D-33 | La multimedia de producto usa **SeaweedFS v4.51 S3 interno + imgproxy v4.0.20 con URLs firmadas**, como servicios de plataforma ya aprovisionados. Las imágenes conservan el original y se optimizan al vuelo; el video mantiene el canónico WebM. SeaweedFS no se publica. | Separa almacenamiento de entrega, evita exponer el bucket y permite migrar a S3/R2 cambiando la configuración de plataforma. Preservar el original evita pérdida irreversible y habilita AVIF futuro; el costo es que la deduplicación de imágenes opera sobre el original, no sobre un WebP canónico. La seguridad y los límites de imgproxy se detallan en RF-07.19 a RF-07.21. |

## 7. Decisiones abiertas

No quedan decisiones abiertas en ADM-001.

Cerradas:

- O-04, el 2026-10-21: la lectura del liderazgo se resuelve por agregación en `mocter-admin`; no hay membresía `AccountUser` en cuentas subordinadas (D-19).
- O-05, el 2026-10-21: `mocter-core` es la capa de dominio dentro de `mocter-admin`, mismo despliegue y misma base, sin tercera instancia (D-24).
- O-08, el 2026-10-21: quien clona decide si incorpora los archivos multimedia del origen y la sincronización los trata como un grupo seleccionable (D-23).
- O-11, el 2026-10-21: separación de roles y schema propio de `mocter-admin`; la landing solo inserta solicitudes de contacto y no accede al schema de admin (D-25).
- O-12, el 2026-10-21: el alta orgánica crea el usuario sin inquilino y lo crea durante el onboarding; Google se considera verificado y el correo manual espera confirmación; la invitación queda como canal alternativo (D-26).
- O-13, el 2026-10-21: la retención se ejecuta desde `mocter-admin` por API de Chatwoot y termina en borrado, sin archivo por defecto; el archivo legal es una excepción cifrada en R2 con retención propia (D-27).
- O-14, el 2026-10-21: los adjuntos siguen la retención de su conversación, no tienen plazo propio ni consumen cuota de producto, y sus blobs se purgan con ella (D-28).
- O-15, el 2026-10-21: el inquilino tiene `owner_user_id` obligatorio; la relación recupera correo, roles y permisos; el alta manual exige crear el usuario, y el correo y el puntero del usuario resuelven la identidad antes del login (D-29).
- O-16, el 2026-10-21: el clon recibe todos los atributos al copiarse, notifica cada ajuste del origen y sincroniza por atributo de forma voluntaria, manual o automática según lo habilite el inquilino (D-21 y D-22).
- O-17, el 2026-10-21: la moderación del feed es configurable por el originador (previa, posterior o sin moderación) y por defecto es previa (D-17, RF-08.7 y RF-08.13).
- O-18, el 2026-10-21: por defecto se comparte el nombre del inquilino y su correo electrónico de contacto; el resto de los datos requiere habilitación explícita (D-20).

## 8. Trazabilidad

- 2026-10-20: alineación con DAT-001 (T-12): RF-04, RF-07 y RF-10 actualizados; O-07 cerrada con la fórmula de almacenamiento facturado; O-13 a O-16 abiertas.
- 2026-10-21: replanteo del modelo de comunidades por decisión del usuario. RF-08 reescrito con liderazgo plural, pertenencia única por inquilino, reingreso libre, admisión exclusiva del originador, privacidad por consentimiento, feed con moderación configurable, producto compartido por cualquier inquilino con notificación de cambios, sincronización por atributo y multimedia opcional al clonar. D-14 a D-29 agregadas; O-04, O-05, O-08, O-11, O-12, O-13, O-14, O-15, O-16, O-17 y O-18 cerradas. No quedan decisiones abiertas.
- 2026-10-21: D-30 agregada y aprobada por el usuario: el Router Global es el plano de objetos globales (comunidades, feed y publicaciones de producto compartido); los productos y sus vínculos quedan en la celda.
- 2026-10-21: roles por scopes (D-31), `tenant_owner` único y `tenant_agent` por plan, inquilino #1 SaaS, asignación del líder por `platform_admin` y promoción de co-líderes con aceptación. RF-01.8/01.9, RF-04.7, RF-08.18/08.19 y criterios 32 a 37 agregados; D-14 y RF-08.1/08.2/08.6 actualizados. A-04 de AUTH-001 cerrada.
- 2026-10-22: corrección de tenencia 1:0..1: un usuario pertenece a un solo inquilino; `users.active_client_id` es el guardián global. D-15, RF-01.10, RF-08.3/08.4, criterios 15 y 38, y D-31 actualizados. A-05 de AUTH-001 cerrada con AUTH-D-06. Se unifica el nombre físico `tenant_users`.
- 2026-10-22: ADM-001 aprobada. La revisión final corrigió el historial de `tenant_users` con `id`, alineó archivos y planes con DAT-001, agregó el acceso de `mocter_auth` a la identidad de la celda dedicada, reforzó una membresía activa y un negocio por usuario, y un solo originador por comunidad.
- 2026-10-23: internacionalización como atributo del cliente. RF-11.2 ahora resuelve el idioma por usuario → inquilino → navegador → defecto; RF-11.4 fija el conjunto inicial Español e Inglés; se agrega RF-11.5 (`clients.locale`, por defecto `es`). Reabre el alcance de T-06 y T-27.
- 2026-10-23: ajuste fino del catálogo de productos. `type` (`good`/`service`) se reemplaza por `kind` (`physical`, `digital`, `service`), que internacionaliza mejor. RF-05.5 a RF-05.7 agregan atributos ERP alineados con Google Merchant Center y Meta (`sku`, `gtin`, `mpn`, `condition`, `availability`, `brand`, variantes, `google_product_category`), origen de ingesta para integraciones futuras (Droppi, Shopify, Effi, MercadoLibre) y la vectorización administrable por el equipo Mocter (`vectorization_config`), con default nombre + descripción + categoría + marca. El prompt de venta queda fuera del embedding.
- 2026-10-23: alta mínima de productos sin fricción (RF-05.8): los únicos atributos obligatorios son nombre, descripción y precio de venta; `price_cents` deja de ser nullable y el resto hereda valores por defecto (`kind = physical`, `condition = new`, `availability = in_stock`, `status = draft`).
- 2026-10-23: la moneda no es atributo obligatorio del producto (RF-05.9): el catálogo hereda `clients.currency` (ISO 4217, por defecto `COP` para la operación inicial en Colombia), editable en el onboarding; el producto la sobrescribe solo si vende en otra moneda. Ajusta el «default USD» anterior.
- 2026-10-23: ficha de archivos completada por decisión del usuario: formatos admitidos restrictivos por tipo de medio (imágenes `webp`/`avif`/`png`/`jpeg`; audio `opus`/`aac`/`mp3`; video `mp4`/`webm`; documentos `pdf`), ficha técnica extendida (`mime_type`, `original_filename`, `width`/`height`, `duration_ms`, `processing_status`) y `alt_text` por vínculo + `media_variants` (RF-07.12 a RF-07.14).
- 2026-10-23: canonicalización de la biblioteca (RF-07.15): el ingreso admite los formatos indicados y el sistema convierte imágenes a `webp` y videos a `webm` (VP9 + Opus); el origen se descarta al llegar a `ready`. La dedup opera sobre bytes canónicos y las variantes de compatibilidad de canal (`mp4_compat`, `jpeg_compat`) se generan bajo demanda. El audio no se transcodifica.
- 2026-10-23: enlaces externos de medios (RF-07.16 a RF-07.18): tamaño máximo por archivo (video 100 MB, imágenes 10 MB, configurables), videos por URL de plataformas admitidas (YouTube, TikTok, Vimeo, Instagram, Facebook) como embed sin cuota, e imágenes por URL con importación perezosa a `webp` solo al entregar por canal. Validación https, sin credenciales y sin IPs privadas (SSRF).
- 2026-10-23: perfil comercial del inquilino (RF-01.11): `phone` (E.164, dato de contacto para la comunidad, no es el registro del canal de WhatsApp — ese vive en Chatwoot), `website_url`, `tax_id` (NIT), dirección, `industry`, `timezone` (default `America/Bogota`), `logo_media_id` y `social_links`. Todo opcional para no generar fricción. El perfil de compartición hereda `phone`, `display_name` y `contact_email` de `clients` y solo administra la visibilidad.
- 2026-10-23: CRM-001 nace para los prospectos del inquilino (fuente de verdad Mocter, Chatwoot como proyección). ADM-001 alinea: `mocter-core` materializa el maestro de contactos y el onboarding pedirá el consentimiento comercial opcional consumiendo `user_consents` de AUTH-001 (Habeas Data).
- 2026-10-23: etiquetas de Chatwoot sincronizadas con un objeto de propiedad del inquilino (RF-03.6): `tenant_labels` en la celda hereda `id`, `title`, `description`, `color` y `show_on_sidebar`; el inquilino gestiona las etiquetas desde Mocter y agrega personalizadas además de las predeterminadas de Chatwoot. El inventario de etiquetas por defecto de 4.19 se identifica en laboratorio (CHW-001).
- 2026-10-23: clasificación de leads y contexto de negocio. RF-03.7 fija el conjunto reservado `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada` (`origin = mocter_default`, no renombrable). RF-03.8 agrega el contexto de atención del negocio (pagos, devoluciones, garantía, entregas por ciudad/grupo, transportadoras, FAQs, cierre) que consume BOT-002; se modela en `client_business_info`, `shipping_carriers`, `delivery_groups`, `delivery_rules`, `product_price_tiers` y `product_faqs`.
- 2026-10-23: time-to-value. RF-14.8 a RF-14.10 definen la operación mínima en una sesión corta: negocio, un producto, bot con preset y canal de atención activo; los 5 minutos son una guía, no un SLA, y WhatsApp es el canal preferido (su conexión no bloquea). Defaults de plataforma y pendientes opcionales que no bloquean. La configuración avanzada nunca es requisito del alta.
- 2026-10-23: regla de envío (ORD-001 D-08). `client_business_info.shipping_policy` guarda la política (gratis y costo por defecto) y `products.free_shipping` / `products.shipping_cost_cents` el indicador y costo por producto. El envío es gratis solo cuando ambas condiciones coinciden.
- 2026-10-24: modelo de planes en dos capas (RF-04.8/RF-04.9): límites numéricos (`plan_limits`) + capacidades (`plan_features`) con catálogos (`plan_dimensions`, `plan_features`), metadata de plan (trial, gracia, estado, orden, ciclos) y overrides de capacidades por inquilino. La asistencia AI queda transversal a todos los planes (AI-001 D-05).
- 2026-10-25: modelo canónico de `plans` (`id uuid`, `code` slug único, `name`/`description`/`marketing_features` JSONB `{es,en}`, `status`, precios mensual/anual en centavos, `currency`); `marketing_features` es presentación y no reemplaza `plan_features`/`plan_feature_values`.
- 2026-10-23: la internacionalización se eleva a **regla general del sistema** (directiva `rules/rules-for-i18n.md`, registrada en la constitución §4.6): Español e Inglés en toda interfaz, correos y notificaciones, con Español por defecto. `clients.locale` sigue siendo el atributo por inquilino dentro de esa regla.
- 2026-10-24: acceso a Chatwoot en iframe (D-32, RF-02.4/RF-02.5). El usuario nunca abandona la shell; Chatwoot se publica en un subdominio same-site y se embebe. Se prohíben la pestaña nueva, el redirect de nivel superior y la reimplementación de la bandeja. La validación de framing, cookies y SSO en 4.19 queda como condición de aceptación en CHW-001 y AUTH-001.
- 2026-10-26: revisión del subsistema de multimedia. Se adopta **SeaweedFS S3 interno + imgproxy con URLs firmadas** para imágenes: se conserva el original validado (sin recodificación) y se generan resize/WebP/AVIF al vuelo; el video mantiene su canónico WebM y `mp4_compat`. Se fijan **SeaweedFS v4.51** e **imgproxy v4.0.20** como servicios de plataforma ya aprovisionados en desarrollo, pruebas y producción; ADM-001 solo define su uso y no documenta contenedores, compose ni variables de despliegue. SeaweedFS queda interno; solo `media.mocter.co` publica imágenes firmadas. RF-07.14, RF-07.15, RF-07.18 y RF-07.9 se ajustan; se agregan RF-07.19 a RF-07.21. La conservación de animaciones y los límites de transformación quedan como verificación de laboratorio; su configuración es responsabilidad de la plataforma.
- 2026-10-27: **ADM-001 1.4.** Se fija el bucket de producción `media` y se documentan los límites vigentes de imgproxy: origen 100 MB, resultado máximo 4096 px, cola 100 con 429 y 1 frame de animación. Con 1 frame, las animaciones se entregan como primer frame; el límite de subida de imágenes sigue en 10 MB. RF-07.20 y RF-07.21 actualizados; contexto completo en `docs/reference/production-services.md`.
