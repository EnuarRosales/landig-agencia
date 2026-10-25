# LND-001 · Requisitos · Landing page, planes comerciales y accesos

| Atributo | Valor |
|---|---|
| ID | LND-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [BILL-001](../bill-001-facturacion-saas/requirements.md) · [DSN-001](../dsn-001-sistema-diseno/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Definir las adaptaciones funcionales e interfaces de la **landing page pública** (`apps/web`): incorporación de un botón de acceso unificado en el header contiguo a «Solicitar demo», visualización **dinámica y condicional** de la sección de planes comerciales (`#planes`), navegación cruzada entre los formularios de inicio de sesión (`/login`) y registro (`/register`), y acceso desde el backoffice del inquilino a la gestión y upgrade de su plan de suscripción.

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «Importante el acceso a la zona admin tanto para la SaaS como para los inquilinos es desde la landing page en el header como un nuevo button siguiente al botton actual de "Solicitar demo"»
- «La Landing debe tener ademas una nueva seccion que debe permitir la visualizacion de los planes comerciales, esta zona solo debe aparecer cuando en la zona administrativa realice la creacion y parametrizacion de los mismos, al igual en el header seccion de menu se debe agregar un nuevo boton de referencia a la nueva sección, de igual forma debe mantener el tema de internacionalizacion, es necesario generar una nueva spec para documentar los cambios a aplicar directamente en la landing page. Solo veo contemplado el path de login, pero no el de registro al cual se debe poder acceder desde la sección de planes. el formulario de login tambien debe tener referencia al formulario de registro. Ahora un inquilino ya registrado debe tener en su backoffice acceso a la zona de planes de forma tal que si lo decide puede realizar upgrade de su plan. Verifica las especificaciones actuales y actualiza lo que sea necesario para dejar claro el contexto antes indicado. Si existe duda debes preguntar.»

## 3. Requisitos funcionales

### RF-01 · Botón de acceso en el header principal
| ID | Requisito |
|---|---|
| RF-01.1 | El header de navegación (`Nav`) incorpora un nuevo botón de acción ("Iniciar sesión" / "Sign in") ubicado inmediatamente al lado del botón principal «Solicitar demo». |
| RF-01.2 | El botón redirige a la ruta internacionalizada `/[locale]/login`. |
| RF-01.3 | En dispositivos móviles, el botón se presenta dentro del menú colapsable conservando visibilidad prioritaria. |

### RF-02 · Visualización condicional de planes comerciales
| ID | Requisito |
|---|---|
| RF-02.1 | La landing page solo renderiza la sección `#planes` (y su respectivo enlace en el menú cápsula) **si existen planes activos y públicos** en la base de datos (`plans.is_active = true` y `plans.is_public = true`), parametrizados desde la SaaS en `mocter-admin`. |
| RF-02.2 | Si no existen planes comerciales creados o activos, la sección `#planes` y el enlace del menú no se renderizan en el DOM, evitando enlaces rotos o secciones vacías. |
| RF-02.3 | La consulta de planes comerciales para la landing es pública, optimizada y libre de autenticación. |

### RF-03 · Sección de planes comerciales (`#planes`)
| ID | Requisito |
|---|---|
| RF-03.1 | Muestra tarjetas de precios con: nombre del plan, descripción comercial, precio (en COP o USD según locale/moneda), selector o toggle de ciclo (mensual / anual con porcentaje de ahorro destacado), lista de características incluidas y badge opcional de "Recomendado" o "Más popular". |
| RF-03.2 | Cada tarjeta de plan dispone de un botón de Call-to-Action (CTA) "Comenzar ahora" / "Elegir plan" que redirige al flujo de registro: `/[locale]/register?plan_id=[id]`. |
| RF-03.3 | El diseño sigue la estética HUD de alto contraste (`DSN-001`) con soporte fluido en temas claro y oscuro. |

### RF-04 · Flujos interconectados de Login y Registro
| ID | Requisito |
|---|---|
| RF-04.1 | **Ruta de Login (`/[locale]/login`):** Presenta formulario de acceso nativo y botones OAuth parametrizados. Incluye un enlace visible hacia el registro: "¿Aún no tienes cuenta? Regístrate aquí" (`/[locale]/register`). |
| RF-04.2 | **Ruta de Registro (`/[locale]/register`):** Presenta formulario de alta inicial (nombre, correo, contraseña con validación de complejidad o botones OAuth). Si en la URL viene el parámetro `plan_id`, el plan queda preseleccionado y visible en el resumen del alta. |
| RF-04.3 | El formulario de registro incluye un enlace directo hacia el login: "¿Ya tienes cuenta? Inicia sesión" (`/[locale]/login`). |
| RF-04.4 | Ambos formularios validan la aceptación obligatoria de los términos y aviso de privacidad de Habeas Data (`user_consents`). |

### RF-05 · Gestión de Upgrade de Plan en Backoffice del Inquilino
| ID | Requisito |
|---|---|
| RF-05.1 | Un inquilino autenticado tiene acceso dentro de `mocter-admin` a la vista de suscripción (`/[locale]/admin/settings/billing` o `/[locale]/admin/plans`). |
| RF-05.2 | La vista muestra su plan actual (`clients.plan_id`), fecha de renovación y el catálogo de planes disponibles para **Upgrade** o cambio de ciclo (mensual/anual). |
| RF-05.3 | La acción de cambio de plan dispara el cálculo de prorrateo y enlaza con la pasarela de pagos configurada en `BILL-001`. |

### RF-06 · Internacionalización (i18n)
| ID | Requisito |
|---|---|
| RF-06.1 | Todos los textos del header, menú, sección de planes, tarjetas de precios y formularios de login/registro se gestionan exclusivamente en los diccionarios `messages/es.json` y `messages/en.json`, con Español como idioma por defecto. |
| RF-06.2 | Formato de moneda localizado (separador de miles, símbolo y código de divisa). |

---

## 4. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Rendimiento | Consulta de planes para la landing en caché/memoria con tiempo de respuesta P95 ≤ 80 ms. |
| RNF-02 | Accesibilidad | Cumplimiento WCAG 2.2 AA en contrastes de botones, tarjetas de precios y campos de formulario. Navegabilidad completa por teclado (`Tab`, `Enter`). |
| RNF-03 | SEO y Metadatos | Marcado semántico HTML5 (`<section id="planes">`, `<h2>`, `<article>`) con datos estructurados de producto/oferta (`schema.org/Product`). |
| RNF-04 | Responsive | Diseño Mobile First fluido desde 320 px hasta resoluciones 4K sin desbordamientos horizontales. |

---

## 5. Criterios de Aceptación (BDD)

### CA-LND-01 · Renderizado condicional de planes comerciales
- **Dado** que en la base de datos no existen planes con `is_active = true` y `is_public = true`,
- **Cuando** un usuario anónimo visita la landing page `/[locale]`,
- **Entonces** el menú de navegación no muestra el enlace `#planes` y la página no renderiza la sección de planes;
- **Y cuando** el administrador de la SaaS activa al menos un plan público, la sección `#planes` y el link de navegación aparecen automáticamente en el siguiente renderizado.

### CA-LND-02 · Botón de acceso en el header
- **Dado** un visitante en la landing page en cualquier resolución (móvil o escritorio),
- **Cuando** visualiza el header principal,
- **Entonces** observa el botón "Iniciar sesión" contiguo a «Solicitar demo»;
- **Y cuando** hace click en él, el navegador navega a `/[locale]/login`.

### CA-LND-03 · Call-to-Action de tarjeta de plan hacia registro
- **Dado** que la sección `#planes` está visible con los planes "Básico" y "Pro",
- **Cuando** el usuario pulsa "Elegir plan" en la tarjeta "Pro",
- **Entonces** es redirigido a `/[locale]/register?plan_id=[pro_id]`,
- **Y** el formulario de registro muestra un badge confirmando "Plan seleccionado: Pro".

### CA-LND-04 · Navegación cruzada entre Login y Registro
- **Dado** un usuario en la página `/[locale]/login`,
- **Cuando** pulsa el enlace "¿Aún no tienes cuenta? Regístrate",
- **Entonces** navega de inmediato a `/[locale]/register`;
- **Y si** desde `/[locale]/register` pulsa "¿Ya tienes cuenta? Inicia sesión", retorna a `/[locale]/login`.

### CA-LND-05 · Upgrade de plan desde el backoffice del inquilino
- **Dado** un `tenant_owner` autenticado en `mocter-admin` con el plan "Básico",
- **Cuando** ingresa a la sección de configuración de suscripción y selecciona "Cambiar a Plan Pro",
- **Entonces** el sistema muestra el prorrateo de días restantes y habilita el botón de confirmación de upgrade enlazado con la pasarela de pagos (`BILL-001`).

---

## 6. Decisiones del documento

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | Renderizado condicional de planes en landing: dependiente de datos activos en BD. | Cero código hardcodeado en la landing; la SaaS gobierna su oferta comercial desde `mocter-admin`. |
| D-02 | Acceso unificado en header de landing contiguo a «Solicitar demo». | Punto único y visible de entrada tanto para inquilinos como para el equipo de plataforma. |
| D-03 | Flujo de registro enlazable con plan preseleccionado vía query param (`plan_id`). | Conversión directa desde la landing sin perder el contexto de la elección comercial. |
| D-04 | Interconexión bidireccional obligatoria entre `/login` y `/register`. | Reducción de fricción para usuarios que confunden el inicio de sesión con el alta. |
| D-05 | Gestión de upgrade en backoffice del inquilino. | Autogestión del ciclo de vida del cliente sin requerir soporte manual. |

## 7. Decisiones abiertas

No quedan decisiones abiertas en LND-001.

## 8. Fuera de alcance

Checkout de compra anónima sin registro previo (el registro es precondición para crear el inquilino), pasarelas de pago dentro de la landing pública (el cobro ocurre tras el alta en el onboarding de `mocter-admin`).

## 9. Anexo i18n · Catálogo de Cadenas

| Clave | Español (`messages/es.json`) | Inglés (`messages/en.json`) |
|---|---|---|
| `nav.login` | Iniciar sesión | Sign in |
| `nav.pricing` | Planes | Pricing |
| `pricing.title` | Planes diseñados para potenciar tu negocio | Plans built to scale your business |
| `pricing.subtitle` | Elige la solución perfecta para tu operación omnicanal | Choose the perfect solution for your omnichannel operation |
| `pricing.monthly` | Mensual | Monthly |
| `pricing.annual` | Anual (Ahorra hasta 20%) | Annual (Save up to 20%) |
| `pricing.cta` | Comenzar ahora | Get started |
| `pricing.popular` | Más popular | Most popular |
| `auth.no_account` | ¿Aún no tienes una cuenta? | Don't have an account yet? |
| `auth.register_link` | Regístrate aquí | Sign up here |
| `auth.already_account` | ¿Ya tienes una cuenta? | Already have an account? |
| `auth.login_link` | Inicia sesión | Sign in |
| `admin.billing.upgrade_plan` | Mejorar plan | Upgrade plan |
| `admin.billing.current_plan` | Plan actual | Current plan |
