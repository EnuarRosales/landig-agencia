# CRM-001 · Tareas · Prospectos y gestión comercial

| Atributo | Valor |
|---|---|
| ID | CRM-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
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

- [ ] **T-01 · [HUMANO] Cerrar las decisiones abiertas**
  - Resolver O-01 (propósitos de consentimiento), O-02 (aviso de privacidad: template de plataforma o del inquilino) y O-03 (captura inicial por WhatsApp: mensaje interactivo o enlace).
  - Verificación: cada decisión queda registrada en `requirements.md` §5 con su resultado y fecha.

## Fase 1 · Maestro de prospectos

- [ ] **T-02 · Crear las migraciones de prospectos**
  - `prospects` y `prospect_consents` en la celda con RLS, auditoría (RF-10.9), índices únicos parciales (email, documento, `chatwoot_contact_id`) y comentarios.
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
  - Captura con propósito, versión de política, canal y evidencia; revocación inmediata fechada; derechos de acceso, corrección y supresión.
  - Verificación: sin consentimiento comercial vigente, la acción comercial se bloquea; la revocación queda registrada con fecha y canal.

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
