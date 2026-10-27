import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canManageAssets } from "@/lib/access";
import {
  DUE_LABEL,
  STATUS_LABEL,
  dueState,
  formatDate,
  todayISO,
  type Asset,
  type DueState,
} from "@/lib/assets";
import { fieldClass } from "@/lib/portal-data";
import { money, parseCents } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/patrimonio/")({
  beforeLoad: ({ context }) => {
    if (!canManageAssets(context.access)) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Patrimônio — Natal Pneus" },
      {
        name: "description",
        content: "Tombo dos equipamentos da loja: fotos, documentos e histórico de manutenção.",
      },
      { property: "og:title", content: "Patrimônio — Natal Pneus" },
      { property: "og:description", content: "Equipamentos da loja e histórico de manutenção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Patrimonio,
});

const dueClass: Record<DueState, string> = {
  vencida: "bg-destructive/10 text-destructive",
  vence_em_breve: "bg-accent text-accent-foreground",
  em_dia: "bg-success-soft text-success",
};

function Patrimonio() {
  const { access } = Route.useRouteContext();
  const navigate = useNavigate();
  const leader = Boolean(access.isAdmin || access.canReadAll);
  const [unit, setUnit] = useState("");
  const [show, setShow] = useState<"ativos" | "baixados" | "todos">("ativos");
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayISO();

  const units = useQuery({
    queryKey: ["asset-units"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("code").order("code");
      return (data ?? []).map((u) => u.code);
    },
  });
  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("assets")
        .select("*")
        .order("code", { ascending: true });
      if (err)
        throw new Error(
          "Não foi possível consultar o patrimônio. A atualização do banco (0022) já foi aplicada?",
        );
      return data as Asset[];
    },
  });

  const rows = (assets.data ?? []).filter((a) => {
    if (unit && a.unit_code !== unit) return false;
    if (show === "ativos" && a.status === "baixado") return false;
    if (show === "baixados" && a.status !== "baixado") return false;
    if (onlyDue && !(a.status !== "baixado" && dueState(a.next_preventive, today) === "vencida"))
      return false;
    const q = search.trim().toLowerCase();
    return (
      !q || [a.code, a.name, a.category, a.serial_number].some((v) => v?.toLowerCase().includes(q))
    );
  });
  const overdue = (assets.data ?? []).filter(
    (a) => a.status !== "baixado" && dueState(a.next_preventive, today) === "vencida",
  ).length;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    try {
      const unitCode = leader ? String(f.get("unit_code")) : (access.profile?.unit_code ?? "");
      const cents = (k: string) => (text(k) ? parseCents(text(k)!) : null);
      const preventive = f.get("preventive_applicable") === "on";
      const interval = text("interval") ? Number(text("interval")) : null;
      setBusy(true);
      const { data, error: err } = await supabase
        .from("assets")
        .insert({
          unit_code: unitCode,
          name: String(f.get("name")).trim(),
          category: text("category"),
          serial_number: text("serial_number"),
          supplier: text("supplier"),
          notes: text("notes"),
          purchase_date: text("purchase_date"),
          purchase_cents: cents("purchase"),
          estimated_cents: cents("estimated"),
          preventive_applicable: preventive,
          preventive_interval_months: preventive ? interval : null,
          next_preventive: preventive ? text("next_preventive") : null,
        })
        .select("code")
        .single();
      if (err || !data?.code) throw new Error("Não foi possível cadastrar o equipamento.");
      await navigate({ to: "/patrimonio/$code", params: { code: data.code } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confira os dados do equipamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell title="Patrimônio" eyebrow="Equipamentos da loja">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Tombo dos equipamentos: cada item tem um código, fotos, documentos e o histórico de
          manutenção.
          {leader ? " Você vê todas as lojas." : ` Você vê a loja ${access.profile?.unit_code}.`}
        </p>
        <Button onClick={() => setCreating((v) => !v)}>
          {creating ? "Fechar" : "Novo equipamento"}
        </Button>
      </div>

      {creating && (
        <form
          onSubmit={create}
          className="mt-5 space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-lg font-bold">Novo equipamento</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {leader ? (
              <label className="block text-sm font-medium">
                Loja
                <select name="unit_code" required defaultValue="" className={fieldClass}>
                  <option value="">Selecione a loja</option>
                  {(units.data ?? []).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="self-end text-sm">
                Loja: <b>{access.profile?.unit_code}</b>
              </p>
            )}
            <label className="block text-sm font-medium">
              Nome do equipamento
              <input name="name" required maxLength={160} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium">
              Categoria
              <input
                name="category"
                maxLength={80}
                placeholder="Ex.: Alinhador, Elevador, Compressor"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium">
              Número de série / identificação
              <input name="serial_number" maxLength={80} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium">
              Data da compra (se souber)
              <input name="purchase_date" type="date" className={fieldClass} />
            </label>
            <label className="block text-sm font-medium">
              Valor da compra (se souber)
              <input
                name="purchase"
                inputMode="decimal"
                placeholder="12.500,00"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium">
              Valor estimado hoje
              <input
                name="estimated"
                inputMode="decimal"
                placeholder="9.000,00"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium">
              Fornecedor
              <input name="supplier" maxLength={160} className={fieldClass} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Observações
            <textarea name="notes" maxLength={2000} rows={2} className={fieldClass} />
          </label>
          <fieldset className="space-y-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold">Manutenção preventiva</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="preventive_applicable"
                type="checkbox"
                className="size-4 accent-primary"
              />
              Este equipamento tem manutenção preventiva
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                A cada quantos meses
                <input
                  name="interval"
                  type="number"
                  min={1}
                  max={120}
                  placeholder="6"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium">
                Próxima manutenção
                <input name="next_preventive" type="date" className={fieldClass} />
              </label>
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            As fotos e os documentos são anexados na próxima tela, depois de salvar.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Salvando…" : "Salvar e anexar fotos"}</Button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        {leader && (
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loja
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass}>
              <option value="">Todas as lojas</option>
              {(units.data ?? []).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Situação
          <select
            value={show}
            onChange={(e) => setShow(e.target.value as typeof show)}
            className={fieldClass}
          >
            <option value="ativos">Em uso</option>
            <option value="baixados">Baixados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="min-w-48 flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Buscar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código, nome ou série"
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          aria-pressed={onlyDue}
          onClick={() => setOnlyDue((v) => !v)}
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${onlyDue ? "border-destructive bg-destructive/10 text-destructive" : "border-border"}`}
        >
          Manutenção vencida ({overdue})
        </button>
      </div>

      {assets.isPending && <p className="mt-6 text-muted-foreground">Carregando…</p>}
      {assets.error && (
        <p role="alert" className="mt-6 text-destructive">
          {assets.error.message}
        </p>
      )}
      {assets.data && !rows.length && (
        <p className="mt-6 text-muted-foreground">
          {assets.data.length
            ? "Nenhum equipamento neste filtro."
            : "Nenhum equipamento cadastrado ainda. Use “Novo equipamento”."}
        </p>
      )}
      {rows.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Equipamento</th>
                <th className="px-4 py-3">Loja</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Próxima preventiva</th>
                <th className="px-4 py-3 text-right">Valor estimado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const due = a.status === "baixado" ? null : dueState(a.next_preventive, today);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        to="/patrimonio/$code"
                        params={{ code: a.code ?? "" }}
                        className="text-primary hover:underline"
                      >
                        {a.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {a.name}
                      {a.category && (
                        <span className="block text-xs text-muted-foreground">{a.category}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{a.unit_code}</td>
                    <td className="px-4 py-3">{STATUS_LABEL[a.status] ?? a.status}</td>
                    <td className="px-4 py-3">
                      {a.preventive_applicable ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {formatDate(a.next_preventive)}
                          {due && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${dueClass[due]}`}
                            >
                              {DUE_LABEL[due]}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Não se aplica</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.estimated_cents !== null ? money(a.estimated_cents) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
