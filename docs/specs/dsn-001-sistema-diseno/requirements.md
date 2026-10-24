# DSN-001 · Requisitos · Sistema de diseño y look & feel

| Atributo | Valor |
|---|---|
| ID | DSN-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [MIG-001](../mig-001-nextjs-migration/requirements.md) · [AI-001](../ai-001-asistente-ai-configuracion/requirements.md) |
| Directivas | `.agents/AGENTS.md` (§4.8) · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Definir el lenguaje visual de Mocter: tokens de diseño, paleta **parametrizable** (para la SaaS y para el inquilino cuyo plan lo habilite), tipografía, componentes, navegación y el contrato de marca blanca. **Mobile First es un principio del sistema.** El estilo es de alto contraste con estética «HUD» profesional, propio de Mocter y adaptado a un SaaS de negocio.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «el desarrollo visual del sistema debe ser Mobile First»
- «los colores paleta (primarios/semánticos/neutros) debe ser parametrizable para la SaaS y para el inquilino cuyo plan le permita hacerlo»
- «la ideas es que esos inquilinos top sientan como su ya la plataforma»
- «Las vista de login, registro, el dashboar, el menu amburgesa, vista de creacion de producto, edicion, paginacion de los datos en todas las vistas que presente datos en tablas, filtros sobre los datos, ordenamiento por columnas»
- «necesito que esta parte visual del sistema me asesores invocando las mejores de la industria del software sobre interfaces muy estilizadas de alto contraste»

## 3. Requisitos funcionales

### RF-01 · Principios visuales

| ID | Requisito |
|---|---|
| RF-01.1 | **Mobile First:** toda vista se diseña primero para móvil; el escritorio es una ampliación del mismo layout, no un diseño aparte. |
| RF-01.2 | El sistema hereda la simplicidad de ADM-001 RF-13: una acción principal por vista, sin densidad de Chatwoot, estados vacío/carga/error en toda pantalla. |
| RF-01.3 | El lenguaje visual es de **alto contraste** con estética HUD sutil: neutros fríos, acento cian, superficies con hairline, cifras en fuente mono con `tabular-nums`. |

### RF-02 · Tokens y temas

| ID | Requisito |
|---|---|
| RF-02.1 | Los tokens viven en **tres capas**: primitivos (fijos: espaciado, radios, sombras), semánticos (claro/oscuro) y marca (sobreescribibles). |
| RF-02.2 | Claro y oscuro cubren todas las vistas; el tema por defecto sigue al sistema (ADM-001 RF-12). |
| RF-02.3 | Los cambios de paleta se validan contra **WCAG 2.2 AA** antes de aplicarse (4.5:1 texto, 3:1 UI). |

### RF-03 · Paleta parametrizable

| ID | Requisito |
|---|---|
| RF-03.1 | La paleta (primarios, semánticos y neutros) es parametrizable a dos niveles: la **SaaS** ajusta la paleta global de Mocter y el **inquilino con plan que habilite marca blanca** ajusta la de su espacio. |
| RF-03.2 | La parametrización opera sobre la capa de marca; los primitivos de estructura nunca cambian (un inquilino no rompe el layout). |
| RF-03.3 | Los valores se guardan en un objeto de tema (`themes`, Router): tema de plataforma (singleton) y tema por inquilino, versionados y auditados. |
| RF-03.4 | Todo cambio de tema tiene **preview en vivo** y restauración a los valores por defecto en una acción (ADM-001 RF-15.5). |

### RF-04 · Tipografía

| ID | Requisito |
|---|---|
| RF-04.1 | **Display:** Chakra Petch o Space Grotesk para marca, etiquetas de panel y cifras de KPI; los títulos de página usan la tipografía de texto en 600. |
| RF-04.2 | **Texto:** Inter o Geist (contenido, formularios, tablas). |
| RF-04.3 | **Datos:** IBM Plex Mono (cifras, códigos, estados de sistema) con `tabular-nums`. |
| RF-04.4 | Las fuentes son self-hosted (licencias OFL) y cargan con `font-display: swap`; sin dependencia de CDN de terceros. |

### RF-05 · Vistas obligatorias

| ID | Requisito |
|---|---|
| RF-05.1 | Login y registro: una columna, acción principal visible, sin distracciones, con el tema claro/oscuro funcionando. |
| RF-05.2 | Dashboard: KPI en display font, tarjetas de datos con hairline y glow sutil, responsive de 1 columna (móvil) a grilla (escritorio). |
| RF-05.3 | Menú hamburguesa: drawer lateral en móvil con navegación primaria; en escritorio se convierte en sidebar persistente. |
| RF-05.4 | Creación y edición de producto: formulario Mobile First con «Mejorar con AI» (AI-001) en los campos asistidos. |
| RF-05.5 | Toda vista expone estados vacío, carga y error con acción de recuperación. |

### RF-06 · Tablas de datos (estándar global)

| ID | Requisito |
|---|---|
| RF-06.1 | **Toda tabla del sistema** tiene paginación, filtros sobre los datos y ordenamiento por columnas, con el mismo componente base. |
| RF-06.2 | En móvil la tabla se degrada a tarjetas o columnas seleccionables, sin scroll horizontal obligatorio. |
| RF-06.3 | Header pegajoso, densidades cómoda/compacta, selección estable entre páginas y estado de filtros persistido por vista. |

### RF-07 · Componentes base

Button, Input, Select, Checkbox, Switch, Textarea, Dialog, Drawer, Toast, Tabs, Badge, Skeleton, EmptyState, Tooltip, CommandBar, Pagination, DataTable (compuesto), ThemeToggle. Construidos sobre Radix/Base UI + Tailwind v4 + shadcn/ui como punto de partida; cada componente aprueba en claro y oscuro con foco visible y teclado.

### RF-08 · Marca blanca (contrato por capas)

| ID | Requisito |
|---|---|
| RF-08.1 | El contrato define qué capas puede tocar el inquilino según plan (ver §5): identidad, paleta, tipografía y dominio, nunca estructura ni accesibilidad. |
| RF-08.2 | El espacio del inquilino con marca blanca no muestra la marca Mocter (logo, favicon, firma); la shell de administración de la plataforma siempre es Mocter. |
| RF-08.3 | La validación de contraste es automática y un valor inválido se rechaza con mensaje explícito (ADM-001 RF-15.4). |

### RF-09 · Accesibilidad y documentación

| ID | Requisito |
|---|---|
| RF-09.1 | Nivel objetivo: WCAG 2.2 AA — contraste, foco visible, navegación por teclado y `prefers-reduced-motion` respetado en toda animación. |
| RF-09.2 | El catálogo de componentes es vivo (Storybook u equivalente) con variantes, tokens y guías de uso por componente. |
| RF-09.3 | La UI cumple la directiva de i18n (es/en, Español por defecto) y está preparada estructuralmente para RTL futuro. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | Mobile First se anexa como principio de constitución (§4.8) y aplica a landing y admin. | Ninguna vista se aprueba si su versión móvil no es la primera en diseñarse. |
| D-02 | Stack confirmado: Tailwind CSS v4 (config CSS-first), Radix/Base UI (accesible), shadcn/ui como base de componentes, lucide para iconos; sin librerías propietarias. | Coherencia con MIG-001 y licencias abiertas. |
| D-03 | Tokens en tres capas; la paleta parametrizable actúa en la capa de marca, nunca en primitivos. | El inquilino personaliza identidad, nunca rompe estructura ni accesibilidad. |
| D-04 | El lenguaje visual (neutros zinc, acento cian, HUD hairline, mono para datos, glow sutil) es propio de Mocter; no se usan assets ni identidades de terceros. | Estética profesional de alto contraste sin riesgo de identidad ajena. |

## 5. Contrato de marca blanca (asesoría)

| Capa | Qué incluye | Plan |
|---|---|---|
| 0 · Estructura | Espaciado, grilla, comportamiento, iconografía, accesibilidad | Intocable para el inquilino |
| 1 · Identidad | Logo, favicon, nombre del espacio | Base |
| 2 · Paleta | Primarios, acento, neutros y semánticos con validación de contraste | White-label |
| 3 · Experiencia propia | Tipografía de marca, tema claro/oscuro propio, dominio custom, sin marca Mocter visible | Top / enterprise |

La idea de fondo: un inquilino «top» siente la plataforma como suya cuando logo + color + tipografía + dominio son suyos y no ve a Mocter en ningún punto de su experiencia. Eso se logra completo en la capa 3; las capas 1 y 2 cubren la mayoría de los negocios.

## 6. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿Catálogo vivo con Storybook o con una página propia en el monorepo? | Define la herramienta del catálogo (RF-09.2). |
| O-02 | ¿Intensidad del estilo HUD: sutil (recomendado para negocio) o cyber total? | Define cuánto glow/grid/noise se usa en el admin. |
| O-03 | ¿La paleta de marca blanca incluye tipografía solo en plan top, o también en white-label? | Ajusta el contrato §5. |
| O-04 | ¿Tema por defecto claro u oscuro para la SaaS (el sistema sigue al usuario, ADM RF-12)? | Confirmar la apariencia del primer render. |

## 7. Fuera de alcance

Ilustraciones 3D, motion complejo, realidad aumentada, rediseño de la interfaz de Chatwoot y componentes fuera del catálogo base.

## 8. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Consumado por RF-12/13/15; la marca blanca de RF-15 se implementa con el contrato de DSN-001. |
| MIG-001 | La landing adopta los tokens y la tipografía del sistema (Sora/Inter migran al esquema de DSN-001). |
| AI-001 | El botón «Mejorar con AI» tiene su patrón visual en el catálogo. |
| i18n | Textos es/en en todas las vistas; RTL preparado. |

## 9. Trazabilidad

- L1 (2026-10-23): «Vamos confirmando la base tecnologica se confirma y se anexa a los principios que el desarrollo visual del sistema debe ser Mobile First, ahora el tema de los colores paleta (primarios/semánticos/neutros) debe ser parametrizable para la SaaS y para el inquilino cuyo plan le permita hacerlo.»
- L2 (2026-10-23): el usuario solicitó interfaces muy estilizadas de alto contraste con tipografía profesional para el dashboard, tomando como referencia un repositorio externo; por decisión posterior del usuario, esa referencia se retira de la spec.
- L3 (2026-10-23): **DSN-001 aprobada.** Por decisión del usuario se retira toda referencia externa de la spec; el lenguaje visual queda como propio de Mocter.
- L4 (2026-10-23): validación de tokens contra el CSS fuente de la referencia visual: se agregan `sidebar`, `input-bg`, `input-border`, `code-bg` y `border-subtle`; layout base 260px/720px con navegación activa de acento; se precisa el uso de la display font (marca, etiquetas HUD y KPI; títulos de página en la tipografía de texto).
