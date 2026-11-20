"use client";

import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { getAdminDictionary } from "@/lib/i18n";
import { PhoneE164Input } from "@/components/phone-e164-input";
import { GeoAddressFields, type GeoAddressFieldValues } from "@/components/geo-address-fields";

/**
 * Diálogo modal interactivo para el alta manual de pedidos (`ORD-001 T-06`).
 */
export function NewOrderDialog() {
  const dict = getAdminDictionary("es").orders;
  const [isOpen, setIsOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingGeo, setShippingGeo] = useState<Partial<GeoAddressFieldValues>>({
    countryCode: "CO",
    country: "Colombia",
    subdivisionCode: "",
    state: "",
    city: "",
    neighborhood: "",
    addressLine: "",
    addressComplement: "",
    postalCode: "",
  });

  return (
    <>
      <Button
        type="button"
        variant="primary"
        onClick={() => setIsOpen(true)}
        className="min-h-[44px] text-sm"
      >
        {dict.newOrder}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[var(--dsn-text)]">
              {dict.modalTitle}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setIsOpen(false);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <Label
                htmlFor="customerName"
                className="block text-xs font-medium text-[var(--dsn-text)]"
              >
                {dict.customerNameLabel}
              </Label>
              <Input
                id="customerName"
                name="customerName"
                type="text"
                required
                className="mt-1 bg-[var(--dsn-background)] text-sm"
              />
            </div>

            <div className="space-y-4">
              <PhoneE164Input
                id="customerPhone"
                name="customerPhone"
                label={dict.customerPhoneLabel}
                value={customerPhone}
                onChange={(next) => setCustomerPhone(next)}
                defaultCountryCode={shippingGeo.countryCode || "CO"}
                required
                locale="es"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor="customerDocument"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.customerDocumentLabel}
                  </Label>
                  <Input
                    id="customerDocument"
                    name="customerDocument"
                    type="text"
                    className="mt-1 bg-[var(--dsn-background)] text-sm"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="shippingMethod"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {dict.shippingMethodLabel}
                  </Label>
                  <Select
                    id="shippingMethod"
                    name="shippingMethod"
                    className="mt-1 bg-[var(--dsn-background)] text-sm"
                  >
                    <option value="home">Domicilio</option>
                    <option value="office">Reclamo en Oficina</option>
                  </Select>
                </div>
              </div>
            </div>

            <GeoAddressFields
              values={shippingGeo}
              onChange={(patch) => setShippingGeo((prev) => ({ ...prev, ...patch }))}
              locale="es"
              idPrefix="admin-order-geo"
              requiredFields={{ country: true, state: true, city: true, addressLine: true }}
            />

            <DialogFooter className="border-t border-[var(--dsn-border)] pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsOpen(false)}
                className="min-h-[44px] text-sm"
              >
                {dict.cancel}
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="min-h-[44px] text-sm"
              >
                {dict.saveOrder}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
