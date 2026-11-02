import { redirect } from "next/navigation";

/**
 * Redirección canónica de /admin/plans hacia el módulo unificado /admin/billing (BILL-001 D-10).
 */
export default function AdminPlansPage() {
  redirect("/admin/billing?tab=plans");
}
