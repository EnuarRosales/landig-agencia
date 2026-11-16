"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  getCountryAddressProfile,
  listCountryOptions,
  normalizeAndValidatePhoneE164,
  splitPhoneForInput,
} from "@mocter/domain/geo";

export interface PhoneE164ChangeMeta {
  isValid: boolean;
  e164?: string;
  countryCode: string;
  callingCode: string;
  nationalNumber: string;
}

export interface PhoneE164InputProps {
  id?: string;
  name?: string;
  label: string;
  value: string;
  onChange: (nextValue: string, meta: PhoneE164ChangeMeta) => void;
  defaultCountryCode?: string;
  required?: boolean;
  disabled?: boolean;
  locale?: "es" | "en";
  error?: string | null;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
  testIdPrefix?: string;
}

/**
 * Selector internacional de código de país y número telefónico con normalización estricta E.164.
 *
 * - Combina selector de país (`+57`, `+54`, `+52`, `+1`, etc.) con el número nacional.
 * - Soporta pegado directo de números con prefijo internacional (`+573001234567`).
 * - Cumple diseño Mobile First y etiquetas en Title Case sin mayúsculas sostenidas.
 */
export function PhoneE164Input({
  id = "phone-e164",
  name,
  label,
  value,
  onChange,
  defaultCountryCode = "CO",
  required = false,
  disabled = false,
  locale = "es",
  error = null,
  hint,
  placeholder,
  autoComplete = "tel-national",
  testIdPrefix,
}: PhoneE164InputProps) {
  const isEs = locale === "es";
  const normalizedDefault = (defaultCountryCode || "CO").trim().toUpperCase();

  const initialParts = useMemo(
    () => splitPhoneForInput(value, normalizedDefault),
    [value, normalizedDefault],
  );

  const [selectedCountry, setSelectedCountry] = useState<string>(initialParts.countryCode);
  const [nationalInput, setNationalInput] = useState<string>(initialParts.nationalNumber);
  const [prevExternalValue, setPrevExternalValue] = useState(value);
  const [touched, setTouched] = useState(false);

  if (prevExternalValue !== value) {
    setPrevExternalValue(value);
    if (!value.trim()) {
      setNationalInput("");
    } else {
      const currentCalling = getCountryAddressProfile(selectedCountry).callingCode;
      const localDigits = nationalInput.replace(/\D/g, "");
      const currentCombined = localDigits ? `+${currentCalling}${localDigits}` : "";
      const normalizedExternal = value.trim().replace(/[\s().-]+/g, "");
      if (normalizedExternal !== currentCombined) {
        const parsed = splitPhoneForInput(value, selectedCountry || normalizedDefault);
        setSelectedCountry(parsed.countryCode);
        setNationalInput(parsed.nationalNumber);
      }
    }
  }

  const countryOptions = useMemo(() => listCountryOptions(locale), [locale]);
  const callingCode = useMemo(
    () => getCountryAddressProfile(selectedCountry).callingCode,
    [selectedCountry],
  );

  const validation = useMemo(() => {
    const cleaned = nationalInput.trim();
    if (!cleaned) {
      return {
        isEmpty: true,
        isValid: !required,
        e164: undefined as string | undefined,
        errorMessage: null as string | null,
      };
    }

    const candidate = cleaned.startsWith("+")
      ? cleaned
      : `+${callingCode}${cleaned.replace(/\D/g, "")}`;

    const res = normalizeAndValidatePhoneE164({
      rawPhone: candidate,
      defaultCountryCode: selectedCountry,
      allowLocalWithDefaultCountry: false,
    });

    if (res.ok) {
      return {
        isEmpty: false,
        isValid: true,
        e164: res.data.e164,
        errorMessage: null,
      };
    }

    return {
      isEmpty: false,
      isValid: false,
      e164: undefined,
      errorMessage: isEs
        ? "Número inválido para el país seleccionado"
        : "Invalid number for the selected country",
    };
  }, [nationalInput, callingCode, selectedCountry, required, isEs]);

  function emitChange(nextCountry: string, nextNational: string) {
    const nextCalling = getCountryAddressProfile(nextCountry).callingCode;
    const trimmed = nextNational.trim();

    if (!trimmed) {
      onChange("", {
        isValid: !required,
        countryCode: nextCountry,
        callingCode: nextCalling,
        nationalNumber: "",
      });
      return;
    }

    if (trimmed.startsWith("+")) {
      const split = splitPhoneForInput(trimmed, nextCountry);
      if (split.isValidE164) {
        const res = normalizeAndValidatePhoneE164({
          rawPhone: trimmed,
          defaultCountryCode: split.countryCode,
          allowLocalWithDefaultCountry: false,
        });
        if (res.ok) {
          setSelectedCountry(split.countryCode);
          setNationalInput(split.nationalNumber);
          onChange(res.data.e164, {
            isValid: true,
            e164: res.data.e164,
            countryCode: split.countryCode,
            callingCode: res.data.callingCode,
            nationalNumber: split.nationalNumber,
          });
          return;
        }
      }
    }

    const digits = trimmed.replace(/\D/g, "");
    const candidate = digits ? `+${nextCalling}${digits}` : trimmed;
    const res = normalizeAndValidatePhoneE164({
      rawPhone: candidate,
      defaultCountryCode: nextCountry,
      allowLocalWithDefaultCountry: false,
    });

    if (res.ok) {
      onChange(res.data.e164, {
        isValid: true,
        e164: res.data.e164,
        countryCode: nextCountry,
        callingCode: nextCalling,
        nationalNumber: digits,
      });
    } else {
      onChange(candidate, {
        isValid: false,
        countryCode: nextCountry,
        callingCode: nextCalling,
        nationalNumber: digits,
      });
    }
  }

  const displayedError = error || (touched && !validation.isEmpty && !validation.isValid ? validation.errorMessage : null);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-[var(--dsn-text)]"
      >
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>

      {name ? (
        <input type="hidden" name={name} value={validation.e164 ?? value} />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id={`${id}-country`}
          aria-label={isEs ? "Código De País Del Teléfono" : "Phone Country Code"}
          data-testid={testIdPrefix ? `${testIdPrefix}-country` : `${id}-country`}
          disabled={disabled}
          value={selectedCountry}
          onChange={(e) => {
            const nextCountry = e.target.value;
            setSelectedCountry(nextCountry);
            emitChange(nextCountry, nationalInput);
          }}
          className="w-full sm:w-44 shrink-0 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-2.5 py-2 text-xs font-medium text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
        >
          {countryOptions.map((opt) => (
            <option key={opt.countryCode} value={opt.countryCode}>
              {opt.name} (+{opt.callingCode})
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete={autoComplete}
            required={required}
            disabled={disabled}
            data-testid={testIdPrefix ? `${testIdPrefix}-national` : id}
            value={nationalInput}
            placeholder={placeholder || "3001234567"}
            onChange={(e) => {
              const raw = e.target.value;
              setNationalInput(raw);
              emitChange(selectedCountry, raw);
            }}
            onBlur={() => setTouched(true)}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        {displayedError ? (
          <p className="inline-flex items-center gap-1 font-medium text-rose-500">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{displayedError}</span>
          </p>
        ) : validation.isValid && validation.e164 ? (
          <p className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span>{validation.e164}</span>
          </p>
        ) : (
          <span className="text-[var(--dsn-text-secondary)]">
            {hint ||
              (isEs
                ? "Formato internacional con código de país"
                : "International format with country code")}
          </span>
        )}
      </div>
    </div>
  );
}
