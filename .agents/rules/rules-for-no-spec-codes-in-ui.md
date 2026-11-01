# Regla de Prohibición de Códigos de Especificación en Interfaces de Usuario Final

> **Estado:** Permanente y obligatoria para todos los desarrolladores y agentes de IA.  
> **Alcance:** Todo el monorepo (`apps/web`, `apps/admin`, componentes compartidos de UI).  
> **Directiva:** Cero tolerancia a la exposición de códigos de especificaciones (`ADM-001`, `CHW-001`, `RF-XX`, etc.) en vistas o elementos visibles para el usuario final.

---

## 1. Principio Fundamental

Queda terminantemente prohibido incluir, renderizar o exponer códigos, identificadores, nomenclaturas o siglas de especificaciones técnicas y requisitos de ingeniería en cualquier elemento visible de la interfaz de usuario final (UI).

Los códigos como `ADM-001`, `CHW-001`, `DAT-001`, `BILL-001`, `REF-001`, `CRM-001`, `AI-001`, `REP-001`, `DSN-001`, `NTF-001`, `RF-XX`, `RNF-XX`, `D-XX`, `CA-XX` o `T-XX` son herramientas de **trazabilidad interna y metodología SDD (Spec-Driven Development)**. Su presencia en la interfaz degrada la estética visual, confunde al usuario/operador y transmite una apariencia inacabada o de depuración.

---

## 2. Dónde Está Permitida la Información de Especificaciones

La referencia a especificaciones técnicas es valiosa y debe conservarse exclusivamente en capas de ingeniería:
1. **Comentarios de Código (TSDoc / JSDoc):**
   ```ts
   /**
    * Bandeja administrativa de prospectos capturados desde la landing page.
    * Cumple con la especificación ADM-001 (RF-16, T-37).
    */
   export async function AdminLeadsInboxPage() { ... }
   ```
2. **Nombres de Archivos y Documentación en `docs/specs/`:**
   Archivos `requirements.md`, `design.md`, `tasks.md` y reportes SDD.
3. **Descripciones de Pruebas Automatizadas:**
   Bloques `describe` o `it` en Vitest/Playwright para validar requisitos funcionales.
4. **Mensajes de Commit:**
   Mensajes Conventional Commits y notas técnicas en el repositorio.

---

## 3. Directivas Específicas para Elementos Visuales

1. **Insignias, Badges y Pills:**
   Queda prohibido utilizar badges como `[ ADM-001 RF-16 ]` o `[ CHW-001 Iframe ]`. Los badges deben comunicar estados semánticos del dominio o eliminarse si no aportan valor informativo al usuario:
   * ❌ `badge: "ADM-001 RF-16"` $\rightarrow$ ✅ `badge: "Bandeja de Entrada"` o simplemente omitir el badge.
   * ❌ `badge: "CHW-001 Iframe"` $\rightarrow$ ✅ `badge: "Atención Omnicanal"`.
   * ❌ `badge: "DAT-001 Nodos"` $\rightarrow$ ✅ `badge: "Nodos PostgreSQL"`.
   * ❌ `badge: "D-31 RBAC"` $\rightarrow$ ✅ `badge: "Seguridad y Roles"`.
   * ❌ `badge: "NTF-001 SMTP"` $\rightarrow$ ✅ `badge: "Pasarela Transaccional"`.
   * ❌ `badge: "DSN-001 WCAG AA"` $\rightarrow$ ✅ `badge: "Tokens y Accesibilidad"`.

2. **Barras de Navegación y Menús:**
   Los elementos de navegación deben presentar únicamente etiquetas claras y familiares para el usuario final (ej. *"Tablero"*, *"Contactos Landing"*, *"Prospectos CRM"*, *"Bandeja Chatwoot"*, *"Suscripciones y Ventas"*). No deben añadirse códigos de spec como badges en los enlaces de menú.

3. **Títulos, Subtítulos y Modales:**
   Los encabezados deben formularse en lenguaje natural y profesional (Title Case en formularios), describiendo la función del negocio sin jerga de tickets o especificaciones.

---

## 4. Verificación y Auditoría

Antes de dar por aprobada cualquier tarea o entrega visual, el desarrollador o agente de IA debe inspeccionar la vista renderizada y verificar que **ningún código de especificación sea visible en pantalla**. Si se detecta un badge o texto con formato de spec, debe refactorizarse inmediatamente a lenguaje de negocio antes de generar el commit.

