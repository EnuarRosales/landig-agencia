"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getCountryAddressProfile,
  listCountryOptions,
  type CountryOption,
} from "@mocter/domain/geo";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Retorna el catálogo de países localizado y ordenado alfabéticamente únicamente tras montar en el cliente.
 *
 * Durante SSR entrega exclusivamente la opción determinista del país seleccionado sin invocar
 * `Intl.DisplayNames` ni `localeCompare`, evitando desajustes de hidratación entre ICU de Node.js y el navegador.
 *
 * @param locale - Idioma de visualización (`"es"` o `"en"`).
 * @param selectedCountryCode - Código ISO alpha-2 activo para preservar la opción seleccionada en SSR.
 */
export function useCountryOptions(
  locale = "es",
  selectedCountryCode = "CO",
): CountryOption[] {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  return useMemo(() => {
    if (isClient) {
      return listCountryOptions(locale);
    }

    const profile = getCountryAddressProfile(selectedCountryCode);
    return [
      {
        countryCode: profile.countryCode,
        name: profile.countryCode,
        callingCode: profile.callingCode,
        dialLabel: `${profile.countryCode} +${profile.callingCode}`,
      },
    ];
  }, [isClient, locale, selectedCountryCode]);
}
