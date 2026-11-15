import { describe, expect, it, vi, beforeEach } from "vitest";
import { CrmService } from "./crm.service";
import {
  computeWhatsappWindow,
  normalizeChatwootChannel,
} from "./crm-omnichannel.helpers";
import type {
  ICrmRepository,
  CrmQualityMetrics,
} from "../repositories/crm.repository.interface";
import type {
  CellContact,
  CellContactAddress,
  CellContactRating,
  CellProspectConsent,
  CellPrivacyNotice,
} from "../db/schemas/tenant/crm";

describe("CRM-001 · Servicio de Prospectos, Ingesta Chatwoot y Habeas Data", () => {
  const cellId = "pg-cell-01";
  const clientId = "11111111-1111-7111-8111-111111111111";

  let mockRepo: ICrmRepository;
  let service: CrmService;

  function buildMockContact(overrides: Partial<CellContact> = {}): CellContact {
    const now = new Date();
    return {
      id: "22222222-2222-7222-8222-222222222222",
      clientId,
      fullName: "Carlos Pérez",
      documentType: null,
      documentNumber: null,
      email: null,
      phoneMobile: "+573001234567",
      phoneLandline: null,
      phoneSecondary: null,
      companyName: null,
      birthDate: null,
      country: null,
      state: null,
      city: null,
      addressLine: null,
      postalCode: null,
      source: "manual",
      channel: null,
      preferredChannel: "whatsapp",
      lastChannel: "manual",
      chatwootContactId: null,
      assignedUserId: null,
      stage: "new",
      tags: [],
      language: "es",
      notes: null,
      currentRatingStars: null,
      currentRatingComment: null,
      firstContactedAt: now,
      lastSeenAt: now,
      lastInboundMessageAt: null,
      lastWhatsappInboundAt: null,
      convertedToCustomerAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
      createdBy: "user-1",
      updatedBy: "user-1",
      ...overrides,
    };
  }

  beforeEach(() => {
    mockRepo = {
      createContact: vi.fn(),
      updateContact: vi.fn(),
      findContactById: vi.fn(),
      findContactByChatwootId: vi.fn(),
      findContactsByPhone: vi.fn(),
      findContactsByEmail: vi.fn().mockResolvedValue([]),
      findActiveDuplicateContact: vi.fn().mockResolvedValue(null),
      listContacts: vi.fn(),
      softDeleteContact: vi.fn(),
      anonymizeContact: vi.fn(),
      addContactRating: vi.fn(),
      listContactRatings: vi.fn().mockResolvedValue([]),
      listContactAddresses: vi.fn().mockResolvedValue([]),
      createContactAddress: vi.fn(),
      updateContactAddress: vi.fn(),
      deleteContactAddress: vi.fn(),
      listDefaultAddressesByContactIds: vi.fn().mockResolvedValue(new Map()),
      listRecentOrdersForContact: vi.fn().mockResolvedValue([]),
      createConsent: vi.fn(),
      findActiveConsent: vi.fn(),
      revokeConsent: vi.fn(),
      listConsentsByProspect: vi.fn().mockResolvedValue([]),
      createPrivacyNotice: vi.fn(),
      findPublishedPrivacyNotice: vi.fn(),
      upsertContactProfile: vi.fn(),
      appendContactEpisode: vi.fn(),
      getQualityMetrics: vi.fn(),
    };
    service = new CrmService(mockRepo);
  });

  describe("T-03 · Alta manual y edición de prospectos", () => {
    it("falla si el nombre es vacío o menor a 2 caracteres", async () => {
      const result = await service.createProspect(cellId, clientId, {
        fullName: "A",
        phoneMobile: "+573001234567",
        createdBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("al menos 2 caracteres");
      }
    });

    it("falla si no se proporciona ningún canal de contacto", async () => {
      const result = await service.createProspect(cellId, clientId, {
        fullName: "Comercializadora SAS",
        createdBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("al menos un canal de contacto");
      }
    });

    it("rechaza teléfonos que no cumplan con el estándar E.164", async () => {
      const result = await service.createProspect(cellId, clientId, {
        fullName: "Carlos Pérez",
        phoneMobile: "3001234567", // Falta el + y código de país
        createdBy: "user-1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("formato internacional E.164");
      }
    });

    it("permite el alta mínima con 2 campos válidos (nombre + teléfono E.164)", async () => {
      const expectedContact = buildMockContact({
        fullName: "Carlos Pérez",
        phoneMobile: "+573001234567",
      });

      vi.mocked(mockRepo.createContact).mockResolvedValue(expectedContact);

      const result = await service.createProspect(cellId, clientId, {
        fullName: "Carlos Pérez",
        phoneMobile: "+573001234567",
        createdBy: "user-1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.fullName).toBe("Carlos Pérez");
        expect(result.data.phoneMobile).toBe("+573001234567");
      }
      expect(mockRepo.createContact).toHaveBeenCalledWith(cellId, clientId, expect.objectContaining({
        fullName: "Carlos Pérez",
        phoneMobile: "+573001234567",
      }));
    });

    it("normaliza el correo a minúsculas en el alta", async () => {
      vi.mocked(mockRepo.createContact).mockResolvedValue(buildMockContact());

      await service.createProspect(cellId, clientId, {
        fullName: "María Gómez",
        email: "Maria.Gomez@Empresa.COM",
        createdBy: "user-1",
      });

      expect(mockRepo.createContact).toHaveBeenCalledWith(cellId, clientId, expect.objectContaining({
        email: "maria.gomez@empresa.com",
      }));
    });

    it("permite actualizar etapa, notas y agente asignado", async () => {
      const existing = buildMockContact({
        email: "carlos@test.com",
      });

      vi.mocked(mockRepo.findContactById).mockResolvedValue(existing);
      vi.mocked(mockRepo.updateContact).mockResolvedValue({
        ...existing,
        stage: "qualified",
        notes: "Cliente interesado en plan anual",
      });

      const result = await service.updateProspect(cellId, clientId, existing.id, {
        stage: "qualified",
        notes: "Cliente interesado en plan anual",
        updatedBy: "user-2",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stage).toBe("qualified");
      }
    });
  });

  describe("T-04 · Ingesta omnicanal desde Chatwoot y reconciliación sin duplicados", () => {
    it("actualiza lastSeenAt cuando el chatwootContactId ya existe en el sistema", async () => {
      const existing = buildMockContact({
        id: "33333333-3333-7333-8333-333333333333",
        fullName: "Laura Restrepo",
        phoneMobile: "+573109876543",
        source: "whatsapp",
        channel: "whatsapp",
        lastChannel: "whatsapp_cloud",
        chatwootContactId: 4501,
        stage: "in_conversation",
      });

      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValue(existing);
      vi.mocked(mockRepo.updateContact).mockResolvedValue({
        ...existing,
        lastSeenAt: new Date(),
      });

      const result = await service.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 4501,
        name: "Laura Restrepo",
        phoneMobile: "+573109876543",
        channel: "Channel::Whatsapp",
        isIncomingMessage: true,
        executedBy: "chatwoot-webhook",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("updated");
        expect(result.data.isWhatsapp).toBe(true);
      }
      expect(mockRepo.updateContact).toHaveBeenCalledWith(
        cellId,
        clientId,
        existing.id,
        expect.objectContaining({
          lastChannel: "whatsapp_cloud",
          lastInboundMessageAt: expect.any(Date),
          lastWhatsappInboundAt: expect.any(Date),
        }),
      );
      expect(mockRepo.createContact).not.toHaveBeenCalled();
    });

    it("reconcilia contacto manual existente por teléfono único conservando source original y enlazando chatwootContactId", async () => {
      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValue(null);

      const manualContact = buildMockContact({
        id: "44444444-4444-7444-8444-444444444444",
        fullName: "Andrés Manual",
        phoneMobile: "+573150001122",
        source: "manual",
        chatwootContactId: null,
      });
      vi.mocked(mockRepo.findContactsByPhone).mockResolvedValue([manualContact]);
      vi.mocked(mockRepo.updateContact).mockResolvedValue({
        ...manualContact,
        chatwootContactId: 9988,
        lastChannel: "instagram",
      });

      const result = await service.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 9988,
        name: "Andrés IG",
        phoneMobile: "+573150001122",
        channel: "Channel::Instagram",
        isIncomingMessage: true,
        executedBy: "chatwoot-webhook",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("reconciled");
        expect(result.data.isWhatsapp).toBe(false);
        expect(result.data.prospect.source).toBe("manual");
      }
      expect(mockRepo.updateContact).toHaveBeenCalledWith(
        cellId,
        clientId,
        manualContact.id,
        expect.objectContaining({
          chatwootContactId: 9988,
          lastChannel: "instagram",
          lastInboundMessageAt: expect.any(Date),
        }),
      );
      expect(mockRepo.updateContact).not.toHaveBeenCalledWith(
        cellId,
        clientId,
        manualContact.id,
        expect.objectContaining({
          lastWhatsappInboundAt: expect.anything(),
        }),
      );
      expect(mockRepo.createContact).not.toHaveBeenCalled();
    });

    it("crea un nuevo prospecto con advertencia cuando existen múltiples contactos ambiguos con el mismo teléfono", async () => {
      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValue(null);
      const dup1 = buildMockContact({ id: "44444444-4444-7444-8444-444444444444", phoneMobile: "+573150001122" });
      const dup2 = buildMockContact({ id: "44444444-4444-7444-8444-444444444445", phoneMobile: "+573150001122" });
      vi.mocked(mockRepo.findContactsByPhone).mockResolvedValue([dup1, dup2]);

      const newCreated = buildMockContact({
        id: "55555555-5555-7555-8555-555555555555",
        fullName: "Andrés WhatsApp",
        source: "whatsapp",
        chatwootContactId: 9988,
      });
      vi.mocked(mockRepo.createContact).mockResolvedValue(newCreated);

      const result = await service.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 9988,
        name: "Andrés WhatsApp",
        phoneMobile: "+573150001122",
        executedBy: "chatwoot-webhook",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("created");
        expect(result.data.duplicateWarning).toBe(true);
      }
      expect(mockRepo.createContact).toHaveBeenCalled();
    });
  });

  describe("T-06 · Consentimientos Habeas Data y Avisos de Privacidad", () => {
    it("registra consentimientos de tratamiento y de comunicaciones comerciales", async () => {
      const expectedConsent: CellProspectConsent = {
        id: "66666666-6666-7666-8666-666666666666",
        clientId,
        prospectId: "22222222-2222-7222-8222-222222222222",
        purpose: "commercial_comms",
        policyVersion: "1.0.0",
        status: "granted",
        grantedAt: new Date(),
        revokedAt: null,
        channel: "whatsapp_buttons",
        evidenceRef: "cw_msg_987654",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      };

      vi.mocked(mockRepo.findContactById).mockResolvedValue(
        buildMockContact({
          id: "22222222-2222-7222-8222-222222222222",
        }),
      );
      vi.mocked(mockRepo.createConsent).mockResolvedValue(expectedConsent);

      const result = await service.recordConsent(cellId, clientId, {
        prospectId: "22222222-2222-7222-8222-222222222222",
        purpose: "commercial_comms",
        policyVersion: "1.0.0",
        channel: "whatsapp_buttons",
        evidenceRef: "cw_msg_987654",
        createdBy: "bot",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("granted");
        expect(result.data.purpose).toBe("commercial_comms");
      }
    });

    it("revoca consentimientos marcando revokedAt", async () => {
      const revokedConsent: CellProspectConsent = {
        id: "66666666-6666-7666-8666-666666666666",
        clientId,
        prospectId: "22222222-2222-7222-8222-222222222222",
        purpose: "commercial_comms",
        policyVersion: "1.0.0",
        status: "revoked",
        grantedAt: new Date("2026-10-01"),
        revokedAt: new Date(),
        channel: "whatsapp_buttons",
        evidenceRef: null,
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "agent-optout",
      };

      vi.mocked(mockRepo.revokeConsent).mockResolvedValue(revokedConsent);

      const result = await service.revokeConsent(cellId, clientId, revokedConsent.id, "agent-optout");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("revoked");
        expect(result.data.revokedAt).toBeDefined();
      }
    });

    it("siembra la versión inicial 1.0.0 del aviso de privacidad para el inquilino", async () => {
      vi.mocked(mockRepo.findPublishedPrivacyNotice).mockResolvedValue(null);

      const seededNotice: CellPrivacyNotice = {
        id: "77777777-7777-7777-8777-777777777777",
        clientId,
        version: "1.0.0",
        locale: "es",
        title: "Aviso de Privacidad y Tratamiento de Datos Personales",
        bodyMarkdown: "En cumplimiento de la Ley 1581 de 2012...",
        status: "published",
        reviewedBy: null,
        reviewedAt: new Date(),
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };
      vi.mocked(mockRepo.createPrivacyNotice).mockResolvedValue(seededNotice);

      const result = await service.seedDefaultPrivacyNotice(cellId, clientId, "system");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.version).toBe("1.0.0");
        expect(result.data.status).toBe("published");
      }
    });
  });

  describe("T-07 · Supresión con anonimización irreversible (D-04)", () => {
    it("anonimiza los campos identificables de un contacto sin eliminar sus consentimientos históricos", async () => {
      const prospectId = "88888888-8888-7888-8888-888888888888";
      const existing = buildMockContact({
        id: prospectId,
        fullName: "Juan Supresión",
        documentType: "CC",
        documentNumber: "12345678",
        email: "juan@supresion.com",
        phoneMobile: "+573111112233",
        country: "CO",
        state: "Antioquia",
        city: "Medellín",
        addressLine: "Calle 10 # 40-20",
        postalCode: "050021",
        stage: "customer",
        tags: ["vip"],
        notes: "Notas confidenciales",
      });

      vi.mocked(mockRepo.findContactById).mockResolvedValue(existing);

      const anonymized: CellContact = {
        ...existing,
        fullName: "anon_88888888",
        documentNumber: null,
        email: null,
        phoneMobile: null,
        addressLine: null,
        notes: null,
        deletedAt: new Date(),
        deletedBy: "dpo_officer",
      };
      vi.mocked(mockRepo.anonymizeContact).mockResolvedValue(anonymized);

      const result = await service.anonymizeProspect(cellId, clientId, prospectId, "dpo_officer");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.fullName).toMatch(/^anon_/);
        expect(result.data.email).toBeNull();
        expect(result.data.phoneMobile).toBeNull();
        expect(result.data.deletedAt).toBeDefined();
        expect(result.data.deletedBy).toBe("dpo_officer");
      }
    });
  });

  describe("T-05 · Indicadores de calidad de datos", () => {
    it("obtiene las métricas de calidad calculadas por el repositorio", async () => {
      const metrics: CrmQualityMetrics = {
        totalContacts: 100,
        accuracyRate: 98,
        uniquenessRate: 95,
        completenessRate: 92,
        recencyRate: 85,
        consentRate: 78,
      };

      vi.mocked(mockRepo.getQualityMetrics).mockResolvedValue(metrics);

      const result = await service.getQualityMetrics(cellId, clientId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.accuracyRate).toBe(98);
        expect(result.data.uniquenessRate).toBe(95);
        expect(result.data.completenessRate).toBe(92);
        expect(result.data.recencyRate).toBe(85);
        expect(result.data.consentRate).toBe(78);
      }
    });
  });

  describe("T-06B · Captura de consentimiento por WhatsApp (botones interactivos)", () => {
    it("genera la carga interactiva con botones y enlace en español e inglés", async () => {
      vi.mocked(mockRepo.findPublishedPrivacyNotice).mockResolvedValue({
        id: "notice-uuid",
        clientId,
        version: "1.2.0",
        locale: "es",
        title: "Aviso Legal",
        bodyMarkdown: "Texto legal...",
        status: "published",
        reviewedBy: null,
        reviewedAt: new Date(),
        publishedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      });

      const esResult = await service.generateWhatsAppConsentMessage(cellId, clientId, { locale: "es" });
      expect(esResult.ok).toBe(true);
      if (esResult.ok) {
        expect(esResult.data.policyVersion).toBe("1.2.0");
        expect(esResult.data.noticeUrl).toContain("lang=es");
        expect(esResult.data.buttons.map((b) => b.id)).toEqual(["accept_treatment", "accept_all", "reject"]);
        expect(esResult.data.buttons[0]?.title).toBe("Acepto Tratamiento");
      }

      const enResult = await service.generateWhatsAppConsentMessage(cellId, clientId, { locale: "en" });
      expect(enResult.ok).toBe(true);
      if (enResult.ok) {
        expect(enResult.data.buttons[0]?.title).toBe("Accept Treatment");
      }
    });

    it("rechazo explícito no otorga consentimiento ni crea registros", async () => {
      const rejectResult = await service.handleWhatsAppConsentResponse(cellId, clientId, {
        prospectId: "22222222-2222-7222-8222-222222222222",
        buttonId: "reject",
        messageId: "cw_msg_reject_1",
      });

      expect(rejectResult.ok).toBe(true);
      if (rejectResult.ok) {
        expect(rejectResult.data.granted).toBe(false);
        expect(rejectResult.data.purposes).toHaveLength(0);
        expect(mockRepo.createConsent).not.toHaveBeenCalled();
      }
    });

    it("registra únicamente tratamiento de datos cuando el usuario selecciona accept_treatment", async () => {
      vi.mocked(mockRepo.findContactById).mockResolvedValue(
        buildMockContact({
          id: "22222222-2222-7222-8222-222222222222",
          fullName: "Diana Prince",
          phoneMobile: "+573009998877",
          source: "whatsapp",
          channel: "whatsapp",
          lastChannel: "whatsapp",
          chatwootContactId: 9988,
          createdBy: "bot",
          updatedBy: "bot",
        }),
      );

      const fakeConsent: CellProspectConsent = {
        id: "consent-treat-1",
        clientId,
        prospectId: "22222222-2222-7222-8222-222222222222",
        purpose: "data_treatment",
        policyVersion: "1.0.0",
        status: "granted",
        grantedAt: new Date(),
        revokedAt: null,
        channel: "whatsapp_buttons",
        evidenceRef: "cw_msg_btn_101",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      };
      vi.mocked(mockRepo.createConsent).mockResolvedValue(fakeConsent);

      const result = await service.handleWhatsAppConsentResponse(cellId, clientId, {
        prospectId: "22222222-2222-7222-8222-222222222222",
        buttonId: "accept_treatment",
        messageId: "cw_msg_btn_101",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.granted).toBe(true);
        expect(result.data.purposes).toEqual(["data_treatment"]);
        expect(result.data.consents[0]?.evidenceRef).toBe("cw_msg_btn_101");
        expect(mockRepo.createConsent).toHaveBeenCalledTimes(1);
      }
    });

    it("registra tratamiento y comunicaciones comerciales cuando el usuario selecciona accept_all", async () => {
      vi.mocked(mockRepo.findContactById).mockResolvedValue(
        buildMockContact({
          id: "22222222-2222-7222-8222-222222222222",
          fullName: "Diana Prince",
          phoneMobile: "+573009998877",
          source: "whatsapp",
          channel: "whatsapp",
          lastChannel: "whatsapp",
          chatwootContactId: 9988,
          createdBy: "bot",
          updatedBy: "bot",
        }),
      );

      vi.mocked(mockRepo.createConsent)
        .mockResolvedValueOnce({
          id: "consent-treat-all",
          clientId,
          prospectId: "22222222-2222-7222-8222-222222222222",
          purpose: "data_treatment",
          policyVersion: "1.0.0",
          status: "granted",
          grantedAt: new Date(),
          revokedAt: null,
          channel: "whatsapp_buttons",
          evidenceRef: "cw_msg_all_202",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "bot",
          updatedBy: "bot",
        })
        .mockResolvedValueOnce({
          id: "consent-comms-all",
          clientId,
          prospectId: "22222222-2222-7222-8222-222222222222",
          purpose: "commercial_comms",
          policyVersion: "1.0.0",
          status: "granted",
          grantedAt: new Date(),
          revokedAt: null,
          channel: "whatsapp_buttons",
          evidenceRef: "cw_msg_all_202",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "bot",
          updatedBy: "bot",
        });

      const result = await service.handleWhatsAppConsentResponse(cellId, clientId, {
        prospectId: "22222222-2222-7222-8222-222222222222",
        buttonId: "accept_all",
        messageId: "cw_msg_all_202",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.granted).toBe(true);
        expect(result.data.purposes).toEqual(["data_treatment", "commercial_comms"]);
        expect(mockRepo.createConsent).toHaveBeenCalledTimes(2);
      }
    });

    it("falla si messageId es vacío", async () => {
      const result = await service.handleWhatsAppConsentResponse(cellId, clientId, {
        prospectId: "22222222-2222-7222-8222-222222222222",
        buttonId: "accept_all",
        messageId: "   ",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("messageId");
      }
    });

    it("evalúa canSendCommercialCommunication con base en el consentimiento activo", async () => {
      vi.mocked(mockRepo.findActiveConsent).mockResolvedValueOnce({
        id: "active-comms-consent",
        clientId,
        prospectId: "22222222-2222-7222-8222-222222222222",
        purpose: "commercial_comms",
        policyVersion: "1.0.0",
        status: "granted",
        grantedAt: new Date(),
        revokedAt: null,
        channel: "whatsapp_buttons",
        evidenceRef: "cw_msg_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      });

      const canSend = await service.canSendCommercialCommunication(cellId, clientId, "22222222-2222-7222-8222-222222222222");
      expect(canSend).toBe(true);

      vi.mocked(mockRepo.findActiveConsent).mockResolvedValueOnce(null);
      const cannotSend = await service.canSendCommercialCommunication(cellId, clientId, "22222222-2222-7222-8222-222222222222");
      expect(cannotSend).toBe(false);
    });
  });
  describe("T7 / S10 · Validación y control de cuotas comerciales de contactos", () => {
    it("bloquea la creación de prospecto si la cuota de contactos está agotada", async () => {
      const mockQuotaEvaluator = {
        getQuota: vi.fn().mockResolvedValue({ mode: "LIMITED", value: 1 }),
      };
      const crmWithQuota = new CrmService(mockRepo, mockQuotaEvaluator);

      vi.mocked(mockRepo.listContacts).mockResolvedValue({
        items: [],
        total: 1, // Ya consumió 1 de 1
      });

      const res = await crmWithQuota.createProspect(cellId, clientId, {
        fullName: "Nuevo Prospecto",
        email: "nuevo@example.com",
        createdBy: "tester",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
        expect(res.code).toBe("QUOTA_EXCEEDED");
      }
    });

    it("en ingesta desde Chatwoot, bloquea nuevos contactos si la cuota está agotada pero permite actualizar existentes", async () => {
      const mockQuotaEvaluator = {
        getQuota: vi.fn().mockResolvedValue({ mode: "LIMITED", value: 1 }),
      };
      const crmWithQuota = new CrmService(mockRepo, mockQuotaEvaluator);

      // 1. Caso contacto existente: no consume cuota, actualiza con éxito
      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValueOnce({
        id: "existing-contact",
        clientId,
        fullName: "Existente",
        deletedAt: null,
      } as any);
      vi.mocked(mockRepo.updateContact).mockResolvedValueOnce({
        id: "existing-contact",
        clientId,
        fullName: "Existente",
      } as any);

      const updateRes = await crmWithQuota.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 123,
        name: "Existente",
        executedBy: "chatwoot",
      });
      expect(updateRes.ok).toBe(true);

      // 2. Caso contacto nuevo con cuota agotada: bloquea con mensaje S10
      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValueOnce(null);
      vi.mocked(mockRepo.listContacts).mockResolvedValueOnce({
        items: [],
        total: 1,
      });

      const newRes = await crmWithQuota.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 456,
        name: "Nuevo Bloqueado",
        executedBy: "chatwoot",
      });
      expect(newRes.ok).toBe(false);
      if (!newRes.ok) {
        expect(newRes.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
        expect(newRes.code).toBe("QUOTA_EXCEEDED");
      }
    });
  });

  describe("SPEC-09 · Ventana 24h WhatsApp, Omnicanalidad, Calificaciones, Direcciones y Conversión", () => {
    it("calcula ventana WhatsApp 24h exclusivamente con lastWhatsappInboundAt (active, expired, none)", () => {
      const now = new Date("2026-11-15T12:00:00.000Z");

      expect(computeWhatsappWindow(null, now)).toEqual({
        status: "none",
        expiresAt: null,
        remainingSeconds: 0,
      });

      const twoHoursAgo = new Date("2026-11-15T10:00:00.000Z");
      const activeWin = computeWhatsappWindow(twoHoursAgo, now);
      expect(activeWin.status).toBe("active");
      expect(activeWin.remainingSeconds).toBe(22 * 3600);

      const expiredInbound = new Date("2026-11-14T11:59:00.000Z");
      const expiredWin = computeWhatsappWindow(expiredInbound, now);
      expect(expiredWin.status).toBe("expired");
      expect(expiredWin.remainingSeconds).toBe(0);
    });

    it("normaliza canales omnicanal de Chatwoot sin colapsarlos todos a WhatsApp", () => {
      expect(normalizeChatwootChannel("Channel::Whatsapp")).toEqual({
        source: "whatsapp",
        channel: "whatsapp_cloud",
        isWhatsapp: true,
      });
      expect(normalizeChatwootChannel("Channel::Instagram")).toEqual({
        source: "instagram",
        channel: "instagram",
        isWhatsapp: false,
      });
      expect(normalizeChatwootChannel("Channel::FacebookPage")).toEqual({
        source: "facebook",
        channel: "facebook",
        isWhatsapp: false,
      });
      expect(normalizeChatwootChannel("Channel::WebWidget")).toEqual({
        source: "web",
        channel: "website",
        isWhatsapp: false,
      });
    });

    it("rechaza creación manual duplicada con código CONFLICT y fechas de cumpleaños futuras", async () => {
      const futureRes = await service.createProspect(cellId, clientId, {
        fullName: "Futuro",
        phoneMobile: "+573001112233",
        birthDate: "2099-01-01",
        createdBy: "user-1",
      });
      expect(futureRes.ok).toBe(false);
      if (!futureRes.ok) {
        expect(futureRes.code).toBe("VALIDATION_ERROR");
      }

      vi.mocked(mockRepo.findActiveDuplicateContact!).mockResolvedValueOnce(
        buildMockContact({ id: "existing-dup", fullName: "Laura Existente" }),
      );
      const dupRes = await service.createProspect(cellId, clientId, {
        fullName: "Laura Nueva",
        phoneMobile: "+573001234567",
        source: "referral",
        createdBy: "user-1",
      });
      expect(dupRes.ok).toBe(false);
      if (!dupRes.ok) {
        expect(dupRes.code).toBe("CONFLICT");
      }
    });

    it("califica un contacto 1..5 estrellas dejando historial y rechaza fuera de rango", async () => {
      const invalid = await service.rateContact(cellId, clientId, "c-1", {
        stars: 6,
        ratedByName: "Agente",
      });
      expect(invalid.ok).toBe(false);

      const rating: CellContactRating = {
        id: "r-1",
        clientId,
        contactId: "c-1",
        stars: 5,
        comment: "Comprador mayorista recurrente",
        ratedByUserId: "u-1",
        ratedByName: "Ana",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "Ana",
        updatedBy: "Ana",
      };
      vi.mocked(mockRepo.addContactRating!).mockResolvedValueOnce({
        rating,
        contact: buildMockContact({
          id: "c-1",
          currentRatingStars: 5,
          currentRatingComment: "Comprador mayorista recurrente",
        }),
      });

      const rated = await service.rateContact(cellId, clientId, "c-1", {
        stars: 5,
        comment: "Comprador mayorista recurrente",
        ratedByUserId: "u-1",
        ratedByName: "Ana",
      });
      expect(rated.ok).toBe(true);
      if (rated.ok) {
        expect(rated.data.rating.stars).toBe(5);
        expect(rated.data.contact.currentRatingStars).toBe(5);
      }
    });

    it("gestiona múltiples direcciones y registra conversión al pasar a customer", async () => {
      const contact = buildMockContact({ id: "c-1", stage: "qualified" });
      vi.mocked(mockRepo.findContactById).mockResolvedValue(contact);
      vi.mocked(mockRepo.updateContact).mockResolvedValue({
        ...contact,
        stage: "customer",
        convertedToCustomerAt: new Date(),
      });

      const stageRes = await service.updateStage(cellId, clientId, "c-1", "customer", "owner");
      expect(stageRes.ok).toBe(true);
      expect(mockRepo.updateContact).toHaveBeenCalledWith(
        cellId,
        clientId,
        "c-1",
        expect.objectContaining({
          stage: "customer",
          convertedToCustomerAt: expect.any(Date),
        }),
      );

      const addr: CellContactAddress = {
        id: "a-1",
        clientId,
        contactId: "c-1",
        label: "Oficina",
        country: "Colombia",
        state: "Antioquia",
        city: "Medellín",
        addressLine: "Cra 43A # 1-50",
        neighborhood: "El Poblado",
        postalCode: null,
        referenceNotes: "Recepción piso 4",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner",
        updatedBy: "owner",
      };
      vi.mocked(mockRepo.createContactAddress!).mockResolvedValueOnce(addr);
      const addrRes = await service.createContactAddress(cellId, clientId, "c-1", {
        label: "Oficina",
        city: "Medellín",
        addressLine: "Cra 43A # 1-50",
        isDefault: true,
        actor: "owner",
      });
      expect(addrRes.ok).toBe(true);

      vi.mocked(mockRepo.deleteContactAddress!).mockResolvedValueOnce({
        deleted: true,
        promotedAddressId: "a-2",
      });
      const delRes = await service.deleteContactAddress(cellId, clientId, "c-1", "a-1", "owner");
      expect(delRes.ok).toBe(true);
      if (delRes.ok) {
        expect(delRes.data.promotedAddressId).toBe("a-2");
      }
    });
  });
});
