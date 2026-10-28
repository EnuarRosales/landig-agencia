# Regla de Prohibición de Código y Dependencias Deprecadas en Mocter

> **Estado:** Permanente y obligatoria para todos los desarrolladores y agentes de IA.  
> **Alcance:** Todo el monorepo (`apps/*`, `packages/*`).  
> **Directiva:** Cero tolerancia al uso de APIs, funciones, métodos, convenciones o paquetes marcados como `@deprecated`.

---

## 1. Principio Fundamental

Queda estrictamente prohibido introducir, conservar o migrar código que utilice APIs, métodos, funciones, convenciones de archivos o paquetes de terceros formalmente marcados como `@deprecated` (en anotaciones TSDoc/JSDoc, firmas TypeScript, advertencias de compilador o documentación oficial de los proveedores).

El código de Mocter debe construirse exclusivamente sobre las interfaces estables y canónicas recomendadas vigentes.

---

## 2. Directivas Específicas

1. **Detección Temprana en Editor y Tipos:**
   Si una función o propiedad aparece tachada en TypeScript o documentada con el tag `@deprecated` (por ejemplo, `setRequestLocale` en `next-intl`), no debe utilizarse. Se debe adoptar de inmediato la alternativa canónica documentada por la biblioteca.

2. **Resolución de Advertencias del Framework (Next.js / React / Drizzle):**
   Las advertencias de deprecación emitidas durante el proceso de compilación (`next build`), pruebas (`vitest`) o análisis estático (`eslint`) deben ser resueltas antes de dar por completada cualquier tarea o compuerta SDD.

3. **No Agregar Paquetes Obsoletos:**
   No se permite la adición de dependencias que hayan entrado en estado de fin de ciclo de vida (EOL), abandono o deprecación oficial por parte de sus mantenedores.

4. **Refactorización Continua al Detectar Deprecaciones:**
   Si durante una tarea o inspección se detecta código preexistente que invoca funciones deprecadas, el agente o desarrollador debe reportarlo, eliminar el uso de la API obsoleta y validar la suite automatizada contra la alternativa moderna recomendada.
