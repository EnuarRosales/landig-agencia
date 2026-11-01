// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  ContactsDashboard,
  type CrmContactItem,
  type CrmQualityMetricsData,
} from "./contacts-dashboard";

describe("CRM-001 T-09 · ContactsDashboard Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockMetrics: CrmQualityMetricsData = {
    totalContacts: 50,
    accuracyRate: 98,
    uniquenessRate: 96,
    completenessRate: 94,
    recencyRate: 88,
    consentRate: 80,
  };

  const mockContacts: CrmContactItem[] = [
    {
      id: "contact-1",
      fullName: "Comercializadora Andina SAS",
      email: "contacto@andina.com",
      phoneMobile: "+573001234567",
      documentType: "NIT",
      documentNumber: "900123456-1",
      stage: "qualified",
      source: "whatsapp",
      channel: "whatsapp",
      chatwootContactId: 101,
      notes: "Interesado en catálogo masivo",
      lastSeenAt: "2026-10-28T10:00:00.000Z",
      consentStatus: "granted",
      hasCommercialConsent: true,
      policyVersion: "1.0.0",
    },
    {
      id: "contact-2",
      fullName: "Felipe Restrepo",
      email: "felipe@gmail.com",
      phoneMobile: "+573109876543",
      documentType: "CC",
      documentNumber: "10203040",
      stage: "new",
      source: "web",
      channel: "web",
      chatwootContactId: null,
      notes: null,
      lastSeenAt: "2026-10-30T14:30:00.000Z",
      consentStatus: "pending",
      hasCommercialConsent: false,
      policyVersion: "1.0.0",
    },
  ];

  it("renderiza los 5 KPIs de calidad de datos CRM", () => {
    render(
      <ContactsDashboard
        initialContacts={mockContacts}
        initialMetrics={mockMetrics}
      />,
    );

    expect(screen.getByText("Maestro De Prospectos Y Contactos")).toBeDefined();
    expect(screen.getByText("98%")).toBeDefined(); // accuracy
    expect(screen.getByText("96%")).toBeDefined(); // uniqueness
    expect(screen.getByText("94%")).toBeDefined(); // completeness
    expect(screen.getByText("88%")).toBeDefined(); // recency
    expect(screen.getByText("80%")).toBeDefined(); // consent
  });

  it("filtra contactos reactivamente por texto en la barra de búsqueda", () => {
    render(
      <ContactsDashboard
        initialContacts={mockContacts}
        initialMetrics={mockMetrics}
      />,
    );

    expect(screen.getByText("Comercializadora Andina SAS")).toBeDefined();
    expect(screen.getByText("Felipe Restrepo")).toBeDefined();

    const searchInput = screen.getByPlaceholderText("Buscar por nombre, teléfono o correo...");
    fireEvent.change(searchInput, { target: { value: "Andina" } });

    expect(screen.getByText("Comercializadora Andina SAS")).toBeDefined();
    expect(screen.queryByText("Felipe Restrepo")).toBeNull();
  });

  it("abre el modal de Alta Manual con labels en Title Case estricto y registra nuevo prospecto", async () => {
    const handleCreate = vi.fn().mockResolvedValue(true);
    render(
      <ContactsDashboard
        initialContacts={mockContacts}
        initialMetrics={mockMetrics}
        onCreateContact={handleCreate}
      />,
    );

    const openButton = screen.getByRole("button", { name: "Nuevo Prospecto" });
    fireEvent.click(openButton);

    expect(screen.getByText("Alta Manual De Prospecto")).toBeDefined();
    // Labels en Title Case estricto (Regla 4.8)
    expect(screen.getByText(/Nombre Completo O Razón Social/)).toBeDefined();
    expect(screen.getByText(/Teléfono Móvil \(Formato E\.164\)/)).toBeDefined();
    expect(screen.getByText(/Correo Electrónico Corporativo/)).toBeDefined();

    const nameInputs = screen.getAllByRole("textbox");
    const fullNameInput = nameInputs[1]; // 0 is search bar, 1 is name
    const phoneInput = screen.getByPlaceholderText("+573001234567");

    fireEvent.change(fullNameInput!, { target: { value: "Distribuidora El Triunfo" } });
    fireEvent.change(phoneInput, { target: { value: "+573155554433" } });

    const submitButton = screen.getByRole("button", { name: "Guardar Prospecto" });
    fireEvent.click(submitButton);

    expect(handleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Distribuidora El Triunfo",
        phoneMobile: "+573155554433",
      }),
    );
  });

  it("abre el modal de consentimientos Habeas Data y permite revocar", async () => {
    const handleRevoke = vi.fn().mockResolvedValue(true);
    render(
      <ContactsDashboard
        initialContacts={mockContacts}
        initialMetrics={mockMetrics}
        onRevokeConsent={handleRevoke}
      />,
    );

    // Clic en el botón de estado de consentimiento del primer contacto
    const consentButtons = screen.getAllByText("Otorgado");
    fireEvent.click(consentButtons[0]!);

    expect(screen.getByText("Historial De Consentimientos Habeas Data")).toBeDefined();
    expect(screen.getByText(/Tratamiento De Datos/)).toBeDefined();

    const revokeButton = screen.getByRole("button", { name: "Revocar Consentimiento" });
    fireEvent.click(revokeButton);

    expect(handleRevoke).toHaveBeenCalledWith("contact-1");
  });

  it("abre modal de confirmación y ejecuta supresión con anonimización irreversible", async () => {
    const handleAnonymize = vi.fn().mockResolvedValue(true);
    render(
      <ContactsDashboard
        initialContacts={mockContacts}
        initialMetrics={mockMetrics}
        onAnonymizeContact={handleAnonymize}
      />,
    );

    const anonymizeButtons = screen.getAllByRole("button", { name: "Suprimir Y Anonimizar" });
    fireEvent.click(anonymizeButtons[0]!);

    expect(screen.getByText("Confirmar Supresión Irreversible")).toBeDefined();

    const confirmAction = screen.getByRole("button", { name: "Confirmar Anonimización" });
    await fireEvent.click(confirmAction);

    expect(handleAnonymize).toHaveBeenCalledWith("contact-1");
    // El nombre cambia a formato anónimo anon_xxxx
    expect(await screen.findByText(/^anon_contact-/)).toBeDefined();
  });
});
