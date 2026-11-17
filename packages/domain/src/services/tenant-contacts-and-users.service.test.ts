import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword } from "../auth/password-hasher";
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

  describe("SPEC-12 · Ciclo completo de invitaciones, cuotas Chatwoot, suspensión y aceptación", () => {
    it("rechaza invitación duplicada vigente (INVITATION_ALREADY_PENDING) y expira automáticamente las vencidas", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 5 });

      const first = await service.issueInvitation(
        clientId,
        { email: "andrea@tienda.co", displayName: "Andrea", invitedByUserId: "owner-1" },
        actor,
      );
      expect(first.ok).toBe(true);

      const dup = await service.issueInvitation(
        clientId,
        { email: "ANDREA@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(dup.ok).toBe(false);
      if (!dup.ok) {
        expect(dup.code).toBe("INVITATION_ALREADY_PENDING");
      }

      // Simular expiración de la invitación previa
      if (first.ok) {
        const stored = repo.invitations.get(first.data.invitation.id)!;
        stored.expiresAt = new Date(Date.now() - 10_000);
      }

      const reissued = await service.issueInvitation(
        clientId,
        { email: "andrea@tienda.co", displayName: "Andrea Nueva", invitedByUserId: "owner-1" },
        actor,
      );
      expect(reissued.ok).toBe(true);
      if (first.ok) {
        expect(repo.invitations.get(first.data.invitation.id)?.status).toBe("expired");
      }
    });

    it("rechaza invitación si el correo ya pertenece a otro comercio o tiene invitación vigente en otro comercio", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 5 });
      repo.globalUsers.set("ocupado@otro.co", {
        id: "u-busy",
        email: "ocupado@otro.co",
        displayName: "Ocupado",
        passwordHash: null,
        identityLocation: "cell-01",
        activeClientId: "other-tenant-99",
        emailVerifiedAt: new Date(),
        status: "active",
        hasPlatformRole: false,
      });

      const crossUser = await service.issueInvitation(
        clientId,
        { email: "ocupado@otro.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(crossUser.ok).toBe(false);
      if (!crossUser.ok) {
        expect(crossUser.code).toBe("EMAIL_BELONGS_TO_ANOTHER_TENANT");
      }

      // Invitación vigente en otro comercio
      await service.issueInvitation(
        "other-tenant-99",
        { email: "pendiente@otro.co", invitedByUserId: "owner-other" },
        actor,
      );
      const crossInv = await service.issueInvitation(
        clientId,
        { email: "pendiente@otro.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(crossInv.ok).toBe(false);
      if (!crossInv.ok) {
        expect(crossInv.code).toBe("EMAIL_BELONGS_TO_ANOTHER_TENANT");
      }
    });

    it("valida cuota chatwoot_agents cuando grantChatwootAccess=true y permite invitar sin Chatwoot si se desmarca", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 5 });
      repo.quotas.set(`${clientId}:chatwoot_agents`, { mode: "LIMITED", value: 1 });

      await repo.createTenantMembership({
        clientId,
        userId: "owner-1",
        role: "tenant_owner",
        grantChatwootAccess: true,
      });

      const blockedCw = await service.issueInvitation(
        clientId,
        { email: "cw@tienda.co", grantChatwootAccess: true, invitedByUserId: "owner-1" },
        actor,
      );
      expect(blockedCw.ok).toBe(false);
      if (!blockedCw.ok) {
        expect(blockedCw.code).toBe("CHATWOOT_AGENTS_QUOTA_EXCEEDED");
      }

      const allowedNoCw = await service.issueInvitation(
        clientId,
        { email: "nocw@tienda.co", grantChatwootAccess: false, invitedByUserId: "owner-1" },
        actor,
      );
      expect(allowedNoCw.ok).toBe(true);
    });

    it("reenvío regenera token dejando obsoleto el anterior y revalida cuota si estaba expirada", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 1 });

      const invRes = await service.issueInvitation(
        clientId,
        { email: "luis@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(invRes.ok).toBe(true);
      if (!invRes.ok) return;

      const oldToken = invRes.data.rawToken;
      const resendRes = await service.resendInvitation(clientId, invRes.data.invitation.id, actor);
      expect(resendRes.ok).toBe(true);
      if (!resendRes.ok) return;

      const newToken = resendRes.data.rawToken;
      expect(newToken).not.toBe(oldToken);

      // Token anterior T1 falla
      const oldAccept = await service.acceptTeamInvitation({
        rawToken: oldToken,
        displayName: "Luis",
        password: "Password123!",
      });
      expect(oldAccept.ok).toBe(false);
      if (!oldAccept.ok) {
        expect(oldAccept.code).toBe("INVITATION_TOKEN_INVALID_OR_EXPIRED");
      }

      // Token nuevo T2 funciona
      const newAccept = await service.acceptTeamInvitation({
        rawToken: newToken,
        displayName: "Luis Pérez",
        password: "Password123!",
      });
      expect(newAccept.ok).toBe(true);
      if (newAccept.ok) {
        expect(newAccept.data.email).toBe("luis@tienda.co");
        expect(newAccept.data.member.status).toBe("active");
      }
    });

    it("acepta invitación para cuenta existente validando contraseña actual sin sobrescribirla", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 5 });
      const existingHash = await hashPassword("ExistingPass1!");
      repo.globalUsers.set("prospecto@tienda.co", {
        id: "u-prospect-1",
        email: "prospecto@tienda.co",
        displayName: "Prospecto Prev",
        passwordHash: existingHash,
        identityLocation: "router",
        activeClientId: null,
        emailVerifiedAt: new Date(),
        status: "active",
        hasPlatformRole: false,
      });

      const inv = await service.issueInvitation(
        clientId,
        { email: "prospecto@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(inv.ok).toBe(true);
      if (!inv.ok) return;

      const missingPwd = await service.acceptTeamInvitation({
        rawToken: inv.data.rawToken,
      });
      expect(missingPwd.ok).toBe(false);
      if (!missingPwd.ok) {
        expect(missingPwd.code).toBe("EXISTING_ACCOUNT_PASSWORD_REQUIRED");
      }

      const wrongPwd = await service.acceptTeamInvitation({
        rawToken: inv.data.rawToken,
        currentPassword: "WrongPassword1!",
      });
      expect(wrongPwd.ok).toBe(false);
      if (!wrongPwd.ok) {
        expect(wrongPwd.code).toBe("INVALID_CURRENT_PASSWORD");
      }

      const validAccept = await service.acceptTeamInvitation({
        rawToken: inv.data.rawToken,
        currentPassword: "ExistingPass1!",
      });
      expect(validAccept.ok).toBe(true);
      if (validAccept.ok) {
        expect(validAccept.data.userId).toBe("u-prospect-1");
        expect(repo.globalUsers.get("prospecto@tienda.co")?.activeClientId).toBe(clientId);
      }
    });

    it("suspende revocando sesiones, protege cuota al reactivar, retira (left) y permite re-invitar después", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 2 });

      const owner = await repo.createTenantMembership({
        clientId,
        userId: "owner-1",
        role: "tenant_owner",
      });

      // Protege al owner contra degradación, suspensión o edición aquí
      const suspendOwner = await service.updateMemberStatus(clientId, owner.id, "suspended", actor);
      expect(suspendOwner.ok).toBe(false);
      if (!suspendOwner.ok) {
        expect(suspendOwner.code).toBe("LAST_OWNER_CANNOT_BE_REMOVED");
      }

      const inv = await service.issueInvitation(
        clientId,
        { email: "andrea@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(inv.ok).toBe(true);
      if (!inv.ok) return;

      const accepted = await service.acceptTeamInvitation({
        rawToken: inv.data.rawToken,
        displayName: "Andrea",
        password: "Password123!",
      });
      expect(accepted.ok).toBe(true);
      if (!accepted.ok) return;

      const memberId = accepted.data.member.id;
      const userId = accepted.data.userId;

      // Suspender revoca sesiones
      const suspended = await service.updateMemberStatus(clientId, memberId, "suspended", actor);
      expect(suspended.ok).toBe(true);
      if (suspended.ok) {
        expect(suspended.data.member.status).toBe("suspended");
        expect(suspended.data.chatwootAction).toBe("remove");
      }
      expect(repo.revokedSessionsForUsers.some((r) => r.userId === userId)).toBe(true);

      // Ocupar el cupo libre con otro invitado
      const inv2 = await service.issueInvitation(
        clientId,
        { email: "camila@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(inv2.ok).toBe(true);

      // Reactivar a Andrea ahora debe fallar por cuota llena
      const reactivateBlocked = await service.updateMemberStatus(clientId, memberId, "active", actor);
      expect(reactivateBlocked.ok).toBe(false);
      if (!reactivateBlocked.ok) {
        expect(reactivateBlocked.code).toBe("QUOTA_EXCEEDED");
      }

      // Revocar invitación de camila y reactivar a Andrea
      if (inv2.ok) {
        await service.revokeInvitation(clientId, inv2.data.invitation.id, actor);
      }
      const reactivated = await service.updateMemberStatus(clientId, memberId, "active", actor);
      expect(reactivated.ok).toBe(true);
      if (reactivated.ok) {
        expect(reactivated.data.member.status).toBe("active");
        expect(reactivated.data.chatwootAction).toBe("sync");
      }

      // Retirar definitivamente (left)
      const retired = await service.retireMember(clientId, memberId, actor);
      expect(retired.ok).toBe(true);
      expect(repo.globalUsers.get("andrea@tienda.co")?.activeClientId).toBeNull();

      // Re-invitar al usuario retirado funciona
      const reinv = await service.issueInvitation(
        clientId,
        { email: "andrea@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );
      expect(reinv.ok).toBe(true);
    });

    it("listTeamAndInvitations oculta invitaciones y suspendidos para tenant_agent", async () => {
      repo.quotas.set(`${clientId}:tenant_users`, { mode: "LIMITED", value: 5 });
      await repo.createTenantMembership({
        clientId,
        userId: "owner-1",
        role: "tenant_owner",
      });
      const agent = await repo.createTenantMembership({
        clientId,
        userId: "agent-1",
        role: "tenant_agent",
      });
      await service.updateMemberStatus(clientId, agent.id, "suspended", actor);
      await service.issueInvitation(
        clientId,
        { email: "pend@tienda.co", invitedByUserId: "owner-1" },
        actor,
      );

      const ownerView = await service.listTeamAndInvitations(clientId, {
        viewerRole: "tenant_owner",
      });
      expect(ownerView.members.length).toBe(2);
      expect(ownerView.invitations.length).toBe(1);

      const agentView = await service.listTeamAndInvitations(clientId, {
        viewerRole: "tenant_agent",
      });
      expect(agentView.members.length).toBe(1);
      expect(agentView.invitations.length).toBe(0);
    });
  });
});
