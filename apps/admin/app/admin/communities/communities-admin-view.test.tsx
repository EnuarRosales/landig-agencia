import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AdminCommunitiesOverviewDto } from "@mocter/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { CommunitiesAdminView } from "./communities-admin-view";

describe("SPEC-15 · CommunitiesAdminView (/admin/communities)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza solicitudes de líderes, KPIs y modal de confirmación sin diálogos nativos ni clase uppercase", () => {
    const overview: AdminCommunitiesOverviewDto = {
      authorizations: [
        {
          id: "auth-1",
          clientId: "22222222-2222-4222-8222-222222222222",
          clientName: "Textiles Medellín",
          clientSlug: "textiles-medellin",
          contactEmail: "hola@textiles.co",
          planName: "Plan Pro",
          status: "pending",
          maxOwnedCommunities: null,
          ownedCommunitiesCount: 0,
          proposedCommunityName: "Clúster Textil Antioquia",
          businessModel: "Distribución B2B para minoristas",
          reviewNotes: null,
          requestedAt: "2026-11-16T10:00:00.000Z",
          reviewedAt: null,
        },
      ],
      organizations: [],
      tenants: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          displayName: "Textiles Medellín",
          slug: "textiles-medellin",
          contactEmail: "hola@textiles.co",
          planName: "Plan Pro",
          leaderStatus: "pending",
        },
      ],
    };

    const { container } = render(
      <CommunitiesAdminView initialOverview={overview} locale="es" />,
    );

    expect(screen.getByText("Gobierno de Comunidades y Líderes")).toBeTruthy();
    expect(screen.getByText("Textiles Medellín")).toBeTruthy();
    expect(screen.getByText("Clúster Textil Antioquia")).toBeTruthy();
    expect(container.innerHTML).not.toContain("uppercase");

    // Abrir modal de aprobación
    const approveButtons = screen.getAllByText("Aprobar Líder");
    fireEvent.click(approveButtons[approveButtons.length - 1]!);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
