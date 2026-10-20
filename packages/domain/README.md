# @mocter/domain — Capa de Dominio y Persistencia

Capa de dominio agnóstica de frameworks para la plataforma **Mocter**. Centraliza el modelo de datos, los esquemas de validación con Zod, las migraciones de base de datos con Drizzle ORM y la gestión resiliente de conexiones a PostgreSQL 18+.

---

## 1. Responsabilidad Arquitectónica

Siguiendo los principios de **Clean Architecture**, `@mocter/domain` no posee dependencias directas con librerías de interfaz de usuario ni frameworks web (como React o Next.js). Su objetivo es garantizar la integridad del negocio y encapsular la persistencia:

- **Aislamiento de Reglas de Negocio:** Validación unificada y estricta de prospectos y contratos de entrada.
- **Persistencia Tipada:** Esquemas Drizzle que aseguran congruencia absoluta entre TypeScript y PostgreSQL.
- **Conexión Resiliente:** Pool de conexiones perezoso (*lazy pooling*), verificación proactiva de salud (`checkDatabaseConnection`) y estrategia fail-fast ante configuraciones ausentes.

---

## 2. Puntos de Entrada Públicos (Public Exports)

El paquete expone tres módulos independientes para evitar importaciones circulares o acoplamientos innecesarios:

```typescript
import { leads, type Lead, type NewLead } from '@mocter/domain/schema';
import { leadSchema, type LeadInput } from '@mocter/domain/validation';
import { db, insertLead, checkDatabaseConnection } from '@mocter/domain/db';
```

### 2.1 `./schema` — Modelo Relacional Drizzle
- **`leads`:** Definición de la tabla relacional en PostgreSQL.
- **`Lead`:** Tipo inferido para registros existentes (`select`).
- **`NewLead`:** Tipo inferido para inserciones (`insert`).

### 2.2 `./validation` — Contratos de Entrada (Zod)
- **`leadSchema`:** Esquema Zod con reglas de validación y claves de error internacionalizables:
  - `name`: Cadena recortada (*trimmed*), entre 2 y 120 caracteres.
  - `email`: Formato de correo electrónico válido, máximo 160 caracteres.
  - `phone`: Formato telefónico compatible con estándares locales e internacionales (E.164).
  - `message`: Campo opcional/anulable, recortado y normalizado a `null` si está vacío (máx. 1.000 caracteres).
- **`LeadInput`:** Tipo estricto inferido `z.infer<typeof leadSchema>`.

### 2.3 `./db` — Cliente PostgreSQL y Operaciones
- **`db`:** Instancia singleton de Drizzle ORM sobre el cliente ultraligero `postgres-js`.
- **`insertLead(input: LeadInput): Promise<Lead>`:** Inserción parametrizada segura que retorna la entidad persistida.
- **`checkDatabaseConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>`:** Chequeo de diagnóstico (`SELECT 1`) con captura de latencia y errores de red o autenticación.

---

## 3. Modelo de Datos (`leads`)

Estructura de la tabla principal en PostgreSQL 18+:

| Columna | Tipo PostgreSQL | Restricciones / Valor por Defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único universal. |
| `name` | `varchar(120)` | `NOT NULL` | Nombre completo del prospecto o empresa. |
| `email` | `varchar(160)` | `NOT NULL` | Correo electrónico corporativo o personal. |
| `phone` | `varchar(30)` | `NOT NULL` | Número telefónico de contacto / WhatsApp. |
| `message` | `text` | `NULL` | Requerimiento o mensaje inicial. |
| `created_at` | `timestamp with time zone` | `NOT NULL DEFAULT now()` | Marca temporal en UTC de creación del registro. |

---

## 4. Contratos de Ejecución y Reglas de Uso

1. **Validación previa requerida:** La función `insertLead` no re-valida las entradas en tiempo de ejecución de base de datos; asume que el consumidor invocó previamente `leadSchema.parse()` o `leadSchema.safeParse()`.
2. **Inicialización perezosa (Lazy Connection):** Importar `@mocter/domain` no abre sockets de red inmediatamente. El pool se conecta únicamente al ejecutar la primera consulta.
3. **Fail-Fast en configuración:** Si `DATABASE_URL` no está definida en tiempo de ejecución, el cliente arroja inmediatamente una excepción clara en lugar de fallar silenciosamente con intentos a `localhost`.

---

## 5. Scripts y Comandos Disponibles

Todos los comandos se ejecutan desde la raíz del monorepo mediante el filtro de workspace:

```bash
# Generar nuevas migraciones SQL a partir de cambios en src/schema.ts (modo offline)
pnpm --filter @mocter/domain db:generate

# Aplicar migraciones pendientes contra la base de datos configurada en DATABASE_URL
pnpm --filter @mocter/domain db:migrate

# Ejecutar la suite de pruebas unitarias con Vitest
pnpm --filter @mocter/domain test

# Verificación estricta de tipado estático con TypeScript (tsc --noEmit)
pnpm --filter @mocter/domain build
```

---

## 6. Configuración y Migraciones

- **Archivo de configuración:** `drizzle.config.ts`.
- **Dialecto:** PostgreSQL.
- **Ruta del esquema:** `./src/schema.ts`.
- **Ruta de salida de migraciones:** `./drizzle/`.
- Las migraciones generadas en `./drizzle` se montan automáticamente en los contenedores Docker en `/docker-entrypoint-initdb.d` para la inicialización idempotente de la base de datos.

---

## 7. Licencia y Derechos

Propiedad exclusiva de **Mocter**. Prohibida su copia, distribución o uso sin autorización previa por escrito.
**Copyright © 2026 Mocter · Todos los derechos reservados.**
