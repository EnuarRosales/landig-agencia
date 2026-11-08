import { check, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Perfiles de despliegue admitidos para un host físico o virtual (CEL-001 §3.2, DAT-001 §3.3).
 */
export type CellHostDeploymentProfile = "local_development" | "control_plane_vps" | "external_vps";

/**
 * Estados operativos manuales y auditables de elegibilidad de un host (CEL-RF-001, DAT-001 §3.3).
 */
export type CellHostStatus = "ready" | "maintenance" | "disabled";

/**
 * Registro de hosts del Plano de Control para placement explícito de celdas de datos (CEL-RF-001, DAT-001 §3.3).
 *
 * Cada registro representa un nodo de infraestructura física o virtual elegible para alojar una o más celdas.
 * Solo los hosts en estado `ready` pueden recibir nuevas celdas. El estado `ready` es una declaración manual y auditada
 * del operador tras verificar la capacidad disponible del host; ningún proceso automático ni migración lo declara.
 */
export const cellHosts = adminSchema.table(
  "cell_hosts",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    code: text("code").notNull().unique(),
    deploymentProfile: text("deployment_profile")
      .$type<CellHostDeploymentProfile>()
      .notNull(),
    status: text("status")
      .$type<CellHostStatus>()
      .notNull()
      .default("ready"),
    connectivityConfigRef: text("connectivity_config_ref").notNull(),
    ...auditColumns(),
  },
  (table) => [
    check(
      "cell_hosts_deployment_profile_check",
      sql.raw("deployment_profile IN ('local_development', 'control_plane_vps', 'external_vps')"),
    ),
    check(
      "cell_hosts_status_check",
      sql.raw("status IN ('ready', 'maintenance', 'disabled')"),
    ),
  ],
);

export type CellHost = typeof cellHosts.$inferSelect;
export type NewCellHost = typeof cellHosts.$inferInsert;

