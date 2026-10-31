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
 * Servicio de negocio para la gestión comercial de prospectos, consentimientos Habeas Data
 * e indicadores de calidad de datos en Mocter (CRM-001).
 */
export class CrmService {
  constructor(private readonly repository: ICrmRepository) {}

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
}
