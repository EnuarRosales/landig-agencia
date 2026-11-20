import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as MocterUi from "@mocter/ui";

const REPO_ROOT = resolve(__dirname, "../../..");

/**
 * Recolecta recursivamente archivos `.tsx` de producción excluyendo suites `.test.tsx`.
 */
function collectProductionTsxFiles(dirPath: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectProductionTsxFiles(fullPath));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("SPEC-21 · Auditoría arquitectónica del UI Kit (@mocter/ui)", () => {
  it("exporta las 17 primitivas atómicas, los 3 componentes compuestos y utilidades obligatorias", () => {
    const requiredExports = [
      // 17 primitivas atómicas
      "Button",
      "Input",
      "Textarea",
      "Label",
      "FormField",
      "Select",
      "NativeSelect",
      "CustomSelect",
      "CustomSelectContent",
      "CustomSelectItem",
      "CustomSelectTrigger",
      "CustomSelectValue",
      "Checkbox",
      "Switch",
      "Badge",
      "Alert",
      "AlertTitle",
      "AlertDescription",
      "Dialog",
      "DialogContent",
      "DialogHeader",
      "DialogTitle",
      "DialogDescription",
      "DialogFooter",
      "DialogTrigger",
      "DialogClose",
      "Sheet",
      "SheetContent",
      "SheetHeader",
      "SheetTitle",
      "SheetDescription",
      "SheetFooter",
      "SheetTrigger",
      "SheetClose",
      "Tabs",
      "TabsList",
      "TabsTrigger",
      "TabsContent",
      "Tooltip",
      "TooltipProvider",
      "TooltipTrigger",
      "TooltipContent",
      "DropdownMenu",
      "DropdownMenuTrigger",
      "DropdownMenuContent",
      "DropdownMenuItem",
      "Card",
      "CardHeader",
      "CardTitle",
      "CardDescription",
      "CardContent",
      "CardFooter",
      "Skeleton",
      "EmptyState",
      // 3 componentes compuestos promovidos
      "ConfirmationModal",
      "WorkspaceDataTable",
      "FormSaveBar",
      // Utilidades y hooks
      "useUnsavedChangesGuard",
      "getUiCompositeLabels",
      "cn",
    ] as const;

    for (const exportName of requiredExports) {
      expect(MocterUi, `Falta exportar '${exportName}' en @mocter/ui`).toHaveProperty(exportName);
      expect((MocterUi as Record<string, unknown>)[exportName]).toBeDefined();
    }
  });

  it("adopta @mocter/ui de forma transversal en /workspace/*, /admin/*, /onboarding/*, /invite/* y apps/web auth", () => {
    const requiredAdopters = [
      // Workspace inquilino
      "apps/admin/app/workspace/products/products-view.tsx",
      "apps/admin/app/workspace/contacts/contacts-view.tsx",
      "apps/admin/app/workspace/orders/orders-view.tsx",
      "apps/admin/app/workspace/conversations/conversations-view.tsx",
      "apps/admin/app/workspace/bot/bot-view.tsx",
      "apps/admin/app/workspace/branding/branding-view.tsx",
      "apps/admin/app/workspace/billing/billing-view.tsx",
      "apps/admin/app/workspace/ai/ai-settings-view.tsx",
      "apps/admin/app/workspace/reports/page.tsx",
      // Onboarding
      "apps/admin/app/onboarding/tenant-onboarding-wizard.tsx",
      "apps/admin/app/onboarding/steps/step-business.tsx",
      // Invitaciones y Plano de Control (/admin/*)
      "apps/admin/app/invite/[token]/invite-accept-view.tsx",
      "apps/admin/app/admin/users/rbac-view.tsx",
      "apps/admin/app/admin/ai/ai-governance-view.tsx",
      "apps/admin/app/admin/settings/notifications/notifications-view.tsx",
      "apps/admin/app/admin/settings/branding/branding-view.tsx",
      "apps/admin/app/admin/billing/billing-tabs-view.tsx",
      "apps/admin/app/admin/communities/communities-admin-view.tsx",
      "apps/admin/app/admin/plans/plan-modal-dialog.tsx",
      "apps/admin/app/admin/tenants/create-tenant-form.tsx",
      "apps/admin/app/admin/cells/create-cell-form.tsx",
      "apps/admin/app/admin/orders/new-order-dialog.tsx",
      "apps/admin/app/admin/leads/page.tsx",
      "apps/admin/app/admin/reports/reports-view.tsx",
      "apps/admin/app/admin/referrals/referrals-view.tsx",
      // Auth y módulos administrativos de apps/web
      "apps/web/components/auth/login-form.tsx",
      "apps/web/components/auth/login-view.tsx",
      "apps/web/components/auth/register-form.tsx",
      "apps/web/components/auth/setup-owner-form.tsx",
      "apps/web/components/auth/setup-password-card.tsx",
      "apps/web/components/auth/verify-email-card.tsx",
      "apps/web/components/admin/crm/contacts-dashboard.tsx",
      "apps/web/components/admin/ai-assist/ai-assist-button.tsx",
    ];

    for (const relPath of requiredAdopters) {
      const content = readFileSync(join(REPO_ROOT, relPath), "utf8");
      expect(content, `${relPath} debe importar desde @mocter/ui`).toMatch(/from\s+["']@mocter\/ui["']/);
    }
  });

  it("prohíbe role='dialog' manuales, tokens --dsn-primary, diálogos nativos y clases uppercase en labels", () => {
    const auditedRoots = [
      "apps/admin/app",
      "apps/admin/components",
      "apps/web/components/auth",
      "apps/web/components/admin",
    ];

    const files = auditedRoots.flatMap((root) => collectProductionTsxFiles(join(REPO_ROOT, root)));
    expect(files.length).toBeGreaterThan(20);

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");

      expect(content, `role="dialog" manual prohibido en ${filePath}`).not.toMatch(/role=["']dialog["']/);
      expect(content, `Token inexistente --dsn-primary detectado en ${filePath}`).not.toContain("--dsn-primary");
      expect(content, `Diálogo nativo del navegador prohibido en ${filePath}`).not.toMatch(
        /\bwindow\.(alert|confirm|prompt)\s*\(/,
      );
      expect(content, `Clase uppercase prohibida en <label>/<Label> en ${filePath}`).not.toMatch(
        /<(?:label|Label)\b[^>]*uppercase[^>]*>/,
      );
    }
  });
});
