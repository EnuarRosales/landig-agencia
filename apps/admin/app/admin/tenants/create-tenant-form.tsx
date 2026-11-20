"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { PhoneE164Input } from "@/components/phone-e164-input";

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
      <Button
        type="button"
        variant="primary"
        onClick={() => setIsOpen(true)}
        className="min-h-[44px] text-sm"
      >
        <Plus className="h-4 w-4" />
        <span>Alta Manual De Inquilino</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-[var(--dsn-accent)]" />
              <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                Alta Manual De Inquilino y Comercio
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
              Registra una nueva cuenta de inquilino asignándole identidad de dueño, plan inicial y enrutamiento a una célula PostgreSQL.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="success" className="mt-4">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Inquilino y comercio registrados con éxito en el Router Global.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Nombre comercial */}
            <div>
              <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Nombre Del Comercio
              </Label>
              <Input
                type="text"
                required
                value={formData.displayName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ej. Zapatería Andina SAS"
                className="bg-[var(--dsn-background)] text-xs"
              />
            </div>

            {/* Slug único */}
            <div>
              <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Slug Del Identificador
              </Label>
              <div className="flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-1">
                <span className="text-xs text-[var(--dsn-text-secondary)] select-none mr-1">mocter.co/</span>
                <Input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="zapateria-andina"
                  className="border-0 bg-transparent px-0 py-0 min-h-[30px] h-auto text-xs font-mono focus-visible:ring-0"
                />
              </div>
            </div>

            {/* Correo y Nombre del propietario */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Correo Del Propietario
                </Label>
                <Input
                  type="email"
                  required
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  placeholder="gerencia@zapateria.com"
                  className="bg-[var(--dsn-background)] text-xs"
                />
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Nombre Del Propietario
                </Label>
                <Input
                  type="text"
                  value={formData.ownerDisplayName}
                  onChange={(e) => setFormData({ ...formData, ownerDisplayName: e.target.value })}
                  placeholder="ej. Carlos Gómez"
                  className="bg-[var(--dsn-background)] text-xs"
                />
              </div>
            </div>

            {/* Plan y Célula */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Plan Inicial
                </Label>
                <Select
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  className="bg-[var(--dsn-background)] text-xs"
                >
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Célula De Datos Asignada
                </Label>
                <Select
                  value={formData.cellId}
                  onChange={(e) => setFormData({ ...formData, cellId: e.target.value })}
                  className="bg-[var(--dsn-background)] text-xs"
                >
                  {availableCells.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} ({c.currentClients}/{c.maxClients})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Teléfono opcional e idioma */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <PhoneE164Input
                  id="admin-create-tenant-phone"
                  label="Teléfono de Contacto"
                  value={formData.phone}
                  locale={formData.locale === "en" ? "en" : "es"}
                  onChange={(nextVal) => setFormData({ ...formData, phone: nextVal })}
                />
              </div>
              <div>
                <Label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                  Idioma Del Comercio
                </Label>
                <Select
                  value={formData.locale}
                  onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
                  className="bg-[var(--dsn-background)] text-xs"
                >
                  <option value="es">Español (es)</option>
                  <option value="en">English (en)</option>
                </Select>
              </div>
            </div>

            {/* Botones de acción */}
            <DialogFooter className="pt-3 border-t border-[var(--dsn-border)]">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsOpen(false)}
                className="min-h-[44px] text-sm"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                loading={loading}
                className="min-h-[44px] text-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Guardar Inquilino</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
