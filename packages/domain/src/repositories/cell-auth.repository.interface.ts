/**
 * Error emitido cuando una celda de datos no responde, está caída o experimenta timeout (AUTH-001 T-27).
 * Se traduce en HTTP 503 Service Unavailable bajo principio Fail-Closed.
 */
export class CellUnavailableError extends Error {
  constructor(
    message: string = "Celda temporalmente fuera de servicio.",
    public readonly cellId?: string,
  ) {
    super(message);
    this.name = "CellUnavailableError";
  }
}

/**
 * Snapshot de credenciales y segundo factor de un usuario alojado en una celda de datos (AUTH-001 §4.2).
 */
export interface CellUserCredentials {
  /** Identificador UUID del usuario (preservado desde el Router Global). */
  id: string;
  /** Identificador del inquilino propietario del registro bajo RLS. */
  clientId: string;
  /** Correo normalizado del usuario en minúsculas. */
  email: string;
  /** Hash Argon2id de la contraseña (o nulo si la cuenta es federada). */
  passwordHash: string | null;
  /** Fecha UTC de última actualización de contraseña. */
  passwordUpdatedAt: Date | null;
  /** Secreto TOTP activo cifrado simétricamente con AES-256-GCM. */
  totpSecretCiphertext: Buffer | null;
  /** Identificador de la clave AES activa usada para cifrar el secreto TOTP. */
  totpKeyId: string | null;
  /** Fecha UTC de activación del segundo factor 2FA (nulo si no está habilitado). */
  totpEnabledAt: Date | null;
  /** Secreto TOTP pendiente de confirmación durante el enrolamiento. */
  totpPendingSecretCiphertext: Buffer | null;
  /** Clave del secreto TOTP pendiente. */
  totpPendingKeyId: string | null;
  /** Fecha de creación del secreto pendiente (vence a los 10 minutos). */
  totpPendingCreatedAt: Date | null;
  /** Último paso de tiempo TOTP verificado para mitigar ataques de replay. */
  totpLastUsedStep: number | null;
  /** Estado de la cuenta en la celda ("active", "disabled"). */
  status: string;
  /** Nombre visible del usuario. */
  displayName: string | null;
  /** URL del avatar del usuario. */
  avatarUrl: string | null;
}

/**
 * Snapshot de una identidad federada asociada a un usuario en una celda (AUTH-001 §4.2).
 */
export interface CellIdentitySnapshot {
  /** Proveedor federado ("google" | "facebook"). */
  provider: "google" | "facebook";
  /** Identificador del sujeto devuelto por el proveedor. */
  providerUserId: string;
  /** Correo original reportado por el proveedor. */
  providerEmail?: string | null;
  /** Indicador de si el proveedor certificó la verificación del correo. */
  emailVerified?: boolean;
  /** Nombre visible reportado por el proveedor. */
  displayName?: string | null;
  /** URL de avatar provista por el proveedor. */
  avatarUrl?: string | null;
}

/**
 * Parámetros para la expansión inicial de un usuario en una celda destino (AUTH-001 §5.12).
 */
export interface ExpandCellUserParams {
  id: string;
  clientId: string;
  email: string;
  emailVerifiedAt: Date | null;
  status: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Contrato de repositorio para la interacción con identidades y credenciales en celdas de datos (AUTH-001 T-27, DAT-001 §4.4).
 */
export interface ICellAuthRepository {
  /**
   * Consulta las credenciales y secretos de un usuario en su celda asignada bajo RLS.
   *
   * @param cellId - Identificador UUID de la celda de datos.
   * @param clientId - Identificador UUID del inquilino (fijado vía `SET LOCAL app.current_client_id`).
   * @param userId - Identificador UUID del usuario a consultar.
   * @returns La entidad {@link CellUserCredentials} o `null` si no existe en la celda.
   * @throws {CellUnavailableError} Si la celda no responde o experimenta timeout.
   */
  findUserCredentialsInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellUserCredentials | null>;

  /**
   * Actualiza el hash de contraseña de un usuario en su celda asignada (rehash transparente).
   */
  updatePasswordHashInCell(
    cellId: string,
    clientId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void>;

  /**
   * Actualiza el último paso temporal TOTP verificado en la celda para protección anti-replay.
   */
  updateTotpLastUsedStepInCell(
    cellId: string,
    clientId: string,
    userId: string,
    step: number,
  ): Promise<void>;

  /**
   * Lista las identidades federadas asociadas a un usuario en una celda bajo RLS.
   */
  listUserIdentitiesInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellIdentitySnapshot[]>;

  /**
   * Fase 1 de Migración inter-celdas: Crea o actualiza la fila `users` en la celda destino con RLS (§5.12).
   */
  expandCellUser(targetCellId: string, user: ExpandCellUserParams): Promise<void>;

  /**
   * Fase 2 de Migración inter-celdas: Copia contraseñas y secretos TOTP a la celda destino (§5.12).
   */
  copyCredentialsToCell(
    targetCellId: string,
    credentials: CellUserCredentials,
  ): Promise<void>;

  /**
   * Fase 2 de Migración inter-celdas: Copia identidades federadas a la celda destino (§5.12).
   */
  copyIdentitiesToCell(
    targetCellId: string,
    clientId: string,
    userId: string,
    identities: CellIdentitySnapshot[],
  ): Promise<void>;

  /**
   * Fase 3 de Migración inter-celdas: Limpia las credenciales y secretos de la celda origen (§5.12).
   */
  cleanupSourceCredentials(
    sourceCellId: string,
    clientId: string,
    userId: string,
  ): Promise<void>;
}
