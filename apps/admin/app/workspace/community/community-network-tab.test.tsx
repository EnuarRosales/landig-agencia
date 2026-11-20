import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TenantCommunitiesOverviewDto } from "@mocter/domain";
import { CommunityNetworkTab } from "./community-network-tab";

describe("SPEC-15 T-12 · CommunityNetworkTab", () => {
  const overview: TenantCommunitiesOverviewDto = {
    leaderAuthorization: {
      status: "approved",
      maxOwnedCommunities: 3,
      ownedCommunitiesCount: 1,
      canCreateMoreCommunities: true,
      proposedCommunityName: null,
      businessModel: null,
      reviewNotes: null,
      requestedAt: "2026-11-18T09:00:00.000Z",
      reviewedAt: "2026-11-18T10:00:00.000Z",
    },
    myCommunities: [
      {
        id: "org-1",
        name: "Somi4030",
        slug: "somi4030",
        description: null,
        category: "Industrial",
        visibility: "private_invite",
        sharePolicy: "leaders_only",
        requireShareApproval: false,
        moderationMode: "pre",
        inviteCode: "MCT-4030",
        status: "active",
        originatorClientId: "client-leader",
        originatorName: "Synergia Market",
        myRole: "originator",
        membersCount: 1,
        sharesCount: 0,
        pendingRequestsCount: 0,
        pendingSharesCount: 0,
        pendingPostsCount: 0,
        joinedAt: "2026-11-18T10:00:00.000Z",
        members: [],
        joinRequests: [],
        invitations: [
          {
            id: "inv-1",
            organizationId: "org-1",
            organizationName: "Somi4030",
            organizationSlug: "somi4030",
            role: "member",
            email: "hola@vitality.co",
            targetClientId: "client-vitality",
            targetClientName: "Vitality Force",
            inviterName: "Synergia Market",
            status: "pending",
            expiresAt: "2026-11-26T10:00:00.000Z",
            createdAt: "2026-11-19T10:00:00.000Z",
          },
          {
            id: "inv-2",
            organizationId: "org-1",
            organizationName: "Somi4030",
            organizationSlug: "somi4030",
            role: "member",
            email: "otra@tienda.co",
            targetClientId: null,
            targetClientName: null,
            inviterName: "Synergia Market",
            status: "expired",
            expiresAt: "2026-11-10T10:00:00.000Z",
            createdAt: "2026-11-03T10:00:00.000Z",
          },
        ],
        promotions: [],
      },
    ],
    directoryCommunities: [],
    pendingInvitations: [],
    pendingPromotions: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra registro de invitaciones enviadas y permite reenviar notificación, conservar vigente y cancelar vía ConfirmationModal", async () => {
    const onSuccessToast = vi.fn();
    const onErrorToast = vi.fn();
    const onDataMutated = vi.fn().mockResolvedValue(undefined);

    globalThis.fetch = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/invite")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: { invitationId: "inv-1", reusedExisting: true },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/resend")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: { invitationId: "inv-1", resentAt: "2026-11-20T00:00:00.000Z" } }),
            { status: 200 },
          ),
        );
      }
      if (init?.method === "DELETE") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: { invitationId: "inv-1", status: "revoked" } }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    render(
      <CommunityNetworkTab
        overview={overview}
        locale="es"
        isOwner={true}
        onSuccessToast={onSuccessToast}
        onErrorToast={onErrorToast}
        onDataMutated={onDataMutated}
      />,
    );

    expect(screen.getByText(/Invitaciones Enviadas \(2\)/)).toBeTruthy();
    expect(screen.getByText("Vitality Force (hola@vitality.co)")).toBeTruthy();
    expect(screen.getByText("Expirada")).toBeTruthy();

    // Reenviar notificación de la pendiente vigente
    fireEvent.click(screen.getByText("Reenviar Notificación"));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/tenant/community/invitations/inv-1/resend",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onSuccessToast).toHaveBeenCalledWith("Notificación de invitación reenviada.");
    });

    // Invitar de nuevo a comercio vigente muestra toast de conservación sin duplicar
    fireEvent.change(screen.getByPlaceholderText("Slug del comercio o correo electrónico"), {
      target: { value: "vitality-force" },
    });
    fireEvent.click(screen.getByText("Enviar Invitación"));
    await waitFor(() => {
      expect(onSuccessToast).toHaveBeenCalledWith(
        "Este comercio ya tiene una invitación vigente; se conservó la activa.",
      );
    });

    // Cancelar invitación vía modal de confirmación (Zero Native Dialogs)
    fireEvent.click(screen.getByText("Cancelar Invitación"));
    expect(screen.getAllByText("Cancelar Invitación Enviada").length).toBeGreaterThan(0);
    const confirmButtons = screen.getAllByRole("button", { name: "Cancelar Invitación" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/tenant/community/invitations/inv-1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(onSuccessToast).toHaveBeenCalledWith("Invitación cancelada correctamente.");
    });
  });
});
