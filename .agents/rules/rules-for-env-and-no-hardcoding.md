# Regla del Agente: Prohibición de Hardcoding y Validación Estricta con @t3-oss/env-nextjs

> **Estado:** Permanente y no negociable para desarrolladores y agentes de IA.  
> **Alcance:** Todo el monorepo (`apps/*`, `packages/*`).  
> **Propósito:** Asegurar que el agente no use datos fijos ni acceda a `process.env` de forma directa o insegura. Toda configuración debe estar tipada, validada y segmentada estrictamente entre Cliente y Servidor mediante `@t3-oss/env-nextjs` (o `@t3-oss/env-core`) y `zod`.

---

## 1. Directiva Principal

Queda estrictamente prohibido usar valores fijos (hardcoded) o acceder directamente a `process.env` en cualquier archivo del proyecto. Toda configuración externa debe ser procesada a través del módulo centralizado de entorno. El incumplimiento de esto se considera un fallo crítico de seguridad y mantenibilidad.

---

## 2. Arquitectura de Configuración Requerida

El agente debe centralizar la validación creando o editando el archivo `env.ts` utilizando exactamente la siguiente estructura nativa del paquete:

```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_RATE_LIMIT_PEPPER: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_API_URL: z.string().url(),
  },
  // Necesario para Next.js: Desestructura manualmente las variables del cliente
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_RATE_LIMIT_PEPPER: process.env.AUTH_RATE_LIMIT_PEPPER,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
});
```

---

## 3. Criterios de Aplicación y Consumo en Código

- **Consumo Único:** Para leer cualquier configuración, el agente debe usar exclusivamente: `import { env } from "@/env";`. No se permite el uso de `process.env`.
- **Protección de Datos Fijos en JSX:** Datos estáticos repetitivos de la UI (enlaces de navegación, configuraciones de temas, textos de cabeceras, rutas estáticas) no deben escribirse directamente en el JSX. Deben extraerse a un archivo de configuración tipado `config/site.ts`.
- **Seguridad Cliente/Servidor:** El agente no debe intentar importar variables del objeto `server` dentro de componentes de cliente (`"use client"`). El paquete `@t3-oss/env-nextjs` lanzará un error en tiempo de ejecución si esto ocurre, y el agente debe preverlo.

---

## 4. Protocolo de Validación Obligatorio (Auto-Corrección del Agente)

Antes de dar por buena cualquier generación de código, el agente debe validar:

1. **¿He introducido una nueva URL, Token o Credencial externa?** Si la respuesta es sí, debo agregarla obligatoriamente a los objetos `server` o `client` (y `runtimeEnv`) en `env.ts`, además de actualizar el archivo `.env.example`.
2. **¿Existe algún valor literal (String/Número) que cambie entre desarrollo y producción?** Si existe, se debe parametrizar inmediatamente a través del validador de entorno.
