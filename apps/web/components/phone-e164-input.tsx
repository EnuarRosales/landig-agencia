"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Input, Label, Select } from "@mocter/ui";
import {
  getCountryAddressProfile,
  listCountryOptions,
  normalizeAndValidatePhoneE164,
  splitPhoneForInput,
} from "@mocter/domain/geo";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export interface WebPhoneE164InputProps {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  locale?: string;
  defaultCountryCode?: string;
  placeholder?: string;
  countryAriaLabel?: string;
  errorText?: string;
  helperText?: string;
  initialValue?: string;
  onValidChange?: (e164OrRaw: string, isValid: boolean) => void;
}

/**
 * Control telefónico E.164 estilizado para el sitio público (`apps/web`).
 * Emite el valor completo E.164 mediante `<input type="hidden" name={name} />`.
 */
export function PhoneE164Input({
  id,
  name,
  label,
  required = true,
  locale = "es",
  defaultCountryCode = "CO",
  placeholder = "300 000 0000",
  countryAriaLabel,
  errorText,
  helperText,
  initialValue = "",
  onValidChange,
}: WebPhoneE164InputProps) {
  const initialSplit = useMemo(
    () => splitPhoneForInput(initialValue, defaultCountryCode),
    [initialValue, defaultCountryCode],
  );
  const [countryCode, setCountryCode] = useState<string>(initialSplit.countryCode);
  const [nationalNumber, setNationalNumber] = useState<string>(initialSplit.nationalNumber);

  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const countryOptions = useMemo(
    () => (isClient ? listCountryOptions(locale) : []),
    [isClient, locale],
  );
  const callingCode = useMemo(
    () => getCountryAddressProfile(countryCode).callingCode,
    [countryCode],
  );

  const e164Result = useMemo(() => {
    const trimmed = nationalNumber.trim();
    if (!trimmed) {
      return { value: "", isValid: !required };
    }
    const candidate = trimmed.startsWith("+")
      ? trimmed
      : `+${callingCode}${trimmed.replace(/\D/g, "")}`;
    const res = normalizeAndValidatePhoneE164({
      rawPhone: candidate,
      defaultCountryCode: countryCode,
      allowLocalWithDefaultCountry: false,
    });
    if (res.ok) {
      return { value: res.data.e164, isValid: true };
    }
    return { value: candidate, isValid: false };
  }, [nationalNumber, callingCode, countryCode, required]);

  function handleCountryChange(nextCountry: string) {
    setCountryCode(nextCountry);
    const nextCalling = getCountryAddressProfile(nextCountry).callingCode;
    const digits = nationalNumber.replace(/\D/g, "");
    const candidate = digits ? `+${nextCalling}${digits}` : "";
    if (!candidate) {
      onValidChange?.("", !required);
      return;
    }
    const res = normalizeAndValidatePhoneE164({
      rawPhone: candidate,
      defaultCountryCode: nextCountry,
      allowLocalWithDefaultCountry: false,
    });
    onValidChange?.(res.ok ? res.data.e164 : candidate, res.ok);
  }

  function handleNationalChange(raw: string) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("+")) {
      const split = splitPhoneForInput(trimmed, countryCode);
      if (split.isValidE164) {
        setCountryCode(split.countryCode);
        setNationalNumber(split.nationalNumber);
        const res = normalizeAndValidatePhoneE164({
          rawPhone: trimmed,
          defaultCountryCode: split.countryCode,
          allowLocalWithDefaultCountry: false,
        });
        onValidChange?.(res.ok ? res.data.e164 : trimmed, res.ok);
        return;
      }
    }

    setNationalNumber(raw);
    const digits = trimmed.replace(/\D/g, "");
    const candidate = digits ? `+${callingCode}${digits}` : "";
    if (!candidate) {
      onValidChange?.("", !required);
      return;
    }
    const res = normalizeAndValidatePhoneE164({
      rawPhone: candidate,
      defaultCountryCode: countryCode,
      allowLocalWithDefaultCountry: false,
    });
    onValidChange?.(res.ok ? res.data.e164 : candidate, res.ok);
  }

  return (
    <div>
      <Label htmlFor={id} className="mb-1 block text-[14px] font-medium text-txt">
        {label}
      </Label>
      <input type="hidden" name={name} value={e164Result.value} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          id={`${id}-country`}
          aria-label={countryAriaLabel}
          value={countryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="w-full shrink-0 rounded-xl border-stroke bg-[rgba(255,255,255,0.04)] px-3 py-3 text-[14px] text-txt focus:border-a2 sm:w-44"
        >
          {isClient ? (
            countryOptions.map((opt) => (
              <option
                key={opt.countryCode}
                value={opt.countryCode}
                className="bg-surface-solid text-txt dark:bg-[#0d111a] dark:text-white"
              >
                {`${opt.name} (+${opt.callingCode})`}
              </option>
            ))
          ) : (
            <option
              value={countryCode}
              className="bg-surface-solid text-txt dark:bg-[#0d111a] dark:text-white"
            >
              {`${countryCode} (+${callingCode})`}
            </option>
          )}
        </Select>
        <Input
          id={id}
          type="tel"
          required={required}
          autoComplete="tel-national"
          placeholder={placeholder}
          value={nationalNumber}
          onChange={(e) => handleNationalChange(e.target.value)}
          error={Boolean(errorText)}
          className="flex-1 rounded-xl bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[15px] text-txt placeholder:text-muted focus:border-a2"
        />
      </div>
      {errorText ? (
        <p className="mt-1 text-[13px] text-hot">{errorText}</p>
      ) : helperText ? (
        <p className="mt-1 text-[12px] text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
