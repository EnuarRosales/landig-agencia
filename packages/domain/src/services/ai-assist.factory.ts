import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import { DrizzleAiAssistRepository } from "../repositories/drizzle-ai-assist.repository";
import { AiCredentialResolverService } from "./ai-credential-resolver.service";
import {
  AiAssistService,
  DrizzleAiUsageEventRecorder,
  type IAiUsageEventRecorder,
} from "./ai-assist.service";
import { LlmHttpProviderClient } from "./llm-http-provider.client";

/**
 * Construye una instancia completamente cableada de `AiAssistService` respaldada por
 * Drizzle ORM, `AiCredentialResolverService` (BYOK o excepción Trial/Onboarding) y
 * `LlmHttpProviderClient` (HTTP nativo multi-proveedor).
 *
 * @param options - Opciones de composición, como inyectar un grabador diferido para Next.js `after()`.
 * @returns Instancia productiva lista para atender peticiones de `/api/ai/enhance`.
 */
export const defaultAiUsageEventRecorder = new DrizzleAiUsageEventRecorder();

/**
 * Construye una instancia completamente cableada de `AiAssistService` respaldada por
 * Drizzle ORM, `AiCredentialResolverService` (BYOK o excepción Trial/Onboarding) y
 * `LlmHttpProviderClient` (HTTP nativo multi-proveedor).
 *
 * @param options - Opciones de composición, como inyectar un grabador diferido para Next.js `after()`.
 * @returns Instancia productiva lista para atender peticiones de `/api/ai/enhance`.
 */
export function createDefaultAiAssistService(options?: {
  usageRecorder?: IAiUsageEventRecorder;
}): AiAssistService {
  const db = getDb() as unknown as PostgresJsDatabase<Record<string, unknown>>;
  const repository = new DrizzleAiAssistRepository(db);
  const llmClient = new LlmHttpProviderClient();
  const resolver = new AiCredentialResolverService();

  return new AiAssistService(
    repository,
    llmClient,
    "gemini-2.0-flash",
    resolver,
    options?.usageRecorder ?? defaultAiUsageEventRecorder,
  );
}
