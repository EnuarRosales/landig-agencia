import { describe, it, expect } from "vitest";
import {
  encodeBase32,
  decodeBase32,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpauthUri,
} from "./totp";

describe("Base32 Encoding / Decoding (RFC 4648)", () => {
  it("codifica y decodifica correctamente buffers binarios", () => {
    const testCases = [
      { plain: "", base32: "" },
      { plain: "f", base32: "MY" },
      { plain: "fo", base32: "MZXQ" },
      { plain: "foo", base32: "MZXW6" },
      { plain: "foob", base32: "MZXW6YQ" },
      { plain: "fooba", base32: "MZXW6YTB" },
      { plain: "foobar", base32: "MZXW6YTBOI" },
    ];

    for (const tc of testCases) {
      const buf = Buffer.from(tc.plain, "utf-8");
      const encoded = encodeBase32(buf);
      expect(encoded).toBe(tc.base32);

      const decoded = decodeBase32(encoded);
      expect(decoded.toString("utf-8")).toBe(tc.plain);
    }
  });

  it("ignora espacios, guiones y mayúsculas/minúsculas al decodificar", () => {
    const original = "foobar";
    const encodedWithNoise = " mzxw-6ytb oi== ";
    const decoded = decodeBase32(encodedWithNoise);
    expect(decoded.toString("utf-8")).toBe(original);
  });

  it("lanza error si contiene caracteres inválidos para Base32", () => {
    expect(() => decodeBase32("MZXW68")).toThrow("Carácter Base32 inválido");
    expect(() => decodeBase32("MZXW69")).toThrow("Carácter Base32 inválido");
    expect(() => decodeBase32("MZXW6$")).toThrow("Carácter Base32 inválido");
  });
});

describe("TOTP Generation and RFC 6238 Standard Test Vectors", () => {
  // Vector de prueba oficial RFC 6238 Appendix B
  // Secreto: "12345678901234567890" (20 bytes ASCII)
  const rfcSecret = Buffer.from("12345678901234567890", "ascii");
  const rfcSecretBase32 = encodeBase32(rfcSecret); // "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

  it("genera códigos exactos con los vectores de prueba de la RFC 6238", () => {
    const testVectors = [
      { timeSec: 59, step: 1, expected: "287082" },
      { timeSec: 1111111109, step: 37037036, expected: "081804" },
      { timeSec: 1111111111, step: 37037037, expected: "050471" },
      { timeSec: 1234567890, step: 41152263, expected: "005924" },
      { timeSec: 2000000000, step: 66666666, expected: "279037" },
    ];

    for (const vector of testVectors) {
      // Usando el buffer directo
      const codeFromBuf = generateTotpCode(rfcSecret, { step: vector.step });
      expect(codeFromBuf).toBe(vector.expected);

      // Usando la cadena Base32 y timestamp
      const codeFromBase32 = generateTotpCode(rfcSecretBase32, {
        now: vector.timeSec * 1000,
      });
      expect(codeFromBase32).toBe(vector.expected);
    }
  });

  it("generateTotpSecret produce 20 bytes binarios y 32 caracteres en Base32", () => {
    const { raw, base32 } = generateTotpSecret();
    expect(raw.length).toBe(20);
    expect(base32.length).toBe(32);
    expect(decodeBase32(base32)).toEqual(raw);
  });
});

describe("TOTP Verification and Anti-Replay", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
  const period = 30;
  const now = 1000000000 * 1000; // Paso S = 33333333
  const currentStep = Math.floor(now / 1000 / period);

  it("valida exitosamente el código en el paso actual", () => {
    const code = generateTotpCode(secret, { step: currentStep });
    const result = verifyTotpCode(code, secret, { now, period, window: 1 });
    expect(result.valid).toBe(true);
    expect(result.step).toBe(currentStep);
  });

  it("admite deriva de reloj ±1 paso (30 segundos antes y después)", () => {
    const codePrev = generateTotpCode(secret, { step: currentStep - 1 });
    const resultPrev = verifyTotpCode(codePrev, secret, { now, period, window: 1 });
    expect(resultPrev.valid).toBe(true);
    expect(resultPrev.step).toBe(currentStep - 1);

    const codeNext = generateTotpCode(secret, { step: currentStep + 1 });
    const resultNext = verifyTotpCode(codeNext, secret, { now, period, window: 1 });
    expect(resultNext.valid).toBe(true);
    expect(resultNext.step).toBe(currentStep + 1);
  });

  it("rechaza códigos fuera de la ventana de tolerancia (step ± 2)", () => {
    const codeTooOld = generateTotpCode(secret, { step: currentStep - 2 });
    const resultOld = verifyTotpCode(codeTooOld, secret, { now, period, window: 1 });
    expect(resultOld.valid).toBe(false);

    const codeTooFar = generateTotpCode(secret, { step: currentStep + 2 });
    const resultFar = verifyTotpCode(codeTooFar, secret, { now, period, window: 1 });
    expect(resultFar.valid).toBe(false);
  });

  it("aplica protección anti-replay: rechaza un paso menor o igual a lastUsedStep", () => {
    const code = generateTotpCode(secret, { step: currentStep });

    // Si lastUsedStep es igual al paso actual -> RECHAZADO (código ya usado en este paso)
    const resultReplayed = verifyTotpCode(code, secret, {
      now,
      period,
      window: 1,
      lastUsedStep: currentStep,
    });
    expect(resultReplayed.valid).toBe(false);

    // Si lastUsedStep es mayor al paso actual -> RECHAZADO
    const resultFutureReplay = verifyTotpCode(code, secret, {
      now,
      period,
      window: 1,
      lastUsedStep: currentStep + 1,
    });
    expect(resultFutureReplay.valid).toBe(false);

    // Si lastUsedStep es anterior al paso actual -> ACEPTADO
    const resultNewer = verifyTotpCode(code, secret, {
      now,
      period,
      window: 1,
      lastUsedStep: currentStep - 1,
    });
    expect(resultNewer.valid).toBe(true);
    expect(resultNewer.step).toBe(currentStep);
  });

  it("rechaza códigos con formato inválido o longitud incorrecta", () => {
    expect(verifyTotpCode("12345", secret, { now })).toEqual({ valid: false });
    expect(verifyTotpCode("1234567", secret, { now })).toEqual({ valid: false });
    expect(verifyTotpCode("abcdef", secret, { now })).toEqual({ valid: false });
    expect(verifyTotpCode("", secret, { now })).toEqual({ valid: false });
  });
});

describe("generateOtpauthUri", () => {
  it("construye la URI canónica otpauth://totp/... según AUTH-001 §5.5", () => {
    const uri = generateOtpauthUri({
      email: "user@mocter.co",
      secretBase32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      issuer: "Mocter",
    });

    expect(uri).toContain("otpauth://totp/Mocter:user%40mocter.co?");
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri).toContain("issuer=Mocter");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
