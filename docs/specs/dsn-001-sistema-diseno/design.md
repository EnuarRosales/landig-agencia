# DSN-001 · Diseño · Sistema de diseño y look & feel

| Atributo | Valor |
|---|---|
| ID | DSN-001 |
| Versión | 1.1 (Aprobada — RNF/BDD/i18n y decisiones cerradas) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [MIG-001](../mig-001-nextjs-migration/design.md) |
| Directivas | `.agents/AGENTS.md` (§4.8) · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Principios

1. **Mobile First.** La vista móvil se diseña primero; el escritorio reutiliza el mismo layout ampliado.
2. **Contraste antes que decoración.** Todo token de color aprueba WCAG 2.2 AA o no entra al sistema.
3. **Tokens en capas.** Primitivos → semánticos → marca; la personalización solo actúa en la capa de marca.
4. **HUD sutil, negocio primero.** El lenguaje de alto contraste se usa para jerarquía y datos, no para decorar.
5. **El inquilino top siente la plataforma como suya.** Logo, color, tipografía y dominio sin marca Mocter visible en su espacio.
6. **Catálogo vivo en el producto.** La ruta interna `/design-system` documenta componentes, tokens y variantes; no se usa Storybook en v1.
7. **Tema que respeta al usuario.** Sigue la preferencia del sistema y usa oscuro como fallback del primer render.

## 2. Stack confirmado

- **Tailwind CSS v4** (config CSS-first, `@theme`), **React 19** (Next.js App Router en web y admin).
- **Radix/Base UI** para primitivas accesibles; **shadcn/ui** (style `base-nova`, base neutral, CSS variables) como base de componentes; **lucide-react** para iconos.
- **Motion:** animaciones CSS/tw-animate con `prefers-reduced-motion` respetado; sin librerías pesadas de animación.
- Herencia de MIG-001 (landing) sin romper lo implementado: la landing adopta los tokens de DSN-001 progresivamente.

## 3. Tokens (tres capas)

| Capa | Contenido | Quién la cambia |
|---|---|---|
| Primitivos | Espaciado (grilla 4px), radios, sombras, duración de motion | Solo plataforma, en código |
| Semánticos | Claro/oscuro: `background`, `surface`, `text`, `border`, `success`, `warning`, `error` | Plataforma (SaaS) vía `themes` |
| Marca | `primary`, `accent`, neutros de marca, tipografía de marca | Inquilino por plan (contrato §5 de requirements) |

### 3.1 Paleta base

| Token | Claro | Oscuro |
|---|---|---|
| `background` | `#f9f9f9` | `#0a0a0b` |
| `surface` | `#ffffff` | `#121214` |
| `surface-secondary` | `#f4f4f5` | `#18181b` |
| `sidebar` | `rgba(250,250,250,.85)` | `rgba(12,12,14,.72)` |
| `text` | `#09090b` | `#ededef` |
| `text-secondary` | `#71717a` | `#8d8d93` |
| `text-tertiary` | `#a1a1aa` | `#5c5c63` |
| `border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.09)` |
| `border-subtle` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.05)` |
| `input-bg` | `#ffffff` | `#0c121a` |
| `input-border` | `#d4d4d8` | `rgba(79,209,255,.12)` |
| `accent` (cian) | `#0891b2` | `#22d3ee` |
| `accent-hover` | `#0e7490` | `#67e8f9` |
| `accent-subtle` | `rgba(8,145,178,.08)` | `rgba(34,211,238,.1)` |
| `accent-glow` | `rgba(8,145,178,.25)` | `rgba(34,211,238,.3)` |
| `accent-amber` / `accent-purple` | `#f59e0b` / `#8b5cf6` | `#f5a524` / `#b794ff` |
| `success` | `#15803d` | `#3ddc97` |
| `warning` | `#a16207` | `#f5a524` |
| `error` | `#dc2626` | `#ff6b6b` |
| `code-bg` | `#f4f4f5` | `#0c121a` |

Radios: `sm .375rem` · `md .5rem` · `lg .75rem` · `xl 1rem` · `full`. Sombras: capas sutiles; en oscuro, borde + glow cian tenue. Los acentos ámbar y púrpura son de apoyo (charts, categorías, estados), no compiten con el cian.

### 3.2 Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Display | **Chakra Petch** o Space Grotesk | Marca, etiquetas de panel y cifras de KPI; los títulos de página usan la tipografía de texto en 600 |
| Texto | **Inter** o Geist | Cuerpo, formularios, tablas |
| Datos | **IBM Plex Mono** | Cifras, códigos, estados, `tabular-nums` |

Self-hosted (licencias OFL), `font-display: swap`, subsetting es/en.

## 4. Modelo de datos del tema (`themes`, Router Global)

| Atributo | Regla |
|---|---|
| `id` | PK |
| `scope` | `platform` (singleton) o `client` |
| `client_id` | FK a `clients`, nullable (nulo para plataforma) |
| `tokens` JSONB | Solo capa de marca: `{primary, accent, neutrals, semantic_overrides, font}` |
| `version` | Incrementa en cada cambio; `(scope, client_id, version)` auditable |
| `status` | `draft` / `active` / `retired` |
| Auditoría | Columnas de la directiva (RF-10.9) |

La plataforma edita el tema `platform` (paleta SaaS) y el tema `client` de cada inquilino con plan habilitado. La validación de contraste corre al escribir `tokens`; un valor inválido se rechaza sin persistir.

## 5. Anatomía de las vistas obligatorias (Mobile First)

**Layout base:** sidebar de **260px**, contenido principal con ancho máximo de **720px** para lectura, panel derecho opcional de sistema; en móvil, una columna con drawer. La navegación activa usa fondo `accent-subtle` y borde izquierdo de acento de 3px; las tarjetas seleccionables usan borde de acento + `accent-glow`. Las etiquetas de sección van en mayúsculas pequeñas, mono y `text-tertiary` (estilo HUD).

- **Login/Registro:** una columna centrada, logo del tema activo, input grande (44px de táctil), acción principal a la vista, tema claro/oscuro funcional; sin ruido visual.
- **Dashboard:** fila de KPIs (display font + mono para cifras), tarjetas con hairline y glow sutil al hover; en móvil, una columna con scroll; en escritorio, grilla por áreas.
- **Menú hamburguesa (móvil) → sidebar (escritorio):** drawer con overlay + navegación primaria, tema activo visible, cierre por gesto y tecla; en escritorio, sidebar persistente con colapso a iconos.
- **Producto (creación/edición):** formulario apilado en móvil, dos columnas en escritorio; campos asistidos con «Mejorar con AI» (patrón del catálogo); panel de medios con la ficha del archivo (ADM §11).
- Estados vacío/carga/error con acción de recuperación en todas (RF-13 de ADM-001).

## 6. Tabla de datos estándar

Componente único `DataTable` con: paginación (tamaños y saltos), filtros por columna y filtros globales de la vista, ordenamiento por columnas con indicador, header pegajoso, selección estable entre páginas, densidades cómoda/compacta, y degradación a **tarjetas en móvil** (columnas seleccionables por el usuario). Los estados de filtros persisten por vista y usuario.

## 7. Contrato de marca blanca (por plan)

| Capa | Contenido | Validación |
|---|---|---|
| 0 · Estructura | Grilla, espaciado, comportamiento, iconos | Intocable |
| 1 · Identidad | Logo, favicon, nombre | Sanitizado y dimensiones controladas |
| 2 · Paleta | Primary/accent/neutros/semánticos | Contraste AA automático + preview |
| 3 · Experiencia propia | Tipografía de marca, dominio custom, sin marca Mocter | Plan top; contraste y licencias de fuentes |

Reglas transversales: restauración a default en una acción; el inquilino nunca ve tokens de la capa 0; la shell de plataforma (configuración, soporte) siempre es Mocter; los cambios de tema auditan quién, qué y cuándo.

## 8. Movimiento y efectos

Animaciones CSS con propósito: transiciones de estado (150–240ms), shimmer solo en skeletons, glow solo en hover/estados vivos (heartbeat de sistema, caret). `prefers-reduced-motion: reduce` desactiva toda animación. El backdrop con grilla sutil y ruido se reserva para pantallas de marca (login, dashboard vacío), no para cada vista.

## 9. Accesibilidad (WCAG 2.2 AA)

Contraste 4.5:1 (texto) y 3:1 (UI y focus); foco visible consistente; navegación completa por teclado; etiquetas en todos los campos; `aria` en componentes del catálogo; motion reducible; contraste de los temas personalizados validado en runtime.

## 10. Verificación

| Control | Prueba |
|---|---|
| Mobile First | Cada vista de la lista §5 se aprueba primero en ancho 390px y luego en escritorio |
| Contraste | La paleta base y 3 paletas custom pasan AA en claro y oscuro |
| Temas | Un cambio de paleta de inquilino no altera el layout ni a otros inquilinos; la restauración vuelve al default |
| Tema inicial | Sin preferencia del sistema, el primer render usa oscuro; con preferencia, la respeta |
| Catálogo | `/design-system` muestra todos los componentes, tokens y variantes en claro y oscuro; no hay Storybook en v1 |
| HUD | La operación diaria no usa grilla/noise; el glow se limita a hover, estados vivos y pantallas de marca |
| Tipografía | Solo Top/Enterprise puede cargar una tipografía de marca; White-label no la expone |
| Tablas | Paginación, filtros y ordenamiento funcionan en la misma tabla desde móvil y escritorio |
| Tokens | La paleta, inputs, sidebar y layout del tema base coinciden con la especificación de estilos de referencia (validado contra el CSS fuente, no solo visualmente) |
| Marca blanca | En capa 3, el espacio del inquilino no muestra marca Mocter |
| i18n y motion | Vistas en es/en; con `prefers-reduced-motion` no hay animaciones |

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Paleta custom rompe contraste | Validación AA automática en escritura + preview |
| Inconsistencia entre vistas | Catálogo único de componentes; solo se usan los del catálogo |
| Estética «cyber» mal recibida por negocios | HUD sutil en la operación; el glow y la grilla se limitan a pantallas de marca |
| Carga de fuentes | Self-hosted, subset es/en, `font-display: swap` |
| Copia de identidad de terceros | El lenguaje visual es propio de Mocter; sin assets ni logo de terceros |

## 12. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | RF-12 (temas), RF-13 (simplicidad), RF-15 (marca blanca) se implementan con este sistema |
| MIG-001 | La landing adopta tokens y tipografía; Sora/Inter migran a Inter/Geist + display font |
| AI-001 | Patrón visual del botón «Mejorar con AI» en el catálogo |
| i18n | es/en y RTL preparado |


### 3.4 Regla de presentación de etiquetas en formularios (Form Labels)

- **Prohibición de mayúsculas sostenidas:** Queda terminantemente prohibido el uso de uppercase en los label de atributos capturados en cualquier formulario del ecosistema.
- **Capitalización tipo título (Title Case):** Los labels deben presentarse en formato de tipo título con las iniciales en mayúscula (ej. «Nombre Completo», «Correo Electrónico Corporativo», «Contraseña Maestra»).
- **Tipografía adaptable:** Está prohibido el uso de tipografías o variantes CSS (ll-petite-caps, uppercase) que fuercen la visualización en mayúsculas sostenidas en los elementos de captura.