import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/access";
import { readManagement, reviewAccess } from "@/lib/management.functions";
import { catalogOptions, fieldClass } from "@/lib/portal-data";
const options = queryOptions({ queryKey: ["admin-accounts"], queryFn: () => readManagement() });
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (!context.access.canReadAll) throw redirect({ to: "/inicio" });
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(options),
      context.queryClient.ensureQueryData(catalogOptions),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Colaboradores e acessos — Natal Pneus" },
      { name: "description", content: "Consulta de contas e aprovação administrativa de acessos." },
      { property: "og:title", content: "Colaboradores e acessos — Natal Pneus" },
      {
        property: "og:description",
        content: "Consulta de contas e aprovação administrativa de acessos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});
const labels = {
  pending: "Pendente de aprovação",
  approved: "Liberado",
  rejected: "Rejeitado",
  suspended: "Suspenso",
};
function Admin() {
  const { access } = Route.useRouteContext();
  const { data } = useSuspenseQuery(options);
  const { data: catalog } = useSuspenseQuery(catalogOptions);
  const qc = useQueryClient();
  const review = useServerFn(reviewAccess);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [store, setStore] = useState("");
  const [status, setStatus] = useState("");
  async function save(e: FormEvent<HTMLFormElement>, p: Profile) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const role = String(f.get("role"));
      if (
        role !== "employee" &&
        role !== "director" &&
        role !== "general_manager" &&
        role !== "supervisor"
      )
        return;
      const nextStatus = String(f.get("status"));
      if (
        nextStatus !== "approved" &&
        nextStatus !== "pending" &&
        nextStatus !== "rejected" &&
        nextStatus !== "suspended"
      )
        return;
      const rawUnit = String(f.get("unit"));
      const unit = rawUnit === "ALL" ? null : rawUnit;
      if (unit !== null && unit !== "NP1" && unit !== "NP2" && unit !== "NP3" && unit !== "NP4")
        throw new Error("Selecione uma unidade.");
      if (unit === null && role !== "director" && role !== "general_manager")
        throw new Error("Todas as lojas vale apenas para Diretoria ou Gestor Geral.");
      await review({
        data: {
          id: p.id,
          status: nextStatus,
          unit,
          job: String(f.get("job")),
          sector: unit === null ? null : String(f.get("sector")) || null,
          role,
          producer: f.get("producer") === "on",
        },
      });
      const { error } = await supabase
        .from("profiles")
        .update({ admission_date: String(f.get("admission")) || null })
        .eq("id", p.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function badge(user: string, id: string, has: boolean) {
    setError("");
    const r = has
      ? await supabase.from("employee_badges").delete().eq("user_id", user).eq("badge_id", id)
      : await supabase.from("employee_badges").insert({ user_id: user, badge_id: id });
    if (r.error) setError("Não foi possível alterar o reconhecimento.");
    else await qc.invalidateQueries({ queryKey: ["admin-accounts"] });
  }
  const people = data.people.filter(
    (p) =>
      (!store || (p.unit_code ?? p.requested_unit_code) === store) &&
      (!status || p.status === status) &&
      (p.full_name + " " + p.email).toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <PortalShell
      title="Colaboradores e acessos"
      eyebrow={access.isAdmin ? "Administração" : "Consulta · somente leitura"}
    >
      <p role="status" className="text-sm text-muted-foreground">
        {data.people.filter((p) => p.status === "pending").length} pedido(s) pendente(s) de
        aprovação
      </p>
      <div className="my-5 grid gap-3 sm:grid-cols-3">
        <input
          aria-label="Buscar colaborador"
          placeholder="Nome ou e-mail"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={fieldClass}
        />
        <select
          aria-label="Filtrar loja"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          className={fieldClass}
        >
          <option value="">Todas as lojas</option>
          {catalog.units.map((u) => (
            <option key={u.code}>{u.code}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClass}
        >
          <option value="">Todos os status</option>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {!people.length && <p className="text-muted-foreground">Nenhuma conta encontrada.</p>}
        {people.map((p) => {
          const roles = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role);
          const admin = roles.includes("admin");
          const badges = new Set(
            data.awarded.filter((b) => b.user_id === p.id).map((b) => b.badge_id),
          );
          return (
            <article key={p.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{p.full_name || "Sem nome"}</h2>
                  <p className="break-all text-sm text-muted-foreground">{p.email}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {labels[p.status]} ·{" "}
                    {p.unit_code ??
                      (p.requested_all_stores
                        ? "Todas as lojas"
                        : (p.requested_unit_code ?? "Sem loja"))}{" "}
                    · {p.job_role ?? p.requested_job_role ?? "Sem função"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  {open === p.id
                    ? "Fechar"
                    : access.isAdmin && !admin
                      ? "Revisar acesso"
                      : "Ver histórico"}
                </Button>
              </div>
              {open === p.id && (
                <div className="mt-5 border-t border-border pt-5">
                  {access.isAdmin && !admin && (
                    <form onSubmit={(e) => save(e, p)} className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm">
                        Unidade
                        <select
                          name="unit"
                          required
                          defaultValue={
                            p.unit_code ??
                            (p.requested_all_stores ? "ALL" : (p.requested_unit_code ?? ""))
                          }
                          className={fieldClass}
                        >
                          <option value="">Selecione</option>
                          <option value="ALL">
                            Todas as lojas · Diretoria ou Gestor Geral
                          </option>
                          {catalog.units.map((u) => (
                            <option key={u.code}>{u.code}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Função aprovada
                        <select
                          name="job"
                          required
                          defaultValue={p.job_role ?? p.requested_job_role ?? ""}
                          className={fieldClass}
                        >
                          <option value="">Selecione</option>
                          {catalog.jobs.map((j) => (
                            <option key={j.id}>{j.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Setor
                        <select
                          name="sector"
                          defaultValue={p.sector_id ?? ""}
                          className={fieldClass}
                        >
                          <option value="">Sem setor</option>
                          {data.sectors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.unit_code} · {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Perfil de acesso
                        <select
                          name="role"
                          defaultValue={
                            roles.find((r) => r !== "producer" && r !== "admin") ?? "employee"
                          }
                          className={fieldClass}
                        >
                          <option value="employee">Funcionário</option>
                          <option value="director">Diretoria · leitura integral</option>
                          <option value="general_manager">Gestor Geral · leitura integral</option>
                          <option value="supervisor">Supervisor · leitura da unidade</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Status
                        <select name="status" defaultValue={p.status} className={fieldClass}>
                          {Object.entries(labels).map(([k, v]) => (
                            <option value={k} key={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Admissão
                        <input
                          type="date"
                          name="admission"
                          defaultValue={p.admission_date ?? ""}
                          className={fieldClass}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          name="producer"
                          type="checkbox"
                          defaultChecked={roles.includes("producer")}
                        />
                        Gera faturamento · consultar apenas os próprios resultados
                      </label>
                      <Button disabled={busy} className="sm:col-span-2">
                        {busy ? "Salvando…" : "Salvar revisão"}
                      </Button>
                    </form>
                  )}
                  <h3 className="mt-5 font-semibold">Histórico e reconhecimentos</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Admissão: {p.admission_date ?? "Não informada"} · {badges.size}{" "}
                    reconhecimento(s)
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.badges.map((b) => (
                      <Button
                        key={b.id}
                        disabled={!access.isAdmin}
                        variant={badges.has(b.id) ? "secondary" : "outline"}
                        onClick={() => badge(p.id, b.id, badges.has(b.id))}
                      >
                        {b.name}
                        {badges.has(b.id) ? " ✓" : " +"}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {access.isAdmin && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Últimas alterações administrativas</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-3">Data</th>
                  <th>Ação</th>
                  <th>Registro</th>
                  <th>Autor</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-3">{new Date(a.created_at).toLocaleString("pt-BR")}</td>
                    <td>{a.action}</td>
                    <td>{a.table_name}</td>
                    <td>{data.people.find((p) => p.id === a.actor_id)?.full_name || "Sistema"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
