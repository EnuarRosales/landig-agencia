# ADM-001 · Requisitos · mocter-admin — núcleo administrativo de inquilinos

| Atributo | Valor |
|---|---|
| ID | ADM-001 |
| Versión | 1.0 |
| Estado | Borrador |
| Fecha | 2026-10-20 |
| Documentos | `requirements.md` (este) · `design.md` (pendiente) · `tasks.md` (pendiente) |
| Depende de | CHW-001 (inventario técnico de Chatwoot) · DAT-001 (arquitectura de datos) · AUTH-001 (autenticación) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` |

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
- Topología de comunidades u organizaciones.
- Restricciones de plan.

### Excluye

- La operación de conversaciones de Chatwoot (bandeja, mensajes, contactos operativos).
- Código y capacidades enterprise de Chatwoot.
- Modificación del esquema o de la base de datos de Chatwoot.
- Las funcionalidades sociales entre miembros de una comunidad: alimentan el modelo, no esta versión.
- La landing page y su tráfico orgánico.

## 3. Actores

| Actor | Rol |
|---|---|
| Gestor de ventas | Crea inquilinos manualmente |
| Inquilino | Se auto-registra y administra su propia cuenta |
| Líder de comunidad | Propone productos y lee los inquilinos bajo su liderazgo |
| Miembro de comunidad | Adopta propuestas de productos |
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

### RF-02 · Entrada única y acceso

| ID | Requisito |
|---|---|
| RF-02.1 | El usuario inicia sesión una sola vez en `mocter-admin` y accede desde un menú a todas las capacidades que le corresponden, incluidas las de Chatwoot. |
| RF-02.2 | El tránsito hacia Chatwoot se realiza por SSO nativo, sin compartir credenciales entre sistemas. |
| RF-02.3 | La zona del inquilino expone solo las capacidades habilitadas por su plan; no reproduce la densidad de opciones de la interfaz de Chatwoot. |

### RF-03 · Aprovisionamiento y sincronización con Chatwoot

| ID | Requisito |
|---|---|
| RF-03.1 | El aprovisionamiento usa exclusivamente las APIs de Chatwoot. Se prohíbe escribir en su base de datos o modificar su esquema. |
| RF-03.2 | Existe una tabla de correlación `client_id` ↔ `chatwoot_account_id` con estado, clave de idempotencia, último error y marca de sincronización. |
| RF-03.3 | Cada inquilino tiene su propio usuario de servicio con token, usado para las operaciones que la Platform API no cubre. |
| RF-03.4 | La escritura es unidireccional desde `mocter-admin`. De Chatwoot solo regresan identificadores y estado. |
| RF-03.5 | Las capacidades de pago de Chatwoot no se habilitan ni se usan; el directorio `enterprise/` se conserva en el fork sin activarse. |

### RF-04 · Planes y restricciones

| ID | Requisito |
|---|---|
| RF-04.1 | El plan define límites de: cantidad de productos, cantidad de usuarios por cuenta, cantidad de imágenes por producto, cantidad de audios, cantidad de videos, cantidad de archivos PDF, retención de chats en días y almacenamiento en bytes. |
| RF-04.2 | Los límites se validan en `mocter-admin` antes de persistir o replicar. Chatwoot no los hace cumplir sin código enterprise. |
| RF-04.3 | Un consumo que supera un límite se rechaza, no se persiste y se informa con un mensaje explícito. |
| RF-04.4 | El almacenamiento facturado es la suma de tamaños de archivos distintos referenciados por el inquilino. El almacenamiento físico es el de objetos distintos en SeaweedFS. La diferencia es margen del proveedor. |
| RF-04.5 | La retención de chats puede tener un piso legal mínimo; un override no puede reducirlo. |

### RF-05 · Productos

| ID | Requisito |
|---|---|
| RF-05.1 | Los atributos del producto se vectorizan. |
| RF-05.2 | La tabla de productos se particiona por `client_id` con `PARTITION BY LIST`. |
| RF-05.3 | Los objetos que no requieren vectorización no se particionan y solo llevan `client_id`. |
| RF-05.4 | Un producto pertenece a un único inquilino. |

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
| RF-07.9 | Existen dos dominios de archivos: multimedia de producto, propiedad de Mocter, con catálogo global, SeaweedFS, deduplicación por hash, cuota y borrado por ausencia de referencias; y adjuntos de conversación, propiedad de Chatwoot ActiveStorage, sin deduplicación, sin cuota de producto y con política propia. |
| RF-07.10 | Los adjuntos de Chatwoot no se cuentan en la cuota de producto y no se eliminan desde el GC de producto. |

### RF-08 · Comunidades y organizaciones

| ID | Requisito |
|---|---|
| RF-08.1 | Un inquilino puede ser miembro de una organización. |
| RF-08.2 | La relación se modela como muchos a muchos desde el origen, con rol de líder o de miembro. |
| RF-08.3 | El líder de una comunidad propone productos a sus miembros. |
| RF-08.4 | Toda adopción de una propuesta registra la propuesta de origen, el inquilino, el producto resultante y la fecha. |
| RF-08.5 | El líder tiene lectura de los inquilinos bajo su liderazgo, resuelta dentro de `mocter-admin`. |
| RF-08.6 | Compartir información entre miembros, con formato de red social, queda previsto en el modelo y fuera de esta versión. |

### RF-09 · Base de datos

| ID | Requisito |
|---|---|
| RF-09.1 | Todo objeto de base de datos de `mocter-admin` cumple la directiva de PostgreSQL y Drizzle. |
| RF-09.2 | La directiva no aplica a la base de datos de Chatwoot. |

### RF-10 · Arquitectura de datos por celdas

| ID | Requisito |
|---|---|
| RF-10.1 | Existe una base PostgreSQL principal (Router Global) que es la base actual de la landing y conserva los datos del formulario de solicitud de contacto. |
| RF-10.2 | El Router Global es el plano de control: información base del inquilino, tabla de planes y los objetos de dominio global del negocio SaaS. |
| RF-10.3 | El Router Global mantiene la tabla de enrutamiento que indica en qué celda residen los datos de cada inquilino y dónde reside su identidad. |
| RF-10.4 | El plano de datos son celdas: instancias PostgreSQL independientes (`pg-celda1`, `pg-celda2`, …) que contienen los datos puntuales del inquilino, incluidos usuarios, productos y archivos multimedia. |
| RF-10.5 | Cada celda admite como máximo 100 inquilinos. Al alcanzar el límite se aprovisiona una celda nueva y las altas siguientes se enrutan a ella. |
| RF-10.6 | Un inquilino con requisito normativo de aislamiento puede recibir una celda dedicada y exclusiva. |
| RF-10.7 | Toda consulta de datos de inquilino resuelve primero su celda en el Router Global. |
| RF-10.8 | Las referencias entre planos se limitan a identificadores. No hay clave foránea entre el Router Global y una celda, ni entre celdas. |
| RF-10.9 | Todas las celdas comparten el mismo esquema, versionado por una única línea de migraciones. |
| RF-10.10 | El Router Global y las celdas tienen líneas de migración separadas: una por base, no una por aplicación. |
| RF-10.11 | Cada celda usa RLS habilitado y forzado (`FORCE ROW LEVEL SECURITY`) con `SET LOCAL app.current_client_id`; el rol de aplicación no tiene DDL ni `BYPASSRLS`. |
| RF-10.12 | `products` y `product_embeddings` se particionan por `client_id` con `PARTITION BY LIST`; el resto de las tablas de inquilino no se particiona y usa RLS. |
| RF-10.13 | La identidad global vive en el Router Global y no usa RLS por `client_id`; las tablas de tenencia y la proyección `users` de cada celda sí. El rol de autenticación es dedicado. |
| RF-10.14 | El Router Global tiene un Redis 7+ dedicado para caché de enrutamiento, Pub/Sub, rate limiting y revocación de sesión; no comparte instancia con Chatwoot. |
| RF-10.15 | La capacidad nominal de una celda es 100 inquilinos; la efectiva es el primer disparador de DAT-001 (inquilinos, relaciones, HNSW o CPU). |
| RF-10.16 | La separación de `pg-control-plane` es una decisión diferida; mientras tanto, la landing y `mocter-admin` usan esquemas y roles separados en el Router Global. |

### RF-11 · Internacionalización

| ID | Requisito |
|---|---|
| RF-11.1 | La interfaz está internacionalizada desde el inicio. Ningún texto visible se escribe directamente en un componente. |
| RF-11.2 | El idioma se resuelve por preferencia del usuario y, en su ausencia, por la configuración regional del navegador, con un idioma por defecto explícito. |
| RF-11.3 | Los formatos de fecha, número y moneda se resuelven según la configuración regional activa. |
| RF-11.4 | Agregar un idioma no exige reestructurar componentes. El conjunto inicial de idiomas se decide aparte. |

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
| RF-13.3 | Se prohíbe reproducir la densidad de opciones de Chatwoot. Sus capacidades se exponen como entradas de menú y la operación ocurre en su interfaz. |
| RF-13.4 | Toda pantalla declara estado vacío, estado de carga y estado de error con acción de recuperación. |

### RF-14 · Onboarding guiado

| ID | Requisito |
|---|---|
| RF-14.1 | En el primer inicio de sesión de un inquilino se ejecuta un asistente guiado de onboarding. |
| RF-14.2 | El asistente se completa en menos de 5 minutos. |
| RF-14.3 | El asistente es reejecutable desde la ayuda del sistema. |
| RF-14.4 | El avance se registra por inquilino y por usuario. |
| RF-14.5 | El asistente no bloquea la navegación: puede interrumpirse y retomarse. |

### RF-15 · Marca blanca (white-labeling)

| ID | Requisito |
|---|---|
| RF-15.1 | El motor de marca blanca permite al inquilino personalizar la identidad visual de su espacio. |
| RF-15.2 | La capacidad se habilita por plan. Un inquilino sin la capacidad no accede a la personalización. |
| RF-15.3 | La personalización altera los tokens de identidad visual, no la estructura ni el comportamiento de los componentes. |
| RF-15.4 | Todo valor personalizado se valida contra las reglas de contraste accesible antes de aplicarse. Un valor inválido se rechaza con mensaje explícito. |
| RF-15.5 | La configuración visual por defecto de la plataforma se restaura con una acción única. |

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

## 7. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-04 | ¿El líder lee los datos de Chatwoot de sus inquilinos subordinados, o solo métricas agregadas en `mocter-admin`? | Si lee, requiere membresía `AccountUser` en cada cuenta y verá toda la cuenta. Con celdas, además cruza planos. |
| O-05 | ¿`mocter-core` es la capa de dominio de `mocter-admin` o un servicio aparte con su propia persistencia? | Define dónde vive el maestro de contactos y si existe una tercera instancia. |
| O-08 | ¿La sincronización desde el origen alcanza también a los archivos multimedia, o solo a los atributos? | Define si el vínculo de medios necesita seguimiento entre productos. |
| O-11 | ¿Con qué rol de base de datos se conecta la landing pública al Router Global? | **Verificado el 2026-10-20 sobre el repositorio:** existe un único rol, el propietario (`POSTGRES_USER=mocter`), y la misma `DATABASE_URL` sirve a la aplicación y a `drizzle-kit migrate`. No aparece ningún `CREATE ROLE`, `GRANT` ni privilegio por tabla. Con D-12, eso deja a la aplicación pública y anónima con permiso de escritura y DDL sobre las tablas de credenciales y secretos TOTP. Recomendación: separar el rol de migración del rol de ejecución y dar a la landing solo `INSERT` sobre la tabla de solicitudes de contacto. |
| O-12 | ¿El registro crea un usuario sin inquilino, o exige invitación a un inquilino existente? | El documento de AUTH-001 describe el registro pero nunca la pertenencia al inquilino (ver AUTH-001, 2.4). |
| O-13 | ¿La retención de chats se aplica en Chatwoot o en Mocter mediante API, y qué pasa con los mensajes vencidos (borrado, archivo o anonimización)? | Chatwoot no la hace cumplir sin enterprise; define costo de almacenamiento y obligación legal. |
| O-14 | ¿Los adjuntos de Chatwoot tienen retención propia y consumen almacenamiento del plan? | ActiveStorage no deduplica; define costo y política de borrado. |
| O-15 | ¿Cómo se resuelve la ubicación de la identidad antes de autenticar cuando un inquilino tiene celda dedicada? | AUTH-D-01; el Router Global conserva el puntero de enrutamiento sin credenciales. |
| O-16 | ¿Cómo se sincronizan los atributos de un producto clonado cuando el origen y el clon están en celdas distintas? | No hay FK entre celdas; define API, consistencia y frecuencia. |

## 8. Trazabilidad

- 2026-10-20: alineación con DAT-001 (T-12): RF-04, RF-07 y RF-10 actualizados; O-07 cerrada con la fórmula de almacenamiento facturado; O-13 a O-16 abiertas.
