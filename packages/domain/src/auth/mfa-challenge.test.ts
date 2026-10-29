import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MfaChallengeManager,
  hashChallengeToken,
  buildChallengeRedisKey,
  MFA_CHALLENGE_TTL_SECONDS,
} from "./mfa-challenge";
import {
  MockRedisClient,
  createMockRedisClient,
} from "../redis/mock-redis";
import { setRedisClientForTesting } from "../redis/client";
import { RedisUnavailableError } from "./rate-limiter";

describe("AUTH-001 T-19 · MfaChallengeManager", () => {
  let manager: MfaChallengeManager;
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
    manager = new MfaChallengeManager();
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  it("genera un token seguro de 32 bytes (64 hex) y guarda el challenge en Redis con TTL de 5 min", async () => {
    const result = await manager.createChallenge({
      userId: "usr_123",
      clientId: "cli_abc",
      routingVersion: 2,
      identityLocation: "router",
    });

    expect(result.challengeToken).toBeDefined();
    expect(result.challengeToken.length).toBe(64);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290 * 1000);

    const redisKey = buildChallengeRedisKey(result.challengeToken);
    const stored = await mockRedis.get(redisKey);
    expect(stored).not.toBeNull();

    const payload = JSON.parse(stored!);
    expect(payload.userId).toBe("usr_123");
    expect(payload.clientId).toBe("cli_abc");
    expect(payload.routingVersion).toBe(2);
    expect(payload.identityLocation).toBe("router");
    expect(payload.attempts).toBe(0);
  });

  it("permite consultar el challenge sin consumirlo con getChallenge", async () => {
    const { challengeToken } = await manager.createChallenge({
      userId: "usr_456",
      clientId: null,
      routingVersion: null,
      identityLocation: "router",
    });

    const payload = await manager.getChallenge(challengeToken);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("usr_456");

    // Sigue existiendo en Redis
    const payloadAgain = await manager.getChallenge(challengeToken);
    expect(payloadAgain).not.toBeNull();
  });

  it("incrementa attempts con recordFailedAttempt y se autodestruye al quinto fallo", async () => {
    const { challengeToken } = await manager.createChallenge({
      userId: "usr_789",
      clientId: null,
      routingVersion: null,
      identityLocation: "router",
    });

    // Intentos 1 a 4
    for (let i = 1; i <= 4; i++) {
      const res = await manager.recordFailedAttempt(challengeToken);
      expect(res.attempts).toBe(i);
      expect(res.exhausted).toBe(false);
    }

    // Intento 5: se agota y autodestruye
    const res5 = await manager.recordFailedAttempt(challengeToken);
    expect(res5.attempts).toBe(5);
    expect(res5.exhausted).toBe(true);

    // Consulta posterior debe ser nula
    const checkAfter = await manager.getChallenge(challengeToken);
    expect(checkAfter).toBeNull();

    // Siguiente intento debe indicar agotado
    const res6 = await manager.recordFailedAttempt(challengeToken);
    expect(res6.exhausted).toBe(true);
  });

  it("consumeChallenge lee y elimina atómicamente el challenge (un solo uso, anti-replay)", async () => {
    const { challengeToken } = await manager.createChallenge({
      userId: "usr_replay",
      clientId: "cli_1",
      routingVersion: 1,
      identityLocation: "router",
    });

    const consumed = await manager.consumeChallenge(challengeToken);
    expect(consumed).not.toBeNull();
    expect(consumed!.userId).toBe("usr_replay");

    // Segundo consumo retorna null (previene replay)
    const replayed = await manager.consumeChallenge(challengeToken);
    expect(replayed).toBeNull();
  });

  it("deleteChallenge elimina el registro en Redis", async () => {
    const { challengeToken } = await manager.createChallenge({
      userId: "usr_logout",
      clientId: null,
      routingVersion: null,
      identityLocation: "router",
    });

    await manager.deleteChallenge(challengeToken);
    const check = await manager.getChallenge(challengeToken);
    expect(check).toBeNull();
  });

  it("arroja RedisUnavailableError en modo Fail-Closed si Redis falla", async () => {
    mockRedis.simulateFailure(true);

    await expect(
      manager.createChallenge({
        userId: "usr_fail",
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      }),
    ).rejects.toThrow(RedisUnavailableError);
  });
});
