# CHW-001 · Requisitos · Inventario técnico de Chatwoot

| Atributo | Valor |
|---|---|
| ID | CHW-001 |
| Versión | 1.0 |
| Estado | Borrador |
| Fecha | 2026-10-20 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |
| Fuente fijada | `chatwoot/chatwoot` · commit `042b438fe31d2a2ef00c396379b7064ab6d0034f` · release `4.19.0` (2026-10-20) |

## 1. Propósito

Producir la referencia técnica verificable de Chatwoot que permita a `mocter-admin` aprovisionar y sincronizar inquilinos sin escribir en la base de datos de Chatwoot ni modificar su esquema, usando exclusivamente sus APIs. La referencia debe responder, con evidencia `archivo:línea`, qué se puede hacer, cómo se autentica y autoriza, qué tablas sostienen cada capacidad y cuáles son los límites impuestos por la licencia.

## 2. Alcance

### Incluye

1. **Arquitectura**: modelo de multi-tenencia por `Account`, límites de dominio, dependencia de Redis y separación `app/` vs `enterprise/`.
2. **Autenticación y autorización**: las tres superficies de API, el token polimórfico, SSO, Pundit y `platform_app_permissibles`.
3. **Superficie de API**: inventario de los 96 paths de la especificación incluida en el repositorio y de los cinco controladores de Platform API, con método, path, autenticación, controlador#acción y payloads.
4. **Modelo de datos**: las 104 tablas de `db/schema.rb`, clasificadas por tenencia y autoridad de escritura, más un ERD Mermaid.
5. **Matriz de capacidades**: para cada funcionalidad de Chatwoot, tablas que la sostienen, endpoints que la operan y si `mocter-admin` debe sembrar datos para que funcione.
6. **Frontera enterprise**: inventario de lo que queda fuera por licenciamiento y su impacto operativo.
7. **Modelo de correlación**: `client_id` ↔ `chatwoot_account_id`, unidireccional, sin FK cruzada.

### Excluye

- Modificar Chatwoot, su esquema o sus migraciones.
- Diseñar o implementar `mocter-admin` (corresponde a `ADM-001`).
- Documentar capacidades enterprise o sugerir su activación.
- Decidir la estrategia de particionado de `mocter-admin` (corresponde a `ADM-001`); este inventario solo debe exponer qué tablas son `account`-scoped.
- Ejecutar pruebas de carga o de seguridad sobre Chatwoot.

## 3. Actores

| Actor | Rol |
|---|---|
| Arquitecto de `mocter-admin` | Consume la referencia para diseñar el aprovisionamiento y la sincronización |
| Desarrollador de integración | Usa endpoints, payloads y reglas de autenticación |
| Responsable de licenciamiento | Verifica que la integración no dependa de código enterprise |
| Auditor técnico | Comprueba que cada afirmación tiene evidencia y pin |

## 4. Requisitos funcionales

### RF-01 · Arquitectura

| ID | Requisito |
|---|---|
| RF-01.1 | Documentar el límite de tenencia: `Account` como raíz del grafo operativo, con evidencia en `app/models/account.rb`. |
| RF-01.2 | Documentar las dependencias de ejecución verificadas (Rails 7.2.3.1, PostgreSQL, Redis) y su impacto en el despliegue del fork. |
| RF-01.3 | Documentar la separación `app/` vs `enterprise/` y el mecanismo `prepend_mod_with` / `ChatwootApp.enterprise?`. |

### RF-02 · Autenticación y autorización

| ID | Requisito |
|---|---|
| RF-02.1 | Describir las tres superficies (`/api/v1`, `/platform/api/v1`, `/public/api/v1`) con su modelo de autenticación y autorización. |
| RF-02.2 | Documentar el token polimórfico: `AccessToken.owner` ∈ {`User`, `AgentBot`, `PlatformApp`}, y la desambiguación de Bearer del dashboard (`dashboard_bearer_token?`). |
| RF-02.3 | Documentar el SSO nativo: `generate_sso_link`, TTL de 5 minutos, un solo uso e impersonación. |
| RF-02.4 | Documentar `platform_app_permissibles` y su consecuencia: un Platform App solo administra cuentas que creó. |
| RF-02.5 | Documentar los roles disponibles sin enterprise (`agent`, `administrator`). |
| RF-02.6 | Documentar el modelo multi-cuenta (`account_users`): un `User` global puede pertenecer a N cuentas y no existe lectura cross-account fuera de esa membresía. |

### RF-03 · Superficie de API

| ID | Requisito |
|---|---|
| RF-03.1 | Inventariar los 96 paths de `swagger/swagger.json` con método, path y controlador#acción. |
| RF-03.2 | Inventariar los cinco controladores de Platform API y sus payloads permitidos. |
| RF-03.3 | Marcar para cada endpoint si es usable por `mocter-admin` y con qué tipo de token. |
| RF-03.4 | Documentar los endpoints de aprovisionamiento: alta de cuenta, alta de usuario, membresía y emisión de token. |

### RF-04 · Modelo de datos

| ID | Requisito |
|---|---|
| RF-04.1 | Inventariar las 104 tablas de `db/schema.rb` con columnas, tipos, PK, FK e índices. |
| RF-04.2 | Clasificar cada tabla por tenencia: `global`, `account`, `join`, `platform`. |
| RF-04.3 | Clasificar cada tabla por autoridad de escritura: `mocter-admin`, `chatwoot`, `ninguna`. |
| RF-04.4 | Producir un ERD Mermaid con las relaciones del grafo administrativo y del grafo operativo. |
| RF-04.5 | Documentar el caso `User` global vs `AccountUser`: consecuencias de fusión por email. |

### RF-05 · Matriz de capacidades

| ID | Requisito |
|---|---|
| RF-05.1 | Listar las funcionalidades de Chatwoot y, para cada una, tablas, endpoints y datos que debe sembrar `mocter-admin`. |
| RF-05.2 | Identificar las funcionalidades que funcionan sin intervención de `mocter-admin`. |

### RF-06 · Frontera enterprise

| ID | Requisito |
|---|---|
| RF-06.1 | Listar las capacidades premium con su archivo de origen en `enterprise/` o `app/helpers/super_admin/features.yml`. |
| RF-06.2 | Documentar el impacto de su ausencia: límites, roles, branding, SAML, Captain y auditoría. |
| RF-06.3 | Verificar que el flujo de SSO y los feature flags core no dependen de enterprise. |

### RF-07 · Trazabilidad y vigencia

| ID | Requisito |
|---|---|
| RF-07.1 | Toda afirmación técnica debe citar `archivo:línea` del commit fijado. |
| RF-07.2 | Todo documento debe declarar el commit y la versión sobre la que se generó. |
| RF-07.3 | Debe existir un procedimiento de actualización al sincronizar con upstream. |

## 5. Criterios de aceptación

1. El ERD y el inventario cubren las 104 tablas de `db/schema.rb`.
2. Los 96 paths figuran con método, path y controlador#acción.
3. El 100% de las afirmaciones de autenticación cita `archivo:línea`.
4. El SSO está documentado con TTL, single-use e impersonación.
5. La consecuencia de `platform_app_permissibles` está documentada con el método que la aplica.
6. Cada capacidad premium está asignada a su archivo de origen.
7. Ningún documento propone escribir en la base de datos de Chatwoot.
8. La referencia declara el commit `042b438` y la versión `4.19.0`.

## 6. Decisiones y supuestos

| ID | Decisión | Motivo |
|---|---|---|
| D-01 | Dos claves de tenencia: `client_id` en `mocter-admin`, `account_id` en Chatwoot. | Cada sistema conserva su autoridad; no hay FK cruzada ni migración compartida. |
| D-02 | La correlación vive en una tabla de `mocter-admin`. | Único contrato compartido; se versiona con el esquema propio. |
| D-03 | `custom_attributes.client_id` es **opcional** y solo sirve como marcador de idempotencia. | Permite reconciliar un alta con timeout sin duplicar; no otorga autoridad. |
| D-04 | Chatwoot es dueño del dominio operativo (conversaciones, mensajes). | Es el sistema que los produce y el fork lo mantiene. |
| D-05 | No se usa código enterprise; el directorio `enterprise/` se conserva en el fork. | Restricción de licenciamiento declarada; conservar el código no habilita su uso. |
| D-06 | El maestro de contactos pertenece a `mocter-core`. Chatwoot recibe una proyección operativa. | O-01 resuelta: un solo dueño del dato, sin doble escritura. |
| D-07 | Token de servicio por inquilino. | O-02 resuelta: blast radius acotado a una cuenta. |
| D-08 | Cada aplicación mantiene su propia instancia PostgreSQL. | No hay FK cruzada ni acceso directo a la base del otro sistema. |
| D-09 | La lógica de comunidades, propuestas y clonación vive exclusivamente en `mocter-admin`. | Hacia Chatwoot solo se materializan cuentas y usuarios; Chatwoot no conoce organizaciones ni propuestas. |

## 7. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-04 | ¿El líder de comunidad lee los datos de Chatwoot de sus inquilinos subordinados, o solo métricas agregadas en `mocter-admin`? | Si lee, hay que crearle `AccountUser` en cada cuenta subordinada y verá toda la cuenta; si no, `mocter-admin` agrega con los tokens de servicio. |
| O-05 | ¿`mocter-core` es la capa de dominio de `mocter-admin` o un servicio aparte con su propia persistencia? | Define dónde vive el maestro de contactos y si existe una tercera instancia. |
