# CRM-001 · Requisitos · Prospectos y gestión comercial

| Atributo | Valor |
|---|---|
| ID | CRM-001 |
| Versión | 0.2 (Aprobada — decisiones O-01 a O-03 cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) · [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Definir el maestro de prospectos de cada inquilino —la primera etapa del ciclo comercial prospecto → cliente— con calidad de datos CRM y cumplimiento de Habeas Data (Ley 1581 de 2012, Colombia). **La fuente de verdad es Mocter**: Chatwoot sigue siendo el motor de conversaciones y sus `contacts` son una proyección sincronizada, nunca el maestro.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «me queda la duda la tabla equivalente pero para guardar los prospectos del inquilino esta contemplada?»
- «Claro es totalmente necesaria, no me queda claro es la fuente de verdad seria Chatwoot o mocter, por lo que indicas el tema del consentimiento de Habeas Data, esto de habeas data tambien debe aplicarse al cliente de la SaaS es decir a los usuarios del inquilino.»

## 3. Requisitos funcionales

### RF-01 · Maestro de prospectos (Mocter como fuente de verdad)

| ID | Requisito |
|---|---|
| RF-01.1 | El prospecto vive en la celda del inquilino con RLS (`client_id`); es dato del inquilino, no del plano de control. |
| RF-01.2 | **Mocter es la fuente de verdad.** Chatwoot `contacts` es una proyección: la escritura es unidireccional desde Mocter y Chatwoot solo devuelve identificadores y estado (mismo patrón que `chatwoot_accounts`, ADM-001 RF-03.4). |
| RF-01.3 | Cuando una conversación trae un contacto desconocido, Chatwoot lo propone y Mocter lo ingesta como prospecto con idempotencia por `(client_id, chatwoot_contact_id)`; el maestro queda en Mocter. |
| RF-01.4 | El prospecto guarda su origen (`source`): `whatsapp`, `landing`, `manual`, `referral`, `other`. |

### RF-02 · Golden record con calidad CRM

| ID | Requisito |
|---|---|
| RF-02.1 | El golden record lleva: nombre o razón social, tipo y número de documento, email, celular (E.164) y fijo, dirección (país, departamento, ciudad, línea, código postal), idioma, etiquetas, etapa, agente asignado, notas, `first_contacted_at` y `last_interaction_at`. |
| RF-02.2 | **Exactitud:** email con formato válido, teléfonos en E.164, número de documento según su tipo. |
| RF-02.3 | **Unicidad:** un prospecto por email (case-insensitive) y por documento dentro del inquilino (índices únicos parciales). |
| RF-02.4 | **Completitud mínima:** nombre y al menos un canal de contacto (email o teléfono); el resto es opcional para no generar fricción de ingesta. |
| RF-02.5 | **Actualidad:** `last_interaction_at` se actualiza con cada interacción; los prospectos inactivos se pueden filtrar. |
| RF-02.6 | **Etapas:** `new` → `in_conversation` → `qualified` → `customer`, con `discarded` como salida; la asignación la hace el `tenant_owner` o el agente asignado. |

### RF-03 · Consentimiento (Habeas Data, Ley 1581 de 2012)

| ID | Requisito |
|---|---|
| RF-03.1 | Todo prospecto con datos personales tiene un registro de consentimiento (`prospect_consents`) con **dos propósitos**: `data_treatment` (incluye a Chatwoot como encargado, declarado en el aviso) y `commercial_comms`. Guarda versión de la política, canal, evidencia, fecha de otorgamiento y de revocación. |
| RF-03.2 | El envío de comunicaciones comerciales exige consentimiento previo, expreso e informado; sin él no se contacta al prospecto por esa vía. |
| RF-03.3 | El prospecto puede revocar en cualquier momento; la revocación es inmediata y queda registrada con fecha y canal. |
| RF-03.4 | Se garantizan los derechos del titular: acceso, corrección, supresión y revocación, con procedimiento documentado y auditado. |
| RF-03.5 | La supresión se implementa como baja lógica con anonimización del registro (conserva correlación de negocio sin dato personal). |
| RF-03.6 | **Aviso de privacidad:** Mocter provee un template versionado en es/en, editable por el inquilino y sujeto a revisión legal antes de publicar. Cada `prospect_consents` referencia la versión exacta aceptada. |
| RF-03.7 | **Captura inicial por WhatsApp:** botones interactivos con aceptación explícita + enlace al aviso completo. Se registra `channel = whatsapp_buttons`, el `message_id` de Chatwoot, la fecha y la versión del aviso. |
| RF-03.8 | **Chatwoot es encargado, no destinatario:** la proyección de contactos se cubre con `data_treatment` y el aviso; no se exige un tercer consentimiento separado. |

### RF-04 · Integración con Chatwoot y el bot

| ID | Requisito |
|---|---|
| RF-04.1 | El `contact_id` de Chatwoot se guarda en el prospecto como correlación; sin FK entre planos (DAT-001 RF-10.8). |
| RF-04.2 | BOT-001 puede consultar el prospecto y su consentimiento para personalizar la atención, dentro de lo autorizado. |
| RF-04.3 | La sincronización de contactos se valida en laboratorio contra Chatwoot 4.19 (webhook e idempotencia). |

### RF-05 · Gobernanza, calidad y auditoría

| ID | Requisito |
|---|---|
| RF-05.1 | El inquilino ve indicadores de calidad de sus datos: % sin email válido, % sin consentimiento comercial, % duplicados detectados. |
| RF-05.2 | Toda tabla cumple la auditoría global (DAT-001 RF-10.9); el acceso a datos personales queda en `audit_log` con actor y propósito. |
| RF-05.3 | La UI de prospectos cumple la directiva de i18n (es/en, Español por defecto). |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | El maestro de prospectos es Mocter (`mocter-core`, en la celda); Chatwoot es proyección y motor de conversaciones. | Los datos del negocio nunca dependen de la disponibilidad ni del esquema de Chatwoot. |
| D-02 | La ingesta de Chatwoot es «Chatwoot propone, Mocter decide»: webhook con upsert idempotente por `chatwoot_contact_id`. | Un contacto que llega por WhatsApp nace como prospecto sin acción manual del inquilino. |
| D-03 | El consentimiento es un registro aparte (`prospect_consents`), no un booleano en el prospecto: guarda versión de política, canal, evidencia y revocación. | Auditable ante la SIC; un cambio de política se distingue de un otorgamiento viejo. |
| D-04 | La supresión es lógica con anonimización (nombre, documento, email y teléfonos se reemplazan por tokens irreversibles); la correlación de negocio se conserva. | Cumple el derecho de supresión sin romper métricas ni conversaciones históricas. |
| D-05 | **Dos propósitos:** `data_treatment` (incluye Chatwoot como encargado) y `commercial_comms`. | Menos fricción y una base legal clara; no se crea un tercer consentimiento para Chatwoot. |
| D-06 | **Aviso de privacidad:** template de plataforma editable, versionado en es/en y con revisión legal antes de publicar. | Escala con el inquilino sin perder control de cumplimiento. |
| D-07 | **Captura por WhatsApp:** botones interactivos + enlace al aviso; se registran mensaje, fecha y versión. | Baja fricción con evidencia razonable; se valida en Chatwoot 4.19. |

## 5. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
No quedan decisiones abiertas en CRM-001.

**Cerradas el 2026-10-25:** O-01 (dos propósitos: tratamiento + comercial; Chatwoot como encargado), O-02 (template de plataforma editable con revisión legal) y O-03 (botones interactivos + enlace al aviso).

## 6. Fuera de alcance

La facturación y cobranza a clientes finales, los pipelines de venta avanzados (funnels complejos), la mensajería masiva y el enriquecimiento de datos de terceros. El motor de conversaciones es Chatwoot (CHW-001); el bot es BOT-001.

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| AUTH-001 | Habeas Data para los **usuarios de la plataforma**: `user_consents` en el Router y consentimiento obligatorio en el registro (se actualiza AUTH-001). |
| ADM-001 | `mocter-core` materializa su maestro de contactos con CRM-001; el onboarding puede pedir consentimiento comercial opcional. |
| CHW-001 | La proyección de `contacts` y el webhook de sincronización se validan contra 4.19. |
| BOT-001 | El bot consulta prospecto y consentimiento antes de acciones comerciales. |
| DAT-001 | RLS, auditoría RF-10.9 y sin FK entre planos (RF-10.8). |

## 8. Trazabilidad

- L1 (2026-10-23): «me queda la duda la tabla equivalente pero para guardar los prospectos del inquilino esta contemplada?»
- L2 (2026-10-23): «Claro es totalmente necesaria, no me queda claro es la fuente de verdad seria Chatwoot o mocter, por lo que indicas el tema del consentimiento de Habeas Data, esto de habeas data tambien debe aplicarse al cliente de la SaaS es decir a los usuarios del inquilino.»
- L3 (2026-10-23): **CRM-001 aprobada.** Quedan abiertas O-01 (propósitos de consentimiento), O-02 (aviso de privacidad: template de plataforma o del inquilino) y O-03 (captura inicial por WhatsApp) para resolver en la fase 0 de implementación.
- L4 (2026-10-25): O-01 a O-03 cerradas — dos propósitos (`data_treatment` + `commercial_comms`, Chatwoot como encargado), template de aviso editable con revisión legal, y captura por botones interactivos + enlace al aviso con evidencia de mensaje/fecha/versión.
