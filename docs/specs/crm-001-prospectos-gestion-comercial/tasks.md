# CRM-001 · Tareas · Prospectos y gestión comercial

| Atributo | Valor |
|---|---|
| ID | CRM-001 |
| Versión | 0.2 (Aprobada — decisiones O-01 a O-03 cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que CRM-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: ADM-001 T-02 (`apps/admin`), T-03 (schemas/roles), T-11 (Chatwoot) y AUTH-001 (consentimiento de usuarios).

## Fase 0 · Decisiones

- [x] **T-01 · [HUMANO] Cerrar las decisiones abiertas (2026-10-25)**
  - Cerradas: O-01 (dos propósitos: tratamiento + comercial), O-02 (template editable con revisión legal) y O-03 (botones interactivos + enlace al aviso).
  - Verificación: las decisiones quedaron registradas en `requirements.md` §5 y en la trazabilidad.

## Fase 1 · Maestro de prospectos

- [ ] **T-02 · Crear las migraciones de prospectos**
  - `prospects`, `prospect_consents` y `privacy_notices` en la celda con RLS, auditoría (RF-10.9), índices únicos parciales (email, documento, `chatwoot_contact_id`, versión de aviso) y comentarios.
  - Verificación: `drizzle-kit check` pasa; una consulta sin contexto RLS no devuelve filas; un email duplicado por inquilino no ingresa.

- [ ] **T-03 · Implementar el alta manual y la edición**
  - Alta mínima (nombre + un canal de contacto); edición de etapa, agente, etiquetas y notas con auditoría.
  - Verificación: un prospecto se crea con 2 campos; un teléfono no E.164 se rechaza con mensaje.

- [ ] **T-04 · Implementar la ingesta desde Chatwoot**
  - Webhook con upsert idempotente por `(client_id, chatwoot_contact_id)`; `source = 'whatsapp'` y actualización de `last_interaction_at`.
  - Verificación: dos eventos del mismo contacto crean un solo prospecto; un contacto existente no se duplica ni se sobrescribe desde la proyección.

- [ ] **T-05 · Indicadores de calidad de datos**
  - Métricas de exactitud, unicidad, completitud, actualidad y consentimiento por inquilino.
  - Verificación: el panel del inquilino muestra los cinco indicadores y permite corregir desde la vista.

## Fase 2 · Consentimiento (Habeas Data)

- [ ] **T-06 · Implementar `prospect_consents`**
  - Captura con dos propósitos (`data_treatment`, `commercial_comms`), versión de política, canal, evidencia; revocación inmediata fechada; derechos de acceso, corrección y supresión.
  - Verificación: sin consentimiento comercial vigente, la acción comercial se bloquea; la revocación queda registrada con fecha y canal.

- [ ] **T-06A · Implementar el aviso de privacidad versionado**
  - `privacy_notices` con template de plataforma, copia editable por inquilino, estados `draft`/`in_review`/`published`/`retired` y revisión legal.
  - Verificación: solo un aviso `published` se usa en la captura; un cambio crea versión nueva y los consentimientos viejos conservan su versión.

- [ ] **T-06B · Implementar la captura por WhatsApp**
  - Botones interactivos + enlace al aviso; registrar `channel = whatsapp_buttons`, `message_id`, fecha y versión.
  - Verificación: sin aceptación explícita no hay consentimiento; la evidencia queda enlazada al mensaje de Chatwoot.

- [ ] **T-07 · Implementar la supresión con anonimización**
  - Baja lógica con reemplazo de datos personales por tokens irreversibles; trazabilidad conservada.
  - Verificación: tras suprimir, ningún campo personal es recuperable y las métricas de negocio se mantienen.

## Fase 3 · Integración y cierre

- [ ] **T-08 · [LAB] Validar la sincronización contra Chatwoot 4.19**
  - Webhook de contactos, correlación por cuenta e idempotencia con datos reales de laboratorio.
  - Verificación: un contacto creado en Chatwoot por una conversación aparece como prospecto; la reconciliación no duplica.

- [ ] **T-09 · i18n de la UI de prospectos**
  - Pantallas y avisos en es/en con Español por defecto.
  - Verificación: alta, edición, consentimiento y supresión se completan en ambos idiomas.

- [ ] **T-10 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-05 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia de laboratorio; ninguno queda «asumido».

- [x] **T-11 · [HUMANO] Aprobar CRM-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
