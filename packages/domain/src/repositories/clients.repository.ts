import { and, asc, eq, isNull, lt, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  cells,
  clientPlans,
  clientRouting,
  clients,
  users,
  type Cell,
  type Client,
  type ClientRouting,
} from "../db/schemas";
import type {
  IClientsRepository,
  ProvisionTenantPersistenceInput,
  ProvisionedTenantRecord,
} from "./clients.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Implementación Drizzle ORM del repositorio de inquilinos, planes asignados y enrutamiento
 * sobre PostgreSQL en el Router Global (`admin.clients`, `admin.client_plans`, `admin.client_routing`).
 */
export class DrizzleClientsRepository implements IClientsRepository {
  /**
   * Inicializa una nueva instancia de {@link DrizzleClientsRepository}.
   *
   * @param dbProvider - Función proveedora de la instancia de base de datos Drizzle (por defecto {@link getDb}).
   */
  constructor(
    private readonly dbProvider: () => PostgresJsDatabase<typeof schema> = getDb,
  ) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbProvider();
  }

  /** @inheritdoc */
  async findById(id: string): Promise<Client | null> {
    try {
      const rows = await this.db
        .select()
        .from(clients)
        .where(eq(clients.id, id))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.findById Failed] ${msg}`, error, { id });
      throw error;
    }
  }

  /** @inheritdoc */
  async findBySlug(slug: string): Promise<Client | null> {
    try {
      const rows = await this.db
        .select()
        .from(clients)
        .where(eq(clients.slug, slug))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.findBySlug Failed] ${msg}`, error, { slug });
      throw error;
    }
  }

  /** @inheritdoc */
  async findLiveByOwnerUserId(ownerUserId: string): Promise<Client | null> {
    try {
      const rows = await this.db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.ownerUserId, ownerUserId),
            ne(clients.lifecycleStatus, "baja"),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.findLiveByOwnerUserId Failed] ${msg}`, error, {
        ownerUserId,
      });
      throw error;
    }
  }

  /** @inheritdoc */
  async findRoutingByClientId(clientId: string): Promise<ClientRouting | null> {
    try {
      const rows = await this.db
        .select()
        .from(clientRouting)
        .where(eq(clientRouting.clientId, clientId))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.findRoutingByClientId Failed] ${msg}`, error, {
        clientId,
      });
      throw error;
    }
  }

  /** @inheritdoc */
  async findAvailableCell(preferredCellId?: string): Promise<Cell | null> {
    try {
      if (preferredCellId) {
        const preferred = await this.db
          .select()
          .from(cells)
          .where(
            and(
              eq(cells.id, preferredCellId),
              eq(cells.status, "active"),
              lt(cells.currentClients, cells.maxClients),
            ),
          )
          .limit(1);
        if (preferred[0]) {
          return preferred[0];
        }
      }

      const rows = await this.db
        .select()
        .from(cells)
        .where(
          and(
            eq(cells.status, "active"),
            lt(cells.currentClients, cells.maxClients),
          ),
        )
        .orderBy(asc(cells.currentClients), asc(cells.code))
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.findAvailableCell Failed] ${msg}`, error, {
        preferredCellId,
      });
      throw error;
    }
  }

  /** @inheritdoc */
  async provisionTenantInRouter(
    input: ProvisionTenantPersistenceInput,
  ): Promise<ProvisionedTenantRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        // 1. Insertar la fila del inquilino en admin.clients
        const [createdClient] = await tx
          .insert(clients)
          .values({
            ...input.client,
            contactEmail: input.client.contactEmail.toLowerCase(),
            createdBy: input.actor,
            updatedBy: input.actor,
          })
          .returning();

        if (!createdClient) {
          throw new Error("Failed to insert row into admin.clients");
        }

        // 2. Reservar users.active_client_id de forma atómica exigiendo que sea NULL
        const updatedUsers = await tx
          .update(users)
          .set({
            activeClientId: createdClient.id,
            updatedBy: input.actor,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(users.id, createdClient.ownerUserId),
              isNull(users.activeClientId),
            ),
          )
          .returning({ id: users.id });

        if (updatedUsers.length !== 1) {
          throw new Error("OWNER_ALREADY_HAS_ACTIVE_MEMBERSHIP");
        }

        // 3. Incrementar el contador de inquilinos en la celda verificando cupo
        const updatedCells = await tx
          .update(cells)
          .set({
            currentClients: sql`${cells.currentClients} + 1`,
            updatedBy: input.actor,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cells.id, input.cellId),
              eq(cells.status, "active"),
              lt(cells.currentClients, cells.maxClients),
            ),
          )
          .returning({ id: cells.id });

        if (updatedCells.length !== 1) {
          throw new Error("CELL_CAPACITY_EXCEEDED_OR_INACTIVE");
        }

        // 4. Registrar el historial de asignación de plan en admin.client_plans
        const [createdPlan] = await tx
          .insert(clientPlans)
          .values({
            clientId: createdClient.id,
            planId: createdClient.planId,
            source: input.planSource,
            assignedByUserId: input.assignedByUserId,
            createdBy: input.actor,
            updatedBy: input.actor,
          })
          .returning();

        if (!createdPlan) {
          throw new Error("Failed to insert row into admin.client_plans");
        }

        // 5. Registrar el enrutamiento en admin.client_routing
        const [createdRouting] = await tx
          .insert(clientRouting)
          .values({
            clientId: createdClient.id,
            cellId: input.cellId,
            routingStatus: "active",
            routingVersion: 1,
            createdBy: input.actor,
            updatedBy: input.actor,
          })
          .returning();

        if (!createdRouting) {
          throw new Error("Failed to insert row into admin.client_routing");
        }

        return {
          client: createdClient,
          clientPlan: createdPlan,
          routing: createdRouting,
        };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ClientsRepository.provisionTenantInRouter Failed] ${msg}`, error, {
        slug: input.client.slug,
        ownerUserId: input.client.ownerUserId,
      });
      throw error;
    }
  }
}

