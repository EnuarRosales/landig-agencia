"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

/**
 * Página interactiva de documentación OpenAPI para desarrolladores.
 *
 * Utiliza el motor moderno de `@scalar/api-reference-react` conectado directamente
 * al endpoint canónico `/api/openapi.json`.
 */
export default function ApiDocsPage() {
  return (
    <main className="min-h-screen w-full bg-[#0b0f19]">
      <ApiReferenceReact
        configuration={{
          spec: {
            url: "/api/openapi.json",
          },
          theme: "deepSpace",
          layout: "modern",
          darkMode: true,
          hideModels: false,
        }}
      />
    </main>
  );
}
