# Regla de Modales de Confirmación del Sistema de Diseño y Prohibición de Diálogos Nativos

> **Estado:** Permanente y no negociable para cualquier desarrollo, refactorización o agente de IA.  
> **Alcance:** Todo el monorepo (`apps/web`, `apps/admin`, componentes de UI).  
> **Directiva:** Prohibición estricta de `window.alert()`, `window.confirm()`, `window.prompt()` o diálogos nativos del navegador. Toda confirmación, advertencia, flujo destructivo o cambio de estado operativo debe utilizar modales contextuales gobernados por los tokens del sistema de diseño Mocter.

---

## 1. Principio Fundamental

Queda **estrictamente prohibido** utilizar las APIs nativas del navegador (`alert()`, `confirm()`, `prompt()` o `window.*`) para cualquier interacción, confirmación, error o advertencia en toda la plataforma Mocter.

Los diálogos nativos del navegador violan los principios de diseño de Mocter:
1. **Quiebran la experiencia de usuario (UX):** Un popup gris nativo con la leyenda `localhost:3003 dice` o `admin.mocter.co dice` rompe la inmersión y degrada la calidad percibida de la aplicación.
2. **Bloquean el hilo de ejecución:** Detienen de forma síncrona el event loop del navegador, impidiendo animaciones y actualizaciones fluidas de interfaz.
3. **Incompatibilidad visual:** No respetan el modo oscuro/claro, la tipografía ni las variables semánticas del sistema de diseño (`--dsn-*`).
4. **Cero accesibilidad estándar:** No implementan contratos semánticos (`role="dialog"`, `aria-modal="true"`, trampas de foco accesibles, cierre unificado con ESC ni transiciones de entrada).
5. **Falta de contexto y datos del negocio:** Un simple texto de confirmación no permite visualizar los metadatos relevantes del recurso antes de actuar (inquilinos vinculados, slugs, capacidades o advertencias de irreversibilidad).

---

## 2. Anatomía Obligatoria de los Modales de Confirmación

Toda confirmación contextual (eliminación física, retiro lógico, drenado de recursos, cambios de estado operativo, restauración a valores por defecto o acciones críticas) debe reproducir con exactitud la anatomía y tokens del sistema de diseño de Mocter:

### 2.1 Contenedor y Capas (Backdrop & Surface)

- **Backdrop:** Overlay con desenfoque de fondo y animación de entrada:
  `fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200`
- **Superficie del Modal:** Caja contenida, bordes suaves y sombra profunda del sistema:
  `w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl`
- **Accesibilidad Semántica:** Obligatorio declarar `role="dialog"`, `aria-modal="true"`, y asociar `aria-labelledby="<id>-title"` al encabezado del modal.

### 2.2 Encabezado (Header)

- **Iconografía Semántica:**
  - **Acción Destructiva / Crítica (Hard Delete):** Icono `Trash2` o `AlertTriangle` en tono carmesí (`text-rose-600 dark:text-rose-400`).
  - **Advertencia / Retiro / Drenado (Soft Delete / Draining):** Icono `Archive`, `ShieldAlert` o `AlertTriangle` en tono ámbar (`text-amber-600 dark:text-amber-400`).
  - **Restablecimiento / Operación Neutral:** Icono `RefreshCw` o `Info` en tono de acento (`text-[var(--dsn-accent)]`).
- **Título:** Formulado obligatoriamente en formato **Tipo Título (Title Case)** estricto con las iniciales en mayúscula (AGENTS.md §4.8), por ejemplo: *«Eliminación De Célula De Datos»*, *«Drenado De Célula De Datos»*, *«Restauración De Marca Visual»*.
- **Botón de Cierre:** Icono `X` (`h-4 w-4`) en la esquina superior derecha con hover suave (`hover:bg-[var(--dsn-surface-secondary)]`).

### 2.3 Tarjeta de Metadatos del Recurso (Summary Card)

Antes de confirmar cualquier acción, se deben presentar en una tarjeta resumen los atributos clave del recurso afectado:
- **Estilo:** `rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3.5 space-y-1.5 text-xs`.
- **Estructura clave-valor:** Etiqueta en `text-[var(--dsn-text-secondary)]`, valor en `font-semibold text-[var(--dsn-text)]` o `font-mono text-[var(--dsn-accent)]`.

### 2.4 Banner de Advertencia y Salvaguarda (Alert Box)

Una caja destacada que describe detalladamente el impacto operativo o técnico de la acción:
- **Variante Destructiva:** `flex items-start gap-2.5 rounded-lg border border-rose-300 dark:border-rose-500/30 bg-rose-50/80 dark:bg-rose-500/10 p-3.5 text-rose-900 dark:text-rose-300`.
- **Variante Advertencia / Drenado:** `flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-300`.
- **Contenido:** Título en negrita y cuerpo en `text-[11px] leading-relaxed`, explicando si la acción es irreversible, si bloquea nuevas altas, o si preserva históricos.

### 2.5 Barra de Acciones y Estados de Carga (Footer)

- **Separador:** `flex items-center justify-end gap-3 pt-4 border-t border-[var(--dsn-border)]`.
- **Botón Cancelar:** Botón neutral con borde y altura mínima táctil accesible (`min-h-[44px]`):
  `rounded-lg border border-[var(--dsn-border)] bg-transparent px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors`.
- **Botón de Confirmación:**
  - Destructivo: `bg-rose-600 hover:bg-rose-500 text-white min-h-[44px] px-5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50`.
  - Advertencia / Drenado: `bg-amber-600 hover:bg-amber-500 text-white min-h-[44px] px-5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50`.
  - Debe mostrar un spinner `Loader2` girando (`animate-spin`) y texto en gerundio (*«Drenando Célula...»*, *«Eliminando Plan...»*) mientras la petición asíncrona esté en curso (`loading`).

---

## 3. Notificación y Despliegue de Errores

Queda igualmente prohibido el uso de `alert(error)` ante excepciones de API o fallos de red:
- **Dentro de Modales:** Mostrar el error en un banner integrado (`bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-xs text-rose-800 dark:text-rose-300`) manteniendo el modal abierto para que el operador pueda corregir o reintentar.
- **En Listados o Vistas:** Mostrar el error mediante componentes de alerta integrados en el layout o cards de error contextuales.

---

## 4. Componente Reutilizable Canónico

En `apps/admin`, se provee el componente `ConfirmationModal` (`apps/admin/components/confirmation-modal.tsx`) que encapsula este estándar y debe ser utilizado en cualquier flujo de confirmación.

