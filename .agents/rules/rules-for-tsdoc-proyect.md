# Regla de Documentación TSDoc para el Proyecto Mocter

> **Estado:** Permanente y obligatoria para todos los desarrolladores y agentes de IA.  
> **Alcance:** Todo el código TypeScript y JavaScript en el monorepo (`apps/*`, `packages/*`).  
> **Idioma:** Español (técnico, neutral, preciso y conciso).  
> **Estándar:** TSDoc (especificación formal de documentación para TypeScript, compatible con JSDoc).

---

## 1. Principio Fundamental y Objetivo

Toda entidad de código exportada o con lógica no trivial (clases, interfaces, tipos, funciones, métodos, Server Actions y Route Handlers) debe contar con documentación **TSDoc**.

La documentación debe cumplir una doble función:
1. **Para Humanos:** Proveer contexto rápido, comprender el propósito de negocio, precondiciones, efectos secundarios y ejemplos de uso sin necesidad de leer la implementación completa.
2. **Para Agentes de IA:** Servir como contexto semántico de alta fidelidad, permitiendo a los LLMs sintetizar responsabilidades, inferir contratos de frontera, evitar alucinaciones en tipos o validaciones, y respetar las decisiones arquitectónicas.

---

## 2. Idioma y Tono

- **Idioma exclusivo:** Español técnico neutral.
- **Tono:** Claro, riguroso, directo y profesional.
- **Enfoque:** Explicar el **QUÉ**, el **POR QUÉ** y las **RESTRICCIONES**. Evitar comentarios triviales o tautológicos (ejemplo a evitar: `/** Obtiene el nombre */ getName()`).

---

## 3. Formato Estándar de Bloque TSDoc

Todo bloque debe iniciar con `/**` y cerrar con `*/`. Cada línea intermedia debe iniciar con ` * `.

### 3.1 Estructura del Bloque

```typescript
/**
 * [Resumen ejecutivo en una o dos líneas que describe el propósito de la entidad].
 *
 * [Descripción detallada opcional: contexto arquitectónico, consideraciones de
 * rendimiento, efectos secundarios o decisiones de diseño relevantes].
 *
 * @param nombreParametro - Descripción del parámetro, formato esperado o restricciones.
 * @returns Descripción clara del valor retornado en caso de éxito y casos borde (null/undefined).
 * @throws {NombreError} Circunstancias bajo las cuales se propaga una excepción.
 * @remarks Advertencias de concurrencia, efectos colaterales o integraciones externas.
 * @example
 * ```typescript
 * const resultado = await servicio.ejecutar({ ... });
 * ```
 */
```

---

## 4. Etiquetas TSDoc Obligatorias y Convenciones

| Etiqueta | Obligatoriedad | Uso y Buenas Prácticas |
|---|---|---|
| *(Resumen)* | **Obligatorio** | Primera línea del bloque. Describe la intención central de la entidad en tiempo presente indicativo ("Registra un prospecto...", "Verifica la conectividad..."). |
| `@param` | **Obligatorio si hay parámetros** | Sintaxis: `@param nombre - Descripción`. En TypeScript no se coloca el tipo `{string}` entre llaves, ya que el compilador lo provee. Debe documentar restricciones semánticas (ej. formato E.164, longitud máxima, si permite nulos). |
| `@returns` | **Obligatorio si retorna valor** | Describe qué entrega la función, el significado de los datos retornados y qué significa que devuelva `null` o estructuras `Result<T, E>`. |
| `@throws` | **Obligatorio si arroja excepciones** | Indica qué error puede lanzar (`@throws {Error}`, `@throws {DatabaseError}`) y bajo qué condición (ej. timeout, credenciales inválidas). Si la función usa `Result Pattern` y no arroja excepciones, debe indicarse explícitamente en el resumen. |
| `@remarks` | Recomendado en lógica compleja | Notas adicionales sobre arquitectura, idempotencia, costo computacional, bloqueos de hilos o dependencias externas. |
| `@example` | Obligatorio en contratos públicos / servicios | Bloque de código TypeScript cerrado con tres tildes invertidas mostrando una invocación representativa. |
| `@deprecated` | Obligatorio en código obsoleto | Debe explicar por qué se depreca y cuál es la alternativa moderna recomendada (usando `{@link ...}`). |
| `{@link ...}` | Recomendado para referencias | Permite navegación cruzada hacia otros símbolos (ej. `{@link ILeadRepository}`). |

---

## 5. Reglas por Tipo de Elemento

### 5.1 Servicios y Clases
- Describir la responsabilidad del servicio dentro de la Clean Architecture.
- Documentar las dependencias inyectadas a través del constructor.
- Documentar si la instancia es singleton o requiere instanciación por petición.

### 5.2 Interfaces y Contratos de Repositorio
- Toda interfaz de repositorio debe documentar qué entidad de persistencia administra.
- Cada método debe especificar el comportamiento ante registros no encontrados (ej. si retorna `null` o arroja error).

### 5.3 Tipos y Esquemas (`type`, `interface`, Zod)
- Documentar el propósito del modelo de datos o DTO.
- En propiedades no evidentes, añadir un comentario TSDoc de una línea sobre la propiedad.

### 5.4 Server Actions y Route Handlers (Next.js)
Deben documentar explícitamente:
1. **Canal de entrada:** Si es Server Action de React o Route Handler HTTP REST.
2. **Método HTTP y ruta:** Ej. `POST /api/leads`.
3. **Códigos de respuesta:** Lista de códigos HTTP generados (ej. `201 Created`, `400 Bad Request`, `429 Too Many Requests`, `503 Service Unavailable`).
4. **Mecanismos de protección:** Si aplica Rate Limiting, CORS, autenticación o sanitización.

---

## 6. Ejemplos Canónicos del Proyecto

### Ejemplo 1: Método de Servicio de Dominio

```typescript
/**
 * Valida y registra un nuevo prospecto en la plataforma.
 *
 * Realiza la validación estricta de datos mediante {@link leadSchema}. Si los datos
 * son válidos, delega la persistencia al {@link ILeadRepository} inyectado.
 * Implementa el patrón Result para no propagar excepciones no controladas a las capas de presentación.
 *
 * @param rawInput - Objeto con los datos crudos provenientes de formularios web o peticiones REST.
 * @returns Un objeto {@link Result} con el registro creado o el detalle de los errores de validación/persistencia.
 *
 * @example
 * ```typescript
 * const resultado = await leadService.registerLead({
 *   name: "Sofía Gómez",
 *   email: "sofia@empresa.com",
 *   phone: "+573001234567",
 *   message: "Interesada en demo"
 * });
 *
 * if (resultado.ok) {
 *   console.log("Lead creado:", resultado.data.id);
 * }
 * ```
 */
async registerLead(rawInput: unknown): Promise<RegisterLeadResult> {
  // ...
}
```

### Ejemplo 2: Contrato de Repositorio

```typescript
/**
 * Contrato de persistencia para la entidad de prospectos (leads).
 *
 * Desacopla la lógica de negocio de la implementación de base de datos subyacente
 * (Drizzle ORM, PostgreSQL, o repositorios en memoria para pruebas).
 */
export interface ILeadRepository {
  /**
   * Inserta un nuevo lead en la base de datos de manera persistente.
   *
   * @param input - Datos validados y listos para persistir según {@link LeadInput}.
   * @returns El registro completo del lead recién creado incluyendo identificador y timestamp.
   * @throws {Error} Si la base de datos no está disponible o la inserción no retorna filas.
   */
  create(input: LeadInput): Promise<Lead>;

  /**
   * Busca un lead por su identificador único universal (UUID).
   *
   * @param id - Identificador UUID del lead.
   * @returns El lead encontrado o `null` si no existe coincidencia.
   */
  findById(id: string): Promise<Lead | null>;
}
```

### Ejemplo 3: Route Handler REST

```typescript
/**
 * Route Handler REST para la recepción pública de solicitudes de prospectos.
 *
 * Endpoint expuesto para integraciones externas, clientes móviles y webhooks.
 * Aplica protección de tasa (Rate Limiting) por dirección IP antes de procesar
 * la carga útil con {@link leadService}.
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/leads`
 * - **Respuestas:**
 *   - `201 Created`: Lead registrado exitosamente.
 *   - `400 Bad Request`: JSON malformado o falla de validación Zod.
 *   - `429 Too Many Requests`: Se excedió el límite de peticiones por minuto.
 *   - `500 Internal Server Error`: Falla de persistencia en PostgreSQL.
 *
 * @param req - Objeto de petición {@link NextRequest} entrante.
 * @returns Respuesta HTTP {@link NextResponse} en formato JSON.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ...
}
```

---

## 7. Mantenimiento y Verificación

- Todo Pull Request que agregue o modifique funciones, clases o endpoints debe incluir la actualización de sus bloques TSDoc correspondientes.
- La eliminación o modificación de argumentos sin actualizar el bloque `@param` correspondiente se considera un error de integración.
- Los agentes de IA deben leer y aplicar estas convenciones antes de generar o editar cualquier archivo TypeScript en el repositorio.
