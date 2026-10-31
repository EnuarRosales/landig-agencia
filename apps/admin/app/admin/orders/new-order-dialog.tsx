"use client";

import React, { useState } from "react";
import { getAdminDictionary } from "@/lib/i18n";

/**
 * Diálogo modal interactivo para el alta manual de pedidos (`ORD-001 T-06`).
 */
export function NewOrderDialog() {
  const dict = getAdminDictionary("es").orders;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="min-h-[44px] rounded-md bg-[var(--dsn-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dsn-accent-hover)]"
      >
        {dict.newOrder}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
            <h2 id="modal-title" className="text-lg font-semibold text-[var(--dsn-text)]">
              {dict.modalTitle}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsOpen(false);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor="customerName"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {dict.customerNameLabel}
                </label>
                <input
                  id="customerName"
                  name="customerName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="customerPhone"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.customerPhoneLabel}
                  </label>
                  <input
                    id="customerPhone"
                    name="customerPhone"
                    type="tel"
                    required
                    placeholder="+573001234567"
                    className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="customerDocument"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.customerDocumentLabel}
                  </label>
                  <input
                    id="customerDocument"
                    name="customerDocument"
                    type="text"
                    className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="shippingMethod"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.shippingMethodLabel}
                  </label>
                  <select
                    id="shippingMethod"
                    name="shippingMethod"
                    className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    <option value="home">Domicilio</option>
                    <option value="office">Reclamo en Oficina</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="shippingCity"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.shippingCityLabel}
                  </label>
                  <input
                    id="shippingCity"
                    name="shippingCity"
                    type="text"
                    className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="shippingAddress"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {dict.shippingAddressLabel}
                </label>
                <input
                  id="shippingAddress"
                  name="shippingAddress"
                  type="text"
                  className="mt-1 block w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--dsn-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="min-h-[44px] rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-sm font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  {dict.cancel}
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-md bg-[var(--dsn-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dsn-accent-hover)]"
                >
                  {dict.saveOrder}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
