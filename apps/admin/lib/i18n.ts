export type AdminLocale = "es" | "en";

export const adminDictionaries = {
  es: {
    shell: {
      brand: "mocter-admin",
      menuOpen: "Abrir menú",
      menuClose: "Cerrar menú",
      navDashboard: "Tablero",
      navOnboarding: "Onboarding rápido",
      navProducts: "Productos",
      navLeads: "Contactos Landing",
      navNotifications: "Notificaciones",
      navDesignSystem: "Sistema de Diseño",
      themeToggle: "Cambiar tema",
    },
    dashboard: {
      title: "Resumen operativo del negocio",
      primaryAction: "Crear producto",
      kpiRevenue: "Ventas activas",
      kpiConversations: "Conversaciones",
      kpiProducts: "Productos publicados",
      kpiWebchatStatus: "Estado Webchat",
      webchatActive: "Activo",
      emptyState: "Aún no registras actividad en este periodo.",
      errorRecovery: "Reintentar carga",
    },
    onboarding: {
      title: "Configura tu comercio en menos de 5 minutos",
      subtitle: "Solo te pediremos los datos esenciales para dejar tu bot y tu canal web operando.",
      stepBusiness: "1. Datos del negocio",
      stepProduct: "2. Primer producto",
      stepBot: "3. Bot y canal web",
      businessNameLabel: "Nombre del negocio",
      slugLabel: "Identificador (slug)",
      productNameLabel: "Nombre del producto o servicio",
      productDescLabel: "Descripción breve",
      productPriceLabel: "Precio (COP)",
      aiEnhanceButton: "Mejorar con AI",
      submitAction: "Activar mi comercio ahora",
      optionalPendingTitle: "Pendientes opcionales (no bloquean tu operación)",
      pendingWhatsapp: "Conectar canal de WhatsApp",
      pendingPolicies: "Completar políticas de envío y devoluciones",
      pendingCatalog: "Cargar el resto del catálogo",
    },
    leads: {
      title: "Bandeja de contactos de la landing",
      exportCsv: "Exportar CSV",
      searchPlaceholder: "Buscar por nombre o correo...",
      colName: "Nombre",
      colEmail: "Correo",
      colPhone: "Teléfono",
      colStatus: "Estado",
      colAssigned: "Asignado a",
      colCreatedAt: "Fecha",
      statusNew: "Nuevo",
      statusContacted: "Contactado",
      statusQualified: "Calificado",
      statusDiscarded: "Descartado",
      emptyLeads: "No hay solicitudes de contacto para los filtros seleccionados.",
    },
    notifications: {
      title: "Notificaciones transaccionales y plantillas",
      tabSenders: "Remitentes",
      tabProvider: "Proveedor SMTP",
      tabEvents: "Catálogo de eventos",
      tabTemplates: "Plantillas TipTap",
      tabDeliveries: "Historial de entregas (Outbox)",
      primaryAction: "Publicar plantilla",
      testConnection: "Probar conexión SMTP",
      sendTestEmail: "Enviar correo de prueba",
      maskedSecretLabel: "Contraseña SMTP (AES-256-GCM)",
    },
    designSystem: {
      title: "Catálogo interno · Sistema de Diseño DSN-001",
      subtitle: "Ruta interna protegida (/design-system). Exhibe tokens, componentes Mobile First y DataTable.",
      tokensSection: "Tokens en 3 capas (Primitivos, Semánticos, Marca)",
      tableSection: "Tabla de datos estándar (DataTable)",
      densityCompact: "Compacta",
      densityNormal: "Estándar",
      densityComfortable: "Cómoda",
    },
  },
  en: {
    shell: {
      brand: "mocter-admin",
      menuOpen: "Open menu",
      menuClose: "Close menu",
      navDashboard: "Dashboard",
      navOnboarding: "Quick Onboarding",
      navProducts: "Products",
      navLeads: "Landing Leads",
      navNotifications: "Notifications",
      navDesignSystem: "Design System",
      themeToggle: "Toggle theme",
    },
    dashboard: {
      title: "Business operational overview",
      primaryAction: "Create product",
      kpiRevenue: "Active sales",
      kpiConversations: "Conversations",
      kpiProducts: "Published products",
      kpiWebchatStatus: "Webchat status",
      webchatActive: "Active",
      emptyState: "No activity recorded for this period yet.",
      errorRecovery: "Retry loading",
    },
    onboarding: {
      title: "Set up your business in under 5 minutes",
      subtitle: "We only ask for essential details to get your bot and webchat running immediately.",
      stepBusiness: "1. Business details",
      stepProduct: "2. First product",
      stepBot: "3. Bot & web channel",
      businessNameLabel: "Business name",
      slugLabel: "Identifier (slug)",
      productNameLabel: "Product or service name",
      productDescLabel: "Short description",
      productPriceLabel: "Price (COP)",
      aiEnhanceButton: "Enhance with AI",
      submitAction: "Activate my business now",
      optionalPendingTitle: "Optional follow-ups (do not block operation)",
      pendingWhatsapp: "Connect WhatsApp channel",
      pendingPolicies: "Complete shipping and return policies",
      pendingCatalog: "Upload additional catalog items",
    },
    leads: {
      title: "Landing contact requests inbox",
      exportCsv: "Export CSV",
      searchPlaceholder: "Search by name or email...",
      colName: "Name",
      colEmail: "Email",
      colPhone: "Phone",
      colStatus: "Status",
      colAssigned: "Assigned to",
      colCreatedAt: "Date",
      statusNew: "New",
      statusContacted: "Contacted",
      statusQualified: "Qualified",
      statusDiscarded: "Discarded",
      emptyLeads: "No contact requests match the selected filters.",
    },
    notifications: {
      title: "Transactional notifications & templates",
      tabSenders: "Senders",
      tabProvider: "SMTP Provider",
      tabEvents: "Event catalog",
      tabTemplates: "TipTap Templates",
      tabDeliveries: "Delivery log (Outbox)",
      primaryAction: "Publish template",
      testConnection: "Test SMTP connection",
      sendTestEmail: "Send test email",
      maskedSecretLabel: "SMTP Password (AES-256-GCM)",
    },
    designSystem: {
      title: "Internal Catalog · Design System DSN-001",
      subtitle: "Protected internal route (/design-system). Showcases tokens, Mobile First components and DataTable.",
      tokensSection: "3-Layer Tokens (Primitives, Semantic, Brand)",
      tableSection: "Standard Data Table (DataTable)",
      densityCompact: "Compact",
      densityNormal: "Standard",
      densityComfortable: "Comfortable",
    },
  },
} as const;

/**
 * Resuelve el idioma activo siguiendo la jerarquía obligatoria:
 * preferencia de usuario → idioma del inquilino (`clients.locale`) → navegador → defecto `'es'` (`ADM-001 T-27, RF-11.2`).
 */
export function resolveActiveLocale(params: {
  userLocale?: string | null;
  tenantLocale?: string | null;
  browserAcceptLanguage?: string | null;
}): AdminLocale {
  const candidates = [
    params.userLocale,
    params.tenantLocale,
    params.browserAcceptLanguage?.split(",")[0]?.split("-")[0],
  ];
  for (const candidate of candidates) {
    const clean = candidate?.trim().toLowerCase();
    if (clean === "es" || clean === "en") {
      return clean;
    }
  }
  return "es";
}

export function getAdminDictionary(locale: AdminLocale = "es") {
  return adminDictionaries[locale];
}
