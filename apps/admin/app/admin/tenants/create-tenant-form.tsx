"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface CreateTenantFormProps {
  availablePlans: Array<{ id: string; code: string; name: string }>;
  availableCells: Array<{ id: string; code: string; currentClients: number; maxClients: number }>;
  onSuccess?: () => void;
}

/**
 * Formulario interactivo para aprovisionamiento manual de inquilinos y comercios (ADM-001 §6.3, T-06).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function CreateTenantForm({ availablePlans, availableCells, onSuccess }: CreateTenantFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    displayName: "",
    slug: "",
    ownerEmail: "",
    ownerDisplayName: "",
    phone: "",
    planId: availablePlans[0]?.id || "",
    cellId: availableCells[0]?.id || "",
    locale: "es",
  });

  function handleNameChange(val: string) {
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    setFormData((prev) => ({
      ...prev,
      displayName: val,
      slug: prev.slug === "" || prev.slug === generatedSlug.slice(0, -1) ? generatedSlug : prev.slug,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al aprovisionar el inquilino");
      }

      setSuccess(true);
      setFormData({
        displayName: "",
        slug: "",
        ownerEmail: "",
        ownerDisplayName: "",
        phone: "",
        planId: availablePlans[0]?.id || "",
        cellId: availableCells[0]?.id || "",
        locale: "es",
      });

      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-3.5 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        <span>Alta Manual De Inquilino</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h2 className="text-base font-bold text-[var(--dsn-text)]">
                  Alta Manual De Inquilino y Comercio
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--dsn-text-secondary)] mt-2">
              Registra una nueva cuenta de inquilino asignándole identidad de dueño, plan inicial y enrutamiento a una célula PostgreSQL.
            </p>

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Inquilino y comercio registrados con éxito en el Router Global.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Nombre comercial */}
              <div>
                <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Nombre Del Comercio
                </label>
                <input
                  type="text"
                  required
                  value={formData.displayName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="ej. Zapatería Andina SAS"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                />
              </div>

              {/* Slug único */}
              <div>
                <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Slug Del Identificador
                </label>
                <div className="flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2">
                  <span className="text-xs text-[var(--dsn-text-secondary)] select-none mr-1">mocter.co/</span>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="zapateria-andina"
                    className="w-full bg-transparent text-xs text-[var(--dsn-text)] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Correo y Nombre del propietario */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Correo Del Propietario
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                    placeholder="gerencia@zapateria.com"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Nombre Del Propietario
                  </label>
                  <input
                    type="text"
                    value={formData.ownerDisplayName}
                    onChange={(e) => setFormData({ ...formData, ownerDisplayName: e.target.value })}
                    placeholder="ej. Carlos Gómez"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  />
                </div>
              </div>

              {/* Plan y Célula */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Plan Inicial
                  </label>
                  <select
                    value={formData.planId}
                    onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  >
                    {availablePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Célula De Datos Asignada
                  </label>
                  <select
                    value={formData.cellId}
                    onChange={(e) => setFormData({ ...formData, cellId: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  >
                    {availableCells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} ({c.currentClients}/{c.maxClients})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Teléfono opcional e idioma */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Teléfono De Contacto
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+573001234567"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Idioma Del Comercio
                  </label>
                  <select
                    value={formData.locale}
                    onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                  >
                    <option value="es">Español (es)</option>
                    <option value="en">English (en)</option>
                  </select>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-transparent px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Inquilino</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
