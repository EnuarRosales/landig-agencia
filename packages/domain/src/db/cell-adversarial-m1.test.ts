import { describe, it, expect, beforeAll } from "vitest";
import {
  reconcileProvisionedTenantsInCells,
  authService,
  hashPassword,
  verifyPassword,
  validatePassword,
  authPasswordSchema,
  getDb,
  withTenantCellTransaction,
} from "../index";
import {
  users,
  clients,
  clientRouting,
  passwordResetTokens,
} from "./schemas";
import {
  cellUsers,
  cellTenantUsers,
  cellTenantLabels,
  cellClientBusinessInfo,
} from "./schemas/tenant";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hashToken } from "../auth/tokens";

describe.runIf(Boolean(process.env.DATABASE_URL || process.env.RUN_LIVE_RECONCILIATION))(
  "Adversarial M1: Identity Promotion, Password Routing & Reconciliation Stress Tests",
  () => {
    let portalDb: ReturnType<typeof getDb>;
    const cellId = "6ae5619b-7ca3-4764-baae-1b8950a8e534";
    const synergiaClientId = "01a1bc84-cc30-73b6-bc84-1f0cda5a9661";
    const synergiaEmail = "synergiamarket25@gmail.com";

    beforeAll(() => {
      portalDb = getDb();
    });

  // ---------------------------------------------------------------------------
  // SECTION 1: Idempotency of reconcileProvisionedTenantsInCells()
  // ---------------------------------------------------------------------------
  describe("Stress 1: Idempotency of reconcileProvisionedTenantsInCells()", () => {
    it("Stress 1.1: Re-running reconcile 5 times consecutively causes no duplicates, regressions or errors", async () => {
      const iterations = 5;
      for (let i = 1; i <= iterations; i++) {
        const res = await reconcileProvisionedTenantsInCells();
        expect(res.ok).toBe(true);
        if (!res.ok) throw new Error(res.error);

        expect(res.data.reconciledCount).toBeGreaterThanOrEqual(1);
        const synergia = res.data.tenants.find((t) => t.slug === "synergia-market");
        expect(synergia).toBeDefined();
        // Since credentials were promoted in initial run, subsequent runs must NOT re-promote or regress
        expect(synergia?.credentialsPromoted).toBe(false);
        expect(synergia?.lifecycleStatus).toBe("alta");

        // Verify cell data plane row counts and integrity
        await withTenantCellTransaction(
          synergiaClientId,
          async (tx) => {
            const uRows = await tx
              .select()
              .from(cellUsers)
              .where(eq(cellUsers.clientId, synergiaClientId));
            expect(uRows.length).toBe(1);
            expect(uRows[0].passwordHash).toBeDefined();
            expect(uRows[0].passwordHash?.startsWith("$argon2id$")).toBe(true);

            const tuRows = await tx
              .select()
              .from(cellTenantUsers)
              .where(eq(cellTenantUsers.clientId, synergiaClientId));
            expect(tuRows.length).toBe(1);
            expect(tuRows[0].role).toBe("tenant_owner");
            expect(tuRows[0].status).toBe("active");

            const tlRows = await tx
              .select()
              .from(cellTenantLabels)
              .where(eq(cellTenantLabels.clientId, synergiaClientId));
            expect(tlRows.length).toBe(4);
            const labelTitles = tlRows.map((l) => l.title).sort();
            expect(labelTitles).toEqual(["compra-realizada", "lead-caliente", "lead-frio", "lead-tibio"]);

            const cbiRows = await tx
              .select()
              .from(cellClientBusinessInfo)
              .where(eq(cellClientBusinessInfo.clientId, synergiaClientId));
            expect(cbiRows.length).toBe(1);
            expect(cbiRows[0].botPreset).toBe("natural_rhythm");
          },
          { cellId },
        );

        // Verify control plane state remains pristine
        const [portalUser] = await portalDb
          .select({
            identityLocation: users.identityLocation,
            passwordHash: users.passwordHash,
            passwordUpdatedAt: users.passwordUpdatedAt,
          })
          .from(users)
          .where(eq(users.email, synergiaEmail))
          .limit(1);

        expect(portalUser).toBeDefined();
        expect(portalUser.identityLocation).toBe(cellId);
        expect(portalUser.passwordHash).toBeNull();
        expect(portalUser.passwordUpdatedAt).toBeNull();
      }
    }, 45000);

    it("Stress 1.2: Concurrent rapid execution (3 parallel reconciliation calls) resolves cleanly without deadlocks", async () => {
      const results = await Promise.all([
        reconcileProvisionedTenantsInCells(),
        reconcileProvisionedTenantsInCells(),
        reconcileProvisionedTenantsInCells(),
      ]);

      for (let idx = 0; idx < results.length; idx++) {
        expect(results[idx].ok).toBe(true);
      }

      // Assert row count stability after concurrent calls
      await withTenantCellTransaction(
        synergiaClientId,
        async (tx) => {
          const [uCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(cellUsers)
            .where(eq(cellUsers.clientId, synergiaClientId));
          expect(uCount?.count).toBe(1);

          const [tuCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(cellTenantUsers)
            .where(eq(cellTenantUsers.clientId, synergiaClientId));
          expect(tuCount?.count).toBe(1);

          const [tlCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(cellTenantLabels)
            .where(eq(cellTenantLabels.clientId, synergiaClientId));
          expect(tlCount?.count).toBe(4);
        },
        { cellId },
      );
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: Synergia Market Control Plane & Cell Data Plane Verification
  // ---------------------------------------------------------------------------
  describe("Stress 2: Synergia Market Database Verification", () => {
    it("Stress 2.1: Verify control plane db-portal fields for Synergia Market", async () => {
      const [user] = await portalDb
        .select({
          id: users.id,
          email: users.email,
          activeClientId: users.activeClientId,
          identityLocation: users.identityLocation,
          passwordHash: users.passwordHash,
          passwordUpdatedAt: users.passwordUpdatedAt,
        })
        .from(users)
        .where(eq(users.email, synergiaEmail))
        .limit(1);

      expect(user).toBeDefined();
      expect(user.identityLocation).toBe(cellId);
      expect(user.passwordHash).toBeNull();
      expect(user.passwordUpdatedAt).toBeNull();
      expect(user.activeClientId).toBe(synergiaClientId);

      const [client] = await portalDb
        .select({
          id: clients.id,
          slug: clients.slug,
          lifecycleStatus: clients.lifecycleStatus,
          ownerUserId: clients.ownerUserId,
        })
        .from(clients)
        .where(eq(clients.id, synergiaClientId))
        .limit(1);

      expect(client).toBeDefined();
      expect(client.slug).toBe("synergia-market");
      expect(client.lifecycleStatus).toBe("alta");
      expect(client.ownerUserId).toBe(user.id);
    });

    it("Stress 2.2: Verify pg-cell-01 tables and Argon2id hash for Synergia Market", async () => {
      await withTenantCellTransaction(
        synergiaClientId,
        async (tx) => {
          // admin.users
          const [cUser] = await tx
            .select()
            .from(cellUsers)
            .where(and(eq(cellUsers.clientId, synergiaClientId), eq(cellUsers.email, synergiaEmail)))
            .limit(1);

          expect(cUser).toBeDefined();
          expect(cUser.status).toBe("active");
          expect(cUser.passwordHash).toBeDefined();
          expect(cUser.passwordHash?.startsWith("$argon2id$v=19$m=65536,t=3,p=1$")).toBe(true);

          // admin.tenant_users
          const [tu] = await tx
            .select()
            .from(cellTenantUsers)
            .where(and(eq(cellTenantUsers.clientId, synergiaClientId), eq(cellTenantUsers.userId, cUser.id)))
            .limit(1);

          expect(tu).toBeDefined();
          expect(tu.role).toBe("tenant_owner");
          expect(tu.status).toBe("active");

          // admin.tenant_labels
          const labels = await tx
            .select()
            .from(cellTenantLabels)
            .where(eq(cellTenantLabels.clientId, synergiaClientId));

          expect(labels.length).toBe(4);
          const titles = labels.map((l) => l.title).sort();
          expect(titles).toEqual(["compra-realizada", "lead-caliente", "lead-frio", "lead-tibio"]);

          // admin.client_business_info
          const [cbi] = await tx
            .select()
            .from(cellClientBusinessInfo)
            .where(eq(cellClientBusinessInfo.clientId, synergiaClientId))
            .limit(1);

          expect(cbi).toBeDefined();
          expect(cbi.botPreset).toBe("natural_rhythm");
          expect(cbi.paymentMethods).toEqual(["transferencia", "contraentrega"]);
        },
        { cellId },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: Edge Case Passwords and Token Handling for Cell Users
  // ---------------------------------------------------------------------------
  describe("Stress 3: Edge Case Passwords & Token Handling for Cell Users", () => {
    it("Stress 3.1: Password validation boundaries (length, ASCII specials, unicode, spaces)", () => {
      const cases = [
        { pw: "Aa1!", valid: false, reason: "Too short (< 7 chars)" },
        { pw: "Aa1!xyz", valid: true, reason: "Exact minimum 7 chars" },
        { pw: "alllowercase1!", valid: false, reason: "Missing uppercase" },
        { pw: "ALLUPPERCASE1!", valid: true, reason: "Valid uppercase, digit, special" },
        { pw: "NoSpecialDigit1A", valid: false, reason: "Missing ASCII special" },
        { pw: "NoDigitsHere!Aa", valid: false, reason: "Missing digit" },
        { pw: "P@ssw0rdñáéíóú123", valid: true, reason: "Unicode / Spanish accents with ASCII special" },
        { pw: "A1!" + "a".repeat(125), valid: true, reason: "Exact maximum length 128 characters" },
        { pw: "A1!" + "a".repeat(126), valid: false, reason: "129 characters exceeds max 128" },
        { pw: "P@ssw0rd#$%&*()_+=[]{}~^:;<>,.?/|1", valid: true, reason: "Complex ASCII symbols coverage" },
        { pw: "P@ss w0rd 123!", valid: true, reason: "Spaces preserved inside password" },
      ];

      for (const c of cases) {
        const valRes = validatePassword(c.pw);
        expect(valRes.valid).toBe(c.valid);

        const zodRes = authPasswordSchema.safeParse(c.pw);
        expect(zodRes.success).toBe(c.valid);
      }
    });

    it("Stress 3.2: Purpose 'setup' rejected when native password already exists in cell", async () => {
      const rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      const tokenId = randomUUID();

      await portalDb.insert(passwordResetTokens).values({
        id: tokenId,
        userId: "01a1bc84-cbec-7a2c-9efe-3a3f55284113", // Synergia owner
        tokenHash,
        purpose: "setup",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      try {
        const resetRes = await authService.resetPassword({
          token: rawToken,
          password: "NewPassword123!",
        });

        expect(resetRes.ok).toBe(false);
        if (!resetRes.ok) {
          expect(resetRes.code).toBe("PASSWORD_ALREADY_EXISTS");
        }
      } finally {
        await portalDb.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
      }
    });

    it("Stress 3.3: Purpose 'reset' rejected when user has NO native password", async () => {
      const tempUserId = randomUUID();
      const tempEmail = `temp.nopw.${Date.now()}@mocter.co`;

      await portalDb.insert(users).values({
        id: tempUserId,
        email: tempEmail,
        status: "active",
        identityLocation: "router",
        passwordHash: null,
        passwordUpdatedAt: null,
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      const rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      const tokenId = randomUUID();

      await portalDb.insert(passwordResetTokens).values({
        id: tokenId,
        userId: tempUserId,
        tokenHash,
        purpose: "reset",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      try {
        const resetRes = await authService.resetPassword({
          token: rawToken,
          password: "ValidNewP@ss123!",
        });

        expect(resetRes.ok).toBe(false);
        if (!resetRes.ok) {
          expect(resetRes.code).toBe("NO_NATIVE_PASSWORD");
        }
      } finally {
        await portalDb.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
        await portalDb.delete(users).where(eq(users.id, tempUserId));
      }
    });

    it("Stress 3.4: Expired reset token rejected", async () => {
      const rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      const tokenId = randomUUID();

      await portalDb.insert(passwordResetTokens).values({
        id: tokenId,
        userId: "01a1bc84-cbec-7a2c-9efe-3a3f55284113",
        tokenHash,
        purpose: "reset",
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 min ago
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      try {
        const resetRes = await authService.resetPassword({
          token: rawToken,
          password: "ValidNewP@ss123!",
        });

        expect(resetRes.ok).toBe(false);
        if (!resetRes.ok) {
          expect(resetRes.code).toBe("TOKEN_EXPIRED");
        }
      } finally {
        await portalDb.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
      }
    });

    it("Stress 3.5: Consumed token cannot be reused", async () => {
      const rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      const tokenId = randomUUID();

      await portalDb.insert(passwordResetTokens).values({
        id: tokenId,
        userId: "01a1bc84-cbec-7a2c-9efe-3a3f55284113",
        tokenHash,
        purpose: "reset",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        consumedAt: new Date(),
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      try {
        const resetRes = await authService.resetPassword({
          token: rawToken,
          password: "ValidNewP@ss123!",
        });

        expect(resetRes.ok).toBe(false);
        if (!resetRes.ok) {
          expect(resetRes.code).toBe("TOKEN_ALREADY_USED");
        }
      } finally {
        await portalDb.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
      }
    });

    it("Stress 3.6: Live reset writes Argon2id to cell and keeps NULL in db-portal", async () => {
      const testClientId = randomUUID();
      const testUserId = randomUUID();
      const testEmail = `adversarial.tenant.${Date.now()}@mocter.co`;
      const initialPassword = "InitialSecur3P@ss!";
      const initialHash = await hashPassword(initialPassword);

      // Provision user in db-portal without activeClientId first to satisfy foreign key
      await portalDb.insert(users).values({
        id: testUserId,
        email: testEmail,
        displayName: "Adversarial Test Merchant",
        status: "active",
        identityLocation: cellId,
        passwordHash: null,
        passwordUpdatedAt: null,
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      // Provision client referencing owner
      await portalDb.insert(clients).values({
        id: testClientId,
        slug: `adv-test-${Date.now()}`,
        displayName: "Adversarial Test Shop",
        contactEmail: testEmail,
        ownerUserId: testUserId,
        planId: "01a198ba-2bcf-76cd-ace2-6c6187cb0923",
        lifecycleStatus: "alta",
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      // Now set activeClientId on user
      await portalDb
        .update(users)
        .set({ activeClientId: testClientId })
        .where(eq(users.id, testUserId));

      await portalDb.insert(clientRouting).values({
        clientId: testClientId,
        cellId,
        routingStatus: "active",
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      // Materialize user in pg-cell-01 under RLS
      await withTenantCellTransaction(
        testClientId,
        async (tx) => {
          await tx.insert(cellUsers).values({
            id: testUserId,
            clientId: testClientId,
            email: testEmail,
            passwordHash: initialHash,
            passwordUpdatedAt: new Date(),
            status: "active",
            createdBy: "adversarial_test",
            updatedBy: "adversarial_test",
          });

          await tx.insert(cellTenantUsers).values({
            id: randomUUID(),
            clientId: testClientId,
            userId: testUserId,
            role: "tenant_owner",
            status: "active",
            createdBy: "adversarial_test",
            updatedBy: "adversarial_test",
          });
        },
        { cellId },
      );

      // Issue password reset token in db-portal
      const rawResetToken = randomUUID();
      const resetTokenHash = hashToken(rawResetToken);
      const tokenId = randomUUID();

      await portalDb.insert(passwordResetTokens).values({
        id: tokenId,
        userId: testUserId,
        tokenHash: resetTokenHash,
        purpose: "reset",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdBy: "adversarial_test",
        updatedBy: "adversarial_test",
      });

      const newTargetPassword = "NewCellP@ssw0rd2026!#$";

      try {
        const resetResult = await authService.resetPassword({
          token: rawResetToken,
          password: newTargetPassword,
        });

        expect(resetResult.ok).toBe(true);

        // Control plane assertions: password remains NULL
        const [pUserAfter] = await portalDb
          .select()
          .from(users)
          .where(eq(users.id, testUserId))
          .limit(1);

        expect(pUserAfter.passwordHash).toBeNull();
        expect(pUserAfter.passwordUpdatedAt).toBeNull();

        const [tokAfter] = await portalDb
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.id, tokenId))
          .limit(1);

        expect(tokAfter.consumedAt).not.toBeNull();

        // Cell data plane assertions: password hash is updated with Argon2id
        let newCellHash = "";
        await withTenantCellTransaction(
          testClientId,
          async (tx) => {
            const [cUserAfter] = await tx
              .select()
              .from(cellUsers)
              .where(eq(cellUsers.id, testUserId))
              .limit(1);

            expect(cUserAfter).toBeDefined();
            expect(cUserAfter.passwordHash).toBeDefined();
            expect(cUserAfter.passwordHash).not.toBe(initialHash);
            expect(cUserAfter.passwordHash?.startsWith("$argon2id$")).toBe(true);
            newCellHash = cUserAfter.passwordHash!;
          },
          { cellId },
        );

        // Verify cryptographic verification matches new password
        const verifyRes = await verifyPassword(newTargetPassword, newCellHash);
        expect(verifyRes).toBe(true);

        const oldVerifyRes = await verifyPassword(initialPassword, newCellHash);
        expect(oldVerifyRes).toBe(false);
      } finally {
        // Complete teardown of test fixtures
        try {
          await withTenantCellTransaction(
            testClientId,
            async (tx) => {
              await tx.delete(cellTenantUsers).where(eq(cellTenantUsers.clientId, testClientId));
              await tx.delete(cellUsers).where(eq(cellUsers.clientId, testClientId));
            },
            { cellId },
          );
        } catch (cleanupErr) {
          // ignore cleanup error
        }
        await portalDb.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
        await portalDb.update(users).set({ activeClientId: null }).where(eq(users.id, testUserId));
        await portalDb.delete(clientRouting).where(eq(clientRouting.clientId, testClientId));
        await portalDb.delete(clients).where(eq(clients.id, testClientId));
        await portalDb.delete(users).where(eq(users.id, testUserId));
      }
    }, 35000);
  });
});
