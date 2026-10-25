# CRM-001 · Diseño · Prospectos y gestión comercial

| Atributo | Valor |
|---|---|
| ID | CRM-001 |
| Versión | 0.2 (Aprobada — decisiones O-01 a O-03 cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Mocter es la fuente de verdad.** El prospecto vive en la celda; Chatwoot ejecuta la conversación y su `contacts` es una proyección.
2. **Chatwoot propone, Mocter decide.** La conversación entrante dispara la ingesta; el maestro y su calidad son de Mocter.
3. **Calidad medible.** Exactitud, unicidad, completitud mínima y actualidad son reglas declaradas, no aspiraciones.
4. **Consentimiento auditable.** Habeas Data (Ley 1581 de 2012) con registro de otorgamiento, versión de política, evidencia y revocación.
5. **Fricción mínima.** La ingesta automática no pide nada al inquilino; el alta manual pide lo mínimo (nombre + un canal de contacto).

## 2. Contexto y flujo

```text
Chatwoot (motor de conversaciones)          Mocter (maestro)
┌──────────────────────────┐  webhook  ┌──────────────────────────┐
│ conversación entrante    ├──────────►│ upsert prospecto         │
│ contact (proyección)     │           │ (client_id, chatwoot_    │
└──────────────────────────┘           │  contact_id) idempotente │
                                       │ prospect_consents        │
                                       └──────────────────────────┘
```

La escritura de contactos es unidireccional desde Mocter (RF-03.4 de ADM-001); de Chatwoot solo vuelven identificadores y estado. Cuando el bot (BOT-001) o el agente atienden, consultan el prospecto y su consentimiento vigente en Mocter.

## 3. Modelo de datos (celda del inquilino, schema `admin`, RLS)

Ambas tablas llevan las columnas de auditoría de la directiva (RF-10.9) y viven en la celda; no hay FK entre planos.

### 3.1 `prospects`

| Atributo | Regla |
|---|---|
| `client_id` + `id` | PK compuesta, RLS |
| `full_name` | Nombre o razón social (obligatorio) |
| `document_type` · `document_number` | `CC`/`NIT`/`CE`/`PASSPORT`/`other`; únicos por inquilino cuando existen (índice parcial) |
| `email` | Validado; único por inquilino (índice parcial `lower(email)`) |
| `phone_mobile` (E.164) · `phone_landline` | Al menos un canal de contacto junto con `email` (RF-02.4) |
| `country` · `state` · `city` · `address_line` · `postal_code` | Opcionales |
| `source` | `whatsapp`, `landing`, `manual`, `referral`, `other` |
| `chatwoot_contact_id` | Correlación; nullable; única por inquilino (índice parcial) |
| `assigned_user_id` | `tenant_agent` asignado; nullable |
| `stage` | `new` → `in_conversation` → `qualified` → `customer`; salida `discarded` |
| `tags` JSONB · `language` (default `clients.locale`) · `notes` | Etiquetas, idioma y notas |
| `first_contacted_at` · `last_interaction_at` | Actualidad (RF-02.5) |
| `deleted_at` · `deleted_by` | Baja lógica con anonimización (D-04): al suprimir, los campos personales se reemplazan por tokens irreversibles |

### 3.2 `prospect_consents`

| Atributo | Regla |
|---|---|
| `id` | PK |
| `client_id` + `prospect_id` | RLS y FK local |
| `purpose` | `data_treatment` (incluye Chatwoot como encargado) o `commercial_comms` |
| `policy_version` | Versión exacta del aviso de privacidad aceptado |
| `status` | `granted` / `revoked` |
| `granted_at` · `revoked_at` | Fechas del otorgamiento y de la revocación |
| `channel` | `whatsapp_buttons`, `web_form`, `manual` o `import` |
| `evidence_ref` | `message_id` de Chatwoot, id de envío del formulario o referencia manual |
| Auditoría | `created_by` registra quién capturó el consentimiento (agente o bot) |

Reglas:

- Append-only: cada otorgamiento es una fila nueva; la revocación marca `revoked_at` en la fila vigente. Las consultas usan la fila vigente por propósito.
- Sin consentimiento de `commercial_comms`, el bot y el agente no envían comunicación comercial por ese canal (RF-03.2); la atención transaccional en curso no se interrumpe.
- La supresión (RF-03.5/D-04) anonimiza `prospects` y conserva `prospect_consents` sin dato personal identificable, para trazabilidad ante la autoridad.
- El aviso se captura con botones interactivos + enlace; `channel = whatsapp_buttons` y `evidence_ref` guarda el `message_id` de Chatwoot. La captura se valida en laboratorio contra 4.19 (T-08).

### 3.3 `privacy_notices`

| Atributo | Regla |
|---|---|
| `id` | PK |
| `client_id` | Nullable: `null` = template de plataforma; UUID = aviso propio del inquilino |
| `version` | Versión semántica o consecutiva, única por `(client_id, version)` |
| `locale` | `es` / `en` |
| `body_markdown` | Texto del aviso, editable por el inquilino |
| `status` | `draft` / `in_review` / `published` / `retired` |
| `reviewed_by` · `reviewed_at` | Revisión legal antes de publicar |
| `published_at` | Fecha de publicación |
| Auditoría | `created_by`, `updated_by` (DAT-001 RF-10.9) |

Reglas: el template de plataforma nace en `draft`; el inquilino lo copia/edita, pasa por `in_review` y solo se usa cuando está `published`. Un cambio de aviso crea una versión nueva; los consentimientos viejos conservan su `policy_version`.

## 4. Calidad de datos (medible)

| Dimensión | Regla | Indicador |
|---|---|---|
| Exactitud | Email válido, teléfonos E.164, documento según tipo | % de registros con formato inválido |
| Unicidad | Email y documento únicos por inquilino | % de duplicados detectados |
| Completitud | Nombre + al menos un canal de contacto | % de prospectos incompletos |
| Actualidad | `last_interaction_at` actualizado en cada interacción | % de prospectos inactivos > 90 días |
| Consentimiento | Registro vigente por propósito | % sin consentimiento comercial (sobre contactados) |

Los indicadores se muestran al inquilino (RF-05.1) y se corrigen desde la misma vista.

## 5. Ingesta desde Chatwoot

1. La conversación entrante de un número desconocido crea el `contact` en Chatwoot.
2. El webhook llega a `mocter-admin` con el `contact_id` y el `account_id` (correlación por `chatwoot_accounts`).
3. Upsert idempotente por `(client_id, chatwoot_contact_id)`: crea el prospecto con `source = 'whatsapp'`, `stage = 'new'` y `first_contacted_at = now()`; si ya existe, actualiza `last_interaction_at`.
4. Sin consentimiento registrado, el bot atiende la conversación transaccional pero no dispara comunicación comercial.

## 6. Habeas Data para usuarios de la plataforma

Además de los prospectos, la ley aplica a los **usuarios del SaaS** (dueño y agentes del inquilino). Ese registro vive en AUTH-001: `user_consents` en el Router Global, con consentimiento obligatorio en el registro y ejercicio de derechos por procedimiento de soporte auditado (acceso, corrección, supresión con anonimización, revocación).

## 7. i18n

La UI de prospectos y consentimientos cumple la directiva de i18n (es/en, Español por defecto); los avisos de privacidad se versionan con traducción oficial.

## 8. Verificación

| Control | Prueba |
|---|---|
| Fuente de verdad | Un cambio hecho en Mocter no se pierde al sincronizar Chatwoot; el maestro nunca se sobrescribe desde la proyección |
| Ingesta | Dos webhooks con el mismo `chatwoot_contact_id` crean un solo prospecto |
| Calidad | Un email inválido o un teléfono no E.164 se rechaza con mensaje; un email duplicado por inquilino no crea un prospecto nuevo |
| Consentimiento | Sin `commercial_comms` vigente, la acción comercial se bloquea; la revocación es inmediata y fechada |
| Dos propósitos | `data_treatment` cubre a Chatwoot como encargado; no se exige un tercer consentimiento separado |
| Aviso versionado | El template editable pasa por `in_review` y solo se usa `published`; el consentimiento referencia la versión exacta |
| Captura WhatsApp | Los botones interactivos + enlace registran `message_id`, fecha y versión; sin aceptación explícita no hay consentimiento |
| Supresión | Tras suprimir, los campos personales quedan anonimizados y el consentimiento conserva trazabilidad |
| Chatwoot | Sincronización validada en laboratorio contra 4.19 |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Divergencia Mocter/Chatwoot | Escritura unidireccional + reconciliación periódica por `chatwoot_contact_id` |
| Consentimiento mal capturado | Evidencia obligatoria (canal + referencia) y auditoría |
| Datos personales en logs | Redacción; `audit_log` sin contenido personal |
| Sanciones por Habeas Data | Registro auditable y procedimiento de derechos documentado |

## 10. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | `mocter-core` materializa el maestro de contactos; onboarding con consentimiento comercial opcional |
| AUTH-001 | `user_consents` y consentimiento en el registro (Habeas Data de usuarios) |
| CHW-001 | `contacts` como proyección; webhook validado contra 4.19 |
| BOT-001 | El bot consulta prospecto y consentimiento antes de acciones comerciales; los recordatorios (RF-11 de BOT-001) consultan `prospect_consents` antes de cada paso |
| DAT-001 | RLS, RF-10.8, RF-10.9 |
