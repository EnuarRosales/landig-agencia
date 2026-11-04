import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantContactsAndUsersService,
  InMemoryTenantContactsAndUsersRepository,
} from "./tenant-contacts-and-users.service";

describe("TenantContactsAndUsersService", () => {
  let repo: InMemoryTenantContactsAndUsersRepository;
  let service: TenantContactsAndUsersService;
  const clientId = "tenant-001";
  const actor = "admin-user";

  beforeEach(() => {
    repo = new InMemoryTenantContactsAndUsersRepository();
    service = new TenantContactsAndUsersService(repo);
  });

  describe("Contactos y cuota 'contacts'", () => {
    it("permite crear contactos cuando el plan es UNLIMITED", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "UNLIMITED", value: null });

      const res = await service.createOrSyncContact(
        clientId,
        {
          fullName: "Juan Pérez",
          email: "juan@example.com",
          phoneMobile: "+573001234567",
        },
        actor,
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.action).toBe("created");
        expect(res.data.contact.fullName).toBe("Juan Pérez");
      }
      expect(await repo.countActiveContacts(clientId)).toBe(1);
    });

    it("rechaza la creación de contactos cuando la cuota es 0 (CA-004, RN-003, RN-004)", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "LIMITED", value: 0 });

      const res = await service.createOrSyncContact(
        clientId,
        {
          fullName: "Contacto Bloqueado",
          email: "bloqueado@example.com",
        },
        actor,
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
        expect(res.code).toBe("QUOTA_EXCEEDED");
      }
      expect(await repo.countActiveContacts(clientId)).toBe(0);
    });

    it("rechaza la creación cuando se alcanza el límite finito (S10)", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "LIMITED", value: 2 });

      // Crear 2 contactos permitidos
      const c1 = await service.createOrSyncContact(clientId, { fullName: "Contacto 1", email: "c1@example.com" }, actor);
      const c2 = await service.createOrSyncContact(clientId, { fullName: "Contacto 2", email: "c2@example.com" }, actor);
      expect(c1.ok).toBe(true);
      expect(c2.ok).toBe(true);

      // El tercero debe ser bloqueado
      const c3 = await service.createOrSyncContact(clientId, { fullName: "Contacto 3", email: "c3@example.com" }, actor);
      expect(c3.ok).toBe(false);
      if (!c3.ok) {
        expect(c3.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
        expect(c3.code).toBe("QUOTA_EXCEEDED");
      }
    });

    it("deduplica contactos por chatwootContactId, email o teléfono sin consumir cuota adicional (S3)", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "LIMITED", value: 1 });

      // Crear primer contacto
      const c1 = await service.createOrSyncContact(
        clientId,
        {
          fullName: "María Gómez",
          email: "maria@example.com",
          phoneMobile: "+573009998877",
          chatwootContactId: 456,
        },
        actor,
      );
      expect(c1.ok).toBe(true);
      if (c1.ok) {
        expect(c1.data.action).toBe("created");
      }

      // Re-sincronizar el mismo contacto por chatwootContactId con nombre actualizado
      const c2 = await service.createOrSyncContact(
        clientId,
        {
          fullName: "María Gómez Actualizada",
          chatwootContactId: 456,
        },
        actor,
      );
      expect(c2.ok).toBe(true);
      if (c2.ok) {
        expect(c2.data.action).toBe("updated");
        expect(c2.data.contact.fullName).toBe("María Gómez Actualizada");
      }

      // Re-sincronizar por email
      const c3 = await service.createOrSyncContact(
        clientId,
        {
          fullName: "María Gómez Tercer Intento",
          email: "maria@example.com",
        },
        actor,
      );
      expect(c3.ok).toBe(true);
      if (c3.ok) {
        expect(c3.data.action).toBe("updated");
      }

      // Conteo activo debe seguir siendo exactamente 1
      expect(await repo.countActiveContacts(clientId)).toBe(1);
    });

    it("aplica cuota compartida en importación de contactos (CA-005, RN-005)", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "LIMITED", value: 3 });

      // Ya existe 1 contacto
      await service.createOrSyncContact(clientId, { fullName: "Existente", email: "existente@example.com" }, actor);

      // Intentar importar 3 contactos nuevos (supera 1 + 3 = 4 > 3)
      const batchExceed = await service.importContacts(
        clientId,
        [
          { fullName: "Nuevo 1", email: "n1@example.com" },
          { fullName: "Nuevo 2", email: "n2@example.com" },
          { fullName: "Nuevo 3", email: "n3@example.com" },
        ],
        actor,
      );
      expect(batchExceed.ok).toBe(false);
      if (!batchExceed.ok) {
        expect(batchExceed.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
      }

      // Importar 2 contactos, uno de los cuales es duplicado del existente
      const batchValid = await service.importContacts(
        clientId,
        [
          { fullName: "Existente Actualizado", email: "existente@example.com" },
          { fullName: "Nuevo Permitido", email: "nuevo@example.com" },
        ],
        actor,
      );
      expect(batchValid.ok).toBe(true);
      if (batchValid.ok) {
        expect(batchValid.data.created.length).toBe(1);
        expect(batchValid.data.updated.length).toBe(1);
      }
      expect(await repo.countActiveContacts(clientId)).toBe(2);
    });

    it("eliminar un contacto libera cuota (S3)", async () => {
      repo.quotas.set(`${clientId}:contacts`, { mode: "LIMITED", value: 1 });

      const c1 = await service.createOrSyncContact(clientId, { fullName: "Temporal", email: "temp@example.com" }, actor);
      expect(c1.ok).toBe(true);
      const contactId = (c1 as any).data.contact.id;

      // Intentar crear otro falla
      const c2 = await service.createOrSyncContact(clientId, { fullName: "Otro", email: "otro@example.com" }, actor);
      expect(c2.ok).toBe(false);

      // Eliminar el primero
      const del = await service.deleteContact(clientId, contactId, actor);
      expect(del.ok).toBe(true);

      // Ahora sí se puede crear
      const c3 = await service.createOrSyncContact(clientId, { fullName: "Otro", email: "otro@example.com" }, actor);
      expect(c3.ok).toBe(true);
    });
  });

  describe("Usuarios del inquilino y cuota 'tenant_users'", () => {
    it("reserva cupo al emitir invitaciones y bloquea al alcanzar la cuota (S3, S10)", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 2 });

      // Supongamos que ya existe 1 dueño activo en el inquilino
      await repo.createTenantMembership({
        clientId,
        userId: "owner-1",
        role: "tenant_owner",
      });

      // 1 cupo restante: emitir 1 invitación debe permitirse
      const inv1 = await service.issueInvitation(
        clientId,
        {
          email: "agente1@example.com",
          invitedByUserId: "owner-1",
        },
        actor,
      );
      expect(inv1.ok).toBe(true);

      const summary = await service.getTenantUsersSummary(clientId);
      expect(summary.usage.activeUsers).toBe(1);
      expect(summary.usage.pendingInvitations).toBe(1);
      expect(summary.usage.totalConsumed).toBe(2);

      // La siguiente invitación debe ser rechazada con S10
      const inv2 = await service.issueInvitation(
        clientId,
        {
          email: "agente2@example.com",
          invitedByUserId: "owner-1",
        },
        actor,
      );
      expect(inv2.ok).toBe(false);
      if (!inv2.ok) {
        expect(inv2.error).toBe("Has alcanzado el límite de usuarios por inquilino incluido en tu plan.");
        expect(inv2.code).toBe("QUOTA_EXCEEDED");
      }
    });

    it("revocar una invitación pendiente libera cupo (S3)", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 1 });

      const inv = await service.issueInvitation(
        clientId,
        {
          email: "agente@example.com",
          invitedByUserId: "admin",
        },
        actor,
      );
      expect(inv.ok).toBe(true);
      const invId = (inv as any).data.invitation.id;

      // Cuota agotada
      const invBlock = await service.issueInvitation(
        clientId,
        {
          email: "otro@example.com",
          invitedByUserId: "admin",
        },
        actor,
      );
      expect(invBlock.ok).toBe(false);

      // Revocar
      const rev = await service.revokeInvitation(clientId, invId, actor);
      expect(rev.ok).toBe(true);

      // Vuelve a permitir
      const invRetry = await service.issueInvitation(
        clientId,
        {
          email: "otro@example.com",
          invitedByUserId: "admin",
        },
        actor,
      );
      expect(invRetry.ok).toBe(true);
    });

    it("aceptar una invitación convierte pending a active sin exceder cuota y respeta 1:0..1", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 1 });

      const invRes = await service.issueInvitation(
        clientId,
        {
          email: "agente@example.com",
          invitedByUserId: "admin",
        },
        actor,
      );
      expect(invRes.ok).toBe(true);
      const rawToken = (invRes as any).data.rawToken;

      // Intentar aceptar con un usuario que ya tiene un active_client_id
      repo.userActiveClients.set("user-already-busy", "other-tenant");
      const busyAccept = await service.acceptInvitation({
        rawToken,
        userId: "user-already-busy",
        userEmail: "agente@example.com",
      });
      expect(busyAccept.ok).toBe(false);
      if (!busyAccept.ok) {
        expect(busyAccept.code).toBe("USER_ALREADY_HAS_ACTIVE_MEMBERSHIP");
      }

      // Aceptar con usuario libre
      const freeAccept = await service.acceptInvitation({
        rawToken,
        userId: "user-free",
        userEmail: "agente@example.com",
      });
      expect(freeAccept.ok).toBe(true);

      const summary = await service.getTenantUsersSummary(clientId);
      expect(summary.usage.activeUsers).toBe(1);
      expect(summary.usage.pendingInvitations).toBe(0);
      expect(summary.usage.totalConsumed).toBe(1);
    });

    it("remover un miembro libera cupo y no permite remover al tenant_owner", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 2 });

      const owner = await repo.createTenantMembership({
        clientId,
        userId: "owner-1",
        role: "tenant_owner",
      });

      const agent = await repo.createTenantMembership({
        clientId,
        userId: "agent-1",
        role: "tenant_agent",
      });

      // No se puede remover al owner
      const remOwner = await service.removeMember(clientId, owner.id, actor);
      expect(remOwner.ok).toBe(false);
      if (!remOwner.ok) {
        expect(remOwner.code).toBe("CANNOT_REMOVE_OWNER");
      }

      // Se puede remover al agent
      const remAgent = await service.removeMember(clientId, agent.id, actor);
      expect(remAgent.ok).toBe(true);

      const summary = await service.getTenantUsersSummary(clientId);
      expect(summary.usage.activeUsers).toBe(1);
    });

    it("garantiza concurrencia atómica cuando queda 1 solo cupo disponible (CA-011)", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 1 });

      const p1 = service.issueInvitation(clientId, { email: "c1@test.com", invitedByUserId: "u" }, actor);
      const p2 = service.issueInvitation(clientId, { email: "c2@test.com", invitedByUserId: "u" }, actor);

      const [r1, r2] = await Promise.all([p1, p2]);

      const successCount = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0);
      const failedCount = (!r1.ok ? 1 : 0) + (!r2.ok ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failedCount).toBe(1);
    });
  });
});
