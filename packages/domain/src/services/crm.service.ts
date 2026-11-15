import { ok, err, type Result } from "../types/result";
import type {
  ICrmRepository,
  CrmQualityMetrics,
  ListContactsFilter,
  ContactListSortBy,
  ContactAddressWriteInput,
  ContactRecentOrderSummary,
} from "../repositories/crm.repository.interface";
import type {
  CellContact,
  CellContactAddress,
  CellContactRating,
  CellProspectConsent,
  CellPrivacyNotice,
} from "../db/schemas/tenant/crm";
import { appLogger } from "../utils/logger";
import {
  computeWhatsappWindow,
  isFutureDateOnly,
  isValidE164Phone,
  isValidEmailAddress,
  normalizeChatwootChannel,
  normalizeE164Phone,
  resolveDefaultPreferredChannel,
  CONTACT_SOURCES,
  CONTACT_STAGES,
  type ContactDocumentType,
  type ContactSource,
  type ContactStage,
  type ConsentChannel,
  type ConsentPurpose,
  type WhatsappWindowInfo,
  type WhatsappWindowStatus,
} from "./crm-omnichannel.helpers";

/**
 * Dirección resumida para tabla de listado de contactos (`SPEC-09`).
 */
export interface ContactDefaultAddressSummary {
  id: string;
  label: string;
  city: string;
  state: string | null;
  country: string;
  addressLine: string;
}

/**
 * DTO completo de contacto para listado CRM omnicanal (`SPEC-09`).
 */
export interface CrmContactListItemDto {
  id: string;
  fullName: string;
  companyName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  email: string | null;
  phoneMobile: string | null;
  phoneSecondary: string | null;
  phoneLandline: string | null;
  birthDate: string | null;
  source: string;
  channel: string | null;
  preferredChannel: string | null;
  lastChannel: string | null;
  chatwootContactId: number | null;
  stage: string;
  tags: string[];
  language: string;
  notes: string | null;
  currentRatingStars: number | null;
  currentRatingComment: string | null;
  firstContactedAt: string | null;
  lastSeenAt: string | null;
  lastInboundMessageAt: string | null;
  lastWhatsappInboundAt: string | null;
  convertedToCustomerAt: string | null;
  createdAt: string;
  whatsappWindow: WhatsappWindowInfo;
  defaultAddressSummary: ContactDefaultAddressSummary | null;
}

/**
 * DTO detallado de ficha integral del contacto (`SPEC-09 §9.2`).
 */
export interface CrmContactDetailDto extends CrmContactListItemDto {
  addresses: CellContactAddress[];
  ratingsHistory: CellContactRating[];
  consents: CellProspectConsent[];
  recentOrders: ContactRecentOrderSummary[];
}

/**
 * Resultado paginado del listado CRM con metadatos de cuota (`SPEC-09` + `SPEC-17`).
 */
export interface CrmContactListResultDto {
  items: CrmContactListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  quota: {
    used: number;
    limit: number | null;
    mode: "LIMITED" | "UNLIMITED";
  };
}

/**
 * Dirección inicial opcional al dar de alta un contacto manualmente (`SPEC-09`).
 */
export interface CreateContactAddressInput {
  label: string;
  country?: string;
  state?: string | null;
  city: string;
  addressLine: string;
  neighborhood?: string | null;
  postalCode?: string | null;
  referenceNotes?: string | null;
  isDefault?: boolean;
}

/**
 * Parámetros para el alta manual o programática de un prospecto/contacto (`CRM-001`, `SPEC-09`).
 */
export interface CreateProspectInput {
  fullName: string;
  companyName?: string | null;
  email?: string | null;
  phoneMobile?: string | null;
  phoneSecondary?: string | null;
  phoneLandline?: string | null;
  documentType?: ContactDocumentType | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  source?: ContactSource;
  channel?: string | null;
  preferredChannel?: string | null;
  assignedUserId?: string | null;
  stage?: ContactStage;
  language?: "es" | "en";
  tags?: string[];
  notes?: string | null;
  initialAddress?: CreateContactAddressInput | null;
  createdBy: string;
}

/**
 * Parámetros para la actualización integral de un contacto existente (`SPEC-09`).
 */
export interface UpdateProspectInput {
  fullName?: string;
  companyName?: string | null;
  email?: string | null;
  phoneMobile?: string | null;
  phoneSecondary?: string | null;
  phoneLandline?: string | null;
  documentType?: ContactDocumentType | null;
  documentNumber?: string | null;
  birthDate?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  preferredChannel?: string | null;
  stage?: ContactStage;
  language?: "es" | "en";
  assignedUserId?: string | null;
  tags?: string[];
  notes?: string | null;
  updatedBy: string;
}

/**
 * Parámetros de ingesta automática derivados de eventos entrantes omnicanal de Chatwoot (`CRM-001`, `SPEC-09`).
 */
export interface ChatwootIngestionInput {
  chatwootContactId: number;
  name: string;
  phoneMobile?: string;
  email?: string;
  channel?: string;
  isIncomingMessage?: boolean;
  messageTimestamp?: Date;
  executedBy: string;
}

/**
 * Resultado estructurado del proceso de ingesta y reconciliación desde Chatwoot.
 */
export interface IngestionResult {
  prospect: CellContact;
  action: "created" | "updated" | "reconciled";
  duplicateWarning?: boolean;
  isWhatsapp?: boolean;
}

/**
 * Parámetros para calificar un contacto con 1 a 5 estrellas (`SPEC-09`).
 */
export interface RateContactInput {
  stars: number;
  comment?: string | null;
  ratedByUserId?: string | null;
  ratedByName: string;
}

/**
 * Parámetros para registrar un consentimiento de tratamiento de datos (Ley 1581, `CRM-001`, `SPEC-09`).
 */
export interface RecordConsentInput {
  prospectId: string;
  purpose: ConsentPurpose;
  policyVersion?: string;
  channel?: ConsentChannel;
  evidenceRef?: string | null;
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
  purposes: ConsentPurpose[];
  consents: CellProspectConsent[];
}

/**
 * Evaluador de cuota de contactos según plan activo del inquilino (`SPEC-03`).
 */
export interface ICrmPlanQuotaEvaluator {
  getQuota(
    clientId: string,
    dimension: "contacts",
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;
}

/**
 * Convierte un registro `CellContact` al DTO de listado CRM incluyendo ventana 24h WhatsApp.
 */
export function mapContactToListItemDto(
  contact: CellContact,
  defaultAddress?: CellContactAddress | null,
  now: Date = new Date(),
): CrmContactListItemDto {
  const defaultAddressSummary: ContactDefaultAddressSummary | null = defaultAddress
    ? {
        id: defaultAddress.id,
        label: defaultAddress.label,
        city: defaultAddress.city,
        state: defaultAddress.state,
        country: defaultAddress.country,
        addressLine: defaultAddress.addressLine,
      }
    : contact.city && contact.addressLine
      ? {
          id: contact.id,
          label: "Principal",
          city: contact.city,
          state: contact.state,
          country: contact.country || "Colombia",
          addressLine: contact.addressLine,
        }
      : null;

  return {
    id: contact.id,
    fullName: contact.fullName,
    companyName: contact.companyName ?? null,
    documentType: contact.documentType ?? null,
    documentNumber: contact.documentNumber ?? null,
    email: contact.email ?? null,
    phoneMobile: contact.phoneMobile ?? null,
    phoneSecondary: contact.phoneSecondary ?? null,
    phoneLandline: contact.phoneLandline ?? null,
    birthDate: contact.birthDate ? String(contact.birthDate) : null,
    source: contact.source,
    channel: contact.channel ?? null,
    preferredChannel: contact.preferredChannel ?? null,
    lastChannel: contact.lastChannel ?? null,
    chatwootContactId: contact.chatwootContactId ?? null,
    stage: contact.stage,
    tags: Array.isArray(contact.tags) ? contact.tags : [],
    language: contact.language || "es",
    notes: contact.notes ?? null,
    currentRatingStars: contact.currentRatingStars ?? null,
    currentRatingComment: contact.currentRatingComment ?? null,
    firstContactedAt: contact.firstContactedAt
      ? new Date(contact.firstContactedAt).toISOString()
      : null,
    lastSeenAt: contact.lastSeenAt ? new Date(contact.lastSeenAt).toISOString() : null,
    lastInboundMessageAt: contact.lastInboundMessageAt
      ? new Date(contact.lastInboundMessageAt).toISOString()
      : null,
    lastWhatsappInboundAt: contact.lastWhatsappInboundAt
      ? new Date(contact.lastWhatsappInboundAt).toISOString()
      : null,
    convertedToCustomerAt: contact.convertedToCustomerAt
      ? new Date(contact.convertedToCustomerAt).toISOString()
      : null,
    createdAt: contact.createdAt
      ? new Date(contact.createdAt).toISOString()
      : new Date().toISOString(),
    whatsappWindow: computeWhatsappWindow(contact.lastWhatsappInboundAt, now),
    defaultAddressSummary,
  };
}

/**
 * Servicio de negocio para la gestión comercial omnicanal de prospectos, calificaciones,
 * libreta de direcciones, ventana WhatsApp 24h y consentimientos Habeas Data (`CRM-001`, `SPEC-09`).
 */
export class CrmService {
  constructor(
    private readonly repository: ICrmRepository,
    private readonly quotaEvaluator?: ICrmPlanQuotaEvaluator,
  ) {}

  /**
   * Da de alta un nuevo prospecto o contacto validando formatos, unicidad, fuentes múltiples y cuota del plan.
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

    const normalizedPhone = normalizeE164Phone(input.phoneMobile);
    const normalizedSecondary = input.phoneSecondary?.trim() || null;
    const normalizedLandline = input.phoneLandline?.trim() || null;
    const normalizedEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    const normalizedDocNumber = input.documentNumber?.trim() || null;

    const hasContactChannel = Boolean(
      normalizedEmail || normalizedPhone || normalizedSecondary || normalizedLandline,
    );
    if (!hasContactChannel) {
      return err(
        "Se requiere al menos un canal de contacto válido (correo electrónico o teléfono).",
        "VALIDATION_ERROR",
      );
    }

    if (normalizedPhone && !isValidE164Phone(normalizedPhone)) {
      return err(
        `El teléfono móvil '${normalizedPhone}' debe cumplir con el formato internacional E.164 (ej: +573001234567).`,
        "VALIDATION_ERROR",
      );
    }

    if (normalizedEmail && !isValidEmailAddress(normalizedEmail)) {
      return err(
        `El correo electrónico '${input.email}' no tiene una estructura válida.`,
        "VALIDATION_ERROR",
      );
    }

    if (input.birthDate && input.birthDate.trim().length > 0) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate.trim())) {
        return err(
          "La fecha de cumpleaños debe tener el formato YYYY-MM-DD.",
          "VALIDATION_ERROR",
        );
      }
      if (isFutureDateOnly(input.birthDate)) {
        return err(
          "La fecha de cumpleaños no puede ser una fecha futura.",
          "VALIDATION_ERROR",
        );
      }
    }

    const source: ContactSource =
      input.source && CONTACT_SOURCES.includes(input.source) ? input.source : "manual";
    const stage: ContactStage =
      input.stage && CONTACT_STAGES.includes(input.stage) ? input.stage : "new";

    if (this.repository.findActiveDuplicateContact) {
      const duplicate = await this.repository.findActiveDuplicateContact(cellId, clientId, {
        phoneMobile: normalizedPhone,
        email: normalizedEmail,
        documentType: input.documentType ?? null,
        documentNumber: normalizedDocNumber,
      });

      if (duplicate) {
        return err(
          `Ya existe un contacto activo (${duplicate.fullName}) con el mismo teléfono, correo o documento.`,
          "CONFLICT",
          { existingContactId: duplicate.id, existingFullName: duplicate.fullName },
        );
      }
    }

    if (this.quotaEvaluator) {
      const quota = await this.quotaEvaluator.getQuota(clientId, "contacts");
      if (quota.mode === "LIMITED") {
        if (quota.value === null || quota.value === 0) {
          return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
        }
        const { total } = await this.repository.listContacts(cellId, clientId, {
          includeDeleted: false,
        });
        if (total + 1 > quota.value) {
          return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
        }
      }
    }

    const preferredChannel = resolveDefaultPreferredChannel({
      preferredChannel: input.preferredChannel,
      phoneMobile: normalizedPhone,
      source,
      lastChannel: input.channel ?? source,
    });

    const initialAddress = input.initialAddress;
    const now = new Date();

    try {
      const created = await this.repository.createContact(cellId, clientId, {
        fullName: trimmedName,
        companyName: input.companyName?.trim() || null,
        email: normalizedEmail ?? undefined,
        phoneMobile: normalizedPhone ?? undefined,
        phoneSecondary: normalizedSecondary,
        phoneLandline: normalizedLandline ?? undefined,
        documentType: input.documentType ?? undefined,
        documentNumber: normalizedDocNumber ?? undefined,
        birthDate: input.birthDate?.trim() || null,
        country: initialAddress?.country?.trim() || input.country?.trim() || undefined,
        state: initialAddress?.state?.trim() || input.state?.trim() || undefined,
        city: initialAddress?.city?.trim() || input.city?.trim() || undefined,
        addressLine: initialAddress?.addressLine?.trim() || input.addressLine?.trim() || undefined,
        postalCode: initialAddress?.postalCode?.trim() || input.postalCode?.trim() || undefined,
        source,
        channel: input.channel ?? source,
        preferredChannel,
        lastChannel: input.channel ?? source,
        assignedUserId: input.assignedUserId ?? undefined,
        stage,
        language: input.language ?? "es",
        tags: input.tags ?? [],
        notes: input.notes ?? undefined,
        firstContactedAt: now,
        lastSeenAt: now,
        convertedToCustomerAt: stage === "customer" ? now : null,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      if (
        initialAddress &&
        initialAddress.city?.trim() &&
        initialAddress.addressLine?.trim() &&
        this.repository.createContactAddress
      ) {
        await this.repository.createContactAddress(cellId, clientId, created.id, {
          label: initialAddress.label?.trim() || "Principal",
          country: initialAddress.country?.trim() || "Colombia",
          state: initialAddress.state?.trim() || null,
          city: initialAddress.city.trim(),
          addressLine: initialAddress.addressLine.trim(),
          neighborhood: initialAddress.neighborhood?.trim() || null,
          postalCode: initialAddress.postalCode?.trim() || null,
          referenceNotes: initialAddress.referenceNotes?.trim() || null,
          isDefault: true,
          actor: input.createdBy,
        });
      }

      return ok(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al crear prospecto en celda", { cellId, clientId, error: msg });
      return err(msg || "Error interno al crear prospecto", "DB_ERROR");
    }
  }

  /**
   * Actualiza los datos integrales de un contacto validando formatos, fechas futuras y duplicidad.
   * Preserva inmutable el campo `source` original (`RN-SPEC-09-04`).
   */
  async updateProspect(
    cellId: string,
    clientId: string,
    prospectId: string,
    input: UpdateProspectInput,
  ): Promise<Result<CellContact>> {
    if (input.fullName !== undefined && input.fullName.trim().length < 2) {
      return err(
        "El nombre completo debe tener al menos 2 caracteres.",
        "VALIDATION_ERROR",
      );
    }

    const normalizedPhone =
      input.phoneMobile !== undefined ? normalizeE164Phone(input.phoneMobile) : undefined;
    if (normalizedPhone && !isValidE164Phone(normalizedPhone)) {
      return err(
        `El teléfono móvil '${normalizedPhone}' debe cumplir con el formato internacional E.164.`,
        "VALIDATION_ERROR",
      );
    }

    const normalizedEmail =
      input.email !== undefined
        ? input.email?.trim()
          ? input.email.trim().toLowerCase()
          : null
        : undefined;
    if (normalizedEmail && !isValidEmailAddress(normalizedEmail)) {
      return err(
        `El correo electrónico '${input.email}' no tiene una estructura válida.`,
        "VALIDATION_ERROR",
      );
    }

    if (input.birthDate !== undefined && input.birthDate && input.birthDate.trim().length > 0) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate.trim())) {
        return err(
          "La fecha de cumpleaños debe tener el formato YYYY-MM-DD.",
          "VALIDATION_ERROR",
        );
      }
      if (isFutureDateOnly(input.birthDate)) {
        return err(
          "La fecha de cumpleaños no puede ser una fecha futura.",
          "VALIDATION_ERROR",
        );
      }
    }

    try {
      const existing = await this.repository.findContactById(cellId, clientId, prospectId);
      if (!existing) {
        return err(`Contacto ${prospectId} no encontrado.`, "NOT_FOUND");
      }

      if (this.repository.findActiveDuplicateContact) {
        const duplicate = await this.repository.findActiveDuplicateContact(cellId, clientId, {
          phoneMobile: normalizedPhone,
          email: normalizedEmail,
          documentType:
            input.documentType !== undefined ? input.documentType : existing.documentType,
          documentNumber:
            input.documentNumber !== undefined ? input.documentNumber?.trim() || null : undefined,
          excludeContactId: prospectId,
        });

        if (duplicate) {
          return err(
            `Otro contacto activo (${duplicate.fullName}) ya utiliza ese teléfono, correo o documento.`,
            "CONFLICT",
            { existingContactId: duplicate.id, existingFullName: duplicate.fullName },
          );
        }
      }

      const nextStage = input.stage ?? (existing.stage as ContactStage);
      const nextConvertedAt =
        nextStage === "customer" && !existing.convertedToCustomerAt
          ? new Date()
          : existing.convertedToCustomerAt;

      const updated = await this.repository.updateContact(cellId, clientId, prospectId, {
        fullName: input.fullName !== undefined ? input.fullName.trim() : existing.fullName,
        companyName:
          input.companyName !== undefined
            ? input.companyName?.trim() || null
            : existing.companyName,
        email: normalizedEmail !== undefined ? normalizedEmail : existing.email,
        phoneMobile: normalizedPhone !== undefined ? normalizedPhone : existing.phoneMobile,
        phoneSecondary:
          input.phoneSecondary !== undefined
            ? input.phoneSecondary?.trim() || null
            : existing.phoneSecondary,
        phoneLandline:
          input.phoneLandline !== undefined
            ? input.phoneLandline?.trim() || null
            : existing.phoneLandline,
        documentType:
          input.documentType !== undefined ? input.documentType : existing.documentType,
        documentNumber:
          input.documentNumber !== undefined
            ? input.documentNumber?.trim() || null
            : existing.documentNumber,
        birthDate:
          input.birthDate !== undefined ? input.birthDate?.trim() || null : existing.birthDate,
        country: input.country !== undefined ? input.country : existing.country,
        state: input.state !== undefined ? input.state : existing.state,
        city: input.city !== undefined ? input.city : existing.city,
        addressLine: input.addressLine !== undefined ? input.addressLine : existing.addressLine,
        postalCode: input.postalCode !== undefined ? input.postalCode : existing.postalCode,
        preferredChannel:
          input.preferredChannel !== undefined
            ? input.preferredChannel?.trim() || null
            : existing.preferredChannel,
        stage: nextStage,
        convertedToCustomerAt: nextConvertedAt,
        language: input.language ?? existing.language,
        assignedUserId:
          input.assignedUserId !== undefined ? input.assignedUserId : existing.assignedUserId,
        tags: input.tags ?? existing.tags,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedBy: input.updatedBy,
      });

      return ok(updated!);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al actualizar contacto", { cellId, clientId, prospectId, error: msg });
      return err(msg || "Error interno al actualizar contacto", "DB_ERROR");
    }
  }

  /**
   * Lista contactos con paginación real, filtros omnicanal/ventana 24h y ordenamiento por prioridad WhatsApp (`SPEC-09`).
   */
  async listContactsPaginated(
    cellId: string,
    clientId: string,
    options: {
      query?: string;
      stage?: ContactStage;
      source?: ContactSource;
      channel?: string;
      whatsappWindow?: WhatsappWindowStatus;
      minRating?: number;
      page?: number;
      limit?: number;
      sortBy?: ContactListSortBy;
      sortDir?: "asc" | "desc";
    } = {},
  ): Promise<Result<CrmContactListResultDto>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const filters: ListContactsFilter = {
        query: options.query,
        stage: options.stage,
        source: options.source,
        channel: options.channel,
        whatsappWindow: options.whatsappWindow,
        minRating: options.minRating,
        sortBy: options.sortBy ?? "whatsapp_priority",
        sortDir: options.sortDir ?? "desc",
        includeDeleted: false,
        limit,
        offset,
      };

      const [{ items, total }, totalActiveRes, quota] = await Promise.all([
        this.repository.listContacts(cellId, clientId, filters),
        this.repository.listContacts(cellId, clientId, { includeDeleted: false, limit: 1, offset: 0 }),
        this.quotaEvaluator
          ? this.quotaEvaluator.getQuota(clientId, "contacts")
          : Promise.resolve({ mode: "UNLIMITED" as const, value: null }),
      ]);

      const defaultAddressesMap = this.repository.listDefaultAddressesByContactIds
        ? await this.repository.listDefaultAddressesByContactIds(
            cellId,
            clientId,
            items.map((c) => c.id),
          )
        : new Map<string, CellContactAddress>();

      const now = new Date();
      return ok({
        items: items.map((c) =>
          mapContactToListItemDto(c, defaultAddressesMap.get(c.id) ?? null, now),
        ),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        quota: {
          used: totalActiveRes.total,
          limit: quota.value,
          mode: quota.mode,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al listar contactos CRM", { cellId, clientId, error: msg });
      return err(msg || "Error interno al listar contactos", "DB_ERROR");
    }
  }

  /**
   * Obtiene la ficha completa del contacto incluyendo direcciones, calificaciones, consentimientos y pedidos recientes.
   */
  async getContactDetail(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<Result<CrmContactDetailDto>> {
    try {
      const contact = await this.repository.findContactById(cellId, clientId, contactId);
      if (!contact || contact.deletedAt) {
        return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
      }

      const [addresses, ratingsHistory, consents, recentOrders] = await Promise.all([
        this.repository.listContactAddresses
          ? this.repository.listContactAddresses(cellId, clientId, contactId)
          : Promise.resolve([]),
        this.repository.listContactRatings
          ? this.repository.listContactRatings(cellId, clientId, contactId)
          : Promise.resolve([]),
        this.repository.listConsentsByProspect(cellId, clientId, contactId),
        this.repository.listRecentOrdersForContact
          ? this.repository.listRecentOrdersForContact(cellId, clientId, contactId, 5)
          : Promise.resolve([]),
      ]);

      const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
      const summary = mapContactToListItemDto(contact, defaultAddr);

      return ok({
        ...summary,
        addresses,
        ratingsHistory,
        consents,
        recentOrders,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al consultar detalle de contacto", {
        cellId,
        clientId,
        contactId,
        error: msg,
      });
      return err(msg || "Error interno al consultar detalle de contacto", "DB_ERROR");
    }
  }

  /**
   * Registra una calificación de 1 a 5 estrellas conservando el historial completo (`RN-SPEC-09-02`).
   */
  async rateContact(
    cellId: string,
    clientId: string,
    contactId: string,
    input: RateContactInput,
  ): Promise<Result<{ rating: CellContactRating; contact: CrmContactListItemDto }>> {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      return err(
        "La calificación debe ser un número entero entre 1 y 5 estrellas.",
        "VALIDATION_ERROR",
      );
    }

    const comment = input.comment?.trim() ? input.comment.trim() : null;
    if (comment && comment.length > 1000) {
      return err(
        "El comentario de calificación no puede superar los 1,000 caracteres.",
        "VALIDATION_ERROR",
      );
    }

    if (!this.repository.addContactRating) {
      return err("Repositorio no soporta calificaciones históricas.", "INTERNAL_ERROR");
    }

    try {
      const res = await this.repository.addContactRating(cellId, clientId, {
        contactId,
        stars: input.stars,
        comment,
        ratedByUserId: input.ratedByUserId ?? null,
        ratedByName: input.ratedByName.trim() || "Operador",
        createdBy: input.ratedByName.trim() || "Operador",
        updatedBy: input.ratedByName.trim() || "Operador",
      });

      if (!res) {
        return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
      }

      appLogger.info("tenant.crm.contact_rated", {
        clientId,
        contactId,
        stars: input.stars,
      });

      return ok({
        rating: res.rating,
        contact: mapContactToListItemDto(res.contact),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al calificar contacto", { cellId, clientId, contactId, error: msg });
      return err(msg || "Error interno al calificar contacto", "DB_ERROR");
    }
  }

  /**
   * Lista todas las direcciones del contacto.
   */
  async listContactAddresses(
    cellId: string,
    clientId: string,
    contactId: string,
  ): Promise<Result<CellContactAddress[]>> {
    const contact = await this.repository.findContactById(cellId, clientId, contactId);
    if (!contact || contact.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }
    if (!this.repository.listContactAddresses) {
      return ok([]);
    }
    const items = await this.repository.listContactAddresses(cellId, clientId, contactId);
    return ok(items);
  }

  /**
   * Crea una nueva dirección en la libreta del contacto respetando invariante `is_default` (`RN-SPEC-09-03`).
   */
  async createContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    input: ContactAddressWriteInput,
  ): Promise<Result<CellContactAddress>> {
    if (!input.label?.trim() || !input.city?.trim() || !input.addressLine?.trim()) {
      return err(
        "Etiqueta, ciudad y dirección física son obligatorios.",
        "VALIDATION_ERROR",
      );
    }

    const contact = await this.repository.findContactById(cellId, clientId, contactId);
    if (!contact || contact.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }

    if (!this.repository.createContactAddress) {
      return err("Repositorio no soporta múltiples direcciones.", "INTERNAL_ERROR");
    }

    const created = await this.repository.createContactAddress(cellId, clientId, contactId, input);
    return ok(created);
  }

  /**
   * Actualiza una dirección existente o la marca como predeterminada (`RN-SPEC-09-03`).
   */
  async updateContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    input: Partial<ContactAddressWriteInput> & { actor: string },
  ): Promise<Result<CellContactAddress>> {
    const contact = await this.repository.findContactById(cellId, clientId, contactId);
    if (!contact || contact.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }

    if (!this.repository.updateContactAddress) {
      return err("Repositorio no soporta múltiples direcciones.", "INTERNAL_ERROR");
    }

    const updated = await this.repository.updateContactAddress(
      cellId,
      clientId,
      contactId,
      addressId,
      input,
    );
    if (!updated) {
      return err(`Dirección ${addressId} no encontrada.`, "NOT_FOUND");
    }
    return ok(updated);
  }

  /**
   * Elimina una dirección promoviendo automáticamente otra si era predeterminada (`RN-SPEC-09-03`).
   */
  async deleteContactAddress(
    cellId: string,
    clientId: string,
    contactId: string,
    addressId: string,
    actor: string,
  ): Promise<Result<{ deleted: boolean; promotedAddressId: string | null }>> {
    const contact = await this.repository.findContactById(cellId, clientId, contactId);
    if (!contact || contact.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }

    if (!this.repository.deleteContactAddress) {
      return err("Repositorio no soporta múltiples direcciones.", "INTERNAL_ERROR");
    }

    const res = await this.repository.deleteContactAddress(
      cellId,
      clientId,
      contactId,
      addressId,
      actor,
    );
    if (!res.deleted) {
      return err(`Dirección ${addressId} no encontrada.`, "NOT_FOUND");
    }
    return ok(res);
  }

  /**
   * Transiciona la etapa del embudo de prospección y registra fecha de conversión a cliente (`RN-SPEC-09-04`).
   */
  async updateStage(
    cellId: string,
    clientId: string,
    contactId: string,
    stage: ContactStage,
    actor: string,
    notes?: string | null,
  ): Promise<Result<CrmContactListItemDto>> {
    if (!CONTACT_STAGES.includes(stage)) {
      return err(`Etapa '${stage}' no es válida.`, "VALIDATION_ERROR");
    }

    const existing = await this.repository.findContactById(cellId, clientId, contactId);
    if (!existing || existing.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }

    const convertedToCustomerAt =
      stage === "customer" && !existing.convertedToCustomerAt
        ? new Date()
        : existing.convertedToCustomerAt;

    const updated = await this.repository.updateContact(cellId, clientId, contactId, {
      stage,
      convertedToCustomerAt,
      notes: notes !== undefined ? notes : existing.notes,
      updatedBy: actor,
    });

    appLogger.info("tenant.crm.stage_changed", {
      clientId,
      contactId,
      previousStage: existing.stage,
      nextStage: stage,
    });

    return ok(mapContactToListItemDto(updated!));
  }

  /**
   * Ejecuta borrado lógico seguro preservando órdenes históricas (`RN-SPEC-09-07`).
   */
  async softDeleteContact(
    cellId: string,
    clientId: string,
    contactId: string,
    deletedBy: string,
  ): Promise<Result<{ id: string; deletedAt: string }>> {
    if (this.repository.softDeleteContact) {
      const deleted = await this.repository.softDeleteContact(cellId, clientId, contactId, deletedBy);
      if (!deleted) {
        return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
      }
      return ok({
        id: deleted.id,
        deletedAt: deleted.deletedAt
          ? new Date(deleted.deletedAt).toISOString()
          : new Date().toISOString(),
      });
    }

    const existing = await this.repository.findContactById(cellId, clientId, contactId);
    if (!existing || existing.deletedAt) {
      return err(`Contacto ${contactId} no encontrado.`, "NOT_FOUND");
    }
    const now = new Date();
    await this.repository.updateContact(cellId, clientId, contactId, {
      deletedAt: now,
      deletedBy,
      updatedBy: deletedBy,
    });
    return ok({ id: contactId, deletedAt: now.toISOString() });
  }

  /**
   * Ingesta o reconcilia un contacto procedente de un webhook omnicanal de Chatwoot (`CRM-001`, `SPEC-09`).
   *
   * Orden de reconciliación:
   * 1) `chatwoot_contact_id` activo.
   * 2) Coincidencia única por `phone_mobile` E.164 activo.
   * 3) Coincidencia única por `email` normalizado activo.
   *
   * Conserva el `source` original del contacto y separa `last_inbound_message_at` (omnicanal)
   * de `last_whatsapp_inbound_at` (ventana 24h Meta exclusiva de WhatsApp).
   */
  async ingestFromChatwoot(
    cellId: string,
    clientId: string,
    input: ChatwootIngestionInput,
  ): Promise<Result<IngestionResult>> {
    const normalizedChannel = normalizeChatwootChannel(input.channel);
    const normalizedPhone = normalizeE164Phone(input.phoneMobile);
    const normalizedEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;
    const eventTime = input.messageTimestamp ?? new Date();
    const isIncoming = Boolean(input.isIncomingMessage);

    try {
      const existingByChatwoot = await this.repository.findContactByChatwootId(
        cellId,
        clientId,
        input.chatwootContactId,
      );

      if (existingByChatwoot) {
        const updated = await this.repository.updateContact(cellId, clientId, existingByChatwoot.id, {
          lastChannel: normalizedChannel.channel,
          preferredChannel:
            existingByChatwoot.preferredChannel ??
            resolveDefaultPreferredChannel({
              phoneMobile: existingByChatwoot.phoneMobile ?? normalizedPhone,
              source: existingByChatwoot.source,
              lastChannel: normalizedChannel.channel,
            }),
          lastSeenAt: eventTime,
          ...(isIncoming
            ? {
                lastInboundMessageAt: eventTime,
                ...(normalizedChannel.isWhatsapp ? { lastWhatsappInboundAt: eventTime } : {}),
              }
            : {}),
          updatedBy: input.executedBy,
        });

        if (isIncoming && normalizedChannel.isWhatsapp) {
          appLogger.info("tenant.crm.whatsapp_window_refreshed", {
            clientId,
            contactId: existingByChatwoot.id,
            channel: normalizedChannel.channel,
          });
        }

        return ok({
          prospect: updated!,
          action: "updated",
          isWhatsapp: normalizedChannel.isWhatsapp,
        });
      }

      let duplicateWarning = false;
      let matchedContact: CellContact | null = null;

      if (normalizedPhone) {
        const matchingPhones = await this.repository.findContactsByPhone(
          cellId,
          clientId,
          normalizedPhone,
        );
        if (matchingPhones.length === 1) {
          matchedContact = matchingPhones[0]!;
        } else if (matchingPhones.length > 1) {
          duplicateWarning = true;
          appLogger.warn("Detectada colisión múltiple de teléfono en ingesta de Chatwoot sin auto-enlace", {
            chatwootContactId: input.chatwootContactId,
            phoneMobile: normalizedPhone,
            conflictingCount: matchingPhones.length,
          });
        }
      }

      if (!matchedContact && !duplicateWarning && normalizedEmail && this.repository.findContactsByEmail) {
        const matchingEmails = await this.repository.findContactsByEmail(
          cellId,
          clientId,
          normalizedEmail,
        );
        if (matchingEmails.length === 1) {
          matchedContact = matchingEmails[0]!;
        } else if (matchingEmails.length > 1) {
          duplicateWarning = true;
          appLogger.warn("Detectada colisión múltiple de correo en ingesta de Chatwoot sin auto-enlace", {
            chatwootContactId: input.chatwootContactId,
            email: normalizedEmail,
            conflictingCount: matchingEmails.length,
          });
        }
      }

      if (matchedContact) {
        const reconciled = await this.repository.updateContact(cellId, clientId, matchedContact.id, {
          chatwootContactId: matchedContact.chatwootContactId ?? input.chatwootContactId,
          phoneMobile: matchedContact.phoneMobile ?? normalizedPhone ?? undefined,
          email: matchedContact.email ?? normalizedEmail ?? undefined,
          lastChannel: normalizedChannel.channel,
          preferredChannel:
            matchedContact.preferredChannel ??
            resolveDefaultPreferredChannel({
              phoneMobile: matchedContact.phoneMobile ?? normalizedPhone,
              source: matchedContact.source,
              lastChannel: normalizedChannel.channel,
            }),
          lastSeenAt: eventTime,
          ...(isIncoming
            ? {
                lastInboundMessageAt: eventTime,
                ...(normalizedChannel.isWhatsapp ? { lastWhatsappInboundAt: eventTime } : {}),
              }
            : {}),
          updatedBy: input.executedBy,
        });

        appLogger.info("tenant.crm.omnichannel_reconciled", {
          clientId,
          contactId: matchedContact.id,
          originalSource: matchedContact.source,
          lastChannel: normalizedChannel.channel,
          isWhatsapp: normalizedChannel.isWhatsapp,
        });

        return ok({
          prospect: reconciled!,
          action: "reconciled",
          isWhatsapp: normalizedChannel.isWhatsapp,
        });
      }

      if (this.quotaEvaluator) {
        const quota = await this.quotaEvaluator.getQuota(clientId, "contacts");
        if (quota.mode === "LIMITED") {
          if (quota.value === null || quota.value === 0) {
            return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
          }
          const { total } = await this.repository.listContacts(cellId, clientId, {
            includeDeleted: false,
          });
          if (total + 1 > quota.value) {
            return err("Has alcanzado el límite de contactos incluido en tu plan.", "QUOTA_EXCEEDED");
          }
        }
      }

      const preferredChannel = resolveDefaultPreferredChannel({
        phoneMobile: normalizedPhone,
        source: normalizedChannel.source,
        lastChannel: normalizedChannel.channel,
      });

      const created = await this.repository.createContact(cellId, clientId, {
        fullName: input.name?.trim() || `Contacto #${input.chatwootContactId}`,
        phoneMobile: normalizedPhone ?? undefined,
        email: normalizedEmail ?? undefined,
        source: normalizedChannel.source,
        channel: normalizedChannel.channel,
        preferredChannel,
        lastChannel: normalizedChannel.channel,
        chatwootContactId: input.chatwootContactId,
        stage: "new",
        firstContactedAt: eventTime,
        lastSeenAt: eventTime,
        lastInboundMessageAt: isIncoming ? eventTime : null,
        lastWhatsappInboundAt: isIncoming && normalizedChannel.isWhatsapp ? eventTime : null,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      return ok({
        prospect: created,
        action: "created",
        duplicateWarning,
        isWhatsapp: normalizedChannel.isWhatsapp,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error en ingesta desde Chatwoot", { cellId, clientId, input, error: msg });
      return err(msg || "Error interno en ingesta Chatwoot", "DB_ERROR");
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error en anonimización de prospecto", {
        cellId,
        clientId,
        prospectId,
        error: msg,
      });
      return err(msg || "Error interno al anonimizar", "DB_ERROR");
    }
  }

  /**
   * Registra un consentimiento explícito de tratamiento de datos personales o comunicaciones comerciales.
   */
  async recordConsent(
    cellId: string,
    clientId: string,
    input: RecordConsentInput,
  ): Promise<Result<CellProspectConsent>> {
    try {
      const existing = await this.repository.findContactById(cellId, clientId, input.prospectId);
      if (!existing || existing.deletedAt) {
        return err(`Contacto ${input.prospectId} no encontrado.`, "NOT_FOUND");
      }

      let policyVersion = input.policyVersion?.trim();
      if (!policyVersion) {
        const publishedNotice = await this.repository.findPublishedPrivacyNotice(
          cellId,
          clientId,
          "es",
        );
        policyVersion = publishedNotice?.version ?? "1.0.0";
      }

      const consent = await this.repository.createConsent(cellId, clientId, {
        prospectId: input.prospectId,
        purpose: input.purpose,
        policyVersion,
        status: "granted",
        channel: input.channel ?? "manual",
        evidenceRef: input.evidenceRef?.trim() || null,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      });

      appLogger.info("tenant.crm.consent_updated", {
        clientId,
        contactId: input.prospectId,
        purpose: input.purpose,
        action: "granted",
        channel: input.channel ?? "manual",
      });

      return ok(consent);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al registrar consentimiento", { cellId, clientId, input, error: msg });
      return err(msg || "Error interno al registrar consentimiento", "DB_ERROR");
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

      appLogger.info("tenant.crm.consent_updated", {
        clientId,
        contactId: revoked.prospectId,
        purpose: revoked.purpose,
        action: "revoked",
      });

      return ok(revoked);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al revocar consentimiento", {
        cellId,
        clientId,
        consentId,
        error: msg,
      });
      return err(msg || "Error interno al revocar consentimiento", "DB_ERROR");
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al sembrar aviso de privacidad por defecto", {
        cellId,
        clientId,
        error: msg,
      });
      return err(msg || "Error interno al sembrar aviso de privacidad", "DB_ERROR");
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al calcular métricas de calidad", { cellId, clientId, error: msg });
      return err(msg || "Error interno al calcular métricas de calidad", "DB_ERROR");
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al generar mensaje de consentimiento WhatsApp", {
        cellId,
        clientId,
        error: msg,
      });
      return err(msg || "Error al generar mensaje de consentimiento WhatsApp", "DB_ERROR");
    }
  }

  /**
   * Procesa la respuesta interactiva de botones de WhatsApp registrando el consentimiento explícito
   * enlazado al message_id de Chatwoot como evidencia (CRM-001 T-06B, RF-03.7).
   */
  async handleWhatsAppConsentResponse(
    cellId: string,
    clientId: string,
    input: HandleWhatsAppConsentInput,
  ): Promise<Result<WhatsAppConsentResult>> {
    if (!input.messageId || input.messageId.trim().length === 0) {
      return err(
        "El identificador de mensaje (messageId) de Chatwoot es obligatorio como evidencia.",
        "VALIDATION_ERROR",
      );
    }

    if (!input.prospectId || input.prospectId.trim().length === 0) {
      return err("El identificador del prospecto es obligatorio.", "VALIDATION_ERROR");
    }

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
        const publishedNotice = await this.repository.findPublishedPrivacyNotice(
          cellId,
          clientId,
          "es",
        );
        policyVersion = publishedNotice?.version ?? "1.0.0";
      }

      const createdConsents: CellProspectConsent[] = [];
      const author = input.executedBy ?? "bot";

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

      const grantedPurposes: ConsentPurpose[] = ["data_treatment"];

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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error("Error al procesar consentimiento por WhatsApp", {
        cellId,
        clientId,
        input,
        error: msg,
      });
      return err(msg || "Error interno al registrar consentimiento interactivo", "DB_ERROR");
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
