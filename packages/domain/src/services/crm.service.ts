import { ok, err, type Result } from "../types/result";
import type { ICrmRepository, CrmQualityMetrics } from "../repositories/crm.repository.interface";
import type {
  CellContact,
  CellProspectConsent,
  CellPrivacyNotice,
} from "../db/schemas/tenant/crm";
import { appLogger } from "../utils/logger";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parámetros para el alta manual o programática de un prospecto (CRM-001 §3.1, RF-02.4).
 */
export interface CreateProspectInput {
  fullName: string;
  email?: string;
  phoneMobile?: string;
  phoneLandline?: string;
  documentType?: "CC" | "NIT" | "CE" | "PASSPORT" | "other";
  documentNumber?: string;
  country?: string;
  state?: string;
  city?: string;
  addressLine?: string;
  postalCode?: string;
  source?: "whatsapp" | "web" | "email" | "manual" | "referral" | "other";
  channel?: string;
  assignedUserId?: string;
  tags?: string[];
  notes?: string;
  createdBy: string;
}

/**
 * Parámetros para la actualización de un prospecto existente.
 */
export interface UpdateProspectInput {
  fullName?: string;
  email?: string;
  phoneMobile?: string;
  phoneLandline?: string;
  documentType?: "CC" | "NIT" | "CE" | "PASSPORT" | "other";
  documentNumber?: string;
  country?: string;
  state?: string;
  city?: string;
  addressLine?: string;
  postalCode?: string;
  stage?: "new" | "in_conversation" | "qualified" | "customer" | "discarded";
  assignedUserId?: string;
  tags?: string[];
  notes?: string;
  updatedBy: string;
}

/**
 * Parámetros de ingesta automática derivados de eventos entrantes de Chatwoot (CRM-001 §5, T-04).
 */
export interface ChatwootIngestionInput {
  chatwootContactId: number;
  name: string;
  phoneMobile?: string;
  email?: string;
  channel?: string;
  executedBy: string;
}

/**
 * Resultado estructurado del proceso de ingesta desde Chatwoot.
 */
export interface IngestionResult {
  prospect: CellContact;
  action: "created" | "updated";
  duplicateWarning?: boolean;
}

/**
 * Parámetros para registrar un consentimiento de tratamiento de datos (Ley 1581, CRM-001 §3.2).
 */
export interface RecordConsentInput {
  prospectId: string;
  purpose: "data_treatment" | "commercial_comms";
  policyVersion: string;
  channel?: "whatsapp_buttons" | "web_form" | "manual" | "import";
  evidenceRef?: string;
  createdBy: string;
}

/**
 * Botón interactivo para mensajes de consentimiento en WhatsApp (CRM-001 T-06B).
 */
export interface WhatsAppConsentButton {
  id: "accept_treatment" | "accept_all" | "reject";
  title: string;
}

/**
 * Carga estructurada de mensaje interactivo para WhatsApp con aviso de privacidad y botones.
 */
export interface WhatsAppConsentMessagePayload {
  bodyText: string;
  noticeUrl: string;
  policyVersion: string;
  buttons: WhatsAppConsentButton[];
}

/**
 * Parámetros para procesar la respuesta interactiva de consentimiento desde WhatsApp/Chatwoot.
 */
export interface HandleWhatsAppConsentInput {
  prospectId: string;
  buttonId: string;
  messageId: string;
  policyVersion?: string;
  executedBy?: string;
}

/**
 * Resultado del procesamiento de consentimiento interactivo por WhatsApp.
 */
export interface WhatsAppConsentResult {
  granted: boolean;
  reason?: string;
  purposes: ("data_treatment" | "commercial_comms")[];
  consents: CellProspectConsent[];
}

/**
 * Servicio de negocio para la gestión comercial de prospectos, consentimientos Habeas Data
 * e indicadores de calidad de datos en Mocter (CRM-001).
 */
export interface ICrmPlanQuotaEvaluator {
  getQuota(clientId: string, dimension: "contacts"): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;
}

export class CrmService {
  constructor(
    private readonly repository: ICrmRepository,
    private readonly quotaEvaluator?: ICrmPlanQuotaEvaluator,
  ) {}

  /**
   * Da de alta un nuevo prospecto exigiendo un mínimo de dos campos (nombre + canal de contacto).
   */
  async createProspect(
    cellId: string,
    clientId: string,
    input: CreateProspectInput,
  ): Promise<Result<CellContact>> {
    const trimmedName = input.fullName?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return err(
        "El nombre completo o razón social es obligatorio y debe tener al menos 2 caracteres.",
        "VALIDATION_ERROR",
      );
    }

    const hasContactChannel = Boolean(input.email?.trim() || input.phoneMobile?.trim() || input.phoneLandline?.trim());
    if (!hasContactChannel) {
      return err(
        "Se requiere al menos un canal de contacto válido (correo electrónico o teléfono).",
        "VALIDATION_ERROR",
      );
    }

    if (input.phoneMobile && input.phoneMobile.trim().length > 0) {
      const sanitizedPhone = input.phoneMobile.trim();
      if (!E164_REGEX.test(sanitizedPhone)) {
        return err(
          `El teléfono móvil '${sanitizedPhone}' debe cumplir con el formato internacional E.164 (ej: +573001234567).`,
          "VALIDATION_ERROR",
        );
      }
    }

    if (input.email && input.email.trim().length > 0) {
      const sanitizedEmail = input.email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(sanitizedEmail)) {
        return err(
          `El correo electrónico '${input.email}' no tiene una estructura válida.`,
          "VALIDATION_ERROR",
        );
      }
    }

    if (this.quotaEvaluator) {
      const quota = await this.quotaEvaluator.getQuota(clientId, "contacts");
      if (quota.mode === "LIMITED") {
        if (quota.value === null || quota.value === 0) {
          return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
        }
        const { total } = await this.repository.listContacts(cellId, clientId, { includeDeleted: false });
        if (total + 1 > quota.value) {
          return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
        }
      }
    }

    try {
      const created = await this.repository.createContact(cellId, clientId, {
        fullName: trimmedName,
        email: input.email ? input.email.trim().toLowerCase() : undefined,
        phoneMobile: input.phoneMobile ? input.phoneMobile.trim() : undefined,
        phoneLandline: input.phoneLandline ? input.phoneLandline.trim() : undefined,
        documentType: input.documentType,
        documentNumber: input.documentNumber ? input.documentNumber.trim() : undefined,
        country: input.country,
        state: input.state,
        city: input.city,
        addressLine: input.addressLine,
        postalCode: input.postalCode,
        source: input.source ?? "manual",
        channel: input.channel,
        assignedUserId: input.assignedUserId,
        stage: "new",
        tags: input.tags ?? [],
        notes: input.notes,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      return ok(created);
    } catch (error: any) {
      appLogger.error("Error al crear prospecto en celda", { cellId, clientId, error });
      return err(error.message ?? "Error interno al crear prospecto", "DB_ERROR");
    }
  }

  /**
   * Actualiza los datos de un prospecto validando formatos de entrada.
   */
  async updateProspect(
    cellId: string,
    clientId: string,
    prospectId: string,
    input: UpdateProspectInput,
  ): Promise<Result<CellContact>> {
    if (input.phoneMobile && input.phoneMobile.trim().length > 0) {
      const sanitizedPhone = input.phoneMobile.trim();
      if (!E164_REGEX.test(sanitizedPhone)) {
        return err(
          `El teléfono móvil '${sanitizedPhone}' debe cumplir con el formato internacional E.164.`,
          "VALIDATION_ERROR",
        );
      }
    }

    if (input.email && input.email.trim().length > 0) {
      const sanitizedEmail = input.email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(sanitizedEmail)) {
        return err(
          `El correo electrónico '${input.email}' no tiene una estructura válida.`,
          "VALIDATION_ERROR",
        );
      }
    }

    try {
      const existing = await this.repository.findContactById(cellId, clientId, prospectId);
      if (!existing) {
        return err(`Prospecto ${prospectId} no encontrado.`, "NOT_FOUND");
      }

      const updated = await this.repository.updateContact(cellId, clientId, prospectId, {
        fullName: input.fullName?.trim() ?? existing.fullName,
        email: input.email !== undefined ? (input.email ? input.email.trim().toLowerCase() : null) : existing.email,
        phoneMobile: input.phoneMobile !== undefined ? (input.phoneMobile ? input.phoneMobile.trim() : null) : existing.phoneMobile,
        phoneLandline: input.phoneLandline !== undefined ? (input.phoneLandline ? input.phoneLandline.trim() : null) : existing.phoneLandline,
        documentType: input.documentType ?? existing.documentType,
        documentNumber: input.documentNumber !== undefined ? (input.documentNumber ? input.documentNumber.trim() : null) : existing.documentNumber,
        country: input.country ?? existing.country,
        state: input.state ?? existing.state,
        city: input.city ?? existing.city,
        addressLine: input.addressLine ?? existing.addressLine,
        postalCode: input.postalCode ?? existing.postalCode,
        stage: input.stage ?? existing.stage,
        assignedUserId: input.assignedUserId !== undefined ? input.assignedUserId : existing.assignedUserId,
        tags: input.tags ?? existing.tags,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedBy: input.updatedBy,
      });

      return ok(updated!);
    } catch (error: any) {
      appLogger.error("Error al actualizar prospecto", { cellId, clientId, prospectId, error });
      return err(error.message ?? "Error interno al actualizar prospecto", "DB_ERROR");
    }
  }

  /**
   * Ingesta o reconcilia un contacto procedente de un webhook de Chatwoot (T-04).
   *
   * Regla de decisión: Inserción estricta por `chatwoot_contact_id`. Si el teléfono ya existe
   * en otro registro, no se fusiona automáticamente; se registra advertencia de duplicidad
   * para conservar la procedencia original del dato.
   */
  async ingestFromChatwoot(
    cellId: string,
    clientId: string,
    input: ChatwootIngestionInput,
  ): Promise<Result<IngestionResult>> {
    try {
      const existingByChatwoot = await this.repository.findContactByChatwootId(
        cellId,
        clientId,
        input.chatwootContactId,
      );

      if (existingByChatwoot) {
        const updated = await this.repository.updateContact(cellId, clientId, existingByChatwoot.id, {
          lastSeenAt: new Date(),
          updatedBy: input.executedBy,
        });

        return ok({
          prospect: updated!,
          action: "updated",
        });
      }

      let duplicateWarning = false;
      if (input.phoneMobile && input.phoneMobile.trim().length > 0) {
        const matchingPhones = await this.repository.findContactsByPhone(
          cellId,
          clientId,
          input.phoneMobile.trim(),
        );

        if (matchingPhones.length > 0) {
          duplicateWarning = true;
          appLogger.warn("Detectada colisión de teléfono en ingesta de Chatwoot sin auto-enlace", {
            chatwootContactId: input.chatwootContactId,
            phoneMobile: input.phoneMobile,
            conflictingCount: matchingPhones.length,
          });
        }
      }

      if (this.quotaEvaluator) {
        const quota = await this.quotaEvaluator.getQuota(clientId, "contacts");
        if (quota.mode === "LIMITED") {
          if (quota.value === null || quota.value === 0) {
            return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
          }
          const { total } = await this.repository.listContacts(cellId, clientId, { includeDeleted: false });
          if (total + 1 > quota.value) {
            return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
          }
        }
      }

      const created = await this.repository.createContact(cellId, clientId, {
        fullName: input.name?.trim() || `Contacto WhatsApp #${input.chatwootContactId}`,
        phoneMobile: input.phoneMobile ? input.phoneMobile.trim() : undefined,
        email: input.email ? input.email.trim().toLowerCase() : undefined,
        source: "whatsapp",
        channel: input.channel ?? "whatsapp",
        chatwootContactId: input.chatwootContactId,
        stage: "new",
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      return ok({
        prospect: created,
        action: "created",
        duplicateWarning,
      });
    } catch (error: any) {
      appLogger.error("Error en ingesta desde Chatwoot", { cellId, clientId, input, error });
      return err(error.message ?? "Error interno en ingesta Chatwoot", "DB_ERROR");
    }
  }

  /**
   * Ejecuta el derecho al olvido y supresión con anonimización irreversible (D-04, Ley 1581).
   *
   * Reemplaza datos personales con tokens irreversibles conservando el historial de consentimientos.
   */
  async anonymizeProspect(
    cellId: string,
    clientId: string,
    prospectId: string,
    deletedBy: string,
  ): Promise<Result<CellContact>> {
    try {
      const existing = await this.repository.findContactById(cellId, clientId, prospectId);
      if (!existing) {
        return err(`Prospecto ${prospectId} no encontrado.`, "NOT_FOUND");
      }

      const anonymized = await this.repository.anonymizeContact(cellId, clientId, prospectId, deletedBy);
      return ok(anonymized!);
    } catch (error: any) {
      appLogger.error("Error en anonimización de prospecto", { cellId, clientId, prospectId, error });
      return err(error.message ?? "Error interno al anonimizar", "DB_ERROR");
    }
  }

  /**
   * Registra un consentimiento de tratamiento de datos personales o comunicaciones comerciales.
   */
  async recordConsent(
    cellId: string,
    clientId: string,
    input: RecordConsentInput,
  ): Promise<Result<CellProspectConsent>> {
    try {
      const consent = await this.repository.createConsent(cellId, clientId, {
        prospectId: input.prospectId,
        purpose: input.purpose,
        policyVersion: input.policyVersion,
        status: "granted",
        channel: input.channel ?? "whatsapp_buttons",
        evidenceRef: input.evidenceRef,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      return ok(consent);
    } catch (error: any) {
      appLogger.error("Error al registrar consentimiento", { cellId, clientId, input, error });
      return err(error.message ?? "Error interno al registrar consentimiento", "DB_ERROR");
    }
  }

  /**
   * Revoca un consentimiento vigente garantizando cese inmediato de comunicaciones comerciales.
   */
  async revokeConsent(
    cellId: string,
    clientId: string,
    consentId: string,
    revokedBy: string,
  ): Promise<Result<CellProspectConsent>> {
    try {
      const revoked = await this.repository.revokeConsent(cellId, clientId, consentId, revokedBy);
      if (!revoked) {
        return err(`Consentimiento ${consentId} no encontrado.`, "NOT_FOUND");
      }

      return ok(revoked);
    } catch (error: any) {
      appLogger.error("Error al revocar consentimiento", { cellId, clientId, consentId, error });
      return err(error.message ?? "Error interno al revocar consentimiento", "DB_ERROR");
    }
  }

  /**
   * Siembra la versión inicial 1.0.0 del aviso de privacidad para el inquilino al provisionarlo.
   */
  async seedDefaultPrivacyNotice(
    cellId: string,
    clientId: string,
    author: string,
  ): Promise<Result<CellPrivacyNotice>> {
    try {
      const existing = await this.repository.findPublishedPrivacyNotice(cellId, clientId, "es");
      if (existing) {
        return ok(existing);
      }

      const defaultNotice = await this.repository.createPrivacyNotice(cellId, clientId, {
        version: "1.0.0",
        locale: "es",
        title: "Aviso de Privacidad y Tratamiento de Datos Personales",
        bodyMarkdown:
          "En cumplimiento de la Ley 1581 de 2012 y sus decretos reglamentarios, le informamos que sus datos serán tratados para la gestión comercial y soporte del servicio.",
        status: "published",
        publishedAt: new Date(),
        reviewedAt: new Date(),
        createdBy: author,
        updatedBy: author,
      });

      return ok(defaultNotice);
    } catch (error: any) {
      appLogger.error("Error al sembrar aviso de privacidad por defecto", { cellId, clientId, error });
      return err(error.message ?? "Error interno al sembrar aviso de privacidad", "DB_ERROR");
    }
  }

  /**
   * Obtiene los cinco indicadores consolidados de calidad de datos para el panel del inquilino.
   */
  async getQualityMetrics(
    cellId: string,
    clientId: string,
  ): Promise<Result<CrmQualityMetrics>> {
    try {
      const metrics = await this.repository.getQualityMetrics(cellId, clientId);
      return ok(metrics);
    } catch (error: any) {
      appLogger.error("Error al calcular métricas de calidad", { cellId, clientId, error });
      return err(error.message ?? "Error interno al calcular métricas de calidad", "DB_ERROR");
    }
  }

  /**
   * Genera la carga interactiva para WhatsApp con botones de aceptación y enlace al aviso legal (T-06B, RF-03.7).
   */
  async generateWhatsAppConsentMessage(
    cellId: string,
    clientId: string,
    options?: { locale?: "es" | "en"; customNoticeUrl?: string },
  ): Promise<Result<WhatsAppConsentMessagePayload>> {
    const locale = options?.locale ?? "es";
    try {
      const notice = await this.repository.findPublishedPrivacyNotice(cellId, clientId, locale);
      const version = notice?.version ?? "1.0.0";
      const noticeUrl =
        options?.customNoticeUrl ??
        `https://mocter.co/privacy/tenant/${clientId}?v=${version}&lang=${locale}`;

      if (locale === "en") {
        return ok({
          bodyText:
            `Privacy Notice: To provide you with personalized attention and manage your orders, ` +
            `we require your authorization for personal data processing. Please review our full notice at: ${noticeUrl}`,
          noticeUrl,
          policyVersion: version,
          buttons: [
            { id: "accept_treatment", title: "Accept Treatment" },
            { id: "accept_all", title: "Accept All" },
            { id: "reject", title: "Reject" },
          ],
        });
      }

      return ok({
        bodyText:
          `Aviso de Privacidad (Ley 1581 de 2012): Para brindarte atención personalizada y gestionar tus pedidos, ` +
          `requerimos tu autorización para el tratamiento de tus datos personales. Consulta nuestro aviso completo en: ${noticeUrl}`,
        noticeUrl,
        policyVersion: version,
        buttons: [
          { id: "accept_treatment", title: "Acepto Tratamiento" },
          { id: "accept_all", title: "Acepto Todo" },
          { id: "reject", title: "Rechazar" },
        ],
      });
    } catch (error: any) {
      appLogger.error("Error al generar mensaje de consentimiento WhatsApp", { cellId, clientId, error });
      return err(error.message ?? "Error al generar mensaje de consentimiento WhatsApp", "DB_ERROR");
    }
  }

  /**
   * Procesa la respuesta interactiva de botones de WhatsApp registrando el consentimiento explícito
   * enlazado al message_id de Chatwoot como evidencia (CRM-001 T-06B, RF-03.7).
   *
   * Regla no negociable: Sin aceptación explícita (botón accept_treatment o accept_all) NO hay consentimiento.
   */
  async handleWhatsAppConsentResponse(
    cellId: string,
    clientId: string,
    input: HandleWhatsAppConsentInput,
  ): Promise<Result<WhatsAppConsentResult>> {
    if (!input.messageId || input.messageId.trim().length === 0) {
      return err("El identificador de mensaje (messageId) de Chatwoot es obligatorio como evidencia.", "VALIDATION_ERROR");
    }

    if (!input.prospectId || input.prospectId.trim().length === 0) {
      return err("El identificador del prospecto es obligatorio.", "VALIDATION_ERROR");
    }

    // Verificación estricta: si el botón no es de aceptación expresa, no se otorga consentimiento
    if (input.buttonId !== "accept_treatment" && input.buttonId !== "accept_all") {
      appLogger.info("Consentimiento interactivo rechazado u omitido por el prospecto", {
        clientId,
        prospectId: input.prospectId,
        buttonId: input.buttonId,
      });

      return ok({
        granted: false,
        reason: "EXPLICIT_REJECTION_OR_UNRECOGNIZED",
        purposes: [],
        consents: [],
      });
    }

    try {
      const existing = await this.repository.findContactById(cellId, clientId, input.prospectId);
      if (!existing) {
        return err(`Prospecto ${input.prospectId} no encontrado en la celda.`, "NOT_FOUND");
      }

      let policyVersion = input.policyVersion;
      if (!policyVersion) {
        const publishedNotice = await this.repository.findPublishedPrivacyNotice(cellId, clientId, "es");
        policyVersion = publishedNotice?.version ?? "1.0.0";
      }

      const createdConsents: CellProspectConsent[] = [];
      const author = input.executedBy ?? "bot";

      // 1. Tratamiento de datos obligatorio (incluye Chatwoot como encargado)
      const treatmentConsent = await this.repository.createConsent(cellId, clientId, {
        prospectId: input.prospectId,
        purpose: "data_treatment",
        policyVersion,
        status: "granted",
        channel: "whatsapp_buttons",
        evidenceRef: input.messageId,
        createdBy: author,
        updatedBy: author,
      });
      createdConsents.push(treatmentConsent);

      const grantedPurposes: ("data_treatment" | "commercial_comms")[] = ["data_treatment"];

      // 2. Comunicaciones comerciales opcionales si aceptó todo
      if (input.buttonId === "accept_all") {
        const commsConsent = await this.repository.createConsent(cellId, clientId, {
          prospectId: input.prospectId,
          purpose: "commercial_comms",
          policyVersion,
          status: "granted",
          channel: "whatsapp_buttons",
          evidenceRef: input.messageId,
          createdBy: author,
          updatedBy: author,
        });
        createdConsents.push(commsConsent);
        grantedPurposes.push("commercial_comms");
      }

      return ok({
        granted: true,
        purposes: grantedPurposes,
        consents: createdConsents,
      });
    } catch (error: any) {
      appLogger.error("Error al procesar consentimiento por WhatsApp", { cellId, clientId, input, error });
      return err(error.message ?? "Error interno al registrar consentimiento interactivo", "DB_ERROR");
    }
  }

  /**
   * Comprueba si un prospecto cuenta con consentimiento activo para comunicaciones comerciales (RF-03.2).
   */
  async canSendCommercialCommunication(
    cellId: string,
    clientId: string,
    prospectId: string,
  ): Promise<boolean> {
    try {
      const activeConsent = await this.repository.findActiveConsent(
        cellId,
        clientId,
        prospectId,
        "commercial_comms",
      );

      return Boolean(activeConsent && activeConsent.status === "granted" && !activeConsent.revokedAt);
    } catch {
      return false;
    }
  }
}
