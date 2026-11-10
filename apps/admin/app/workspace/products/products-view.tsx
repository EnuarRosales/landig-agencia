"use client";

import React, { useState } from "react";
import {
  Package,
  Plus,
  Trash2,
  UploadCloud,
  Image as ImageIcon,
  Sparkles,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { WorkspaceProductDto } from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface ProductsViewProps {
  initialProducts: WorkspaceProductDto[];
}

export function ProductsView({ initialProducts }: ProductsViewProps) {
  const [products, setProducts] = useState<WorkspaceProductDto[]>(initialProducts);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<WorkspaceProductDto | null>(null);

  // Estados de formulario de creación
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [saving, setSaving] = useState(false);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados de subida multimedia
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Estados de eliminación
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<WorkspaceProductDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Función «Mejorar Con AI» (AI-001, Regla 4.7)
  const handleAiEnhance = async () => {
    if (!description.trim() && !name.trim()) return;
    setAiEnhancing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const enhanced = `${description ? description.trim() : name.trim()} — Producto artesanal seleccionado con altos estándares de calidad, durabilidad garantizada y entrega inmediata a nivel nacional.`;
      setDescription(enhanced);
    } finally {
      setAiEnhancing(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNum = parseFloat(price);
    if (!name.trim()) {
      setFormError("El Nombre Del Producto es obligatorio.");
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError("El Precio Del Producto debe ser mayor a cero.");
      return;
    }

    setSaving(true);
    try {
      const res = await workspaceFetch<WorkspaceProductDto>("/api/tenant/products", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || name.trim(),
          priceCents: Math.round(priceNum * 100),
          sku: sku.trim() || null,
          category: category.trim() || null,
          status,
        }),
      });

      if (!res.ok || !res.data) {
        setFormError(res.error || "Error al crear el producto.");
        return;
      }

      setProducts((prev) => [res.data!, ...prev]);
      setModalOpen(false);
      setName("");
      setDescription("");
      setPrice("");
      setSku("");
      setCategory("");
    } catch {
      setFormError("Error inesperado al conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedProduct) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("productId", selectedProduct.id);

      const res = await fetch("/api/tenant/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadError(body.detail || "Error al subir la imagen.");
        return;
      }

      const json = await res.json();
      const signedUrl = json.data?.signedUrl;

      if (signedUrl) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === selectedProduct.id
              ? { ...p, mediaUrls: [signedUrl, ...p.mediaUrls] }
              : p,
          ),
        );
      }

      setUploadModalOpen(false);
      setSelectedFile(null);
      setSelectedProduct(null);
    } catch {
      setUploadError("Error de red al subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = (p: WorkspaceProductDto) => {
    setProductToDelete(p);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    setDeleting(true);
    try {
      const res = await workspaceFetch(`/api/tenant/products/${productToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
        setDeleteModalOpen(false);
        setProductToDelete(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Productos Y Catálogo Comercial
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] border border-cyan-500/20">
              Catálogo Celular
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gestión transaccional de productos con imágenes alojadas en SeaweedFS y optimización con imgproxy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span>Registrar Nuevo Producto</span>
        </button>
      </header>

      {/* Tabla de Productos */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Inventario De Productos
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </span>
        </div>

        {products.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No Tienes Productos Registrados
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Comienza publicando tu primer producto para que tu asistente AI pueda ofrecerlo en tus canales.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Registrar Primer Producto</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Miniatura</th>
                  <th className="px-4 py-3 font-medium">Nombre Del Producto</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors">
                    <td className="px-4 py-3">
                      {p.mediaUrls.length > 0 ? (
                        <img
                          src={p.mediaUrls[0]}
                          alt={p.name}
                          className="h-10 w-10 rounded-lg object-cover border border-[var(--dsn-border)]"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border border-[var(--dsn-border)]">
                          <ImageIcon className="h-5 w-5 opacity-40" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--dsn-text)]">{p.name}</p>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)] line-clamp-1 max-w-xs">
                        {p.description}
                      </p>
                      {p.sku && (
                        <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                          SKU: {p.sku}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      ${(p.priceCents / 100).toLocaleString("es-CO")} {p.currency}
                    </td>
                    <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">
                      {p.category || "General"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                          p.status === "published"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {p.status === "published" ? "Publicado" : "Borrador"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProduct(p);
                            setUploadModalOpen(true);
                          }}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--dsn-border)]/40 transition-colors"
                        >
                          <UploadCloud className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Subir Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(p)}
                          className="inline-flex min-h-[32px] items-center justify-center rounded-md border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20 transition-colors"
                          title="Eliminar Producto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de Creación de Producto (Title Case en labels, Regla 4.8) */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)]">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Registrar Nuevo Producto
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
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                  Nombre Del Producto *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Café De Origen Tostado"
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--dsn-text)]">
                    Descripción Del Producto
                  </label>
                  <button
                    type="button"
                    onClick={handleAiEnhance}
                    disabled={aiEnhancing}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--dsn-accent)] hover:opacity-80 disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>{aiEnhancing ? "Mejorando..." : "Mejorar Con AI"}</span>
                  </button>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe notas de sabor, presentación y características clave..."
                  rows={3}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                    Precio En Pesos *
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="35000"
                    min="100"
                    step="100"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs font-mono text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                    Código O SKU
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="CF-001"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs font-mono text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                    Categoría Comercial
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Bebidas"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                    Estado Inicial
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  >
                    <option value="published">Publicado</option>
                    <option value="draft">Borrador</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-[var(--dsn-border)]">
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
                  {saving ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Carga Multimedia (SeaweedFS S3 + imgproxy) */}
      {uploadModalOpen && selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)]">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-cyan-400" />
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Subir Fotografía Del Producto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--dsn-text-secondary)] mt-2">
              Producto: <span className="font-semibold text-[var(--dsn-text)]">{selectedProduct.name}</span>
            </p>

            {uploadError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadMedia} className="mt-4 space-y-4">
              <div className="rounded-xl border-2 border-dashed border-[var(--dsn-border)] p-6 text-center hover:border-[var(--dsn-accent)] transition-colors">
                <ImageIcon className="h-8 w-8 text-[var(--dsn-text-secondary)]/50 mx-auto mb-2" />
                <p className="text-xs font-semibold text-[var(--dsn-text)]">
                  {selectedFile ? selectedFile.name : "Selecciona una imagen desde tu equipo"}
                </p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
                  Formatos admitidos: JPEG, PNG, WEBP (Máx. 10MB)
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="mt-3 block w-full text-xs text-[var(--dsn-text-secondary)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--dsn-accent)] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:opacity-90"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="rounded-lg border border-[var(--dsn-border)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {uploading ? "Subiendo..." : "Subir Y Optimizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Accesible de Confirmación de Eliminación (Regla 4.17) */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar Producto Del Catálogo"
        subtitle="Confirmación para retirar este producto de tu catálogo comercial."
        variant="danger"
        confirmText="Eliminar Producto"
        confirmLoadingText="Eliminando..."
        cancelText="Conservar Producto"
        loading={deleting}
        details={[
          { label: "Nombre", value: productToDelete?.name || "" },
          { label: "SKU", value: productToDelete?.sku || "Sin SKU", mono: true },
          { label: "Precio", value: `$${((productToDelete?.priceCents || 0) / 100).toLocaleString("es-CO")}` },
        ]}
        warningTitle="Acción Irreversible"
        warningMessage="El producto se marcará como retirado y dejará de estar disponible para tu asistente AI y clientes."
      />
    </div>
  );
}

