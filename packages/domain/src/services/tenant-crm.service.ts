import { getDb } from "../db/client";
import { cellDatabasePoolManager } from "../db/cell-client";
import { DrizzleCrmRepository } from "../repositories/drizzle-crm.repository";
import type {
  ContactAddressWriteInput,
  ContactListSortBy,
} from "../repositories/crm.repository.interface";
import type {
  CellContact,
  CellContactAddress,
  CellContactRating,
  CellProspectConsent,
} from "../db/schemas/tenant/crm";
import type { Result } from "../types/result";
import {
  CrmService,
  type CrmContactDetailDto,
  type CrmContactListItemDto,
  type CrmContactListResultDto,
  type CreateProspectInput,
  type ICrmPlanQuotaEvaluator,
  type RateContactInput,
  type RecordConsentInput,
  type UpdateProspectInput,
  mapContactToListItemDto,
} from "./crm.service";
import type {
  ContactSource,
  ContactStage,
  WhatsappWindowStatus,
} from "./crm-omnichannel.helpers";
import {
  DrizzleTenantCapabilityGateRepository,
  TenantCapabilityGateService,
} from "./tenant-capability-gate.service";

/**
 * Evaluador de cuota de contactos conectado al Control Plane (`SPEC-03`).
 */
export class ControlPlaneCrmQuotaEvaluator implements ICrmPlanQuotaEvaluator {
  async getQuota(
    clientId: string,
    _dimension: "contacts",
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const db = getDb();
    const gateRepo = new DrizzleTenantCapabilityGateRepository(() => db);
    const gateService = new TenantCapabilityGateService(gateRepo);
    const limits = await gateService.getResolvedLimits(clientId);
    const contactsLimit = limits.contacts;
    return {
      mode: contactsLimit?.mode ?? "UNLIMITED",
      value: contactsLimit?.value ?? null,
    };
  }
}

/**
 * Fachada de CRM por inquilino (`clientId`) que resuelve automáticamente la celda destino,
 * aplica evaluación de cuotas del plan (`SPEC-03`) y delega las reglas de negocio en {@link CrmService}.
 */
export class TenantCrmService {
  constructor(
    private readonly crmService: CrmService = new CrmService(
      new DrizzleCrmRepository(),
      new ControlPlaneCrmQuotaEvaluator(),
    ),
    private readonly cellResolver: (clientId: string) => Promise<string> = (clientId) =>
      cellDatabasePoolManager.resolveCellIdForClient(clientId),
  ) {}

  /** Lista contactos paginados, filtrables y ordenables priorizando WhatsApp (`SPEC-09`). */
  async listContacts(
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
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.listContactsPaginated(cellId, clientId, options);
  }

  /** Da de alta un contacto manual o multi-fuente validando cuota y unicidad (`SPEC-09`). */
  async createContact(
    clientId: string,
    input: CreateProspectInput,
  ): Promise<Result<CrmContactListItemDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.crmService.createProspect(cellId, clientId, input);
    if (!res.ok) return res;
    return { ok: true, data: mapContactToListItemDto(res.data) };
  }

  /** Obtiene el detalle integral de un contacto (direcciones, calificaciones, consentimientos y pedidos). */
  async getContactDetail(
    clientId: string,
    contactId: string,
  ): Promise<Result<CrmContactDetailDto>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.getContactDetail(cellId, clientId, contactId);
  }

  /** Actualiza la ficha general del contacto preservando origen `source`. */
  async updateContact(
    clientId: string,
    contactId: string,
    input: UpdateProspectInput,
  ): Promise<Result<CrmContactListItemDto>> {
    const cellId = await this.cellResolver(clientId);
    const res = await this.crmService.updateProspect(cellId, clientId, contactId, input);
    if (!res.ok) return res;
    return { ok: true, data: mapContactToListItemDto(res.data) };
  }

  /** Ejecuta borrado lógico seguro del contacto (`SPEC-09 RN-07`). */
  async deleteContact(
    clientId: string,
    contactId: string,
    actor: string,
  ): Promise<Result<{ id: string; deletedAt: string }>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.softDeleteContact(cellId, clientId, contactId, actor);
  }

  /** Registra una calificación histórica de 1 a 5 estrellas (`SPEC-09`). */
  async rateContact(
    clientId: string,
    contactId: string,
    input: RateContactInput,
  ): Promise<Result<{ rating: CellContactRating; contact: CrmContactListItemDto }>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.rateContact(cellId, clientId, contactId, input);
  }

  /** Lista las direcciones guardadas de un contacto. */
  async listAddresses(
    clientId: string,
    contactId: string,
  ): Promise<Result<CellContactAddress[]>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.listContactAddresses(cellId, clientId, contactId);
  }

  /** Agrega una dirección a la libreta del contacto (`SPEC-09`). */
  async createAddress(
    clientId: string,
    contactId: string,
    input: ContactAddressWriteInput,
  ): Promise<Result<CellContactAddress>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.createContactAddress(cellId, clientId, contactId, input);
  }

  /** Actualiza una dirección existente o cambia su estado predeterminado (`SPEC-09`). */
  async updateAddress(
    clientId: string,
    contactId: string,
    addressId: string,
    input: Partial<ContactAddressWriteInput> & { actor: string },
  ): Promise<Result<CellContactAddress>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.updateContactAddress(
      cellId,
      clientId,
      contactId,
      addressId,
      input,
    );
  }

  /** Elimina una dirección promoviendo otra como predeterminada si quedan restantes (`SPEC-09`). */
  async deleteAddress(
    clientId: string,
    contactId: string,
    addressId: string,
    actor: string,
  ): Promise<Result<{ deleted: boolean; promotedAddressId: string | null }>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.deleteContactAddress(
      cellId,
      clientId,
      contactId,
      addressId,
      actor,
    );
  }

  /** Actualiza la etapa del embudo de prospección y conversión a cliente (`SPEC-09`). */
  async updateStage(
    clientId: string,
    contactId: string,
    stage: ContactStage,
    actor: string,
    notes?: string | null,
  ): Promise<Result<CrmContactListItemDto>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.updateStage(cellId, clientId, contactId, stage, actor, notes);
  }

  /** Registra un consentimiento explícito Ley 1581 desde la ficha del contacto (`SPEC-09`). */
  async recordConsent(
    clientId: string,
    input: RecordConsentInput,
  ): Promise<Result<CellProspectConsent>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.recordConsent(cellId, clientId, input);
  }

  /** Revoca un consentimiento vigente Ley 1581 (`SPEC-09`). */
  async revokeConsent(
    clientId: string,
    consentId: string,
    revokedBy: string,
  ): Promise<Result<CellProspectConsent>> {
    const cellId = await this.cellResolver(clientId);
    return await this.crmService.revokeConsent(cellId, clientId, consentId, revokedBy);
  }
}

let defaultTenantCrmService: TenantCrmService | null = null;

/**
 * Retorna la instancia singleton del servicio CRM por inquilino.
 */
export function getTenantCrmService(): TenantCrmService {
  if (!defaultTenantCrmService) {
    defaultTenantCrmService = new TenantCrmService();
  }
  return defaultTenantCrmService;
}
