"use client";

import React, { useState } from "react";

export interface CrmContactItem {
  id: string;
  fullName: string;
  email: string | null;
  phoneMobile: string | null;
  documentType: "CC" | "NIT" | "CE" | "PASSPORT" | "other" | null;
  documentNumber: string | null;
  stage: "new" | "in_conversation" | "qualified" | "customer" | "discarded";
  source: string;
  channel: string | null;
  chatwootContactId: number | null;
  notes: string | null;
  lastSeenAt: string;
  consentStatus: "granted" | "pending" | "revoked";
  hasCommercialConsent: boolean;
  policyVersion: string;
}

export interface CrmQualityMetricsData {
  totalContacts: number;
  accuracyRate: number;
  uniquenessRate: number;
  completenessRate: number;
  recencyRate: number;
  consentRate: number;
}

export interface ContactsDashboardProps {
  initialContacts: CrmContactItem[];
  initialMetrics: CrmQualityMetricsData;
  t?: Partial<Record<string, string>>;
  onCreateContact?: (input: {
    fullName: string;
    email?: string;
    phoneMobile?: string;
    documentType?: "CC" | "NIT" | "CE" | "PASSPORT" | "other";
    documentNumber?: string;
    stage?: "new" | "in_conversation" | "qualified" | "customer" | "discarded";
    source?: string;
    notes?: string;
  }) => Promise<boolean>;
  onUpdateContact?: (id: string, patch: Partial<CrmContactItem>) => Promise<boolean>;
  onAnonymizeContact?: (id: string) => Promise<boolean>;
  onRevokeConsent?: (id: string) => Promise<boolean>;
  onGrantConsent?: (id: string, purpose: "data_treatment" | "commercial_comms") => Promise<boolean>;
}

const defaultTranslations: Record<string, string> = {
  title: "Maestro De Prospectos Y Contactos",
  subtitle: "Gestión comercial, calidad de datos CRM y cumplimiento estricto de Habeas Data",
  kpiAccuracy: "Exactitud De Datos",
  kpiUniqueness: "Unicidad",
  kpiCompleteness: "Completitud Mínima",
  kpiRecency: "Actualidad (90 Días)",
  kpiConsent: "Consentimiento Comercial",
  searchPlaceholder: "Buscar por nombre, teléfono o correo...",
  filterAllStages: "Todas Las Etapas",
  stageNew: "Nuevo",
  stageInConversation: "En Conversación",
  stageQualified: "Calificado",
  stageCustomer: "Cliente",
  stageDiscarded: "Descartado",
  newContactButton: "Nuevo Prospecto",
  tableContact: "Contacto",
  tableStage: "Etapa",
  tableChannel: "Canal",
  tableConsent: "Habeas Data",
  tableLastSeen: "Última Actividad",
  tableActions: "Acciones",
  consentGranted: "Otorgado",
  consentPending: "Pendiente",
  consentRevoked: "Revocado",
  modalNewTitle: "Alta Manual De Prospecto",
  modalEditTitle: "Editar Datos Del Prospecto",
  modalConsentTitle: "Historial De Consentimientos Habeas Data",
  labelFullName: "Nombre Completo O Razón Social",
  labelEmail: "Correo Electrónico Corporativo",
  labelPhoneMobile: "Teléfono Móvil (Formato E.164)",
  labelDocumentType: "Tipo De Documento",
  labelDocumentNumber: "Número De Documento",
  labelStage: "Etapa Del Embudo Comercial",
  labelSource: "Canal De Adquisición",
  labelNotes: "Notas Comerciales",
  saveButton: "Guardar Prospecto",
  cancelButton: "Cancelar",
  closeButton: "Cerrar",
  revokeConsentButton: "Revocar Consentimiento",
  grantConsentButton: "Registrar Otorgamiento",
  anonymizeButton: "Suprimir Y Anonimizar",
  confirmAnonymizeTitle: "Confirmar Supresión Irreversible",
  confirmAnonymizeDesc: "¿Deseas anonimizar irreversiblemente este contacto conforme al derecho de supresión de la Ley 1581?",
  confirmAnonymizeAction: "Confirmar Anonimización",
  emptyState: "No se encontraron prospectos registrados con los filtros seleccionados.",
};

export function ContactsDashboard({
  initialContacts,
  initialMetrics,
  t = {},
  onCreateContact,
  onUpdateContact,
  onAnonymizeContact,
  onRevokeConsent,
  onGrantConsent,
}: ContactsDashboardProps) {
  const i18n = { ...defaultTranslations, ...t };

  const [contacts, setContacts] = useState<CrmContactItem[]>(initialContacts);
  const [metrics] = useState<CrmQualityMetricsData>(initialMetrics);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");

  // Modales
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CrmContactItem | null>(null);
  const [consentModalContact, setConsentModalContact] = useState<CrmContactItem | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<CrmContactItem | null>(null);

  // Form State para Nuevo Prospecto
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDocType, setNewDocType] = useState<"CC" | "NIT" | "CE" | "PASSPORT" | "other">("CC");
  const [newDocNumber, setNewDocNumber] = useState("");
  const [newStage, setNewStage] = useState<"new" | "in_conversation" | "qualified" | "customer" | "discarded">("new");
  const [newSource, setNewSource] = useState("manual");
  const [newNotes, setNewNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filteredContacts = contacts.filter((c) => {
    const matchesQuery =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.phoneMobile && c.phoneMobile.includes(searchQuery));
    const matchesStage = selectedStage === "all" || c.stage === selectedStage;
    return matchesQuery && matchesStage;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim().length < 2) {
      setFormError("El nombre completo debe tener al menos 2 caracteres.");
      return;
    }
    if (!newEmail.trim() && !newPhone.trim()) {
      setFormError("Se requiere al menos un canal de contacto (teléfono o correo).");
      return;
    }

    setFormError(null);
    const newContactObj: CrmContactItem = {
      id: `client-created-${Date.now()}`,
      fullName: newName.trim(),
      email: newEmail.trim() || null,
      phoneMobile: newPhone.trim() || null,
      documentType: newDocNumber ? newDocType : null,
      documentNumber: newDocNumber.trim() || null,
      stage: newStage,
      source: newSource,
      channel: newSource,
      chatwootContactId: null,
      notes: newNotes.trim() || null,
      lastSeenAt: new Date().toISOString(),
      consentStatus: "pending",
      hasCommercialConsent: false,
      policyVersion: "1.0.0",
    };

    if (onCreateContact) {
      await onCreateContact({
        fullName: newContactObj.fullName,
        email: newContactObj.email ?? undefined,
        phoneMobile: newContactObj.phoneMobile ?? undefined,
        documentType: newContactObj.documentType ?? undefined,
        documentNumber: newContactObj.documentNumber ?? undefined,
        stage: newContactObj.stage,
        source: newContactObj.source,
        notes: newContactObj.notes ?? undefined,
      });
    }

    setContacts((prev) => [newContactObj, ...prev]);
    setIsNewModalOpen(false);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewDocNumber("");
    setNewNotes("");
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;

    if (onUpdateContact) {
      await onUpdateContact(editingContact.id, editingContact);
    }

    setContacts((prev) =>
      prev.map((c) => (c.id === editingContact.id ? editingContact : c)),
    );
    setEditingContact(null);
  };

  const handleConfirmAnonymize = async () => {
    if (!anonymizeTarget) return;

    if (onAnonymizeContact) {
      await onAnonymizeContact(anonymizeTarget.id);
    }

    setContacts((prev) =>
      prev.map((c) =>
        c.id === anonymizeTarget.id
          ? {
              ...c,
              fullName: `anon_${c.id.slice(0, 8)}`,
              email: null,
              phoneMobile: null,
              documentNumber: null,
              notes: null,
            }
          : c,
      ),
    );
    setAnonymizeTarget(null);
  };

  const handleRevokeConsent = async (contactId: string) => {
    if (onRevokeConsent) {
      await onRevokeConsent(contactId);
    }
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, consentStatus: "revoked", hasCommercialConsent: false }
          : c,
      ),
    );
    if (consentModalContact && consentModalContact.id === contactId) {
      setConsentModalContact((prev) =>
        prev ? { ...prev, consentStatus: "revoked", hasCommercialConsent: false } : null,
      );
    }
  };

  const handleGrantConsent = async (contactId: string, purpose: "data_treatment" | "commercial_comms") => {
    if (onGrantConsent) {
      await onGrantConsent(contactId, purpose);
    }
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? {
              ...c,
              consentStatus: "granted",
              hasCommercialConsent: purpose === "commercial_comms" ? true : c.hasCommercialConsent,
            }
          : c,
      ),
    );
    if (consentModalContact && consentModalContact.id === contactId) {
      setConsentModalContact((prev) =>
        prev
          ? {
              ...prev,
              consentStatus: "granted",
              hasCommercialConsent: purpose === "commercial_comms" ? true : prev.hasCommercialConsent,
            }
          : null,
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
            {i18n.title}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{i18n.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition-colors"
        >
          {i18n.newContactButton}
        </button>
      </div>

      {/* KPI Cards (Calidad de datos RF-05.1) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs text-zinc-400 font-mono">{i18n.kpiAccuracy}</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {metrics.accuracyRate}%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs text-zinc-400 font-mono">{i18n.kpiUniqueness}</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {metrics.uniquenessRate}%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs text-zinc-400 font-mono">{i18n.kpiCompleteness}</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {metrics.completenessRate}%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-xs text-zinc-400 font-mono">{i18n.kpiRecency}</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1 font-mono">
            {metrics.recencyRate}%
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-zinc-400 font-mono">{i18n.kpiConsent}</p>
          <p className="text-2xl font-bold text-amber-400 mt-1 font-mono">
            {metrics.consentRate}%
          </p>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder={i18n.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="stage-filter-select" className="text-xs text-zinc-400 font-medium">
            {i18n.labelStage}:
          </label>
          <select
            id="stage-filter-select"
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">{i18n.filterAllStages}</option>
            <option value="new">{i18n.stageNew}</option>
            <option value="in_conversation">{i18n.stageInConversation}</option>
            <option value="qualified">{i18n.stageQualified}</option>
            <option value="customer">{i18n.stageCustomer}</option>
            <option value="discarded">{i18n.stageDiscarded}</option>
          </select>
        </div>
      </div>

      {/* Table of Contacts */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 uppercase font-mono">
            <tr>
              <th className="px-4 py-3">{i18n.tableContact}</th>
              <th className="px-4 py-3">{i18n.tableStage}</th>
              <th className="px-4 py-3">{i18n.tableChannel}</th>
              <th className="px-4 py-3">{i18n.tableConsent}</th>
              <th className="px-4 py-3">{i18n.tableLastSeen}</th>
              <th className="px-4 py-3 text-right">{i18n.tableActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono">
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  {i18n.emptyState}
                </td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{contact.fullName}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-zinc-400 mt-0.5">
                      {contact.phoneMobile && <span>{contact.phoneMobile}</span>}
                      {contact.email && <span>{contact.email}</span>}
                      {contact.documentNumber && (
                        <span className="text-zinc-500">
                          {contact.documentType}: {contact.documentNumber}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        contact.stage === "customer"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : contact.stage === "qualified"
                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            : contact.stage === "in_conversation"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              : contact.stage === "discarded"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                      }`}
                    >
                      {contact.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {contact.channel || contact.source}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setConsentModalContact(contact)}
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors ${
                        contact.consentStatus === "granted"
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : contact.consentStatus === "revoked"
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      }`}
                    >
                      {contact.consentStatus === "granted"
                        ? i18n.consentGranted
                        : contact.consentStatus === "revoked"
                          ? i18n.consentRevoked
                          : i18n.consentPending}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(contact.lastSeenAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingContact({ ...contact })}
                        className="text-xs text-zinc-300 hover:text-white px-2 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800"
                      >
                        {i18n.modalEditTitle}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnonymizeTarget(contact)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-900/40"
                      >
                        {i18n.anonymizeButton}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Alta Manual (Title Case en Labels) */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white font-mono">{i18n.modalNewTitle}</h2>
            {formError && (
              <p className="mt-2 text-xs text-red-400 bg-red-950/50 p-2 rounded border border-red-900/50 font-mono">
                {formError}
              </p>
            )}
            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3 font-mono text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelFullName} *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelPhoneMobile}
                  </label>
                  <input
                    type="text"
                    placeholder="+573001234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelEmail}
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelDocumentType}
                  </label>
                  <select
                    value={newDocType}
                    onChange={(e) =>
                      setNewDocType(
                        e.target.value as "CC" | "NIT" | "CE" | "PASSPORT" | "other",
                      )
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="CC">Cédula De Ciudadanía</option>
                    <option value="NIT">NIT</option>
                    <option value="CE">Cédula De Extranjería</option>
                    <option value="PASSPORT">Pasaporte</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelDocumentNumber}
                  </label>
                  <input
                    type="text"
                    value={newDocNumber}
                    onChange={(e) => setNewDocNumber(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelStage}
                  </label>
                  <select
                    value={newStage}
                    onChange={(e) =>
                      setNewStage(
                        e.target.value as
                          | "new"
                          | "in_conversation"
                          | "qualified"
                          | "customer"
                          | "discarded",
                      )
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="new">{i18n.stageNew}</option>
                    <option value="in_conversation">{i18n.stageInConversation}</option>
                    <option value="qualified">{i18n.stageQualified}</option>
                    <option value="customer">{i18n.stageCustomer}</option>
                    <option value="discarded">{i18n.stageDiscarded}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelSource}
                  </label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="manual">Alta Manual</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web">Formulario Web</option>
                    <option value="referral">Referido</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelNotes}
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {i18n.cancelButton}
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {i18n.saveButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edición de Prospecto */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white font-mono">{i18n.modalEditTitle}</h2>
            <form onSubmit={handleUpdateSubmit} className="mt-4 space-y-3 font-mono text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelFullName} *
                </label>
                <input
                  type="text"
                  required
                  value={editingContact.fullName}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, fullName: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelPhoneMobile}
                  </label>
                  <input
                    type="text"
                    value={editingContact.phoneMobile || ""}
                    onChange={(e) =>
                      setEditingContact({ ...editingContact, phoneMobile: e.target.value || null })
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    {i18n.labelEmail}
                  </label>
                  <input
                    type="email"
                    value={editingContact.email || ""}
                    onChange={(e) =>
                      setEditingContact({ ...editingContact, email: e.target.value || null })
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelStage}
                </label>
                <select
                  value={editingContact.stage}
                  onChange={(e) =>
                    setEditingContact({
                      ...editingContact,
                      stage: e.target.value as CrmContactItem["stage"],
                    })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="new">{i18n.stageNew}</option>
                  <option value="in_conversation">{i18n.stageInConversation}</option>
                  <option value="qualified">{i18n.stageQualified}</option>
                  <option value="customer">{i18n.stageCustomer}</option>
                  <option value="discarded">{i18n.stageDiscarded}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelNotes}
                </label>
                <textarea
                  rows={2}
                  value={editingContact.notes || ""}
                  onChange={(e) =>
                    setEditingContact({ ...editingContact, notes: e.target.value || null })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingContact(null)}
                  className="rounded px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {i18n.cancelButton}
                </button>
                <button
                  type="submit"
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  {i18n.saveButton}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gestión de Consentimientos Habeas Data */}
      {consentModalContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white font-mono">{i18n.modalConsentTitle}</h2>
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              Titular: <span className="text-white font-semibold">{consentModalContact.fullName}</span> (Versión política: {consentModalContact.policyVersion})
            </p>

            <div className="mt-4 space-y-3 font-mono text-xs">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200">Tratamiento De Datos (data_treatment)</span>
                  <span
                    className={`rounded px-2 py-0.5 ${
                      consentModalContact.consentStatus === "granted"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {consentModalContact.consentStatus}
                  </span>
                </div>
                <p className="text-zinc-500 text-[11px] mt-1">
                  Incluye Chatwoot como encargado del tratamiento.
                </p>
              </div>

              <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200">Comunicaciones Comerciales (commercial_comms)</span>
                  <span
                    className={`rounded px-2 py-0.5 ${
                      consentModalContact.hasCommercialConsent
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {consentModalContact.hasCommercialConsent ? "Otorgado" : "No Otorgado"}
                  </span>
                </div>
                <p className="text-zinc-500 text-[11px] mt-1">
                  Autorización expresa requerida antes de enviar promociones o catálogos.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-2 pt-2">
              <div className="flex gap-2">
                {consentModalContact.consentStatus === "granted" ? (
                  <button
                    type="button"
                    onClick={() => handleRevokeConsent(consentModalContact.id)}
                    className="rounded bg-red-950/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900 border border-red-800/60"
                  >
                    {i18n.revokeConsentButton}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGrantConsent(consentModalContact.id, "commercial_comms")}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    {i18n.grantConsentButton}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setConsentModalContact(null)}
                className="rounded px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {i18n.closeButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Supresión / Anonimización Irreversible */}
      {anonymizeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-900/60 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-red-400 font-mono">
              {i18n.confirmAnonymizeTitle}
            </h2>
            <p className="text-xs text-zinc-300 mt-2 font-mono leading-relaxed">
              {i18n.confirmAnonymizeDesc}
            </p>
            <p className="text-xs text-zinc-500 mt-2 font-mono">
              Contacto: <span className="text-zinc-300">{anonymizeTarget.fullName}</span> ({anonymizeTarget.id})
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAnonymizeTarget(null)}
                className="rounded px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {i18n.cancelButton}
              </button>
              <button
                type="button"
                onClick={handleConfirmAnonymize}
                className="rounded bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
              >
                {i18n.confirmAnonymizeAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
