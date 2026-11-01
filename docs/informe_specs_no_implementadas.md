# Catálogo Integral de Capacidades Documentadas para Implementación
## Plataforma Mocter · Arquitectura de Producto y Especificaciones del Sistema

| Metadato | Detalle |
|---|---|
| **Proyecto** | Mocter (`EnuarRosales/landig-agencia`) |
| **Documento** | Dossier de Capacidades Técnicas y Funcionales Documentadas |
| **Fecha de corte** | 2026-10-25 |
| **Autor** | Senior Software & Systems Architect |
| **Marco Metodológico** | Spec-Driven Development (SDD) · Constitución [`AGENTS.md`](../.agents/AGENTS.md) |
| **Hoja de Ruta** | [`docs/plan_maestro_implementacion.md`](plan_maestro_implementacion.md) |

---

## 1. Visión General de la Plataforma y Propuesta de Valor

**Mocter** es una plataforma SaaS multi-inquilino de **comercio conversacional, atención omnicanal automatizada y gestión comercial asistida por Inteligencia Artificial**. Su propuesta de valor central radica en el **Time-to-Value radical**: permitir que cualquier negocio u operador comercial quede completamente operativo y listo para interactuar con clientes en **menos de 5 minutos** tras su registro inicial.

El equipo de ingeniería y producto ha formalizado una fase exhaustiva de diseño y arquitectura basada en **Spec-Driven Development (SDD)**, cerrando **29 decisiones estructurales** y documentando en detalle **16 especificaciones funcionales y técnicas** que definen la totalidad de las capacidades que compondrán la plataforma.

Este dossier expone en detalle **todas las capacidades que han sido especificadas, diseñadas y aprobadas** para su posterior implementación en código, organizadas por dominios funcionales, describiendo el valor que entregan al inquilino, a los clientes finales y al operador de la SaaS.

---

## 2. Mapa Arquitectónico de Capacidades

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DOMINIO PÚBLICO Y COMERCIAL                                              │
│    • Landing dinámica con catálogo de planes (LND-001)                      │
│    • Sistema de diseño visual HUD Mobile First (DSN-001)                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Registro con plan_code)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. IDENTIDAD Y AISLAMIENTO DE DATOS                                         │
│    • Autenticación híbrida Argon2id y cookies seguras __Host- (AUTH-001)    │
│    • Persistencia multi-inquilino en celdas con RLS estricto (DAT-001)      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Aprovisionamiento de cuenta y celda)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. NÚCLEO ADMINISTRATIVO Y COMUNICACIONES                                   │
│    • Consola mocter-admin y onboarding en 5 minutos (ADM-001)               │
│    • Notificaciones transaccionales Outbox + RabbitMQ (NTF-001)             │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 4. ATENCIÓN OMNICANAL Y CRM          │  │ 5. MOTOR DE IA Y PROMPTS          │
│    • Chatwoot embebido same-site     │  │    • Inferencia LLM BYOK (BOT-001)│
│      con SSO unificado (CHW-001)     │  │    • Compositor dinámico de       │
│    • CRM de prospectos con Habeas    ├──►      prompts en runtime (BOT-002) │
│      Data Ley 1581 (CRM-001)         │  │    • Asistente en textareas       │
└──────────────────────────────────────┘  │      "Mejorar con AI" (AI-001)    │
                                          └─────────────────┬─────────────────┘
                                                            │ (registrar_pedido)
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. COMERCIO ELECTRÓNICO Y PEDIDOS                                           │
│    • Máquina de estados determinística y fulfillment (ORD-001)              │
│    • Inmutabilidad de precios y prevención de duplicados                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Facturación de ventas y SaaS)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. MONETIZACIÓN, ANALÍTICA Y CRECIMIENTO                                    │
│    • Facturación SaaS dual Wompi + Stripe con Matías API (BILL-001)         │
│    • Dashboards operativos y de negocio en caliente (REP-001)               │
│    • Programa de referidos con créditos en factura (REF-001)                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Protección y continuidad)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. RESILIENCIA Y OPERACIÓN                                                  │
│    • Backups externos con pgBackRest hacia Cloudflare R2 (OPS-001)          │
│    • Monitoreo proactivo de saturación y healthchecks de servicios          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Catálogo Exhaustivo de Capacidades por Dominio

### 3.1 Dominio de Acceso Público y Sistema de Diseño

#### Capacidad 1: Catálogo Dinámico de Planes y Embudo de Conversión (`LND-001`)
* **Propósito:** Conectar la atracción comercial de la landing page con la infraestructura de registro y aprovisionamiento de inquilinos de manera transparente.
* **Capacidades Funcionales Diseñadas:**
  - **Exposición Dinámica de Precios (`#planes`):** La sección de precios se renderiza exclusivamente cuando existen planes públicos activos en base de datos (`plans.status = 'active' AND plans.is_public = true`), eliminando inconsistencias entre la oferta web y la facturación.
  - **Selector de Ciclo de Facturación:** Conmutador interactivo entre pago mensual y anual, calculando en tiempo real el porcentaje de ahorro comercial para el usuario.
  - **Preservación de Intención de Compra (Handoff Seguro):** Selección de plan mediante CTA que redirige a `/[locale]/register?plan_code=...`, conservando el código del plan durante todo el proceso de registro para inyectarlo en el onboarding sin crear inquilinos vacíos si el usuario abandona.
  - **Acceso Unificado al Backoffice:** Botón contextual «Iniciar sesión» en la barra de navegación que enruta fluidamente a la consola administrativa.

#### Capacidad 2: Sistema Visual Adaptable de Alto Contraste HUD (`DSN-001`)
* **Propósito:** Dotar a Mocter de una identidad visual propia, ultra-profesional, accesible y preparada para soportar marca blanca para grandes clientes.
* **Capacidades Funcionales Diseñadas:**
  - **Arquitectura de Tokens en 3 Capas:** Separación limpia de tokens primitivos (paleta base), tokens semánticos (fondos, bordes, estados) y tokens de componente, facilitando la personalización temática por inquilino.
  - **Estética «HUD» Profesional:** Interfaz inspirada en displays de misión crítica, con alto contraste, bordes acentuados y micro-interacciones sutiles que transmiten control y tecnología punta.
  - **Filosofía Mobile First Estricta:** Vistas diseñadas de forma nativa para smartphones y expandidas progresivamente hacia pantallas de escritorio.
  - **Accesibilidad Garantizada (WCAG 2.2 AA):** Contraste cromático certificado para modos claro y oscuro, con tipografías legibles escalonadas (`Chakra Petch` / `Space Grotesk` para títulos HUD, `Inter` / `Geist` para lectura fluida, e `IBM Plex Mono` para datos financieros y métricas).
  - **Catálogo Vivo `/design-system`:** Entorno interno para visualización y prueba de estados de componentes, tablas parametrizables, botones y formularios.

---

### 3.2 Dominio de Identidad, Seguridad y Aislamiento de Datos

#### Capacidad 3: Autenticación Híbrida y Gobernanza de Sesiones (`AUTH-001`)
* **Propósito:** Garantizar que la identidad del usuario sea global, segura e inmutable, manteniendo un control estricto de roles sin delegar autoridad al cliente.
* **Capacidades Funcionales Diseñadas:**
  - **Principio «Falla Cerrado» y Cero Autoridad en el Cliente:** Sin tokens JWT manipulables en el navegador ni roles en cookies. Las sesiones se controlan mediante una cookie opaca `__Host-mocter_sid` con flags de máxima seguridad (`HttpOnly`, `Secure`, `SameSite=Strict`), validada contra hash SHA-256 en PostgreSQL y Redis.
  - **Criptografía de Grado Industrial:** Hash de contraseñas mediante **Argon2id** (64 MB de memoria, 3 iteraciones, 4 hilos de paralelismo) según estándares OWASP.
  - **Matriz de Roles y Alcances Granulares (`D-31`):**
    - Roles de Plataforma SaaS: `platform_admin` (superadministrador) y `platform_sales` (gestión comercial de prospectos).
    - Roles de Inquilino: `tenant_owner` (dueño de la cuenta y facturación), `tenant_agent` (atención humana y pedidos) y `tenant_viewer` (solo lectura y reportes). Se eliminó la ambigüedad histórica de roles intermedios.
  - **OAuth Dinámico Parametrizable:** Capacidad de activar o desactivar proveedores de inicio de sesión social (Google, Facebook) en caliente desde la base de datos (`auth_providers_config`) sin requerir despliegues ni reinicios.
  - **Segundo Factor de Autenticación (2FA TOTP):** Soporte opcional para aplicaciones autenticadoras estándar (Google Authenticator, Authy) con almacenamiento de secretos disociado de los datos del usuario.

#### Capacidad 4: Arquitectura de Persistencia Multi-Inquilino en Celdas (`DAT-001`)
* **Propósito:** Aislar completamente los datos de cada negocio, garantizando escalabilidad horizontal ilimitada y cumplimiento de estrictas normas de confidencialidad.
* **Capacidades Funcionales Diseñadas:**
  - **Separación de Tres Planos:** Plano de Soporte (Chatwoot, SeaweedFS, RabbitMQ), Plano de Control (Router Global `pg-portal`) y Plano de Datos (Celdas `pg-cell-*`).
  - **Clave Universal de Tenencia:** Identificadores `client_id` generados mediante **UUIDv7** ordenables cronológicamente por defecto, evitando colisiones y fugas de información secuencial.
  - **Aislamiento por Row Level Security (RLS) Estricto:** Políticas `FORCE ROW LEVEL SECURITY` a nivel de PostgreSQL activadas mediante la variable de contexto transaccional `app.current_client_id`. Ninguna consulta puede cruzar la frontera de un inquilino a nivel de motor.
  - **Esquema de Celdas y Particionado Híbrido:** Tablas masivas de catálogo (`products`, `product_embeddings`) particionadas de forma nativa por inquilino, preparadas para soportar hasta 10.000 particiones sin degradación del planificador de PostgreSQL 18.
  - **Búsqueda Semántica Vectorial con pgvector:** Indexación HNSW con soporte para embeddings vectoriales de productos y políticas (`halfvec`), facilitando la recuperación contextual para la IA.

---

### 3.3 Dominio de Administración de Inquilinos y Notificaciones

#### Capacidad 5: mocter-admin y Onboarding en 5 Minutos (`ADM-001`)
* **Propósito:** Constituir el corazón operativo de la plataforma donde el inquilino gestiona su negocio, acelerando su activación comercial desde el primer contacto.
* **Capacidades Funcionales Diseñadas:**
  - **Onboarding Guiado Ultra-rápido:** Flujo paso a paso que toma la intención del usuario (`plan_code`), resuelve el plan canónico, crea la cuenta en el Router Global, asigna la celda, aprovisiona la cuenta de Chatwoot, levanta el inbox del webchat y siembra un producto de muestra interactivo en menos de 5 minutos.
  - **Bandeja de Prospección Comercial `/admin/leads`:** Área reservada para el equipo de ventas de Mocter (`platform_sales`) que permite visualizar los leads generados en la landing pública, clasificar su estado, registrar notas de seguimiento y asignarlos a ejecutivos.
  - **Gestión Multimedia Centralizada con SeaweedFS:** Integración con almacenamiento de objetos SeaweedFS 4.49, deduplicando archivos mediante hashes criptográficos SHA-256 para ahorrar hasta un 40% de espacio en disco en catálogos compartidos, con control estricto de cuotas por plan.
  - **Gestión Integral de Usuarios y Miembros:** Invitación y asignación de colaboradores con control de acceso basado en roles (RBAC).

#### Capacidad 6: Mensajería Transaccional Resiliente y Desacoplada (`NTF-001`)
* **Propósito:** Centralizar y asegurar la entrega de correos electrónicos transaccionales críticos (bienvenida, confirmación de pedidos, alertas de pago) sin degradar el rendimiento de la aplicación web.
* **Capacidades Funcionales Diseñadas:**
  - **Patrón Transactional Outbox + RabbitMQ:** Los eventos de notificación se graban en la base de datos dentro de la misma transacción de negocio. Un worker en segundo plano consume los mensajes desde RabbitMQ y efectúa los envíos SMTP.
  - **Resiliencia Operativa Absoluta:** Si el servicio de correo o RabbitMQ sufren interrupciones, **las ventas y el onboarding jamás se detienen**. Los eventos quedan retenidos de forma segura en la tabla outbox y se entregan automáticamente tras el restablecimiento del servicio.
  - **Editor Visual TipTap para Plantillas:** Interfaz enriquecida en `/admin/settings/notifications` que permite al administrador redactar, editar y previsualizar plantillas de correo con variables dinámicas, versionamiento histórico y soporte multilingüe (`es`, `en`).
  - **Gestión de Entregas y Dead Letter Queue (DLQ):** Registro exhaustivo de cada intento de envío, motivos de rebote y cola de descarte para reintentos supervisados.

---

### 3.4 Dominio de Atención Omnicanal y CRM

#### Capacidad 7: Atención Omnicanal Embebida con Chatwoot (`CHW-001`)
* **Propósito:** Ofrecer un centro de contacto profesional omnicanal (Webchat, WhatsApp, Instagram, Messenger) sin forzar al usuario a abandonar la plataforma ni rediseñar la consola de mensajería.
* **Capacidades Funcionales Diseñadas:**
  - **Bandeja de Entrada Embebida en Iframe Same-Site:** Chatwoot v4.19.1 se presenta integrado de forma nativa en `mocter-admin` bajo políticas estrictas de framing seguro (`frame-ancestors 'self'`), manteniendo una experiencia de usuario unificada.
  - **Single Sign-On (SSO) Transparente:** Autenticación automática de agentes vía tokens SSO efímeros (5 minutos de vigencia, un solo uso), eliminando el doble inicio de sesión.
  - **Sincronización Idempotente de Cuentas y Canales:** Creación y vinculación automatizada de cuentas e inboxes mediante Platform API con reintentos basados en claves idempotentes.
  - **Webhooks Bidireccionales:** Captura de eventos de mensajería y cambios de estado en tiempo real para activar la lógica de bots y prospectos en Mocter.

#### Capacidad 8: CRM de Prospectos y Cumplimiento de Habeas Data (`CRM-001`)
* **Propósito:** Convertir las conversaciones en un pipeline comercial estructurado garantizando el cumplimiento riguroso de la Ley 1581 de 2012 de Protección de Datos Personales (Colombia).
* **Capacidades Funcionales Diseñadas:**
  - **Mocter como Única Fuente de Verdad:** Los prospectos y sus estados residen en Mocter; los contactos de Chatwoot actúan como meros reflejos proyectados.
  - **Gestión de Consentimiento Explícito (`prospect_consents`):** Registro inmutable de autorizaciones para dos propósitos independientes: Tratamiento de datos personales y Envío de comunicaciones comerciales.
  - **Captura Interactiva de Autorización:** Envío de avisos de privacidad versionados mediante botones interactivos de WhatsApp/Webchat o enlaces web securizados.
  - **Derecho al Olvido y Anonimización:** Mecanismos automáticos para purgar o anonimizar información confidencial cuando un titular ejerza su derecho de supresión legal.
  - **Índice de Calidad del Dato:** Algoritmos de deduplicación y evaluación de completitud de perfiles de clientes para optimizar campañas de ventas.

---

### 3.5 Dominio de Inteligencia Artificial y Automatización Conversacional

#### Capacidad 9: Gobernanza de Inferencia LLM y Modelo Multicátalogo (`BOT-001`)
* **Propósito:** Permitir que cada negocio active un asistente virtual inteligente adaptado a su presupuesto y preferencias de proveedor.
* **Capacidades Funcionales Diseñadas:**
  - **Esquema Inicial BYOK (Bring Your Own Key):** El inquilino puede configurar sus propias credenciales de proveedores líderes: OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude 3.5 Sonnet), Google Gemini (Gemini 1.5 Pro/Flash) o inferencia local con Ollama.
  - **Bóveda Segura de Secretos:** Cifrado en reposo para todas las API keys configuradas por los inquilinos.
  - **Mecanismo de Salvaguarda Operativa (Timeout & Fallback):** Límite estricto de inferencia de 10 segundos. Si el proveedor de IA se satura o demora, el bot transfiere automáticamente la conversación a un agente humano en Chatwoot, evitando silencios incómodos con el cliente.
  - **Arquitectura para Billetera Compartida Prepago:** Modelo diseñado con spread configurable (30% base) para que Mocter ofrezca en el futuro inferencia empaquetada como servicio de valor agregado.

#### Capacidad 10: Motor de Composición Dinámica de Prompts en Runtime (`BOT-002`)
* **Propósito:** Generar respuestas conversacionales hipercontextualizadas y actualizadas al instante sin requerir reindexaciones complejas de catálogos.
* **Capacidades Funcionales Diseñadas:**
  - **Composición Modular en Tiempo Real:** El prompt de sistema se construye dinámicamente al recibir cada mensaje ensamblando:
    1. Directivas maestras de seguridad y restricciones de la plataforma.
    2. Identidad, personalidad y políticas del inquilino (envíos, devoluciones, garantías).
    3. Estado actual de la conversación y perfil del prospecto.
    4. Productos activos y disponibilidad de inventario directamente desde la base de datos.
  - **Cero Latencia por Cambios de Catálogo:** Cambiar un precio o descripción en el catálogo impacta de inmediato en la siguiente respuesta del bot sin regenerar prompts estáticos ni reconstruir bases de conocimiento.
  - **Clasificación Automática de Intenciones:** Detección de intención de compra, solicitud de soporte o reclamos, aplicando etiquetas automáticas al lead.
  - **Contrato de Acción `registrar_pedido`:** Capacidad del bot para invocar formalmente la creación de órdenes de compra cuando el cliente confirma su intención de compra en el chat.

#### Capacidad 11: Asistente «Mejorar con AI» en Textareas de Configuración (`AI-001`)
* **Propósito:** Eliminar la fricción de redacción en los formularios administrativos, guiando al inquilino para crear descripciones comerciales atractivas en segundos.
* **Capacidades Funcionales Diseñadas:**
  - **Componente Universal `AiEnhanceTextarea`:** Integración de un botón interactivo «Mejorar con AI» en todos los campos de texto enriquecido del backoffice (descripción de negocio, fichas de productos, políticas de servicio).
  - **Biblioteca de Prompts Maestros Parametrizados:** El sistema toma el borrador preliminar del usuario y lo refina utilizando prompts maestros optimizados para persuasión comercial y claridad técnica.
  - **Revisión Humana Obligatoria:** La propuesta generada por la IA se presenta en un panel de comparación (*diff* visual); el usuario decide si la acepta, la ajusta o la descarta, garantizando el control total sobre la marca.

---

### 3.6 Dominio de Comercio Electrónico y Gestión de Pedidos

#### Capacidad 12: Motor de Pedidos y Fulfillment Determinístico (`ORD-001`)
* **Propósito:** Estructurar el proceso transaccional de ventas cerradas tanto por el bot de IA como por los asesores comerciales humanos.
* **Capacidades Funcionales Diseñadas:**
  - **Registro Omnicanal de Órdenes:** Recepción de pedidos mediante la invocación programática del bot (`registrar_pedido`) o a través de captura manual en la consola por parte del equipo de ventas.
  - **Inmutabilidad de Precios y Condiciones:** Al registrarse el pedido, se genera una fotografía inmutable de los ítems, precios unitarios, descuentos y moneda, protegiendo la venta frente a futuras variaciones del catálogo.
  - **Máquina de Estados Finita y Robusta:** Ciclo de vida determinístico:
    `Borrador` → `Pendiente de Pago` → `Pagado` → `En Preparación` → `Despachado` → `Entregado` (con transiciones controladas hacia `Cancelado` o `Reembolsado`).
  - **Garantía de Idempotencia en Conversaciones:** Control de duplicados mediante tokens únicos asociados a la conversación, impidiendo que reintentos del bot o problemas de red generen órdenes duplicadas.
  - **Logística y Trazabilidad:** Registro de número de guía, transportadora asociada y eventos de seguimiento accesibles tanto por el operador como consultables por el bot para responder al cliente («¿dónde está mi pedido?»).

---

### 3.7 Dominio de Facturación, Analítica y Crecimiento

#### Capacidad 13: Pasarela de Cobros SaaS Dual y Facturación Inteligente (`BILL-001`)
* **Propósito:** Gestionar de forma integral la recaudación de ingresos de la plataforma Mocter a nivel nacional e internacional, automatizando el ciclo de suscripción.
* **Capacidades Funcionales Diseñadas:**
  - **Pasarela Dual Georreferenciada:**
    - **Wompi (Colombia):** Pagos mediante PSE, Nequi, transferencias Bancolombia y tarjetas locales.
    - **Stripe (Internacional):** Tarjetas de crédito globales con procesamiento multidivisa.
  - **Seguridad en Pagos (Cero Datos de Tarjeta en Mocter):** Tokenización delegada en las pasarelas; el sistema almacena exclusivamente tokens reutilizables y referencias seguras.
  - **Prorrateo Exacto por Días:** Cálculo financiero automatizado de cargos y abonos proporcionales al momento de cambiar de plan (upgrade o downgrade de suscripción).
  - **Comprobantes Internos en Excel y PDF:** Generación instantánea de comprobantes contables de pago descargables tanto para el inquilino como para la administración de la SaaS.
  - **Preparación para Facturación Electrónica DIAN:** Captura estructurada de datos fiscales (NIT, razón social, régimen tributario) bajo los estándares de la **API de Matías**, facilitando la emisión masiva de facturas electrónicas oficiales en etapas posteriores.

#### Capacidad 14: Informes Analíticos en Tiempo Real sin Snapshots (`REP-001`)
* **Propósito:** Ofrecer visibilidad ejecutiva y operativa instantánea sobre el rendimiento del negocio sin incurrir en costes de infraestructura de Data Warehousing en etapas tempranas.
* **Capacidades Funcionales Diseñadas:**
  - **Cálculo en Caliente de Alto Rendimiento:** Consultas directas a PostgreSQL 18 aprovechando índices compuestos cronológicos, garantizando tiempos de respuesta P95 inferiores a 800 ms.
  - **Doble Superficie Analítica:**
    - Dashboard de Inquilino: Tasa de conversión de conversaciones, pedidos cerrados, efectividad del bot vs agentes humanos, tiempos de primera respuesta y volumen de ventas.
    - Dashboard de la SaaS: Crecimiento de inquilinos activos, MRR (Monthly Recurring Revenue), consumo de cuotas de almacenamiento en SeaweedFS y llamadas agregadas a LLMs.
  - **Selector Flexible de Períodos:** Análisis desglosado por: Hoy, Semana, Mes, Trimestre, Semestre, Año o Rangos personalizados.
  - **Motor Nativo de Exportación:** Descarga asíncrona de reportes consolidados en formatos abiertos **Excel (`.xlsx`)** y documentos ejecutivos **PDF (`.pdf`)**.

#### Capacidad 15: Programa de Crecimiento Comunitario por Referidos (`REF-001`)
* **Propósito:** Impulsar el crecimiento viral de la plataforma mediante la fidelización y recompensa a inquilinos y líderes comunitarios que refieran nuevos negocios.
* **Capacidades Funcionales Diseñadas:**
  - **Modelo A Aprobado (Crédito en Factura):** Recompensas asignadas como saldo a favor en la cuenta del inquilino, amortizable automáticamente en su siguiente factura de suscripción SaaS.
  - **Atribución Automatizada:** Generación de enlaces y códigos únicos de recomendación con ventana de atribución por cookies de 60 días.
  - **Mecanismo Antifraude:** La recompensa solo se califica y acredita cuando el referido completa su primer pago real de suscripción (las altas en período de prueba o cuentas abandonadas no generan crédito).
  - **Vigencia Controlada:** Saldo de referidos válido durante 365 días continuos desde su emisión.
  - **Interruptor Maestro de Campaña:** Capacidad de activar, pausar o modificar porcentajes de recompensa desde el backoffice de la SaaS mediante un simple toggle.

---

### 3.8 Dominio de Continuidad Operativa y Resiliencia

#### Capacidad 16: Respaldo Externo, Continuidad y Observabilidad (`OPS-001`)
* **Propósito:** Blindar la plataforma frente a desastres catastróficos, garantizando la inviolabilidad y recuperación de los datos en cualquier circunstancia.
* **Capacidades Funcionales Diseñadas:**
  - **Estrategia de Backup Fuera del Servidor con pgBackRest:** Copias de seguridad automatizadas enviadas directamente hacia almacenamiento de objetos **Cloudflare R2** (S3 compatible), desacopladas del VPS de producción:
    - Respaldo completo semanal.
    - Respaldos diferenciales diarios con archivado continuo de Write-Ahead Logs (WAL).
  - **Objetivos de Recuperación Confiables:** RTO (Tiempo de Recuperación) ≤ 2 horas y RPO (Pérdida Máxima de Datos) ≤ 24 horas (cero pérdida en transacciones con WAL archivado).
  - **Respaldo Sincronizado de Archivos:** Copias de seguridad de volúmenes multimedia de SeaweedFS correlacionadas con las versiones de la base de datos.
  - **Matriz de Monitoreo y Salud del Sistema:** Endpoints de healthcheck activos y métricas de saturación para PostgreSQL, Redis, SeaweedFS, RabbitMQ y Chatwoot, alertando proactivamente sobre anomalías de memoria, disco o concurrencia.

---

## 4. Matriz de Flujos de Extremo a Extremo (El Ciclo de Vida en Mocter)

La integración sinérgica de estas 16 capacidades conforma un recorrido de usuario fluido y automatizado:

| Paso | Actor / Origen | Módulo / Spec | Acción / Capacidad Ejecutada | Resultado / Siguiente Handoff |
|:---:|---|---|---|---|
| **01** | Prospecto Web | **LND-001** (Landing) | Explora la oferta pública, compara funcionalidades y selecciona un plan comercial (`#planes`). | Redirección con intención de compra a `/[locale]/register?plan_code=...`. |
| **02** | Prospecto Web | **AUTH-001** (Identidad) | Diligencia el formulario de registro. Se valida la contraseña con Argon2id y se emite la cookie segura `__Host-mocter_sid`. | Usuario autenticado en el Router Global; redirigido al onboarding. |
| **03** | Inquilino / Dueño | **ADM-001** (mocter-admin) & **DAT-001** (Celdas) | Se ejecuta el wizard de onboarding en 5 minutos: resolución de `plan_code` a `plans.id` UUID, creación de `client`, asignación de celda y producto demo. | Inquilino activo, celda aprovisionada y rol `tenant_owner` asignado. |
| **04** | Plataforma Mocter | **CHW-001** (Chatwoot) | Aprovisionamiento automatizado de cuenta en Chatwoot e inbox de webchat vía Platform API. | Canal de atención listo y correlacionado con `client_id`. |
| **05** | Plataforma Mocter | **NTF-001** (Notificaciones) | Emisión del evento `tenant.welcome`. Registro en tabla outbox transaccional y despacho asíncrono con RabbitMQ. | Correo de bienvenida entregado sin bloquear la experiencia web. |
| **06** | Cliente Final | **CHW-001** & **CRM-001** (Omnicanal) | El cliente inicia conversación por Webchat o WhatsApp. Se captura su consentimiento legal de Habeas Data (Ley 1581). | Prospecto creado en Mocter y proyectado a contactos de Chatwoot. |
| **07** | Motor Mocter | **BOT-001** & **BOT-002** (IA Conversacional) | El bot ensambla el prompt dinámico en runtime (directivas + tono + catálogo activo de Postgres) y responde en menos de 2s. | Asistencia fluida con precios actualizados y sin prompts estáticos. |
| **08** | Cliente Final / Bot | **ORD-001** (Pedidos) | El cliente confirma su compra en el chat. El bot ejecuta el contrato `registrar_pedido` con clave de idempotencia. | Orden inmutable creada con precios congelados y estado `draft`/`pending_payment`. |
| **09** | Asesor / Inquilino | **ADM-001** & **REP-001** (Gestión) | El asesor gestiona el fulfillment del pedido desde `mocter-admin` y consulta las métricas de venta en tiempo real. | Pedido despachado con guía y dashboards operativos actualizados en caliente. |
| **10** | Plataforma Mocter | **BILL-001** & **REF-001** (Finanzas) | Al cumplirse el ciclo, se procesa el cobro de la suscripción SaaS vía Wompi o Stripe, aplicando créditos de referidos disponibles. | Cobro exitoso, emisión de comprobante PDF/Excel y extensión del plan. |
| **11** | Infraestructura | **OPS-001** (Operaciones) | Ejecución automática de copias de seguridad continuas y archivado de WALs hacia Cloudflare R2. | Resiliencia garantizada con RTO <= 2 horas y RPO <= 24 horas. |

---

## 5. Hoja de Ruta de Implementación Secuencial

Para materializar estas capacidades sin comprometer la estabilidad del sistema actual, el equipo ha estructurado el **Plan Maestro de Implementación** en 5 fases secuenciales gobernadas por compuertas de verificación automatizadas (*Verification Gates*):

| Fase | Título de la Fase | Capacidades y Módulos a Implementar | Compuerta de Verificación (Gate) |
|:---:|---|---|---|
| **Fase 1** | **Cimientos y Entrada Pública** | `DAT-001` (Esquemas y RLS) + `AUTH-001` (Auth híbrida y sesiones) + `LND-001` (Header, #planes y /login) + `DSN-001` (Tokens base) | Migraciones fundacionales verificadas con `drizzle-kit check`, tests de auth (Argon2id/sesiones), render condicional de planes y handoff seguro de `plan_code`. |
| **Fase 2** | **Chatwoot Base, Administración y Notificaciones** | `CHW-001` (Contenedor 4.19.1 y API adapter) + `ADM-001` (Onboarding, roles y leads) + `DSN-001` (Componentes y catálogo) + `NTF-001` (Outbox y RabbitMQ) | Onboarding completo en < 5 min, cuentas correlacionadas, envío de emails desacoplado (RabbitMQ caído no detiene el alta) y multimedia en SeaweedFS. |
| **Fase 3** | **Chatwoot Avanzado y CRM Legal** | `CHW-001` (Iframe same-site y SSO) + `CRM-001` (Maestro prospectos y Habeas Data) | Iframe y SSO validados en laboratorio, webhooks con idempotencia y trazabilidad de consentimientos bajo Ley 1581. |
| **Fase 4** | **Motor de Inteligencia Artificial y Pedidos** | `BOT-001` (Catálogo LLM y BYOK) + `BOT-002` (Prompts en runtime) + `ORD-001` (Pedidos y fulfillment) + `AI-001` (Asistente en textareas) | Contrato `registrar_pedido` probado sin duplicidad, timeout de 10s con fallback a humano y asistente AI integrado en formularios. |
| **Fase 5** | **Monetización, Analítica y Resiliencia** | `BILL-001` (Wompi, Stripe y Matías) + `REP-001` (Dashboards en caliente) + `REF-001` (Referidos) + `OPS-001` (pgBackRest y R2) + `LND-001` (Upgrade) | Webhooks de pago validados con checksum/firma, reportes P95 < 800 ms, créditos de referidos aplicados y simulacro de restore exitoso con pgBackRest. |

---

## 6. Conclusiones y Estado de Preparación

1. **Madurez Documental Excepcional:** Las 16 especificaciones cubren de manera exhaustiva y sin vacíos conceptuales la totalidad de los requerimientos de negocio, técnicos y legales de una plataforma SaaS moderna.
2. **Arquitectura Desacoplada y Escalable:** El diseño garantiza que cada subsistema (Chatwoot, RabbitMQ, Pasarelas de Pago, LLMs) opere de forma modular y tolerante a fallos, asegurando que la indisponibilidad de un tercero nunca paralice la operación central del cliente.
3. **Listo para la Fase 1:** El equipo cuenta con todos los contratos, esquemas y diagramas requeridos para iniciar la codificación de la **Fase 1 (Cimientos y Entrada Pública)** en el momento en que se emita la autorización de inicio.
