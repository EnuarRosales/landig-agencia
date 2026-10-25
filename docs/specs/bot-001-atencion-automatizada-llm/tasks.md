# BOT-001 · Tareas · Bot de atención automatizada con LLM e inferencia como servicio

| Atributo | Valor |
|---|---|
| ID | BOT-001 |
| Versión | 0.3 (Aprobada — decisiones O-01 a O-07 cerradas) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que BOT-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- **Alcance por fase (D-07):** Fases 0 a 4 son el **día uno** (catálogo, canales, bot y BYOK). La Fase 5 son las **fundaciones de la propuesta de negocio** (billetera, spread e inferencia Mocter): se diseñan y se dejan listas, pero su activación la decide el equipo al madurar la propuesta; no bloquea el lanzamiento.
- Dependencias de entrada: ADM-001 T-02 (`apps/admin`), T-03 (schemas/roles), T-06 (`clients`), T-10 (planes) y T-11 (Chatwoot). El motor BOT-002 no es prerrequisito: BOT-001 define la configuración que BOT-002 consumirá.

## Fase 0 · Decisiones del día uno

- [ ] **T-01 · [HUMANO] Aprobar el catálogo inicial y la lista de canales admisibles**
  - Revisar el seed de proveedores y modelos (OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Together AI), tonos, presets y la tabla de canales admisibles con su viabilidad (§5 del design).
  - Verificación: el seed y la lista de admisibles quedan aprobados por el dueño del producto; los precios de costo se registran solo si la propuesta de negocio lo pide (fundaciones).

## Fase 1 · Catálogo (plataforma)

- [ ] **T-02 · Crear las migraciones del catálogo**
  - `ai_providers`, `ai_models`, `bot_tones`, `bot_presets`, `bot_defaults`, `chatwoot_channel_types` con auditoría (DAT-001 RF-10.9), comentarios, índices por camino de acceso y `UNIQUE` declarados.
  - Verificación: `drizzle-kit check` pasa; la migración aplica desde cero; `bot_defaults` admite una sola fila.

- [ ] **T-03 · Cargar el catálogo con recomendaciones**
  - Seed versionado con etiquetas JSONB `{es,en}` para modelos, tonos y presets; precios de costo vigentes y `spread_percent` por modelo (30% por defecto).
  - Verificación: los 6 proveedores y sus modelos se listan con recomendación; el retail se calcula desde costo + spread; un modelo sin retail queda marcado solo-BYOK.

- [ ] **T-04 · Implementar el backoffice y permisos del catálogo**
  - `platform_admin`/`platform_owner` registran proveedores, los activan/desactivan, habilitan modelos por proveedor y editan costo y spread por modelo desde la SaaS; los inquilinos solo leen la whitelist activa.
  - Verificación: un inquilino no puede crear ni modificar proveedores, modelos, tonos, presets, canales, precios ni spread; cada cambio de proveedor/modelo/spread queda auditado y versionado.

## Fase 2 · Canales e integraciones

- [ ] **T-05 · Gestionar las integraciones de canal desde Mocter**
  - Listado de canales admisibles por inquilino; creación de instancias en Chatwoot para los tipos `api`; disparo del flujo OAuth mediado por Chatwoot para los tipos `oauth`; reflejo del `inbox_id` en el panel.
  - Verificación: un inquilino crea y desactiva sus integraciones sin entrar a Chatwoot; cada tipo muestra su nota de viabilidad; un tipo no admisible no se ofrece.

- [ ] **T-06 · [LAB] Validar el aprovisionamiento por tipo contra Chatwoot 4.19**
  - Confirmar qué tipos de canal permite 4.19 crear/mediar y con qué endpoints; documentar en CHW-001.
  - Verificación: cada tipo de la tabla §5 del design queda marcado `api`/`oauth` confirmado o `is_admissible = false` con su nota; el widget de Website se crea de punta a punta.

## Fase 3 · Configuración del inquilino

- [ ] **T-07 · Crear las migraciones del inquilino**
  - `tenant_bots`, `tenant_ai_providers`, `tenant_model_settings`, `tenant_bot_channels` con auditoría, soft delete y `UNIQUE` declarados.
  - Verificación: `preset_id` y `provider_id`+`model_id` son excluyentes; el mismo canal no se habilita dos veces en un bot.

- [ ] **T-08 · Implementar el alta mínima del bot**
  - Nombre, objetivo, tono, preset (o modelo) y canales; el resto hereda `bot_defaults`; snapshot efectivo por `revision`.
  - Verificación: un bot se crea con 5 campos; dos bots con defaults distintos no se alteran al versionar `bot_defaults`; el snapshot coincide con la resolución documentada.

- [ ] **T-09 · Habilitar el bot por canales**
  - Habilitación/deshabilitación por integración aprovisionada, con saludo opcional por canal.
  - Verificación: un canal sin bot no recibe respuesta automática; un canal desactivado por el inquilino no responde.

- [ ] **T-10 · i18n de la configuración**
  - UI es/en (Español por defecto); etiquetas del catálogo en ambos idiomas.
  - Verificación: el alta del bot se completa en es y en en sin texto incrustado; ninguna etiqueta del catálogo queda sin traducción.

## Fase 4 · BYOK (día uno)

- [ ] **T-11 · Registrar claves BYOK cifradas**
  - AES-256-GCM con AAD `client_id:provider_id` y maquinaria de AUTH-D-04; máscara `last4`; rotación y desactivación.
  - Verificación: la clave no aparece en logs, respuestas ni respaldos en claro; una clave rotada deja la anterior retirada sin borrar la historia; el consumo BYOK queda en `ai_usage_events` con costo 0.

## Fase 5 · Fundaciones de la propuesta de negocio (activación por fases, D-07)

- [ ] **T-12 · Crear las migraciones de billetera y consumo**
  - `wallets`, `wallet_transactions`, `ai_usage_events`, `ai_platform_keys` append-only con índices por `(client_id, created_at)`.
  - `wallet_transactions` con `currency`, `amount_local_cents`, `fx_rate`; `ai_usage_events.purpose` con `bot`/`assist`/`trial`.
  - Verificación: `wallet_transactions` y `ai_usage_events` no admiten UPDATE ni DELETE por el rol de aplicación.

- [ ] **T-13 · Implementar la recarga idempotente**
  - Reusar Wompi + Stripe de BILL-001; webhook con `reference` único, moneda local y FX registrados; una recarga acredita una sola vez.
  - Verificación: dos notificaciones con la misma referencia producen una sola transacción y un solo aumento de saldo; COP y USD se acreditan en USD.

- [ ] **T-14 · Implementar el consumo con débito atómico**
  - Costo = tokens × retail del modelo (costo + spread, 30% por defecto); débito y ledger en una transacción; el saldo nunca queda negativo.
  - Verificación: 1.000 tokens descuentan el monto exacto; saldo insuficiente rechaza sin debitar ni registrar consumo.

- [ ] **T-15 · Implementar el fallback y el historial**
  - Prepago estricto: sin saldo, proveedor BYOK habilitado; si no hay, fallback configurado y pausa del modo Mocter. La billetera cubre bot y asistente.
  - Verificación: el inquilino ve recargas, consumos con tokens/costo y el estado de sus modos; el consumo del asistente usa `purpose = assist`.

- [ ] **T-16 · Auditar precios, claves y saldos; monitorear recaudación**
  - Cambios de proveedor/modelo/spread, registro/rotación de claves, recargas y ajustes en `audit_log`; métricas de consumo y recaudación (OPS-001).
  - Verificación: cada evento sensible tiene actor, entidad y fecha; el dashboard muestra consumo y costo con el desglose declarado.

## Fase 6 · Cierre

- [ ] **T-17 · [LAB] Validar las APIs de los proveedores en modo BYOK**
  - Llamadas reales a los 6 proveedores con la llave del inquilino; versiones de modelo fijadas.
  - Verificación: cada proveedor responde con la versión configurada; los tokens y el costo registrados coinciden con lo reportado por el proveedor.

- [ ] **T-18 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-12 y registrar evidencia por requisito, separando día uno de fundaciones.
  - Verificación: cada requisito tiene prueba o evidencia de laboratorio; ninguno queda «asumido».

- [x] **T-19 · [HUMANO] Aprobar BOT-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.

## Fase 7 · Recordatorios y seguimientos (agregada el 2026-10-23, se ejecuta junto a la Fase 3)

- [ ] **T-20 · Crear las migraciones de recordatorios**
  - `bot_followups`, `bot_followup_steps` y `bot_followup_runs` con auditoría, `(followup_id, position)` único y comentarios.
  - Verificación: `drizzle-kit check` pasa; una secuencia no admite dos pasos con la misma posición.

- [ ] **T-21 · Implementar la configuración de secuencias**
  - UI del inquilino para crear secuencias personalizadas: nombre, inactividad de disparo, pasos con texto y espera, pausa/activación; textos asistidos por AI-001 (`followup_step.message`).
  - Seed por inquilino con la secuencia de ejemplo (`origin = platform_default`, estado `draft`); el inquilino la adopta, edita o archiva.
  - Verificación: una secuencia se crea con pasos ordenados e intervalos libres; el máximo de 10 pasos se respeta; la secuencia por defecto llega como borrador editable y no se envía hasta activarla; pausar la secuencia detiene los envíos pendientes.

- [ ] **T-22 · Implementar la ejecución y las reglas de parada**
  - BOT-002 agenda y envía los pasos por el canal de la conversación; consulta `prospect_consents` antes de cada paso comercial; cancela ante respuesta, agente, revocación o pausa; una secuencia activa por prospecto; auditoría con actor `bot`.
  - Verificación: la respuesta del prospecto cancela los pasos pendientes; sin consentimiento comercial no se envía el paso; el estado queda en `bot_followup_runs` con motivo de parada.

- [ ] **T-23 · [LAB] Validar recordatorios de WhatsApp contra 4.19**
  - Confirmar el comportamiento de la ventana de 24 h y el uso de plantillas aprobadas para mensajes iniciados por el negocio.
  - Verificación: un recordatorio dentro de la ventana se envía como mensaje de sesión; fuera de la ventana exige plantilla y la secuencia lo respeta.
