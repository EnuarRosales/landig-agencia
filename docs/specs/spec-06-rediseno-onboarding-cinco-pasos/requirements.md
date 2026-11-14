# SPEC-06 · Rediseño del Onboarding Unificado en 5 Pasos, Marca Mocter y Margen de Producto

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-06` |
| **Nombre** | Rediseño del Onboarding Unificado en 5 Pasos, Identidad Mocter y Cálculo de Utilidad |
| **Tipo de intervención** | Evolución arquitectónica de flujo core (3 pasos → 5 pasos) y corrección UI/UX |
| **Prioridad** | P0 — Crítica (primer punto de entrada y activación de todo inquilino nuevo) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `ONB-01`, `ONB-07`, `ONB-08` (y orquestación integral del Wizard con los insumos de `ONB-02..06`, `ONB-09..12`) |
| **Specs previas relacionadas** | `ADM-001` (D-36), `TNT-001` |
| **Specs integradas / coordinadas** | `SPEC-02` (`ONB-10`: «Mejorar con AI» real en Paso 3), `SPEC-03` (`ONB-09`: visibilidad de límites del plan en Paso 3), `SPEC-04` (`ONB-12`: Paso 5 pago/trial/Bre-B), `SPEC-05` (`ONB-02..06`: campos de perfil, idioma, logo y métodos de pago), `SPEC-10` (`ONB-11`: objetivo/preset del bot y etiquetas predeterminadas Chatwoot) |
| **Wave de ejecución sugerida** | Wave 2 — Monetización, Identidad y Onboarding |

---

## 3. Problema / Situación actual

El asistente actual (`apps/admin/app/onboarding/tenant-onboarding-wizard.tsx` y `packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`) opera con **3 pasos acoplados** (`1. Tu Negocio y Plan`, `2. Primer Producto`, `3. Asistente y Pagos`), generando las siguientes brechas funcionales y de experiencia:

1. **Identidad visual inconsistente (`ONB-01`):**
   - El encabezado del wizard carece del logotipo oficial de Mocter utilizado en las pantallas de Login y Registro, rompiendo la continuidad de marca al iniciar sesión por primera vez.
2. **Estructura de pasos deficiente y falta de paso de pago/activación (`ONB-07`, `ONB-12`):**
   - El selector de plan está mezclado dentro del Paso 1 junto con los datos de empresa, saturando el formulario inicial, y no existe un paso dedicado para formalizar el pago o activar formalmente el periodo de prueba al concluir la configuración. El usuario solicitó confirmar explícitamente el flujo en **5 pasos**:
     1. **Paso 1:** Datos del Negocio, Idioma y Logo opcional.
     2. **Paso 2:** Selección o Confirmación del Plan.
     3. **Paso 3:** Creación del Primer Producto (con costo, precio de venta, utilidad automática y límites del plan).
     4. **Paso 4:** Configuración Rápida del Asistente AI y Canales de Pago.
     5. **Paso 5:** Pago del Plan o Activación de Periodo de Prueba.
3. **Atributos de rentabilidad ausentes en Primer Producto (`ONB-08`):**
   - El paso de primer producto captura únicamente `name`, `description`, `priceCents` (precio de venta) y `kind` (`physical | digital | service`). No captura **precio de costo (`costPriceCents`)** ni calcula en tiempo real la **utilidad bruta** (en monto y porcentaje de margen), atributo esencial para reportes comerciales y validación mínima de rentabilidad.

---

## 4. Objetivo y valor de negocio

Transformar el Onboarding del Inquilino en un **asistente guiado de 5 pasos claros y persistentes** que preserve el principio de *Time-to-Value en una sesión corta* (`AGENTS.md §4.9`): permitir que en menos de 5 minutos el comercio configure su identidad completa, elija su plan con transparencia de cuotas, cree su primer producto rentable con ayuda de AI real, active su asistente con presets y etiquetas Chatwoot listas, y concluya pagando (Wompi/Stripe/Bre-B) o activando su periodo de prueba.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Refactorización de la máquina de estados del wizard en `admin.onboarding_sessions`, `TenantOnboardingService` y `apps/admin/app/api/tenant/onboarding/route.ts` de 3 pasos a **5 pasos formales** con retrocompatibilidad para borradores en progreso de la versión previa.
- Incorporación del **logo oficial de Mocter** en `apps/admin/app/onboarding/layout.tsx` o cabecera superior de `TenantOnboardingWizard`, idéntico al componente usado en login/registro (`ONB-01`).
- Integración ordenada de los 5 pasos en `TenantOnboardingWizard`:
  - **Paso 1 — Tu Negocio (`business`):** Nombre comercial, slug (`mocter.co/{slug}`), email comercial (`ONB-02`), página web opcional (`ONB-03`), teléfono de contacto (`ONB-04`), idioma del comercio `es`/`en` (`ONB-05`), moneda, zona horaria y carga opcional de logo comercial vía SeaweedFS (`ONB-06`, `SPEC-05`).
  - **Paso 2 — Tu Plan (`plan`, `ONB-07`):** Comparador visual de planes públicos activos (`admin.plans` en `SPEC-03`) mostrando precios mensual/anual, días de prueba (`trial_days`), cuotas de productos, multimedia por producto (imágenes, videos, **audios**, PDFs), equipo y canales Chatwoot.
  - **Paso 3 — Primer Producto (`product`, `ONB-08`):** Banner informativo de límites del plan seleccionado (`ONB-09`, `<CatalogQuotaBanner />`), nombre, tipo (`physical` | `digital` | `service`), **precio de costo**, **precio de venta al público**, indicador en vivo de **Utilidad Bruta ($)** y **Margen (%)** (calculado automáticamente con advertencia no bloqueante si costo > venta), descripción asistida con `<AiEnhanceTextarea />` conectado al motor real (`ONB-10`, `SPEC-02`), y carga opcional de imagen cover.
  - **Paso 4 — Asistente Y Pagos (`assistant_payments`, `ONB-11`):** Parametrización rápida del **Objetivo del Bot** y **Preset de Personalidad y Tono** sincronizados desde los catálogos reales de `/admin/ai` (`SPEC-10`), selección/configuración rápida de canales de pago informativos persistidos en `tenant_payment_channels` (`SPEC-05`), mensaje de confirmación de pedido, y aprovisionamiento automático idempotente de las **etiquetas predeterminadas de Chatwoot** en `cell_tenant_labels` / cuenta Chatwoot.
  - **Paso 5 — Activación Y Pago (`billing`, `ONB-12`):** Muestra resumen del plan elegido en Paso 2 y consume el panel financiero unificado de `SPEC-04`: botón principal «Comenzar Periodo De Prueba ({N} Días)» cuando `trial_days > 0` o pago inmediato vía Wompi / Stripe / Bre-B Colombia (QR dinámico + carga de comprobante con continuidad en `trialing`).
- Persistencia progresiva del borrador en cada transición `Siguiente` / `Anterior`, permitiendo retomar sin pérdida de datos si el usuario recarga o vuelve luego.

### Fuera de alcance
- Creación de múltiples productos, combos complejos o atributos dinámicos avanzados durante el onboarding (el comercio los completa luego en `/workspace/products`, cubierto por `SPEC-08`, respetando `AGENTS.md §4.9`).
- Aprobación manual de vouchers Bre-B (vive en `/admin/billing` de `SPEC-04`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` (usuario recién registrado con `onboarding` pendiente) | Navegar entre los 5 pasos, guardar borradores, subir logo/producto y finalizar onboarding | Sí | Solo sobre su propio `client_id` asignado en sesión |
| `tenancy_owner` (con onboarding ya completado) | Acceder a `/onboarding` tras completar | Redirigido | Redirige automáticamente a `/workspace` |
| `tenancy_users` (`tenant_agent`) | Iniciar o alterar el wizard de onboarding de la empresa | No | Bloqueado (`403` en API / redirect a `/workspace` en UI) |

---

## 7. Modelo de datos

### 7.1 Actualización de `admin.onboarding_sessions` (`packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`)
- **Enum `current_step` actualizado:**
  `'business' | 'plan' | 'product' | 'assistant_payments' | 'billing' | 'completed'`
  *(Compatibilidad migratoria: si existe una sesión heredada en `'product'` o `'bot_channel'`, se mapea de manera segura al paso equivalente dentro del nuevo esquema de 5 pasos sin crashear).*
- **Estructura `draft_payload` (`JSONB`):**
  ```typescript
  export interface OnboardingDraftPayloadV2 {
    business?: {
      displayName: string;
      slug: string;
      commercialEmail: string;
      websiteUrl?: string | null;
      phone: string;
      locale: "es" | "en";
      currency: "COP" | "USD";
      timezone: string;
      country: string;
      logoMediaId?: string | null;
    };
    plan?: {
      planCode: string;
      planId: string;
      cycle: "monthly" | "annual";
    };
    firstProduct?: {
      name: string;
      kind: "physical" | "digital" | "service";
      costPriceCents: number;
      salePriceCents: number;
      description: string;
      coverMediaId?: string | null;
    };
    assistantPayments?: {
      botObjective: string;
      botPresetId: string;
      botToneId: string;
      paymentChannels: Array<{
        channelCode: string;
        displayName: string;
        accountIdentifier?: string;
        instructions?: string;
        isActive: boolean;
      }>;
      orderConfirmationMessage: string;
    };
  }
  ```

### 7.2 Persistencia final al concluir cada hito
- Al completar **Paso 1 y Paso 2** (`POST /api/tenant/onboarding/step`): actualiza `admin.clients` (`displayName`, `slug`, `commercialEmail`, `websiteUrl`, `phone`, `locale`, `currency`, `timezone`, `logoMediaId`, `planId`).
- Al completar **Paso 3**: crea o actualiza el primer producto en `pg-cell-XX` (`cell_products` incluyendo `cost_price_cents`, `price_cents` / `sale_price_cents` definidos en `SPEC-08`, y `cell_product_media` si subió imagen).
- Al completar **Paso 4**: persiste en `admin.tenant_bots` (`objective`, `presetId`, `toneId`, mensaje de confirmación synced con `SPEC-10`), `tenant_payment_channels` en celda (`SPEC-05`) e inserta idempotemente las **etiquetas predeterminadas de Chatwoot** en `cell_tenant_labels` (y las sincroniza con la cuenta Chatwoot aprovisionada del comercio si ya existe `chatwoot_accounts`).
- Al completar **Paso 5**: ejecuta activación de `trialing` (`POST /api/tenant/billing/trial`) o checkout/reporte Bre-B (`SPEC-04`), marca `onboarding_sessions.current_step = 'completed'` y `completed_at = NOW()`.

---

## 8. Reglas de negocio

- **RN-SPEC-06-01 (Secuencia obligatoria de 5 pasos):** El onboarding consta exactamente de 5 pasos ordenados: `1. Tu Negocio` → `2. Tu Plan` → `3. Primer Producto` → `4. Asistente Y Pagos` → `5. Activación Y Pago`. No puede marcarse como `completed` sin haber validado los datos mínimos de los pasos 1 a 4 y haber elegido pago o periodo de prueba en el paso 5.
- **RN-SPEC-06-02 (Sincronización bidireccional inmediata de idioma):** Si en el Paso 1 el usuario selecciona `locale = 'en'` o `'es'`, la interfaz del propio wizard se actualiza al idioma seleccionado y lo persiste en `admin.clients.locale`.
- **RN-SPEC-06-03 (Pre-asignación o confirmación del plan antes del producto):** El plan debe confirmarse en el **Paso 2** (`ONB-07`) para que, al entrar al **Paso 3**, el sistema ya conozca con certeza el plan activo/elegido y muestre sus límites exactos (`products`, `images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`). Si viene preseleccionado desde la landing (`?plan=...`), aparece premarcado en el Paso 2 para confirmación rápida en 1 clic.
- **RN-SPEC-06-04 (Cálculo automático de utilidad en Paso 3 `ONB-08`):** Dado `costPrice >= 0` y `salePrice > 0`:
  - `utilidadMonto = salePrice - costPrice`
  - `margenSobreVentaPct = ((salePrice - costPrice) / salePrice) * 100` (redondeado a 2 decimales)
  - `roiSobreCostoPct = costPrice > 0 ? ((salePrice - costPrice) / costPrice) * 100 : null`
  - Si `costPrice > salePrice` (utilidad negativa), el sistema calcula correctamente el valor negativo y muestra advertencia visual clara (*«El precio de costo supera al precio de venta al público (pérdida por unidad)»*) permitiendo continuar solo si el comercio así lo decide conscientemente (ej. gancho promocional). No se aceptan precios negativos.
- **RN-SPEC-06-05 (Fuente real compartida para Asistente AI y Etiquetas Chatwoot en Paso 4 `ONB-11`):** El Paso 4 lee exactamente los mismos catálogos de `objective`, `bot_presets` y `bot_tones` que el módulo `/workspace/bot` (`SPEC-10`), persistiendo sobre la misma entidad `admin.tenant_bots` para que al abrir `/workspace/bot` el usuario vea exactamente lo que configuró en Onboarding. Además, garantiza la creación idempotente del set estándar de etiquetas predeterminadas de Chatwoot (`nuevo_pedido`, `pendiente_pago`, `pagado`, `despachado`, `soporte_humano`, `cliente_recurrente`) desde el día cero.
- **RN-SPEC-06-06 (Continuidad ante pago omitido o Bre-B pendiente en Paso 5):** Elegir «Omitir Pago Por Ahora / Comenzar Prueba» (cuando `trial_days > 0`) o reportar comprobante Bre-B (`SPEC-04`) habilita el acceso completo al Backoffice en estado `trialing` sin bloquear la operación del comercio.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/onboarding` (Actualización de contrato existente)
- Retorna estado normalizado de 5 pasos: `{ step: 1|2|3|4|5, stepKey, isCompleted, client, draft, availablePlans, botCatalog: { presets, tones, objectives }, availableGateways }`.

### 9.2 `POST /api/tenant/onboarding/step` (o `PATCH /api/tenant/onboarding`)
- **Request JSON discriminado por `stepKey`:**
  - `stepKey: "business"`: valida `displayName`, `slug`, `commercialEmail`, `websiteUrl?`, `phone`, `locale`, `currency`, `timezone`, `country`, `logoMediaId?`. Verifica unicidad de `slug` retornando `409 SLUG_ALREADY_TAKEN` si ya pertenece a otro comercio.
  - `stepKey: "plan"`: valida `planCode` / `planId` activo y `cycle` (`monthly` | `annual`).
  - `stepKey: "product"`: valida `name`, `kind`, `costPriceCents >= 0`, `salePriceCents > 0`, `description`.
  - `stepKey: "assistant_payments"`: valida `botObjective`, `botPresetId`, `botToneId`, `paymentChannels[]`, `orderConfirmationMessage`. Ejecuta provisión idempotente de etiquetas predeterminadas Chatwoot.
  - `stepKey: "billing"`: valida elección `'start_trial'` | `'paid'` | `'bre_b_pending_review'`; concluye onboarding (`current_step = 'completed'`).

---

## 10. Especificación de UI/UX

- **Cabecera superior homogénea (`ONB-01`):** Mostrar el **componente oficial de logo Mocter** (el mismo SVG/marca de `/login` y `/register`) + nombre del sistema, con stepper visual de **5 pasos** claro en móvil (indicador compacto «Paso X de 5 — Nombre Del Paso» + barra de progreso) y horizontal en desktop.
- **Labels e idiomas:** 100% de los labels en formato **Title Case** sin CSS `uppercase` («Nombre Comercial», «Correo Electrónico Comercial», «Sitio Web», «Teléfono De Contacto», «Idioma Del Comercio», «Logotipo Comercial (Opcional)», «Precio De Costo», «Precio De Venta Al Público», «Utilidad Estimada»).
- **Cero códigos de spec ni jerga de celdas** en textos visibles; soporte completo `es`/`en`.
- **Feedback de utilidad en Paso 3:** Tarjeta reactiva en tiempo real junto a costo y venta que muestra:
  - Utilidad por unidad en moneda del comercio (`currency`).
  - Porcentaje de margen.
  - Color verde cuando hay ganancia, ámbar si es `0%`, rojo si es negativa.
- **Paso 5:** Reutiliza `<BillingCheckoutPanel />` (`SPEC-04`) con énfasis claro en los días de prueba gratuita incluidos en el plan o pago directo por canal habilitado.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Asistente de Onboarding unificado en 5 pasos

  Escenario: Nuevo comercio completa los 5 pasos del onboarding con logo, utilidad automática y periodo de prueba
    Dado que un usuario propietario recién registrado accede a "/onboarding"
    Y visualiza en la cabecera el logotipo oficial de Mocter y el indicador de 5 pasos
    Cuando en el Paso 1 ingresa nombre comercial, correo comercial, sitio web, teléfono, selecciona idioma "es" y sube su logo comercial opcional
    Y en el Paso 2 confirma el plan "Pro" con "14" días de prueba y 3 audios por producto
    Y en el Paso 3 visualiza los límites de su plan, ingresa costo "$40.000", venta "$100.000" (observando utilidad automática de "$60.000 / 60%"), y mejora la descripción con AI real
    Y en el Paso 4 define el objetivo del bot, el preset "Vendedor Consultivo", activa Nequi y personaliza el mensaje de confirmación
    Y en el Paso 5 selecciona "Comenzar Periodo De Prueba (14 Días)"
    Entonces el backend marca el onboarding como "completed", crea el producto, la configuración compartida de bot, los canales de pago y las etiquetas predeterminadas de Chatwoot
    Y redirige al tablero operativo "/workspace" con el logo comercial y estado "trialing"

  Escenario: Parametrización del bot en Paso 4 queda exactamente visible en Backoffice /workspace/bot
    Dado que el propietario completó el Paso 4 eligiendo objetivo "Calificar leads mayoristas" y preset "Asesor Técnico"
    Cuando ingresa por primera vez a "/workspace/bot"
    Entonces observa exactamente el mismo objetivo, preset y tono seleccionados durante el onboarding sin valores reestablecidos
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo en Paso 1 si falta correo comercial o teléfono o URL web mal formada
    Dado que el usuario envía el Paso 1 sin "commercialEmail" o con "websiteUrl = www sin http"
    Cuando pulsa "Continuar Al Paso 2"
    Entonces el sistema muestra mensajes de validación por campo y el backend retorna HTTP 400 Problem Details si se invoca directamente
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Conflicto de slug duplicado al guardar Paso 1
    Dado que ya existe otro comercio con slug "moda-colombia"
    Cuando el nuevo comercio intenta continuar el Paso 1 usando el slug "moda-colombia"
    Entonces el backend responde HTTP 409 "SLUG_ALREADY_TAKEN" y sugiere una variación disponible en la UI

  Escenario: Cálculo automático de utilidad con advertencia cuando el costo supera al precio de venta
    Dado que el usuario está en el Paso 3 de Primer Producto
    Cuando ingresa "Precio De Costo = 120000" y "Precio De Venta Al Público = 95000"
    Entonces la interfaz calcula y resalta utilidad negativa "-$25.000" con advertencia legible de pérdida unitaria
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Usuario con onboarding ya completado o rol colaborador es bloqueado/redirigido
    Dado que un propietario que ya finalizó su onboarding navega manualmente a "/onboarding"
    Cuando la página se renderiza o invoca POST "/api/tenant/onboarding/step"
    Entonces es redirigido a "/workspace" y el endpoint responde HTTP 409 "ONBOARDING_ALREADY_COMPLETED"
```

### (e) Escenarios de borde

```gherkin
  Escenario: Reanudación automática tras recargar navegador o migrar sesión desde borrador anterior
    Dado que el comercio guardó hasta el Paso 3 y cerró la pestaña antes de pasar al Paso 4
    Cuando vuelve a iniciar sesión
    Entonces "/onboarding" reanuda exactamente en el paso pendiente conservando los datos previos del negocio, plan y producto sin perder información
```

---

## 12. Requisitos no funcionales

- **Mobile First (`AGENTS.md §4.8`):** Flujo completo operable sin scroll horizontal en pantallas `>= 360px`, con navegación de pasos colapsable en móvil y botones accesibles de altura mínima `44px`.
- **Observabilidad (`AGENTS.md §4.13`):** Log Pino JSON por cada transición de paso (`onboarding.step.saved`, `onboarding.completed`) con `requestId`, `clientId`, `stepKey` y duración total de onboarding.
- **Consistencia transaccional:** La finalización del onboarding ejecuta en transacción de celda + control sin dejar productos huérfanos si falla un paso crítico; inicialización de etiquetas Chatwoot idempotente (`ON CONFLICT DO NOTHING`).

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (logo en Paso 1), `SPEC-02` (AI enhance real en Paso 3), `SPEC-03` (resumen de cuotas en Paso 2 y 3), `SPEC-04` (Paso 5 trial/checkout/Bre-B), `SPEC-05` (campos de perfil + `tenant_payment_channels`), `SPEC-08` (columna `cost_price_cents` en `cell_products`), `SPEC-10` (presets/objetivos reales y etiquetas Chatwoot).
- **Riesgos:**
  - *Sesiones de onboarding en progreso antes del despliegue del paso 1→5:* Mitigado con normalizador retrocompatible en `TenantOnboardingService.mapLegacyStep()`.

---

## 14. Definition of Done

- [ ] Esquema `admin.onboarding_sessions` y `TenantOnboardingService` migrados al flujo oficial de **5 pasos** con retrocompatibilidad.
- [ ] Logo de Mocter estandarizado integrado en la vista `/onboarding` idéntico al de Login/Registro (`ONB-01`).
- [ ] Todos los campos nuevos (`commercialEmail`, `websiteUrl`, `phone`, `locale`, `logoMediaId`, `costPriceCents` + utilidad calculada, objetivo/preset del bot, etiquetas Chatwoot, Paso 5 pago/trial) integrados y sincronizados.
- [ ] Pruebas unitarias y E2E/integración cubriendo recorrido de 5 pasos, cálculo de margen, conflicto de slug y persistencia de borrador.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todas las propuestas (`ONB-07` en 5 pasos y `ONB-12` con Bre-B/trial) fueron confirmadas expresamente por el usuario. Sin preguntas pendientes.

