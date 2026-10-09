import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Administração de acessos — Natal Pneus" },
      { name: "description", content: "Aprove, suspenda e acompanhe os cadastros de colaboradores." },
      { property: "og:title", content: "Administração de acessos — Natal Pneus" },
      { property: "og:description", content: "Aprove, suspenda e acompanhe os cadastros de colaboradores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const statusLabel: Record<Profile["status"], string> = { pending: "Pendente", approved: "Aprovado", suspended: "Suspenso" };

function AdminPage() {
  const qc = useQueryClient();
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function setStatus(id: string, status: Profile["status"]) {
    await supabase.from("profiles").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  }

  const pending = people.filter((p) => p.status === "pending").length;

  return (
    <PortalShell title="Administração de acessos" eyebrow="Área do administrador">
      <p className="text-sm text-muted-foreground">{pending} cadastro(s) aguardando aprovação.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>{["Colaborador", "Matrícula", "Função", "Unidade", "Admissão", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-muted-foreground">Carregando…</td></tr>}
            {!isLoading && people.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-muted-foreground">Nenhum cadastro ainda.</td></tr>}
            {people.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><p className="font-semibold">{p.full_name || "—"}</p><p className="text-xs text-muted-foreground">{p.email}</p></td>
                <td className="px-4 py-3">{p.internal_id || "—"}</td>
                <td className="px-4 py-3">{p.job_role || "—"}</td>
                <td className="px-4 py-3">{p.unit || "—"}</td>
                <td className="px-4 py-3">{p.admission_date || "—"}</td>
                <td className="px-4 py-3">{statusLabel[p.status]}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {p.status !== "approved" && <button onClick={() => setStatus(p.id, "approved")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Aprovar</button>}
                    {p.status === "approved" && <button onClick={() => setStatus(p.id, "suspended")} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Suspender</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalShell>
  );
}
