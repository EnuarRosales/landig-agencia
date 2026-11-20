import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TenantCommunitiesOverviewDto } from "@mocter/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CommunityView } from "./community-view";

describe("SPEC-15 · CommunityView (/workspace/community)", () => {
  const sampleOverview: TenantCommunitiesOverviewDto = {
    leaderAuthorization: {
      status: "approved",
      maxOwnedCommunities: 3,
      ownedCommunitiesCount: 1,
      canCreateMoreCommunities: true,
      proposedCommunityName: "Red Mayorista Sur",
      businessModel: "Red de distribuidores de moda",
      reviewNotes: null,
      requestedAt: "2026-11-15T10:00:00.000Z",
      reviewedAt: "2026-11-16T10:00:00.000Z",
    },
    myCommunities: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Red Mayorista Sur",
        slug: "red-mayorista-sur",
        description: "Distribución oficial",
        category: "Moda",
        visibility: "request_to_join",
        sharePolicy: "leaders_only",
        requireShareApproval: true,
        moderationMode: "pre",
        inviteCode: "SUR2026",
        status: "active",
        originatorClientId: "11111111-1111-4111-8111-111111111111",
        originatorName: "Tienda Fundadora",
        myRole: "member",
        membersCount: 4,
        sharesCount: 1,
        pendingRequestsCount: 0,
        pendingSharesCount: 0,
        pendingPostsCount: 0,
        joinedAt: "2026-11-16T10:00:00.000Z",
        members: [],
        joinRequests: [],
        invitations: [],
        promotions: [],
      },
    ],
    directoryCommunities: [],
    pendingInvitations: [],
    pendingPromotions: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/tenant/community/feed")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                items: [
                  {
                    shareId: "44444444-4444-4444-8444-444444444444",
                    organizationId: "33333333-3333-4333-8333-333333333333",
                    organizationName: "Red Mayorista Sur",
                    sharerClientId: "11111111-1111-4111-8111-111111111111",
                    sharerDisplayName: "Tienda Fundadora",
                    sourceProductId: "66666666-6666-4666-8666-666666666666",
                    currentVersion: 1,
                    latestChangelog: "Lanzamiento",
                    status: "active",
                    moderationStatus: "approved",
                    rejectionReason: null,
                    name: "Chaqueta Impermeable",
                    description: "Chaqueta ligera resistente al agua",
                    sku: "CHQ-100",
                    kind: "physical",
                    compositionType: "simple",
                    category: "Moda",
                    brand: "Nord",
                    currency: "COP",
                    wholesaleCostCents: 9000000,
                    suggestedPriceCents: 15000000,
                    minResalePriceCents: 13000000,
                    suggestedMarginPercent: 40,
                    referenceStock: 25,
                    coverImageUrl: null,
                    mediaPreviewUrls: [],
                    mediaCounts: { image: 1, video: 0, audio: 0, pdf: 0 },
                    attributesCount: 1,
                    comboComponents: [],
                    botMasterPromptPreview: "",
                    adoptionsCount: 2,
                    isOwnShare: false,
                    alreadyAdopted: false,
                    adoptionId: null,
                    adoptedVersion: null,
                    hasUpdateAvailable: false,
                    publishedAt: "2026-11-16T10:00:00.000Z",
                    updatedAt: "2026-11-16T10:00:00.000Z",
                  },
                ],
                pendingModerationItems: [],
                categories: ["Moda"],
                total: 1,
                page: 1,
                limit: 12,
                totalPages: 1,
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/tenant/community/adoptions")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, data: sampleOverview }), { status: 200 }),
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra puerta de actualización de plan cuando community_feed no está habilitado", () => {
    const { container } = render(
      <CommunityView
        initialOverview={null}
        capabilityEnabled={false}
        isOwner={true}
        locale="es"
      />,
    );

    expect(screen.getByText("Comunidad de Comercios no Incluida en Tu Plan")).toBeTruthy();
    expect(screen.getByText("Revisar Mi Plan").closest("a")?.getAttribute("href")).toBe(
      "/workspace/billing",
    );
    expect(container.textContent).not.toMatch(/SPEC-\d+|ADM-\d+|RF-\d+/);
  });

  it("renderiza catálogo compartido para tenant_owner, abre modal de clonación y no expone códigos de spec", async () => {
    const { container } = render(
      <CommunityView
        initialOverview={sampleOverview}
        capabilityEnabled={true}
        isOwner={true}
        locale="es"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Chaqueta Impermeable")).toBeTruthy();
    });

    const cloneBtn = screen.getByText("Clonar a Mi Catálogo");
    fireEvent.click(cloneBtn);

    expect(screen.getByText("Clonar Producto a Tu Catálogo")).toBeTruthy();
    expect(container.innerHTML).not.toContain("uppercase");
    expect(container.textContent).not.toMatch(/SPEC-\d+|ADM-\d+|RF-\d+/);
  });

  it("muestra aviso de solo lectura para tenant_agent y oculta botones mutantes", async () => {
    render(
      <CommunityView
        initialOverview={sampleOverview}
        capabilityEnabled={true}
        isOwner={false}
        locale="es"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Chaqueta Impermeable")).toBeTruthy();
    });

    expect(
      screen.getByText(/Modo lectura operativa:/),
    ).toBeTruthy();
    expect(screen.queryByText("Clonar a Mi Catálogo")).toBeNull();
  });

  it("T-13 · muestra alerta explícita con la variable de cuota excedida y cierra el modal automáticamente al clonar con éxito", async () => {
    const baseFeedFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const previousImpl = baseFeedFetch.getMockImplementation();

    let blockByMedia = true;
    globalThis.fetch = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/adopt") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                allowed: !blockByMedia,
                includeMediaMode: blockByMedia ? "all_compatible" : "none",
                violations: blockByMedia
                  ? [
                      {
                        dimension: "images_per_product",
                        currentUsed: 0,
                        requiredDelta: 3,
                        projectedTotal: 3,
                        limitValue: 1,
                      },
                    ]
                  : [],
                summary: {
                  productsUsed: 0,
                  productsNeeded: 1,
                  productsLimit: 1,
                  storageUsedBytes: 0,
                  storageNeededBytes: blockByMedia ? 250000 : 0,
                  storageLimitBytes: 104857600,
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/adopt") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                adoptionId: "adopt-1",
                cloneProductId: "clone-1",
                cloneCellId: "cell-01",
                createdProductsCount: 1,
                copiedMediaCount: 0,
                skippedMedia: [],
                version: 1,
              },
            }),
            { status: 201 },
          ),
        );
      }
      return previousImpl ? previousImpl(input, init) : Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof fetch;

    render(
      <CommunityView
        initialOverview={sampleOverview}
        capabilityEnabled={true}
        isOwner={true}
        locale="es"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Chaqueta Impermeable")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Clonar a Mi Catálogo"));

    await waitFor(() => {
      expect(screen.getByText("Límite de Plan Alcanzado")).toBeTruthy();
      expect(screen.getByText(/Imágenes por Producto \(images_per_product\)/)).toBeTruthy();
    });

    // Cambiar a Sin Archivos Multimedia libera el bloqueo y permite clonar + cerrar modal automáticamente
    blockByMedia = false;
    const mediaSelect = screen.getByDisplayValue("Toda la Multimedia Compatible");
    fireEvent.change(mediaSelect, { target: { value: "none" } });

    await waitFor(() => {
      expect(screen.queryByText("Límite de Plan Alcanzado")).toBeNull();
    });

    fireEvent.click(screen.getByText("Clonar Producto Ahora"));

    await waitFor(() => {
      expect(screen.queryByText("Clonar Producto a Tu Catálogo")).toBeNull();
    });
  });
});
