import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, BadgePercent, Lock } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_TYPES } from "@/lib/customer-webhook";
import { fieldClass } from "@/lib/portal-data";

export const Route = createFileRoute("/_authenticated/admin-alertas")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Alertas de clientes — Gestão — Natal Pneus" },
      {
        name: "description",
        content: "Mudanças de tipo de cliente no Decision: varejo, frota e atacado.",
      },
      { property: "og:title", content: "Alertas de clientes — Gestão — Natal Pneus" },
      {
        property: "og:description",
        content: "Alertas de mudanças de tipo de cliente no Decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAlertas,
});

const FILTERS = [
  { key: "", label: "Todas as mudanças" },
  { key: "2-3", label: "Varejo → Atacado" },
  { key: "4-3", label: "Frota → Atacado" },
  { key: "2-4", label: "Varejo → Frota" },
] as const;

const typeName = (code: number | null, name: string | null) =>
  (name && name.trim()) || (code !== null ? (CUSTOMER_TYPES[code] ?? String(code)) : "—");

function AdminAlertas() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("");
  const [onlyNew, setOnlyNew] = useState(false);
  const { data, isPending, error } = useQuery({
    queryKey: ["customer-type-changes"],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("customer_type_changes")
        .select(
          "notice,customer_code,customer_name,old_type,new_type,old_name,new_name,event_at,received_at,seen_at",
        )
        .order("received_at", { ascending: false })
        .limit(300);
      if (err)
        throw new Error(
          "Não foi possível consultar os alertas. A atualização do banco (0033) já foi aplicada?",
        );
      return rows ?? [];
    },
  });

  const rows = (data ?? []).filter(
    (r) => (!filter || `${r.old_type}-${r.new_type}` === filter) && (!onlyNew || !r.seen_at),
  );
  const unseen = (data ?? []).filter((r) => !r.seen_at).length;

  async function markSeen() {
    await supabase
      .from("customer_type_changes")
      .update({ seen_at: new Date().toISOString() })
      .is("seen_at", null);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["customer-type-changes"] }),
      qc.invalidateQueries({ queryKey: ["customer-alerts-count"] }),
    ]);
  }

  return (
    <PortalShell title="Alertas de clientes" eyebrow="Gestão · ADM RH">
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        O Decision avisa o portal, na hora, quando o tipo de um cliente muda de varejo para frota,
        de varejo para atacado ou de frota para atacado. Outras mudanças não geram aviso.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mudança
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={fieldClass}>
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Só os novos
        </label>
        {unseen > 0 && (
          <Button variant="outline" onClick={markSeen}>
            Marcar {unseen} como visto{unseen > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      <section className="mt-5 min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
        {isPending ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum aviso ainda. Quando um cliente mudar de tipo no Decision, ele aparece aqui.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.notice}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
              >
                <span className="w-32 tabular-nums text-muted-foreground">
                  {r.event_at
                    ? new Date(r.event_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
                <span className="min-w-56 flex-1 font-semibold">
                  {r.customer_code} · {r.customer_name || "Cliente sem nome"}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${r.new_type === 3 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                >
                  {typeName(r.old_type, r.old_name)}
                  <ArrowRight size={13} aria-hidden="true" />
                  {typeName(r.new_type, r.new_name)}
                </span>
                {!r.seen_at && (
                  <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-white">
                    Novo
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Ainda em preparação</h2>
        <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <Lock size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <b className="text-foreground">Novo cliente de atacado:</b> o Decision ainda não avisa
              cadastros novos.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <BadgePercent size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <b className="text-foreground">Desconto acima do limite:</b> precisa do limite de
              desconto de cada vendedor.
            </span>
          </li>
        </ul>
      </section>
    </PortalShell>
  );
}
