"use client";

import React, { useState } from "react";
import { Users, UserPlus, Shield, CheckCircle2 } from "lucide-react";
import type { WorkspaceTeamMemberDto } from "@mocter/domain";

interface TeamViewProps {
  initialMembers: WorkspaceTeamMemberDto[];
}

export function TeamView({ initialMembers }: TeamViewProps) {
  const [members] = useState<WorkspaceTeamMemberDto[]>(initialMembers);

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Equipo Y Colaboradores
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] border border-cyan-500/20">
              Membresías Celulares
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Gestión de usuarios autorizados para operar en la tienda y atender clientes.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Miembros Del Comercio
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {members.length} {members.length === 1 ? "miembro" : "miembros"}
          </span>
        </div>

        {members.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No Hay Miembros Adicionales
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Solo el propietario principal está registrado actualmente en este comercio.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre / Correo</th>
                  <th className="px-4 py-3 font-medium">Rol Asignado</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Fecha De Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--dsn-text)]">
                        {m.displayName || "Colaborador"}
                      </p>
                      <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                        {m.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                          m.role === "tenant_owner"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        }`}
                      >
                        {m.role === "tenant_owner" ? "Propietario" : "Agente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 capitalize">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                      {m.joinedAt.split("T")[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

