import { describe, expect, it, vi, beforeEach } from "vitest";
import { CrmService } from "./crm.service";
import type {
  ICrmRepository,
  CrmQualityMetrics,
} from "../repositories/crm.repository.interface";
import type {
  CellContact,
  CellProspectConsent,
  CellPrivacyNotice,
} from "../db/schemas/tenant/crm";

describe("CRM-001 · Servicio de Prospectos, Ingesta Chatwoot y Habeas Data", () => {
  const cellId = "pg-cell-01";
  const clientId = "11111111-1111-7111-8111-111111111111";

  let mockRepo: ICrmRepository;
  let service: CrmService;

  beforeEach(() => {
    mockRepo = {
      createContact: vi.fn(),
      updateContact: vi.fn(),
      findContactById: vi.fn(),
      findContactByChatwootId: vi.fn(),
      findContactsByPhone: vi.fn(),
      listContacts: vi.fn(),
      anonymizeContact: vi.fn(),
      createConsent: vi.fn(),
      findActiveConsent: vi.fn(),
      revokeConsent: vi.fn(),
      listConsentsByProspect: vi.fn(),
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
      const expectedContact: CellContact = {
        id: "22222222-2222-7222-8222-222222222222",
        clientId,
        fullName: "Carlos Pérez",
        documentType: null,
        documentNumber: null,
        email: null,
        phoneMobile: "+573001234567",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "manual",
        channel: null,
        chatwootContactId: null,
        assignedUserId: null,
        stage: "new",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-1",
        updatedBy: "user-1",
      };

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
      vi.mocked(mockRepo.createContact).mockResolvedValue({} as any);

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
      const existing: CellContact = {
        id: "22222222-2222-7222-8222-222222222222",
        clientId,
        fullName: "Carlos Pérez",
        documentType: null,
        documentNumber: null,
        email: "carlos@test.com",
        phoneMobile: "+573001234567",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "manual",
        channel: null,
        chatwootContactId: null,
        assignedUserId: null,
        stage: "new",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-1",
        updatedBy: "user-1",
      };

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

  describe("T-04 · Ingesta idempotente desde Chatwoot y detección de colisiones", () => {
    it("actualiza lastSeenAt cuando el chatwootContactId ya existe en el sistema", async () => {
      const existing: CellContact = {
        id: "33333333-3333-7333-8333-333333333333",
        clientId,
        fullName: "Laura Restrepo",
        documentType: null,
        documentNumber: null,
        email: null,
        phoneMobile: "+573109876543",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "whatsapp",
        channel: "whatsapp",
        chatwootContactId: 4501,
        assignedUserId: null,
        stage: "in_conversation",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date("2026-10-01"),
        lastSeenAt: new Date("2026-10-01"),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01"),
        createdBy: "chatwoot-webhook",
        updatedBy: "chatwoot-webhook",
      };

      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValue(existing);
      vi.mocked(mockRepo.updateContact).mockResolvedValue({
        ...existing,
        lastSeenAt: new Date(),
      });

      const result = await service.ingestFromChatwoot(cellId, clientId, {
        chatwootContactId: 4501,
        name: "Laura Restrepo",
        phoneMobile: "+573109876543",
        executedBy: "chatwoot-webhook",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("updated");
      }
      expect(mockRepo.updateContact).toHaveBeenCalled();
      expect(mockRepo.createContact).not.toHaveBeenCalled();
    });

    it("crea un nuevo prospecto e identifica conflicto de duplicidad si el teléfono ya existía en otro contacto", async () => {
      vi.mocked(mockRepo.findContactByChatwootId).mockResolvedValue(null);

      const manualContact: CellContact = {
        id: "44444444-4444-7444-8444-444444444444",
        clientId,
        fullName: "Andrés Manual",
        documentType: null,
        documentNumber: null,
        email: null,
        phoneMobile: "+573150001122",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "manual",
        channel: null,
        chatwootContactId: null,
        assignedUserId: null,
        stage: "new",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "agent-1",
        updatedBy: "agent-1",
      };
      vi.mocked(mockRepo.findContactsByPhone).mockResolvedValue([manualContact]);

      const newCreated: CellContact = {
        ...manualContact,
        id: "55555555-5555-7555-8555-555555555555",
        fullName: "Andrés WhatsApp",
        source: "whatsapp",
        chatwootContactId: 9988,
      };
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
      const existing: CellContact = {
        id: prospectId,
        clientId,
        fullName: "Juan Supresión",
        documentType: "CC",
        documentNumber: "12345678",
        email: "juan@supresion.com",
        phoneMobile: "+573111112233",
        phoneLandline: null,
        country: "CO",
        state: "Antioquia",
        city: "Medellín",
        addressLine: "Calle 10 # 40-20",
        postalCode: "050021",
        source: "manual",
        channel: null,
        chatwootContactId: null,
        assignedUserId: null,
        stage: "customer",
        tags: ["vip"],
        language: "es",
        notes: "Notas confidenciales",
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-1",
        updatedBy: "user-1",
      };

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
      vi.mocked(mockRepo.findContactById).mockResolvedValue({
        id: "22222222-2222-7222-8222-222222222222",
        clientId,
        fullName: "Diana Prince",
        documentType: null,
        documentNumber: null,
        email: null,
        phoneMobile: "+573009998877",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "whatsapp",
        channel: "whatsapp",
        chatwootContactId: 9988,
        assignedUserId: null,
        stage: "new",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      });

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
      vi.mocked(mockRepo.findContactById).mockResolvedValue({
        id: "22222222-2222-7222-8222-222222222222",
        clientId,
        fullName: "Diana Prince",
        documentType: null,
        documentNumber: null,
        email: null,
        phoneMobile: "+573009998877",
        phoneLandline: null,
        country: null,
        state: null,
        city: null,
        addressLine: null,
        postalCode: null,
        source: "whatsapp",
        channel: "whatsapp",
        chatwootContactId: 9988,
        assignedUserId: null,
        stage: "new",
        tags: [],
        language: "es",
        notes: null,
        firstContactedAt: new Date(),
        lastSeenAt: new Date(),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      });

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
});
