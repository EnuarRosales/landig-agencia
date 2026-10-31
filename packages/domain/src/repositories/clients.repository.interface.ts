import type { Client, NewClient } from "../db/schemas/admin/clients";
import type { ClientRouting } from "../db/schemas/admin/client-routing";
import type { ClientPlan } from "../db/schemas/admin/client-plans";
import type { Cell } from "../db/schemas/admin/cells";

/**
 * Datos de entrada para aprovisionar un inquilino con su plan inicial y enrutamiento de celda.
 */
export interface ProvisionTenantPersistenceInput {
  /** Datos de la fila `admin.clients` a insertar. */
  client: NewClient;
  /** Identificador UUID de la celda asignada (`admin.cells.id`). */
  cellId: string;
  /** Origen de la asignación del plan: `'manual'` (`platform_sales`) o `'self_service'` (onboarding). */
  planSource: "manual" | "self_service";
  /** Usuario que ejecuta la asignación de plan (ej. vendedor o el propio dueño). */
  assignedByUserId: string;
  /** Identificador de actor para trazabilidad (`created_by` / `updated_by`). */
  actor: string;
}

/**
 * Resultado persistido del aprovisionamiento transaccional en el Router Global.
 */
export interface ProvisionedTenantRecord {
  /** Fila creada en `admin.clients`. */
  client: Client;
  /** Fila de historial creada en `admin.client_plans`. */
  clientPlan: ClientPlan;
  /** Fila de enrutamiento creada en `admin.client_routing`. */
  routing: ClientRouting;
}

/**
 * Contrato de persistencia para la gestión de inquilinos (`admin.clients`),
 * planes asignados (`admin.client_plans`) y enrutamiento de celdas (`admin.client_routing`)
 * en el Router Global (ADM-001 T-06, T-07, T-09).
 */
export interface IClientsRepository {
  /**
   * Busca un inquilino por su identificador UUID canónico.
   *
   * @param id - Identificador UUID del inquilino (`client_id`).
   * @returns El inquilino encontrado o `null` si no existe.
   */
  findById(id: string): Promise<Client | null>;

  /**
   * Busca un inquilino por su slug único.
   *
   * @param slug - Identificador legible único del inquilino.
   * @returns El inquilino encontrado o `null` si no existe.
   */
  findBySlug(slug: string): Promise<Client | null>;

  /**
   * Busca el inquilino vivo (`lifecycle_status <> 'baja'`) cuyo dueño es `ownerUserId`.
   *
   * @param ownerUserId - Identificador UUID del usuario en `admin.users`.
   * @returns El inquilino activo/en alta/suspendido del dueño, o `null` si no posee ninguno vivo.
   */
  findLiveByOwnerUserId(ownerUserId: string): Promise<Client | null>;

  /**
   * Obtiene el enrutamiento vigente de un inquilino (`admin.client_routing`).
   *
   * @param clientId - Identificador UUID del inquilino.
   * @returns La fila de enrutamiento o `null` si no existe.
   */
  findRoutingByClientId(clientId: string): Promise<ClientRouting | null>;

  /**
   * Selecciona una celda activa con capacidad disponible (`status = 'active'` y `current_clients < max_clients`).
   *
   * @param preferredCellId - Identificador UUID opcional de celda preferida.
   * @returns La celda disponible o `null` si ninguna celda activa tiene cupo.
   */
  findAvailableCell(preferredCellId?: string): Promise<Cell | null>;

  /**
   * Ejecuta de forma atómica en el Router Global:
   * 1. Reserva de `users.active_client_id` verificando que el dueño no tenga otra membresía activa.
   * 2. Inserción de `admin.clients` con `owner_user_id` obligatorio.
   * 3. Registro del plan inicial en `admin.client_plans`.
   * 4. Registro del enrutamiento en `admin.client_routing` e incremento de `cells.current_clients`.
   *
   * @param input - Parámetros de aprovisionamiento del inquilino.
   * @returns El registro compuesto creado (`client`, `clientPlan`, `routing`).
   */
  provisionTenantInRouter(
    input: ProvisionTenantPersistenceInput,
  ): Promise<ProvisionedTenantRecord>;
}

