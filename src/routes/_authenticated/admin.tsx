import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/access";
import { signedUrls } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Contas dos colaboradores — Natal Pneus" },
      { name: "description", content: "Veja todas as contas, libere acessos e entregue insígnias." },
      { property: "og:title", content: "Contas dos colaboradores — Natal Pneus" },
      { property: "og:description", content: "Veja todas as contas, libere acessos e entregue insígnias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const statusLabel: Record<Profile["status"], string> = { pending: "Aguardando liberação", approved: "Liberado", suspended: "Suspenso" };
const btn = "rounded-lg px-3 py-1.5 text-xs font-semibold";

function AdminPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const [p, b, eb] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("badges").select("*").order("name"),
        supabase.from("employee_badges").select("*"),
      ]);
      if (p.error) throw p.error;
      const badges = b.data ?? [];
      const urls = await signedUrls("badges", badges.map((x) => x.image_path));
      return { people: p.data, badges, awarded: eb.data ?? [], urls };
    },
  });
  const people = data?.people ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-accounts"] });

  async function setStatus(id: string, status: Profile["status"]) {
    await supabase.from("profiles").update({ status }).eq("id", id);
    refresh();
  }
  async function setAdmission(id: string, value: string) {
    await supabase.from("profiles").update({ admission_date: value || null }).eq("id", id);
    refresh();
  }
  async function toggleBadge(userId: string, badgeId: string, has: boolean) {
    if (has) await supabase.from("employee_badges").delete().eq("user_id", userId).eq("badge_id", badgeId);
    else await supabase.from("employee_badges").insert({ user_id: userId, badge_id: badgeId });
    refresh();
  }

  const pending = people.filter((p) => p.status === "pending").length;

  return (
    <PortalShell title="Contas dos colaboradores" eyebrow="Área do administrador">
      {pending > 0 ? (
        <p role="status" className="rounded-xl border border-primary bg-card p-4 text-sm font-semibold">🔔 {pending} pedido(s) de acesso aguardando sua liberação.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum pedido de acesso pendente.</p>
      )}
      <div className="mt-5 space-y-3">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && people.length === 0 && <p className="text-muted-foreground">Nenhuma conta ainda.</p>}
        {people.map((p) => {
          const mine = new Set(data?.awarded.filter((a) => a.user_id === p.id).map((a) => a.badge_id));
          return (
            <article key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{p.email} · {p.phone || "sem telefone"}</p>
                  <p className="mt-1 text-xs">{statusLabel[p.status]} · {mine.size} reconhecimento(s)</p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">Admissão
                    <input type="date" defaultValue={p.admission_date ?? ""} onBlur={(e) => setAdmission(p.id, e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-foreground" />
                  </label>
                </div>
                <div className="flex gap-2">
                  {p.status !== "approved" && <button onClick={() => setStatus(p.id, "approved")} className={`${btn} bg-primary text-primary-foreground`}>Liberar acesso</button>}
                  {p.status === "approved" && <button onClick={() => setStatus(p.id, "suspended")} className={`${btn} border border-border`}>Suspender</button>}
                  <button onClick={() => setOpen(open === p.id ? null : p.id)} className={`${btn} border border-border`}>Reconhecimentos</button>
                </div>
              </div>
              {open === p.id && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {data?.badges.length === 0 && <p className="text-sm text-muted-foreground">Cadastre insígnias na página Insígnias.</p>}
                  {data?.badges.map((b) => {
                    const has = mine.has(b.id);
                    return (
                      <button key={b.id} onClick={() => toggleBadge(p.id, b.id, has)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${has ? "border-primary bg-muted" : "border-border"}`}>
                        {b.image_path && data.urls[b.image_path] && <img src={data.urls[b.image_path]} alt="" className="size-8 object-contain" />}
                        {b.name} {has ? "✓" : "+"}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </PortalShell>
  );
}
