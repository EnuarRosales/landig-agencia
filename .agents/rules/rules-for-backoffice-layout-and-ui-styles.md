# Regla de Layout Perimetral, Botones Canónicos y Ciclo de Guardado en Modales del Backoffice (SaaS e Inquilino)

> **Estado:** Permanente y no negociable para cualquier desarrollo, refactorización o agente de IA.  
> **Alcance:** Todo el Backoffice unificado en `apps/admin` (Plano de Control SaaS `/admin/*` y Backoffice del Comercio `/workspace/*`).  
> **Directiva:** Garantizar el margen perimetral obligatorio (~1 cm / `md:px-8` en escritorio) respecto a los bordes del contenedor, el uso exclusivo de los estilos canónicos de botones (`--dsn-accent` y `--dsn-surface`) y el cierre automático de modales tras guardar cambios.

---

## 1. Espaciado Perimetral Obligatorio de Contenedor (`~1 cm` en Escritorio)

Tanto `<AdminShell>` (`apps/admin/components/admin-shell.tsx`) como `<TenantWorkspaceShell>` (`apps/admin/components/tenant-workspace-shell.tsx`) renderizan `<main className="flex-1 min-w-0 min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)]">` sin `padding` interno forzado para permitir casos especiales de lienzo completo (como el iframe embebido de Chatwoot).

Por consiguiente, **toda vista o página estándar de gestión en `/admin/*` y `/workspace/*` DEBE declarar obligatoriamente en su nodo raíz**:

```tsx
<div className="w-full space-y-6 p-4 md:px-8 md:py-6">
  {/* Contenido de la vista */}
</div>
```

### Reglas de cumplimiento:
1. **Móvil (`< 768px`, Mobile First):** `p-4` (`1rem` / `16px`) en los cuatro bordes.
2. **Escritorio (`>= 768px`):** `md:px-8` (`2rem` / `32px`, equivalente a `~1 cm` visual de separación respecto al borde derecho del sidebar lateral y al margen derecho de la ventana) y `md:py-6` (`1.5rem` / `24px` superior e inferior).
3. **Prohibición:** Queda terminantemente prohibido iniciar una vista de página con `<div className="space-y-6">` sin incluir `w-full p-4 md:px-8 md:py-6`, ya que deja los textos, tarjetas y tablas pegados al borde divisor del menú lateral y al extremo derecho del monitor.

---

## 2. Encabezado de Vista (`<header>`) y Botones de Acción Canónicos

Toda vista operativa del Backoffice SaaS e Inquilino debe presentar un encabezado consistente con línea divisoria inferior y botones alineados al sistema de diseño (`DSN-001`):

```tsx
<header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
  <div>
    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
      Título de la Vista en Title Case
    </h1>
    <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
      Subtítulo descriptivo o contador operativo.
    </p>
  </div>

  <div className="flex flex-wrap items-center gap-2">
    {/* Botones secundarios y primarios */}
  </div>
</header>
```

### 2.1 Botón de Acción Secundaria (ej. «Actualizar», «Proveedores y Llaves AI»)
- **Clases obligatorias:**
  ```tsx
  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
  ```
- **Icono interno:** Debe llevar color de acento `className="h-4 w-4 text-[var(--dsn-accent)]"`.

### 2.2 Botón de Acción Primaria (ej. «Registrar Nuevo Producto», «Guardar Cambios»)
- **Clases obligatorias:**
  ```tsx
  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
  ```
- **Icono interno:** En blanco heredado `className="h-4 w-4"`.

### 2.3 Prohibición de Tokens CSS Inexistentes (`--dsn-primary`)
- En `apps/admin/app/globals.css`, el token semántico de acción principal y acento de marca es **`--dsn-accent`** (junto con `--dsn-accent-hover` y `--dsn-accent-fg`).
- Queda **estrictamente prohibido** usar `bg-[var(--dsn-primary)]`, `text-[var(--dsn-primary)]` o `border-[var(--dsn-primary)]`. Dicho token no existe en el sistema de diseño y provoca que los botones primarios se rendericen con fondo transparente e invisibles sobre el lienzo oscuro.

---

## 3. Cierre Automático de Modales de Formulario al Guardar

En cualquier modal de creación o edición de recursos (productos, canales de pago, contactos, miembros de equipo, planes, celdas, etc.):

1. **Cierre inmediato tras persistencia exitosa:** Al pulsar la acción primaria de confirmación/guardado (ej. «Guardar Producto», «Guardar Cambios») y recibir respuesta satisfactoria del servidor (`200 OK` o `201 Created`), el callback `onSaved` en la vista padre **DEBE cerrar el modal de inmediato (`setFormOpen(false)` y limpiar el estado de edición)**, actualizar el listado reactivamente y mostrar el mensaje de confirmación en el banner/toast de la vista principal.
2. **Prohibición de modales huérfanos tras guardar:** Nunca debe obligarse al usuario a pulsar «Cancelar» o la «X» para salir de un modal cuyos cambios ya fueron guardados con éxito.
3. **Única excepción permitida:** Botones secundarios de flujo guiado multipaso cuya etiqueta indique explícitamente la permanencia en el modal (por ejemplo, *«Guardar y Continuar a Multimedia»* durante el alta inicial de un producto para habilitar la subida de archivos vinculados al nuevo ID).

---

## 4. Verificación en Pruebas Unitarias e Integración

Toda prueba de componente (`*.test.tsx`) que valide el guardado de un formulario modal debe verificar explícitamente:
- Que la llamada HTTP (`POST` / `PUT` / `PATCH`) fue ejecutada.
- Que el diálogo modal se desmonta o deja de estar visible tras completarse el guardado estándar.
