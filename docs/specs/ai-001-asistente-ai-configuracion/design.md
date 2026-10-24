# AI-001 · Diseño · Asistente AI de configuración

| Atributo | Valor |
|---|---|
| ID | AI-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [`requirements.md`](requirements.md) · [BOT-001](../bot-001-atencion-automatizada-llm/design.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **La AI propone, el inquilino acepta.** Ninguna sugerencia se guarda sola.
2. **Prompt maestro por campo.** Cada atributo asistible tiene un prompt diseñado exactamente para él, versionado y evaluado.
3. **La plataforma gobierna los prompts.** El inquilino solo usa el botón.
4. **El idioma respeta al inquilino.** La sugerencia sale en `clients.locale`.
5. **Costo transparente.** BYOK lo paga el inquilino a su proveedor; modo Mocter debita la billetera (cuando madure).

## 2. Arquitectura

```text
Inquilino (UI, i18n es/en)
   │ borrador + clic «Mejorar con AI»
   ▼
apps/admin ── API interna ──► Asistente
   │                           │ 1. lookup: ai_assist_fields + prompt maestro activo
   │                           │ 2. ensambla: prompt maestro + borrador + locale
   │                           │ 3. inferencia: BYOK (día uno) o Mocter (propuesta)
   │                           │ 4. devuelve sugerencia (no guarda)
   │                           │ 5. registra consumo en ai_usage_events (purpose=assist)
   ▼
El inquilino compara, edita, acepta o descarta ──► al aceptar: validación del campo + audit_log (source=ai_suggested)
```

## 3. Modelo de datos (Router Global, schema `admin`)

Ambas tablas llevan la auditoría de la directiva (RF-10.9) y son administradas por la plataforma.

### 3.1 `ai_assist_fields` — registro de campos asistidos

| Atributo | Regla |
|---|---|
| `field_key` (PK) | Clave estable por campo: `bot.objective`, `bot.tone`, `bot.persona`, `bot.instructions`, `bot.greeting`, `bot.fallback`, `bot.allowed_topics`, `bot.excluded_topics`, `product.name`, `product.description`, `product.prompt`, `product.price_note`, `product.alt_text`, `prospect.notes`, `client.sharing_profile`, `label.title`, `label.description`, `followup_step.message` |
| `entity` · `column` | Dónde vive el campo en el modelo |
| `labels` JSONB `{es,en}` | Nombre visible del campo en la zona de administración |
| `is_active` | Un campo inactivo no muestra el botón |

El registro cubre **todo `textarea`** que el inquilino redacte; la lista es el conjunto inicial y se amplía con cada campo nuevo (RF-01.3). Los campos de una línea solo se registran si el prompt maestro del campo lo justifica.

### 3.2 `ai_assist_prompts` — prompts maestros versionados

| Atributo | Regla |
|---|---|
| `id` (PK) | Cada versión es una fila nueva (historial) |
| `field_key` FK | Campo al que sirve |
| `version` | `(field_key, version)` único |
| `master_prompt` | El prompt maestro del sistema para ese campo |
| `input_hint` | Qué debe escribir el inquilino |
| `output_rules` JSONB | Idioma, longitud máxima, formato y reglas del campo |
| `examples` JSONB | Ejemplos de evaluación (entrada → salida esperada) |
| `status` | `draft` / `active` / `retired`; solo hay una versión `active` por campo |

El ensamblado es: `master_prompt` + borrador del inquilino + `output_rules` con el locale. No se inyecta contexto ajeno al campo (RF-05.1).

## 4. Flujo «Mejorar con AI»

1. El campo tiene prompt maestro activo → muestra el botón con `input_hint` como placeholder de ayuda.
2. El inquilino escribe su borrador y presiona el botón.
3. El asistente llama a la inferencia (BYOK del inquilino; sin proveedor, el botón está deshabilitado con aviso).
4. La sugerencia llega **sin guardarse**: el inquilino la ve al lado de su borrador, la edita y acepta o descarta.
5. Al aceptar, el campo pasa sus validaciones normales (longitud, formato) y el cambio se guarda con `audit_log` de origen `ai_suggested` (campo, versión de prompt y modelo).

## 5. Inferencia

- **Día uno (BYOK):** usa `tenant_ai_providers` + `tenant_model_settings` del inquilino (BOT-001); el modelo por defecto del asistente se define por plataforma (O-01).
- **Modo Mocter (propuesta):** cuando la billetera madure, el asistente puede usar la inferencia Mocter; el costo se debita del saldo según el precio minorista del modelo.
- El consumo siempre se registra en `ai_usage_events` con `purpose = 'assist'` (se agrega la columna `purpose` al ledger de BOT-001).

## 6. Seguridad y auditoría

- Al prompt solo viaja el texto del campo; sin PII de prospectos ni datos de otros inquilinos.
- Rate limiting por inquilino para el botón (RF-04.4).
- Toda aceptación de sugerencia queda en `audit_log` con actor, campo, versión de prompt y modelo; las tasas de aceptación se miden por campo (RF-05.3).

## 7. i18n

UI es/en (Español por defecto); `input_hint` y etiquetas del registro en ambos idiomas; la sugerencia sale en `clients.locale`.

## 8. Verificación

| Control | Prueba |
|---|---|
| Cobertura | Un campo asistible sin prompt maestro activo no muestra el botón y se reporta en la zona de administración |
| Flujo | El borrador + prompt maestro devuelve una sugerencia en el idioma del inquilino; la sugerencia no se guarda sin aceptar |
| Validación | Una sugerencia que excede la longitud del campo no se puede aceptar |
| Inferencia | Sin BYOK el botón está deshabilitado con aviso; con BYOK, el consumo queda en `ai_usage_events` con propósito `assist` |
| Auditoría | La aceptación queda con origen `ai_suggested` y versión de prompt |
| Prompt | Un cambio de prompt pasa la batería de ejemplos de evaluación antes de activarse |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Prompt maestro de baja calidad | Versiones + ejemplos de evaluación + tasa de aceptación por campo |
| Costo descontrolado del asistente | Rate limiting; modo Mocter atado a la billetera; BYOK a cargo del inquilino |
| Sugerencias guardadas sin revisión | Human-in-the-loop obligatorio (D-02) |
| Fuga de datos | Solo viaja el texto del campo; sin PII de terceros |

## 10. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| BOT-001 | Reutiliza catálogo, BYOK, presets y `ai_usage_events` (gana `purpose`) |
| ADM-001 | Campos de productos, perfil y bot registrados como asistidos |
| CRM-001 | Notas de prospectos como campo asistido, sin PII en el prompt |
| DAT-001 | Auditoría RF-10.9; tablas en el Router |
| i18n | Directiva es/en aplicada |
