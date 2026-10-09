import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { Pencil, Trash2, X } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { readResults } from "@/lib/management.functions";
import { catalogOptions, fieldClass } from "@/lib/portal-data";
import { parseCents, periodTotal, compare, monthSeries, money, rangeFor } from "@/lib/results";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
const options = queryOptions({ queryKey: ["sales-results"], queryFn: () => readResults() });
export const Route = createFileRoute("/_authenticated/resultados")({
  beforeLoad: ({ context }) => {
    if (!context.access.canReadAll && !context.access.isProducer) throw redirect({ to: "/inicio" });
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(options),
      context.queryClient.ensureQueryData(catalogOptions),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Vendas e resultados — Natal Pneus" },
      {
        name: "description",
        content: "Histórico mensal e comparação de resultados conforme seu acesso.",
      },
      { property: "og:title", content: "Vendas e resultados — Natal Pneus" },
      {
        property: "og:description",
        content: "Histórico mensal e comparação de resultados conforme seu acesso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Results,
});
const dimensionNames: Record<string, string> = {
  store: "Loja",
  sector: "Setor",
  employee: "Funcionário",
};
function Results() {
  const { access } = Route.useRouteContext();
  const { data } = useSuspenseQuery(options);
  const { data: catalog } = useSuspenseQuery(catalogOptions);
  const qc = useQueryClient();
  const now = new Date();
  const [unit, setUnit] = useState("");
  const [dimension, setDimension] = useState(access.canReadAll ? "store" : "employee");
  const [subject, setSubject] = useState("");
  const [mode, setMode] = useState("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState(now.getMonth() < 6 ? 1 : 2);
  const [customStart, setCustomStart] = useState(`${now.getFullYear()}-01`);
  const [customEnd, setCustomEnd] = useState(`${now.getFullYear()}-12`);
  const [compareStart, setCompareStart] = useState(`${now.getFullYear() - 1}-01`);
  const [compareEnd, setCompareEnd] = useState(`${now.getFullYear() - 1}-12`);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<"sales_results"> | null>(null);
  const [formUnit, setFormUnit] = useState("NP1");
  const [formDimension, setFormDimension] = useState("store");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const period =
    mode === "interval"
      ? { start: customStart, end: customEnd }
      : rangeFor(mode, year, month, half);
  const valid = period.start <= period.end && compareStart <= compareEnd;
  const rows = data.rows.filter(
    (r) =>
      (access.canReadAll || r.employee_id === access.userId) &&
      (!subject || (dimension === "sector" ? r.sector_id === subject : r.employee_id === subject)),
  );
  const units = unit ? [unit] : [];
  const total = valid ? periodTotal(rows, dimension, period.start, period.end, units) : null;
  const previous = valid ? periodTotal(rows, dimension, compareStart, compareEnd, units) : null;
  const delta = compare(total, previous);
  const series = valid
    ? monthSeries(period.start, period.end).map((m) => ({
        month: m,
        value: periodTotal(rows, dimension, m, m, units),
      }))
    : [];
  const selected = data.rows.filter(
    (r) =>
      r.dimension === dimension &&
      r.competence >= period.start + "-01" &&
      r.competence <= period.end + "-01" &&
      (!unit || r.unit_code === unit) &&
      (!subject || (dimension === "sector" ? r.sector_id === subject : r.employee_id === subject)),
  );
  const comparison = [
    { name: `${period.start} a ${period.end}`, value: total === null ? null : total / 100 },
    { name: `${compareStart} a ${compareEnd}`, value: previous === null ? null : previous / 100 },
  ];
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const payload = {
        unit_code: formUnit,
        dimension: formDimension,
        competence: String(f.get("competence")) + "-01",
        sector_id: formDimension === "store" ? null : String(f.get("sector")) || null,
        employee_id: formDimension === "employee" ? String(f.get("employee")) : null,
        amount_cents: parseCents(String(f.get("amount"))),
      };
      const r = editing
        ? await supabase.from("sales_results").update(payload).eq("id", editing.id)
        : await supabase.from("sales_results").insert(payload);
      if (r.error)
        throw new Error(
          "Não foi possível salvar. Verifique a unidade, o setor, o funcionário e se já existe lançamento nesta competência.",
        );
      await qc.invalidateQueries({ queryKey: ["sales-results"] });
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("Excluir este resultado?")) return;
    const r = await supabase.from("sales_results").delete().eq("id", id);
    if (r.error) setError("Não foi possível excluir.");
    else await qc.invalidateQueries({ queryKey: ["sales-results"] });
  }
  return (
    <PortalShell
      title={access.canReadAll ? "Vendas e resultados" : "Meus resultados"}
      eyebrow={access.isAdmin ? "Administração" : "Consulta de resultados"}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {access.canReadAll ? "Histórico das quatro lojas" : "Seu histórico individual"}
        </p>
        {access.isAdmin && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormDimension("store");
              setFormUnit(unit || "NP1");
              setFormOpen(true);
            }}
          >
            Novo resultado
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="my-4 text-destructive">
          {error}
        </p>
      )}
      {formOpen && access.isAdmin && (
        <section className="my-6 border-y border-border py-6">
          <div className="flex justify-between">
            <h2 className="text-xl font-semibold">
              {editing ? "Editar resultado" : "Novo resultado"}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar lançamento"
              onClick={() => setFormOpen(false)}
            >
              <X />
            </Button>
          </div>
          <form
            key={editing?.id ?? "new"}
            onSubmit={save}
            className="mt-4 grid gap-4 sm:grid-cols-3"
          >
            <label className="text-sm">
              Loja
              <select
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                className={fieldClass}
              >
                {catalog.units.map((u) => (
                  <option key={u.code}>{u.code}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Tipo de resultado
              <select
                value={formDimension}
                onChange={(e) => setFormDimension(e.target.value)}
                className={fieldClass}
              >
                {Object.entries(dimensionNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Competência
              <input
                type="month"
                name="competence"
                required
                defaultValue={editing?.competence.slice(0, 7) ?? period.start}
                className={fieldClass}
              />
            </label>
            {formDimension !== "store" && (
              <label className="text-sm">
                Setor
                <select
                  name="sector"
                  required={formDimension === "sector"}
                  defaultValue={editing?.sector_id ?? ""}
                  className={fieldClass}
                >
                  <option value="">{formDimension === "sector" ? "Selecione" : "Sem setor"}</option>
                  {data.sectors
                    .filter((s) => s.unit_code === formUnit)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {formDimension === "employee" && (
              <label className="text-sm">
                Funcionário
                <select
                  required
                  name="employee"
                  defaultValue={editing?.employee_id ?? ""}
                  className={fieldClass}
                >
                  <option value="">Selecione</option>
                  {data.people
                    .filter((p) => p.unit_code === formUnit)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              Valor (R$)
              <input
                required
                name="amount"
                inputMode="decimal"
                defaultValue={
                  editing ? (editing.amount_cents / 100).toFixed(2).replace(".", ",") : ""
                }
                placeholder="0,00"
                className={fieldClass}
              />
            </label>
            <Button disabled={busy} className="self-end">
              {busy ? "Salvando…" : "Salvar resultado"}
            </Button>
          </form>
        </section>
      )}
      <section className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-3">
        {access.canReadAll && (
          <>
            <label className="text-sm">
              Loja
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  setSubject("");
                }}
                className={fieldClass}
              >
                <option value="">Todas as lojas</option>
                {catalog.units.map((u) => (
                  <option key={u.code}>{u.code}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Dimensão
              <select
                value={dimension}
                onChange={(e) => {
                  setDimension(e.target.value);
                  setSubject("");
                }}
                className={fieldClass}
              >
                {Object.entries(dimensionNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {dimension !== "store" && (
              <label className="text-sm">
                {dimensionNames[dimension]}
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {dimension === "sector"
                    ? data.sectors
                        .filter((s) => !unit || s.unit_code === unit)
                        .map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.unit_code} · {s.name}
                          </option>
                        ))
                    : data.people
                        .filter((p) => !unit || p.unit_code === unit)
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                </select>
              </label>
            )}
          </>
        )}
        <label className="text-sm">
          Período
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={fieldClass}>
            <option value="month">Mês</option>
            <option value="semester">Semestre</option>
            <option value="year">Ano</option>
            <option value="interval">Intervalo</option>
          </select>
        </label>
        {mode !== "interval" && (
          <label className="text-sm">
            Ano
            <input
              type="number"
              min={1900}
              max={2200}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={fieldClass}
            />
          </label>
        )}
        {mode === "month" && (
          <label className="text-sm">
            Mês
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={fieldClass}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(2026, i, 1).toLocaleString("pt-BR", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "semester" && (
          <label className="text-sm">
            Semestre
            <select
              value={half}
              onChange={(e) => setHalf(Number(e.target.value))}
              className={fieldClass}
            >
              <option value={1}>1º semestre</option>
              <option value={2}>2º semestre</option>
            </select>
          </label>
        )}
        {mode === "interval" && (
          <>
            <label className="text-sm">
              De
              <input
                type="month"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="text-sm">
              Até
              <input
                type="month"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={fieldClass}
              />
            </label>
          </>
        )}
        <label className="text-sm">
          Comparar de
          <input
            type="month"
            value={compareStart}
            onChange={(e) => setCompareStart(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-sm">
          Comparar até
          <input
            type="month"
            value={compareEnd}
            onChange={(e) => setCompareEnd(e.target.value)}
            className={fieldClass}
          />
        </label>
      </section>
      {!valid && (
        <p role="alert" className="mt-3 text-destructive">
          O início deve ser anterior ao fim de cada período.
        </p>
      )}
      <p className="my-5 text-xs text-muted-foreground">
        {unit || "Todas as lojas"} · {dimensionNames[dimension]} · {period.start} a {period.end} ·
        Origem: lançamentos{" "}
        {dimension === "store"
          ? "consolidados da loja"
          : dimension === "sector"
            ? "do setor"
            : "individuais"}{" "}
        informados pelo ADM
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Faturamento do período", money(total)],
          ["Período comparado", money(previous)],
          ["Diferença", money(delta.difference)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 break-words text-2xl font-semibold">{value}</p>
            {label === "Diferença" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {delta.percent === null
                  ? "Percentual não calculável"
                  : `${delta.percent.toFixed(2)}%`}
              </p>
            )}
          </article>
        ))}
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Evolução mês a mês</h2>
          <div className="h-64 w-full">
            {total === null ? (
              <p className="text-muted-foreground">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series.map((s) => ({
                    ...s,
                    value: s.value === null ? null : s.value / 100,
                  }))}
                >
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    contentStyle={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                  />
                  <Line
                    dataKey="value"
                    name="Faturamento"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-4 text-lg font-semibold">Comparação de períodos</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison}>
                <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => money(Number(v) * 100)}
                  contentStyle={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
                <Bar dataKey="value" name="Faturamento" fill="var(--primary)" maxBarSize={72} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Lançamentos do período</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-3">Competência</th>
                <th>Loja</th>
                <th>Origem</th>
                <th className="text-right">Valor</th>
                <th className="pl-4">Atualização</th>
                {access.isAdmin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {selected.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-3">{r.competence.slice(0, 7)}</td>
                  <td>{r.unit_code}</td>
                  <td>
                    {dimensionNames[r.dimension]}
                    {r.employee_id
                      ? " · " +
                        (data.people.find((p) => p.id === r.employee_id)?.full_name ??
                          "Funcionário")
                      : r.sector_id
                        ? " · " + data.sectors.find((s) => s.id === r.sector_id)?.name
                        : ""}
                  </td>
                  <td className="text-right whitespace-nowrap">{money(r.amount_cents)}</td>
                  <td className="pl-4 text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString("pt-BR")} ·{" "}
                    {data.people.find((p) => p.id === r.updated_by)?.full_name ?? "ADM"}
                  </td>
                  {access.isAdmin && (
                    <td>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar resultado"
                          title="Editar resultado"
                          onClick={() => {
                            setEditing(r);
                            setFormUnit(r.unit_code);
                            setFormDimension(r.dimension);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir resultado"
                          title="Excluir resultado"
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!selected.length && <p className="py-5 text-muted-foreground">Sem dados</p>}
        </div>
      </section>
    </PortalShell>
  );
}
