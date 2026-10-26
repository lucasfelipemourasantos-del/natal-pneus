import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { money } from "@/lib/results";

export type MonthPoint = { competence: string; soldCents: number; commissionCents: number };
type Measure = "soldCents" | "commissionCents";

const MEASURES: { key: Measure; label: string }[] = [
  { key: "soldCents", label: "Vendido" },
  { key: "commissionCents", label: "Comissão" },
];

const compact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function monthShort(competence: string) {
  const [y = 0, m = 1] = competence.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${name}/${String(y).slice(2)}`;
}

function shiftMonths(competence: string, delta: number) {
  const [y = 0, m = 1] = competence.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function Delta({ now, before, label }: { now: number; before: number | null; label: string }) {
  if (before === null || before <= 0) return null;
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className="inline-flex items-center gap-1.5 text-sm">
      <Icon size={16} className={up ? "text-success" : "text-destructive"} aria-hidden="true" />
      <b className="tabular-nums">
        {up ? "+" : "−"}
        {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      </b>
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}

type TipProps = { active?: boolean; payload?: { value: number; payload: { label: string } }[] };
function Tip({ active, payload }: TipProps) {
  const p = active ? payload?.[0] : null;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="text-xs text-muted-foreground">{p.payload.label}</p>
      <p className="font-bold tabular-nums">{money(p.value)}</p>
    </div>
  );
}

/**
 * Year-long follow-up for one person (seller or technician): evolution line and month comparison.
 * `points` are ascending months; the last one is the month being viewed. One measure at a time, never two axes.
 */
export function CommissionCharts({
  points,
  partialCompetence,
}: {
  points: MonthPoint[];
  /** Month still in progress (its numbers are partial). */
  partialCompetence?: string | null;
}) {
  const [measure, setMeasure] = useState<Measure>("soldCents");
  const [table, setTable] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const last = points.at(-1);
  if (!last) return null;
  const series = points.map((p) => ({
    label: monthShort(p.competence),
    value: p[measure],
    partial: p.competence === partialCompetence,
  }));
  const valueOf = (competence: string) =>
    points.find((p) => p.competence === competence)?.[measure] ?? null;
  const now = last[measure];
  const prev = valueOf(shiftMonths(last.competence, -1));
  const yearAgo = valueOf(shiftMonths(last.competence, -12));
  const closed = series.filter((s) => !s.partial && s.value > 0);
  const average = closed.length
    ? Math.round(closed.reduce((t, s) => t + s.value, 0) / closed.length)
    : null;
  const compare = [
    { label: monthShort(last.competence), value: now, tone: "now" as const },
    {
      label: monthShort(shiftMonths(last.competence, -1)),
      value: prev ?? 0,
      tone: "past" as const,
    },
    {
      label: monthShort(shiftMonths(last.competence, -12)),
      value: yearAgo ?? 0,
      tone: "past" as const,
    },
  ];
  const measureLabel = MEASURES.find((m) => m.key === measure)!.label;
  const inProgress = last.competence === partialCompetence;
  const axis = { fontSize: 12, fill: "var(--muted-foreground)" };

  return (
    <section
      className="mt-6 rounded-xl border border-border bg-card p-5"
      aria-labelledby="chart-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chart-title" className="text-lg font-bold">
          Acompanhamento do ano
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Medida do gráfico"
            className="inline-flex rounded-lg border border-border p-0.5"
          >
            {MEASURES.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={measure === m.key}
                onClick={() => setMeasure(m.key)}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold ${measure === m.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={table}
            onClick={() => setTable((v) => !v)}
            className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold"
          >
            {table ? "Ver gráficos" : "Ver em tabela"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Delta now={now} before={prev} label="contra o mês anterior" />
        <Delta now={now} before={yearAgo} label="contra o mesmo mês do ano passado" />
      </div>
      {inProgress && (
        <p className="mt-2 text-xs text-muted-foreground">
          O mês atual está em andamento, então o valor ainda é parcial.
        </p>
      )}

      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Mês</th>
                <th className="px-2 text-right font-semibold">Vendido</th>
                <th className="pl-2 text-right font-semibold">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.competence} className="border-t border-border">
                  <td className="py-2 pr-2">
                    {monthShort(p.competence)}
                    {p.competence === partialCompetence && (
                      <span className="ml-2 text-xs text-muted-foreground">em andamento</span>
                    )}
                  </td>
                  <td className="px-2 text-right tabular-nums">{money(p.soldCents)}</td>
                  <td className="pl-2 text-right tabular-nums">{money(p.commissionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <figure
            aria-label={`${measureLabel} por mês nos últimos ${points.length} meses`}
            className="min-w-0"
          >
            <figcaption className="mb-2 text-sm font-semibold">
              {measureLabel} por mês
              {average !== null && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  linha tracejada: média dos meses fechados ({money(average)})
                </span>
              )}
            </figcaption>
            <div className="h-64">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tickFormatter={(v: number) => compact.format(v / 100)}
                    />
                    <Tooltip
                      content={<Tip />}
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                    />
                    {average !== null && (
                      <ReferenceLine
                        y={average}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="5 4"
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
                      activeDot={{ r: 6, stroke: "var(--card)", strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </figure>

          <figure
            aria-label={`Comparativo de ${measureLabel.toLowerCase()} entre meses`}
            className="min-w-0"
          >
            <figcaption className="mb-2 text-sm font-semibold">Comparativo de meses</figcaption>
            <div className="h-64">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compare} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tickFormatter={(v: number) => compact.format(v / 100)}
                    />
                    <Tooltip content={<Tip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={56}
                      isAnimationActive={false}
                    >
                      {compare.map((c) => (
                        <Cell
                          key={c.label}
                          fill={c.tone === "now" ? "var(--primary)" : "var(--muted-foreground)"}
                          fillOpacity={c.tone === "now" ? 1 : 0.55}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </figure>
        </div>
      )}
    </section>
  );
}
