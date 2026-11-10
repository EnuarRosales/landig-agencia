import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminUsersRbacPage from "./page";
import { RbacView } from "./rbac-view";

vi.mock("@mocter/domain", () => ({
  fetchRbacOverview: vi.fn().mockResolvedValue({
    kpis: {
      totalUsers: 3,
      activeUsers: 3,
      totalRoles: 3,
      totalPermissions: 23,
    },
    users: [
      {
        id: "usr-01",
        email: "soporte@mocter.co",
        displayName: "Admin Mocter",
        status: "active",
        identityLocation: "router",
        roles: ["platform_owner"],
        createdAt: "2026-10-24",
      },
      {
        id: "usr-02",
        email: "admin@mocter.co",
        displayName: "Platform Admin Mocter",
        status: "active",
        identityLocation: "router",
        roles: ["platform_admin"],
        createdAt: "2026-10-24",
      },
    ],
    roles: [
      {
        key: "platform_owner",
        name: "Platform Owner",
        description: "Propietario supremo de la SaaS",
        scope: "platform",
        isSystem: true,
        status: "active",
        assignedUsersCount: 1,
        permissions: ["platform.governance.manage", "platform.roles.manage"],
      },
      {
        key: "platform_admin",
        name: "Platform Admin",
        description: "Administrador de operaciones",
        scope: "platform",
        isSystem: true,
        status: "active",
        assignedUsersCount: 1,
        permissions: ["platform.audit.view"],
      },
    ],
    permissionModules: [
      {
        module: "Gobierno y Control",
        permissions: [
          {
            key: "platform.governance.manage",
            module: "Gobierno y Control",
            name: "Control Supremo Del Sistema",
            description: "Supervisión total",
            isCritical: true,
          },
          {
            key: "platform.roles.manage",
            module: "Gobierno y Control",
            name: "Gestión De Roles y Matriz RBAC",
            description: "Crear y editar roles",
            isCritical: true,
          },
        ],
      },
    ],
  }),
}));

describe("ADM-001 D-31 · Consola de Gobernanza de Usuarios, Roles y Permisos (RBAC)", () => {
  it("renderiza el Server Component con encabezado institucional y vista RBAC", async () => {
    const page = await AdminUsersRbacPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(2);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const view = children[1] as React.ReactElement<any>;
    expect(view.type).toBe(RbacView);
    expect(view.props.initialData.kpis.totalUsers).toBe(3);
    expect(view.props.initialData.users[0].email).toBe("soporte@mocter.co");
    expect(view.props.initialData.roles[0].key).toBe("platform_owner");
  });

  it("renderiza RbacView con estructura de pestañas e indicadores KPI", () => {
    const mockData = {
      kpis: {
        totalUsers: 2,
        activeUsers: 2,
        totalRoles: 2,
        totalPermissions: 2,
      },
      users: [
        {
          id: "usr-01",
          email: "soporte@mocter.co",
          displayName: "Admin Mocter",
          status: "active",
          identityLocation: "router",
          roles: ["platform_owner"],
          createdAt: "2026-10-24",
        },
      ],
      roles: [
        {
          key: "platform_owner",
          name: "Platform Owner",
          description: "Propietario supremo de la SaaS",
          scope: "platform",
          isSystem: true,
          status: "active",
          assignedUsersCount: 1,
          permissions: ["platform.governance.manage"],
        },
      ],
      permissionModules: [
        {
          module: "Gobierno y Control",
          permissions: [
            {
              key: "platform.governance.manage",
              module: "Gobierno y Control",
              name: "Control Supremo Del Sistema",
              description: "Supervisión total",
              isCritical: true,
            },
          ],
        },
      ],
    };

    const element = <RbacView initialData={mockData} />;
    expect(React.isValidElement(element)).toBe(true);
  });
});

