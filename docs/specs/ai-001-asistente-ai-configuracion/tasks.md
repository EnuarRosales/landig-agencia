# AI-001 · Tareas · Asistente AI de configuración

| Atributo | Valor |
|---|---|
| ID | AI-001 |
| Versión | 0.2 (Aprobada — decisiones O-01 y O-02 cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que AI-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: BOT-001 Fase 4 (BYOK) y las pantallas de configuración de ADM-001 y CRM-001.

## Fase 0 · Decisiones

- [ ] **T-01 · [HUMANO] Definir el catálogo inicial de campos asistidos**
  - Lista de campos de la Fase 1 (bot, productos, prospectos, perfil) con sus prompts maestros, `input_hint` y ejemplos de evaluación.
  - Verificación: cada campo asistible tiene prompt maestro y ejemplos; el dueño del producto aprueba el contenido en es/en.

## Fase 1 · Biblioteca de prompts

- [ ] **T-02 · Crear las migraciones de la biblioteca**
  - `ai_assist_fields` y `ai_assist_prompts` con auditoría (RF-10.9), `(field_key, version)` único y comentarios.
  - Verificación: `drizzle-kit check` pasa; una sola versión `active` por campo.

- [ ] **T-03 · Construir la zona de administración de prompts**
  - UI de plataforma para registrar campos y versionar prompts con estado `draft`/`active`/`retired`, etiquetas es/en y batería de ejemplos.
  - Verificación: un prompt `draft` no se usa; un `retired` no aparece en el campo; el cambio queda auditado.

## Fase 2 · Flujo «Mejorar con AI»

- [ ] **T-04 · Implementar el endpoint del asistente**
  - Ensamblado `master_prompt` + borrador + `output_rules` con el locale; inferencia por BYOK (BOT-001) o por la billetera Mocter cuando esté activa; sin proveedor, 409 con aviso.
  - El modelo por defecto es propio del asistente, configurable por plataforma y distinto del modelo del bot.
  - Verificación: la sugerencia llega en el idioma del inquilino; sin BYOK ni saldo el endpoint rechaza; el consumo queda en `ai_usage_events` con `purpose = 'assist'`.

- [ ] **T-05 · Implementar la UI del botón**
  - «Mejorar con AI» en cada campo asistido con `input_hint`; comparación borrador/sugerencia; editar, aceptar o descartar.
  - Verificación: la sugerencia no se guarda sin aceptar; al aceptar, el campo pasa sus validaciones normales y se registra `source = ai_suggested` en `audit_log`.

- [ ] **T-06 · Rate limiting y estados**
  - Límite por inquilino para el botón; aviso cuando no hay proveedor ni saldo. No hay límite mensual separado: BYOK es libre y Mocter consume la billetera del bot.
  - Verificación: pasando el límite, el botón responde con `Retry-After`; el aviso explica cómo habilitar BYOK o recargar.

## Fase 3 · Calidad y cierre

- [ ] **T-07 · Medir la calidad de los prompts**
  - Tasa de aceptación por campo y batería de ejemplos de evaluación en cada cambio de prompt o modelo.
  - Verificación: un cambio de prompt se evalúa antes de activarse; la métrica de aceptación está en el panel de plataforma.

- [ ] **T-08 · [LAB] Evaluar los prompts maestros y fijar el modelo del asistente**
  - Correr la batería de ejemplos contra los modelos candidatos y registrar calidad/costo por modelo.
  - Verificación: cada campo tiene un resultado por modelo; el modelo propio por defecto del asistente queda justificado y configurable por plataforma.

- [ ] **T-09 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-05 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia de laboratorio; ninguno queda «asumido».

- [x] **T-10 · [HUMANO] Aprobar AI-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
