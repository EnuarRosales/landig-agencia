import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signChatwootJwt,
  verifyChatwootJwt,
  consumeChatwootSsoJti,
  toBase64Url,
  fromBase64Url,
  type ChatwootSsoClaims,
} from "./chatwoot-sso";
import { MockRedisClient } from "../redis/mock-redis";
import { setRedisClientForTesting } from "../redis/client";

describe("AUTH-001 T-25 · Utilidades Criptográficas de Chatwoot SSO (chatwoot-sso.ts)", () => {
  const secret = "super-secret-chatwoot-sso-key-32b";
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as any);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  const validClaims: ChatwootSsoClaims = {
    email: "agente@mocter.co",
    name: "Agente Mocter",
    identifier: "uuid-user-123",
    jti: "jti-uuid-456",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 min
  };

  describe("toBase64Url & fromBase64Url", () => {
    it("codifica y decodifica correctamente cadenas UTF-8 sin caracteres especiales ni padding", () => {
      const input = "Hola Mundo Mocter! ¿Cómo estás?";
      const encoded = toBase64Url(input);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");

      const decoded = fromBase64Url(encoded).toString("utf8");
      expect(decoded).toBe(input);
    });
  });

  describe("signChatwootJwt & verifyChatwootJwt", () => {
    it("emite un token JWT compacto de 3 partes con firma válida", () => {
      const token = signChatwootJwt(validClaims, secret);
      const parts = token.split(".");
      expect(parts).toHaveLength(3);

      const verified = verifyChatwootJwt(token, secret);
      expect(verified.email).toBe(validClaims.email);
      expect(verified.name).toBe(validClaims.name);
      expect(verified.identifier).toBe(validClaims.identifier);
      expect(verified.jti).toBe(validClaims.jti);
      expect(verified.exp).toBe(validClaims.exp);
    });

    it("falla si la firma del token no coincide con el secreto", () => {
      const token = signChatwootJwt(validClaims, secret);
      expect(() => verifyChatwootJwt(token, "wrong-secret-key")).toThrow(
        "Firma del token JWT inválida o alterada.",
      );
    });

    it("falla si la carga útil del token fue adulterada", () => {
      const token = signChatwootJwt(validClaims, secret);
      const parts = token.split(".");

      // Alterar el payload
      const tamperedClaims = { ...validClaims, email: "hacker@evil.com" };
      const tamperedPayload = toBase64Url(JSON.stringify(tamperedClaims));
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => verifyChatwootJwt(tamperedToken, secret)).toThrow(
        "Firma del token JWT inválida o alterada.",
      );
    });

    it("falla si el token no tiene el formato estándar de 3 partes", () => {
      expect(() => verifyChatwootJwt("invalid.token", secret)).toThrow(
        "Formato de token JWT inválido (se esperaban 3 partes).",
      );
    });

    it("falla si el token ha expirado (más de 5 minutos)", () => {
      const expiredClaims: ChatwootSsoClaims = {
        ...validClaims,
        iat: Math.floor(Date.now() / 1000) - 400,
        exp: Math.floor(Date.now() / 1000) - 100, // Expiró hace 100 segundos
      };

      const token = signChatwootJwt(expiredClaims, secret);
      expect(() => verifyChatwootJwt(token, secret, 0)).toThrow("El token JWT ha expirado.");
    });
  });

  describe("consumeChatwootSsoJti (Single-Use en Redis)", () => {
    it("permite el primer consumo del token y rechaza el segundo uso (un solo uso permitido)", async () => {
      const jti = "unique-jti-token-1";

      // 1. Primer uso: debe ser permitido (true)
      const firstUse = await consumeChatwootSsoJti(jti);
      expect(firstUse).toBe(true);

      // 2. Segundo uso: debe ser rechazado (false)
      const secondUse = await consumeChatwootSsoJti(jti);
      expect(secondUse).toBe(false);

      // 3. Tercer uso: debe continuar rechazado
      const thirdUse = await consumeChatwootSsoJti(jti);
      expect(thirdUse).toBe(false);
    });
  });
});
