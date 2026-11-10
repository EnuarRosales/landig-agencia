"use client";

import React, { useState } from "react";
import { Users, Plus, Mail, Phone, X, AlertCircle } from "lucide-react";
import type { WorkspaceContactDto } from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";

interface ContactsViewProps {
  initialContacts: WorkspaceContactDto[];
}

export function ContactsView({ initialContacts }: ContactsViewProps) {
  const [contacts, setContacts] = useState<WorkspaceContactDto[]>(initialContacts);
  const [modalOpen, setModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneMobile, setPhoneMobile] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setFormError("El Nombre Completo es obligatorio.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await workspaceFetch<WorkspaceContactDto>("/api/tenant/contacts", {
        method: "POST",
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || null,
          phoneMobile: phoneMobile.trim() || null,
          documentNumber: documentNumber.trim() || null,
        }),
      });

      if (!res.ok || !res.data) {
        setFormError(res.error || "Error al registrar el contacto.");
        return;
      }

      setContacts((prev) => [res.data!, ...prev]);
      setModalOpen(false);
      setFullName("");
      setEmail("");
      setPhoneMobile("");
      setDocumentNumber("");
    } catch {
      setFormError("Error inesperado al conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Contactos Y Clientes CRM
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/20">
              CRM Celular
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gestión de prospectos, clientes capturados por el asistente y seguimiento comercial.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span>Registrar Nuevo Contacto</span>
        </button>
      </header>

      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Directorio De Contactos
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {contacts.length} {contacts.length === 1 ? "contacto" : "contactos"}
          </span>
        </div>

        {contacts.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No Hay Contactos Registrados
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Los prospectos que conversen con tu bot o los que agregues manualmente aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre Del Contacto</th>
                  <th className="px-4 py-3 font-medium">Correo Electrónico</th>
                  <th className="px-4 py-3 font-medium">Teléfono Móvil</th>
                  <th className="px-4 py-3 font-medium">Etapa</th>
                  <th className="px-4 py-3 font-medium">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors">
                    <td className="px-4 py-3 font-semibold">{c.fullName}</td>
                    <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                      {c.email || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                      {c.phoneMobile || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400 border border-cyan-500/20 capitalize">
                        {c.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                      {c.documentNumber || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de Creación */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)]">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Registrar Nuevo Contacto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateContact} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@ejemplo.com"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                  Teléfono Móvil
                </label>
                <input
                  type="tel"
                  value={phoneMobile}
                  onChange={(e) => setPhoneMobile(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs font-mono text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                  Número De Documento
                </label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="10203040"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs font-mono text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--dsn-border)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[var(--dsn-border)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar Contacto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

