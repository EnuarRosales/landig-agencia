# BOT-002 · Tareas · Motor de atención y composición dinámica de prompts

| Atributo | Valor |
|---|---|
| ID | BOT-002 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que BOT-002 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: ADM-001 (contexto de negocio, productos, etiquetas), BOT-001 (BYOK, canales) y CHW-001 (envío y etiquetas).

## Fase 0 · Decisiones

- [x] **T-01 · [HUMANO] Cerrar la decisión de separadores y tiempos**
  - Resuelta (D-09): perfiles por canal + tiempo adaptativo + presets de ritmo acotados.
  - Verificación: la decisión queda registrada en `requirements.md` §5 y en la trazabilidad (L4).

## Fase 1 · Bloques y compositor

- [ ] **T-02 · Crear las migraciones de bloques y estado**
  - `bot_prompt_blocks` (Router) versionado y `conversation_state`; auditoría y únicos declarados.
  - Verificación: `drizzle-kit check` pasa; solo una versión `active` por bloque.

- [ ] **T-03 · Sembrar los bloques de plataforma**
  - Identidad, personalidad, saludo, multimedia, splits, flujo de pedido, cierre, clasificador y formato, en es/en.
  - Verificación: el preview compone un prompt completo para un producto; cada bloque muestra su versión.

- [ ] **T-04 · Implementar el compositor en runtime**
  - Lee bloques + contexto del inquilino + producto activo + estado; arma el prompt por turno sin regeneración; registra versiones usadas.
  - Incluye el motor de burbujas: perfil por canal, pausa adaptativa 800–5.000 ms, máximo 4 burbujas y presets natural/rápido/pausado.
  - Verificación: agregar un producto y abrir conversación nueva lo incluye sin job; una conversación no mezcla productos; WhatsApp respeta el orden y las pausas del rango; un fallo de una burbuja no bloquea el resto.

- [ ] **T-05 · Implementar caché e invalidación**
  - Clave por versiones y TTL de respaldo; invalidación al cambiar bot, producto, políticas o bloques.
  - Verificación: editar un producto invalida su entrada y el siguiente turno usa la versión nueva.

## Fase 2 · Atención y clasificación

- [ ] **T-06 · Implementar el estado de conversación**
  - Ciudad, nombre, producto activo, cantidad, método de envío, etapa y última etiqueta; persistencia por conversación.
  - Verificación: cambiar de producto conserva ciudad y nombre; el prompt no crece con el historial.

- [ ] **T-07 · Implementar el clasificador de leads**
  - Bloque `core.classifier`, últimos 10 turnos, salida validada contra los 4 slugs, aplicación en prospecto y Chatwoot.
  - Verificación: solo devuelve los 4 slugs; una salida inválida no cambia la etiqueta; `compra-realizada` solo con evidencia de registro.

- [ ] **T-08 · Implementar la captura de pedido y el cierre**
  - Flujo de método de envío, plantilla única de datos, `registrar_pedido` idempotente, cierre y etiqueta.
  - Verificación: dos ejecuciones de la misma conversación no duplican pedido; el cierre se envía una sola vez.

## Fase 3 · Verificación y cierre

- [ ] **T-09 · Implementar la vista previa del prompt**
  - Prompt compuesto por inquilino/producto con bloques y conteo de tokens.
  - Verificación: el preview coincide con lo que consume el motor para la misma versión.

- [ ] **T-10 · [LAB] Validar el motor contra Chatwoot 4.19**
  - Webhook entrante, envío multiburbuja con separadores, marcadores de multimedia y etiquetas.
  - Verificación: el orden multimedia → beneficios → ubicación se respeta; las etiquetas aparecen en la conversación.

- [ ] **T-11 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-06 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia de laboratorio; ninguno queda «asumido».

- [x] **T-12 · [HUMANO] Aprobar BOT-002 (2026-10-25)**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
