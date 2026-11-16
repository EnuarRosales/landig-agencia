import { describe, expect, it } from "vitest";
import {
  fromIsoNumericCountryCode,
  getCountryAddressProfile,
  getCountrySubdivisions,
  inferCandidateCountriesFromE164,
  normalizeAndValidatePhoneE164,
  resolveCountryAlpha2FromInput,
  resolveIsoSubdivision,
  splitPhoneForInput,
  toIsoNumericCountryCode,
} from "./index";

describe("geo standards & phone E.164 module", () => {
  it("resolves country address profiles, ISO numeric translations, and free-text countries", () => {
    const ar = getCountryAddressProfile("AR");
    expect(ar.countryCode).toBe("AR");
    expect(ar.numericIsoCode).toBe("032");
    expect(ar.callingCode).toBe("54");
    expect(ar.adminAreaKind).toBe("province");
    expect(ar.defaultTimezone).toBe("America/Argentina/Buenos_Aires");

    expect(toIsoNumericCountryCode("AR")).toBe("032");
    expect(fromIsoNumericCountryCode("032")).toBe("AR");
    expect(fromIsoNumericCountryCode("32")).toBe("AR");

    expect(resolveCountryAlpha2FromInput("Argentina")).toBe("AR");
    expect(resolveCountryAlpha2FromInput("Colombia")).toBe("CO");
    expect(resolveCountryAlpha2FromInput("México")).toBe("MX");
    expect(resolveCountryAlpha2FromInput("170")).toBe("CO");
  });

  it("resolves ISO 3166-2 subdivisions deterministically across countries", () => {
    expect(getCountrySubdivisions("CO").length).toBeGreaterThanOrEqual(32);

    const coAnt = resolveIsoSubdivision({ countryCode: "CO", input: "Antioquia" });
    expect(coAnt.status).toBe("resolved");
    expect(coAnt.matches[0]?.code).toBe("CO-ANT");

    const arCaba = resolveIsoSubdivision({ countryCode: "AR", input: "CABA" });
    expect(arCaba.status).toBe("resolved");
    expect(arCaba.matches[0]?.code).toBe("AR-C");

    const mxCdmx = resolveIsoSubdivision({ countryCode: "MX", input: "CDMX" });
    expect(mxCdmx.status).toBe("resolved");
    expect(mxCdmx.matches[0]?.code).toBe("MX-CMX");

    const cityAsSub = resolveIsoSubdivision({ countryCode: "CO", input: "Rionegro" });
    expect(cityAsSub.status).toBe("unresolved");
  });

  it("validates E.164 strictly for UI forms and supports tenant-country fallback in chat", () => {
    const strictMissingPlus = normalizeAndValidatePhoneE164({
      rawPhone: "3001234567",
      defaultCountryCode: "CO",
      allowLocalWithDefaultCountry: false,
    });
    expect(strictMissingPlus.ok).toBe(false);

    const chatLocalFallback = normalizeAndValidatePhoneE164({
      rawPhone: "3001234567",
      defaultCountryCode: "CO",
      allowLocalWithDefaultCountry: true,
    });
    expect(chatLocalFallback.ok).toBe(true);
    if (chatLocalFallback.ok) {
      expect(chatLocalFallback.data.e164).toBe("+573001234567");
      expect(chatLocalFallback.data.countryCode).toBe("CO");
    }

    const strictValid = normalizeAndValidatePhoneE164({
      rawPhone: "+54 9 11 5555-1234",
      allowLocalWithDefaultCountry: false,
    });
    expect(strictValid.ok).toBe(true);
    if (strictValid.ok) {
      expect(strictValid.data.e164).toBe("+5491155551234");
      expect(strictValid.data.countryCode).toBe("AR");
    }
  });

  it("infers candidate countries from shared E.164 prefixes and splits stored numbers for inputs", () => {
    const nanp = inferCandidateCountriesFromE164("+14155552671");
    expect(nanp).toContain("US");
    expect(nanp).toContain("CA");

    const split = splitPhoneForInput("+525512345678", "CO");
    expect(split.countryCode).toBe("MX");
    expect(split.nationalNumber).toBe("5512345678");
    expect(split.isValidE164).toBe(true);
  });
});
