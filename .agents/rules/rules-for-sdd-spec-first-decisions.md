# Directiva · Protocolo Spec-First ante Dudas y Decisiones (SDD)

> **Estado:** Permanente y no negociable para cualquier agente de IA o desarrollo en este repositorio.
> **Alcance:** Toda especificación bajo `docs/specs/<id>-<nombre>/` y cualquier implementación derivada.
> **Directiva:** Ninguna duda, ambigüedad o vacío funcional/técnico detectado en una especificación se resuelve por suposición en código; primero se pregunta, luego se actualiza la especificación y solo después se implementa.

---

## 1. Detección de Dudas o Vacíos Antes de Implementar

Al analizar o retomar cualquier especificación (`requirements.md`, `design.md`, `tasks.md`), el agente debe contrastar sus definiciones contra:

1. El estado real del código, esquemas de base de datos y migraciones vigentes.
2. Las directivas permanentes en `.agents/AGENTS.md` y `.agents/rules/*.md`.
3. Otras especificaciones relacionadas ya implementadas o aprobadas.

Si surge cualquier duda funcional, borde sin definir o contradicción con el código actual:

- **Detener la implementación** del bloque afectado antes de escribir código.
- **Formular la pregunta** de forma concreta, con la evidencia encontrada en el código/spec y los tradeoffs relevantes.
- **Esperar respuesta explícita** del usuario antes de asumir comportamientos.

## 2. Regla «Primero la Spec, Luego el Código»

Una vez tomada cada decisión con el usuario:

1. **Actualizar la especificación primero** en los archivos que correspondan (`requirements.md`, `design.md` y/o `tasks.md`), registrando explícitamente:
   - La nueva decisión numerada (`D-XX`) con su justificación en `requirements.md`.
   - El ajuste en reglas de negocio (`RN-*`), modelo de datos, contratos API/DTO o criterios de aceptación afectados.
   - El reflejo técnico en `design.md` y el plan de verificación en `tasks.md`.
2. **Solo después de dejar la especificación consistente y actualizada**, continuar con la implementación de las tareas en el orden definido por `tasks.md`.

## 3. Prohibiciones

- Prohibido implementar «arreglos silenciosos» que diverjan de `requirements.md` o `design.md` sin actualizar ambos documentos primero.
- Prohibido diferir la actualización de la spec para el final de la implementación cuando se hayan tomado decisiones de diseño o negocio durante el análisis.
