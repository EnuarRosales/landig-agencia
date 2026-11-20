"use client";

import React, { useMemo } from "react";
import { Input, Label, Select } from "@mocter/ui";
import {
  getCountryAddressProfile,
  getCountrySubdivisions,
  getLocalizedCountryName,
  type AdminAreaKind,
  type DependentLocalityKind,
} from "@mocter/domain/geo";
import { useCountryOptions } from "@/lib/use-country-options";

export interface GeoAddressFieldValues {
  countryCode: string;
  country: string;
  subdivisionCode: string;
  state: string;
  city: string;
  neighborhood: string;
  addressLine: string;
  addressComplement: string;
  postalCode: string;
  referenceNotes: string;
}

export interface GeoAddressFieldsProps {
  values: Partial<GeoAddressFieldValues>;
  onChange: (patch: Partial<GeoAddressFieldValues>) => void;
  locale?: "es" | "en";
  disabled?: boolean;
  idPrefix?: string;
  showAddressLine?: boolean;
  showNeighborhood?: boolean;
  showComplement?: boolean;
  showPostalCode?: boolean;
  showReferenceNotes?: boolean;
  requiredFields?: {
    country?: boolean;
    state?: boolean;
    city?: boolean;
    neighborhood?: boolean;
    addressLine?: boolean;
    postalCode?: boolean;
  };
}

const ADMIN_AREA_LABELS_ES: Partial<Record<AdminAreaKind, string>> = {
  department: "Departamento",
  state: "Estado",
  province: "Provincia",
  region: "Región",
};

const ADMIN_AREA_LABELS_EN: Partial<Record<AdminAreaKind, string>> = {
  department: "Department",
  state: "State",
  province: "Province",
  region: "Region",
};

const DEPENDENT_LOCALITY_LABELS_ES: Partial<Record<DependentLocalityKind, string>> = {
  neighborhood: "Barrio",
  colony: "Colonia / Barrio",
  district: "Distrito / Barrio",
  sector: "Sector / Barrio",
};

const DEPENDENT_LOCALITY_LABELS_EN: Partial<Record<DependentLocalityKind, string>> = {
  neighborhood: "Neighborhood",
  colony: "Neighborhood / Colony",
  district: "District / Neighborhood",
  sector: "Sector / Neighborhood",
};

/**
 * Conjunto internacional de campos geográficos y dirección híbrida adaptable por país.
 *
 * - Selector de país ISO 3166-1 alpha-2 localizado.
 * - Selector dinámico de subdivisión ISO 3166-2 cuando el país cuenta con catálogo oficial,
 *   o campo textual con etiqueta regional cuando es abierto.
 * - Soporta campos fijos globales: ciudad, barrio/colonia, dirección principal y complemento.
 */
export function GeoAddressFields({
  values,
  onChange,
  locale = "es",
  disabled = false,
  idPrefix = "geo",
  showAddressLine = true,
  showNeighborhood = true,
  showComplement = true,
  showPostalCode = true,
  showReferenceNotes = false,
  requiredFields = {},
}: GeoAddressFieldsProps) {
  const isEs = locale === "es";
  const countryCode = (values.countryCode || "CO").trim().toUpperCase();

  const countryOptions = useCountryOptions(locale, countryCode);
  const profile = useMemo(() => getCountryAddressProfile(countryCode), [countryCode]);
  const subdivisions = useMemo(() => getCountrySubdivisions(countryCode), [countryCode]);

  const adminAreaLabel =
    (isEs
      ? ADMIN_AREA_LABELS_ES[profile.adminAreaKind]
      : ADMIN_AREA_LABELS_EN[profile.adminAreaKind]) || (isEs ? "Estado / Región" : "State / Region");

  const dependentLocalityLabel =
    (isEs
      ? DEPENDENT_LOCALITY_LABELS_ES[profile.dependentLocalityKind]
      : DEPENDENT_LOCALITY_LABELS_EN[profile.dependentLocalityKind]) ||
    (isEs ? "Barrio / Colonia" : "Neighborhood");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* País */}
        <div>
          <Label htmlFor={`${idPrefix}-country`} required={requiredFields.country} className="mb-1.5 font-semibold">
            {isEs ? "País" : "Country"}
          </Label>
          <Select
            id={`${idPrefix}-country`}
            disabled={disabled}
            required={requiredFields.country}
            value={countryCode}
            onChange={(e) => {
              const nextCode = e.target.value;
              const nextName = getLocalizedCountryName(nextCode, locale);
              onChange({
                countryCode: nextCode,
                country: nextName,
                subdivisionCode: "",
                state: "",
              });
            }}
            className="bg-[var(--dsn-background)] text-sm"
          >
            {countryOptions.map((opt) => (
              <option key={opt.countryCode} value={opt.countryCode}>
                {opt.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Subdivisión territorial ISO 3166-2 o texto */}
        <div>
          <Label htmlFor={`${idPrefix}-state`} required={requiredFields.state} className="mb-1.5 font-semibold">
            {adminAreaLabel}
          </Label>

          {subdivisions.length > 0 ? (
            <Select
              id={`${idPrefix}-state`}
              disabled={disabled}
              required={requiredFields.state}
              value={values.subdivisionCode || ""}
              onChange={(e) => {
                const code = e.target.value;
                const found = subdivisions.find((s) => s.code === code);
                onChange({
                  subdivisionCode: code,
                  state: found ? found.name : "",
                });
              }}
              className="bg-[var(--dsn-background)] text-sm"
            >
              <option value="">
                {isEs ? `Seleccionar ${adminAreaLabel.toLowerCase()}...` : `Select ${adminAreaLabel.toLowerCase()}...`}
              </option>
              {subdivisions.map((sub) => (
                <option key={sub.code} value={sub.code}>
                  {sub.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id={`${idPrefix}-state`}
              type="text"
              disabled={disabled}
              required={requiredFields.state}
              value={values.state || ""}
              onChange={(e) =>
                onChange({
                  subdivisionCode: "",
                  state: e.target.value,
                })
              }
              className="bg-[var(--dsn-background)] text-sm"
            />
          )}
        </div>

        {/* Ciudad */}
        <div>
          <Label htmlFor={`${idPrefix}-city`} required={requiredFields.city} className="mb-1.5 font-semibold">
            {isEs ? "Ciudad" : "City"}
          </Label>
          <Input
            id={`${idPrefix}-city`}
            type="text"
            disabled={disabled}
            required={requiredFields.city}
            value={values.city || ""}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder={isEs ? "Ej. Medellín, Bogotá, Buenos Aires" : "e.g. Miami, Madrid, Bogotá"}
            className="bg-[var(--dsn-background)] text-sm"
          />
        </div>

        {/* Barrio / Colonia */}
        {showNeighborhood ? (
          <div>
            <Label htmlFor={`${idPrefix}-neighborhood`} required={requiredFields.neighborhood} className="mb-1.5 font-semibold">
              {dependentLocalityLabel}
            </Label>
            <Input
              id={`${idPrefix}-neighborhood`}
              type="text"
              disabled={disabled}
              required={requiredFields.neighborhood}
              value={values.neighborhood || ""}
              onChange={(e) => onChange({ neighborhood: e.target.value })}
              placeholder={isEs ? "Ej. El Poblado, Palermo, Roma Norte" : "e.g. Downtown, Soho"}
              className="bg-[var(--dsn-background)] text-sm"
            />
          </div>
        ) : null}

        {/* Dirección Principal */}
        {showAddressLine ? (
          <div className={showNeighborhood ? "sm:col-span-2" : ""}>
            <Label htmlFor={`${idPrefix}-address-line`} required={requiredFields.addressLine} className="mb-1.5 font-semibold">
              {isEs ? "Dirección Principal" : "Street Address"}
            </Label>
            <Input
              id={`${idPrefix}-address-line`}
              type="text"
              disabled={disabled}
              required={requiredFields.addressLine}
              value={values.addressLine || ""}
              onChange={(e) => onChange({ addressLine: e.target.value })}
              placeholder={isEs ? "Ej. Calle 10 # 43-20 / Av. Santa Fe 1850" : "e.g. 123 Main St"}
              className="bg-[var(--dsn-background)] text-sm"
            />
          </div>
        ) : null}

        {/* Complemento de Dirección */}
        {showComplement ? (
          <div>
            <Label htmlFor={`${idPrefix}-complement`} className="mb-1.5 font-semibold">
              {isEs ? "Complemento" : "Address Complement"}
            </Label>
            <Input
              id={`${idPrefix}-complement`}
              type="text"
              disabled={disabled}
              value={values.addressComplement || ""}
              onChange={(e) => onChange({ addressComplement: e.target.value })}
              placeholder={
                isEs
                  ? "Apto 402, Torre B, Conjunto Residencial..."
                  : "Apt 402, Suite 3B, Building..."
              }
              className="bg-[var(--dsn-background)] text-sm"
            />
          </div>
        ) : null}

        {/* Código Postal */}
        {showPostalCode ? (
          <div>
            <Label
              htmlFor={`${idPrefix}-postal`}
              required={Boolean(requiredFields.postalCode || profile.postalCodeRequired)}
              className="mb-1.5 font-semibold"
            >
              {isEs ? "Código Postal" : "Postal Code"}
            </Label>
            <Input
              id={`${idPrefix}-postal`}
              type="text"
              disabled={disabled}
              required={Boolean(requiredFields.postalCode)}
              value={values.postalCode || ""}
              onChange={(e) => onChange({ postalCode: e.target.value })}
              placeholder={profile.postalCodeExample || "050021"}
              className="bg-[var(--dsn-background)] text-sm"
            />
          </div>
        ) : null}

        {/* Referencias */}
        {showReferenceNotes ? (
          <div className="sm:col-span-2">
            <Label htmlFor={`${idPrefix}-reference`} className="mb-1.5 font-semibold">
              {isEs ? "Indicaciones Adicionales" : "Delivery Instructions"}
            </Label>
            <Input
              id={`${idPrefix}-reference`}
              type="text"
              disabled={disabled}
              value={values.referenceNotes || ""}
              onChange={(e) => onChange({ referenceNotes: e.target.value })}
              placeholder={
                isEs
                  ? "Portería 24h, portón verde, llamar al llegar..."
                  : "Gate code, leave at reception..."
              }
              className="bg-[var(--dsn-background)] text-sm"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
