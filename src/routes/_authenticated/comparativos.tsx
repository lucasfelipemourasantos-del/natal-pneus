import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommissionCharts } from "@/components/commission-charts";
import { PortalShell } from "@/components/portal-shell";
import {
  readCommissions,
  readOsComposition,
  readTechCommissions,
} from "@/lib/commission.functions";
import {
  categoryLabels,
  currentCompetence,
  monthLabel,
  monthsBefore,
  sellerSeries,
  storeSeries,
  type Category,
} from "@/lib/commissions";
import {
  fieldRows,
  percentOver,
  selectFields,
  sideResult,
  ticketOf,
  type Side,
  type SideKind,
} from "@/lib/compare";
import { cleanName } from "@/lib/names";
import { fieldClass } from "@/lib/portal-data";
import { money } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/comparativos")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Vendas e resultados — Natal Pneus" },
      {
        name: "description",
        content: "Comparativos de lojas, vendedores e operadores, por mês e por campo de venda.",
      },
      { property: "og:title", content: "Vendas e resultados — Natal Pneus" },
      { property: "og:description", content: "Comparativos de lojas e funcionários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Comparativos,
});

const KIND_LABEL: Record<SideKind, string> = {
  rede: "Todas as lojas",
  loja: "Uma loja",
  vendedor: "Vendedor",
  operador: "Operador",
};
const UNITS = ["NP1", "NP2", "NP3", "NP4"];
const COLOR_A = "var(--primary)";
const COLOR_B = "var(--chart-3)";

type Person = { code: number; name: string };

function Comparativos() {
  const api = useQuery({
    queryKey: ["commissions", null],
    queryFn: () => readCommissions({ data: { competence: null } }),
  });
  const tech = useQuery({
    queryKey: ["tech-commissions", null],
    queryFn: () => readTechCommissions({ data: { competence: null } }),
  });
  const latest = api.data?.competence ?? null;
  const [a, setA] = useState<Side>({ kind: "loja", unit: "NP1", code: null, month: "" });
  const [b, setB] = useState<Side>({ kind: "loja", unit: "NP4", code: null, month: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const months = useMemo(() => {
    if (!api.data || !latest) return [];
    const range = new Set([latest, ...monthsBefore(latest, 12)]);
    return api.data.available.filter((m) => range.has(m));
  }, [api.data, latest]);
  const sideA = { ...a, month: a.month || latest || "" };
  const sideB = { ...b, month: b.month || latest || "" };

  const nameOf = (code: number) =>
    api.data?.names.find((n) => n.code === code)?.name ??
    tech.data?.names.find((n) => n.code === code)?.name ??
    cleanName(
      api.data?.sellers.find((s) => s.code === code)?.name ??
        tech.data?.sellers.find((s) => s.code === code)?.name ??
        `Código ${code}`,
    );

  const people = useMemo(() => {
    const ok = (s: { code: number; ignored: boolean; is_person: boolean }) =>
      !s.ignored && s.is_person !== false;
    const sellers = new Map<number, Person>();
    const operators = new Map<number, Person>();
    for (const r of api.data?.reports ?? []) {
      const s = api.data?.sellers.find((x) => x.code === r.seller_code);
      if (s && ok(s)) sellers.set(s.code, { code: s.code, name: nameOf(s.code) });
    }
    for (const r of api.data?.noCommission ?? [])
      sellers.set(r.seller_code, { code: r.seller_code, name: cleanName(r.seller_name) });
    for (const r of tech.data?.reports ?? []) {
      const s = tech.data?.sellers.find((x) => x.code === r.seller_code);
      // Operators with no commission in the last 6 months (history only) are no longer offered.
      if (s && ok(s) && s.active !== false)
        operators.set(s.code, { code: s.code, name: nameOf(s.code) });
    }
    const byName = (x: Person, y: Person) => x.name.localeCompare(y.name, "pt-BR");
    return {
      sellers: [...sellers.values()].sort(byName),
      operators: [...operators.values()].sort(byName),
    };
    // nameOf only reads the two queries above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.data, tech.data]);

  const ignored = useMemo(
    () => new Set((api.data?.sellers ?? []).filter((s) => s.ignored).map((s) => s.code)),
    [api.data],
  );
  const source = {
    apiReports: api.data?.reports ?? [],
    apiOs: api.data?.os ?? [],
    techReports: tech.data?.reports ?? [],
    techOs: tech.data?.os ?? [],
    ignored,
    extra: api.data?.noCommission ?? [],
  };

  const rawA = sideResult(source, sideA);
  const rawB = sideResult(source, sideB);
  const ra = selectFields(rawA, selected);
  const rb = selectFields(rawB, selected);
  const rows = fieldRows(rawA, rawB);
  const allFields = rows.flatMap((c) => c.fields);

  // OS composition (which OS had peças, pneus...) for the sides that come from the sellers' reports.
  const needsOs = (s: Side) =>
    s.month !== "" &&
    (s.kind === "rede" ||
      s.kind === "loja" ||
      (s.kind === "vendedor" &&
        s.code !== null &&
        !(api.data?.noCommission ?? []).some((r) => r.seller_code === s.code)));
  const osOf = (s: Side) => ({
    competence: s.month,
    unit: s.unit || null,
    sellerCode: s.kind === "vendedor" ? s.code : null,
    fields: [...selected],
  });
  const osA = useQuery({
    queryKey: ["os-composition", sideA, [...selected].sort()],
    queryFn: () => readOsComposition({ data: osOf(sideA) }),
    enabled: needsOs(sideA),
  });
  const osB = useQuery({
    queryKey: ["os-composition", sideB, [...selected].sort()],
    queryFn: () => readOsComposition({ data: osOf(sideB) }),
    enabled: needsOs(sideB),
  });

  if (api.isPending)
    return (
      <PortalShell printable title="Vendas e resultados" eyebrow="Comparativos">
        <p className="text-muted-foreground">Carregando…</p>
      </PortalShell>
    );
  if (api.error || !api.data || !latest)
    return (
      <PortalShell printable title="Vendas e resultados" eyebrow="Comparativos">
        <p role="alert" className="text-destructive">
          {api.error?.message ?? "Ainda não há dados do Decision para comparar."}
        </p>
      </PortalShell>
    );

  const pointsFor = (s: Side) => {
    if (s.kind === "operador" && s.code !== null)
      return sellerSeries(source.techReports, s.code, s.month);
    if (s.kind === "vendedor" && s.code !== null) {
      const hum = source.extra.filter((r) => r.seller_code === s.code);
      if (hum.length)
        return [...monthsBefore(s.month, 12)]
          .reverse()
          .concat(s.month)
          .map((m) => ({
            competence: m,
            soldCents: hum.filter((r) => r.competence === m).reduce((t, r) => t + r.sold_cents, 0),
            commissionCents: 0,
          }));
      return sellerSeries(source.apiReports, s.code, s.month);
    }
    return storeSeries(source.apiReports, s.month, ignored, s.unit || undefined, source.extra);
  };

  const describe = (s: Side) => {
    const who =
      s.kind === "rede"
        ? "Todas as lojas"
        : s.kind === "loja"
          ? s.unit || "Loja"
          : s.code !== null
            ? `${nameOf(s.code)}${s.unit ? ` (${s.unit})` : ""}`
            : KIND_LABEL[s.kind];
    return `${who} · ${monthLabel(s.month)}`;
  };

  // Chart data: the fields of both sides (only the chosen ones when a selection exists), biggest first.
  const chartData = rows
    .flatMap((c) => c.fields)
    .filter((f) => !selected.size || selected.has(f.key))
    .map((f) => ({ name: f.label, A: f.a / 100, B: f.b / 100 }))
    .sort((x, y) => Math.max(y.A, y.B) - Math.max(x.A, x.B))
    .slice(0, 12);

  const sellersLabel = (list: Person[]) =>
    list.map((p) => (
      <option key={p.code} value={p.code}>
        {p.name}
      </option>
    ));

  return (
    <PortalShell printable title="Vendas e resultados" eyebrow="Comparativos">
      <div className="space-y-6">
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          Compare lojas, vendedores e operadores, mês a mês, com os valores que o Decision traz.
          Cada lado tem o seu mês. Itens sem comissão (como cortesias) não aparecem nos relatórios
          do Decision, então o total pode ficar um pouco abaixo do faturamento oficial.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {(
            [
              ["A", a, setA, COLOR_A],
              ["B", b, setB, COLOR_B],
            ] as const
          ).map(([name, side, setSide, color]) => (
            <section
              key={name}
              className="space-y-3 rounded-xl border border-border bg-card p-5"
              style={{ borderTop: `3px solid ${color}` }}
            >
              <h2 className="text-lg font-bold">Lado {name}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Comparar
                  <select
                    value={side.kind}
                    onChange={(e) =>
                      setSide({ ...side, kind: e.target.value as SideKind, code: null })
                    }
                    className={fieldClass}
                  >
                    {(Object.keys(KIND_LABEL) as SideKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mês
                  <select
                    value={side.month || latest}
                    onChange={(e) => setSide({ ...side, month: e.target.value })}
                    className={fieldClass}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                {side.kind !== "rede" && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Loja
                    <select
                      value={side.unit}
                      onChange={(e) => setSide({ ...side, unit: e.target.value })}
                      className={fieldClass}
                    >
                      {(side.kind === "vendedor" || side.kind === "operador") && (
                        <option value="">Todas as lojas</option>
                      )}
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(side.kind === "vendedor" || side.kind === "operador") && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {side.kind === "vendedor" ? "Vendedor" : "Operador"}
                    <select
                      value={side.code ?? ""}
                      onChange={(e) =>
                        setSide({ ...side, code: e.target.value ? Number(e.target.value) : null })
                      }
                      className={fieldClass}
                    >
                      <option value="">Escolha…</option>
                      {sellersLabel(side.kind === "vendedor" ? people.sellers : people.operators)}
                    </select>
                  </label>
                )}
              </div>
            </section>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card p-5" open={selected.size > 0}>
          <summary className="cursor-pointer text-lg font-bold">
            Campos comparados:{" "}
            <span className="font-semibold text-primary">
              {selected.size ? `${selected.size} escolhido(s)` : "tudo"}
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-pressed={selected.size === 0}
                className={`min-h-9 rounded-lg border px-3 text-sm font-semibold ${selected.size === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
              >
                Tudo
              </button>
            </div>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Escolha o que comparar acima para ver os campos.
              </p>
            )}
            {rows.map((c) => (
              <fieldset key={c.category} className="space-y-1">
                <legend className="text-sm font-bold">{categoryLabels[c.category]}</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {c.fields.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(f.key)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(f.key);
                          else next.delete(f.key);
                          setSelected(next);
                        }}
                        className="size-4 accent-primary"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </details>

        <Kpis
          a={{ title: describe(sideA), result: ra, os: osA.data ?? null, loading: osA.isFetching }}
          b={{ title: describe(sideB), result: rb, os: osB.data ?? null, loading: osB.isFetching }}
          filtered={selected.size > 0}
          osAvailable={[needsOs(sideA), needsOs(sideB)]}
        />

        {allFields.length > 0 && (
          <section
            data-print-block="grafico"
            className="space-y-6 rounded-xl border border-border bg-card p-5"
          >
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Gráfico por categoria</h2>
              <CompareBars
                data={rows.map((c) => ({ name: c.label, A: c.a / 100, B: c.b / 100 }))}
                nameA={describe(sideA)}
                nameB={describe(sideB)}
                unit="money"
                height={Math.max(220, rows.length * 70)}
                label="Gráfico de barras comparando as categorias dos dois lados"
              />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold">
                Gráfico por campo {selected.size ? "(campos escolhidos)" : "(maiores campos)"}
              </h2>
              <CompareBars
                data={chartData}
                nameA={describe(sideA)}
                nameB={describe(sideB)}
                unit="money"
                height={Math.max(260, chartData.length * 44)}
                label="Gráfico de barras comparando os campos dos dois lados"
              />
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Vendido por campo</h2>
          {allFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas para este comparativo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-semibold">Campo</th>
                    <th className="px-2 text-right font-semibold" style={{ color: COLOR_A }}>
                      A · {describe(sideA)}
                    </th>
                    <th className="px-2 text-right font-semibold" style={{ color: COLOR_B }}>
                      B · {describe(sideB)}
                    </th>
                    <th className="px-2 text-right font-semibold">Diferença (A − B)</th>
                    <th className="pl-2 text-right font-semibold">A sobre B</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap((c) => [
                    <Row
                      key={c.category}
                      label={categoryLabels[c.category]}
                      a={c.a}
                      b={c.b}
                      head
                    />,
                    ...c.fields
                      .filter((f) => !selected.size || selected.has(f.key))
                      .map((f) => <Row key={f.key} label={f.label} a={f.a} b={f.b} />),
                  ])}
                  {(rawA.noDetailCents > 0 || rawB.noDetailCents > 0) && !selected.size && (
                    <Row
                      label="Sem detalhamento (vendedor sem comissão)"
                      a={rawA.noDetailCents}
                      b={rawB.noDetailCents}
                    />
                  )}
                  <Row label="Total" a={ra.soldCents} b={rb.soldCents} head total />
                </tbody>
              </table>
            </div>
          )}
        </section>

        <OsPanel
          a={{
            title: describe(sideA),
            data: osA.data ?? null,
            enabled: needsOs(sideA),
            loading: osA.isFetching,
          }}
          b={{
            title: describe(sideB),
            data: osB.data ?? null,
            enabled: needsOs(sideB),
            loading: osB.isFetching,
          }}
        />

        <section
          data-print-block="grafico"
          className="space-y-2 rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-lg font-bold">Evolução mês a mês</h2>
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-bold" style={{ color: COLOR_A }}>
                A · {describe(sideA)}
              </h3>
              <CommissionCharts points={pointsFor(sideA)} partialCompetence={currentCompetence()} />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold" style={{ color: COLOR_B }}>
                B · {describe(sideB)}
              </h3>
              <CommissionCharts points={pointsFor(sideB)} partialCompetence={currentCompetence()} />
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

function Row({
  label,
  a,
  b,
  head,
  total,
}: {
  label: string;
  a: number;
  b: number;
  head?: boolean;
  total?: boolean;
}) {
  const diff = a - b;
  return (
    <tr
      className={`border-t border-border ${head ? "bg-accent/20 font-bold" : ""} ${total ? "font-extrabold" : ""}`}
    >
      <td className={`py-2 pr-2 ${head ? "" : "pl-4"}`}>{label}</td>
      <td className={`px-2 text-right ${a > b ? "text-success" : ""}`}>{money(a)}</td>
      <td className={`px-2 text-right ${b > a ? "text-success" : ""}`}>{money(b)}</td>
      <td className="px-2 text-right">{money(diff)}</td>
      <td className="pl-2 text-right text-muted-foreground">{percentOver(a, b) ?? "—"}</td>
    </tr>
  );
}

type OsData = Awaited<ReturnType<typeof readOsComposition>>;

function Kpis({
  a,
  b,
  filtered,
  osAvailable,
}: {
  a: { title: string; result: ReturnType<typeof sideResult>; os: OsData | null; loading: boolean };
  b: { title: string; result: ReturnType<typeof sideResult>; os: OsData | null; loading: boolean };
  filtered: boolean;
  osAvailable: [boolean, boolean];
}) {
  // With fields chosen, the OS count and the average ticket are about the OS that contain those fields.
  const figures = (
    x: typeof a,
    hasOs: boolean,
  ): { sold: number; os: number | null; ticket: number | null } => {
    if (!filtered) {
      return {
        sold: x.result.soldCents,
        os: x.result.osCount,
        ticket: ticketOf(x.result.soldCents, x.result.osCount),
      };
    }
    const sel = hasOs ? (x.os?.withSelection ?? null) : null;
    return {
      sold: x.result.soldCents,
      os: sel ? sel.osCount : null,
      ticket: sel && sel.osCount ? Math.round(sel.osTotalCents / sel.osCount) : null,
    };
  };
  const fa = figures(a, osAvailable[0]);
  const fb = figures(b, osAvailable[1]);
  const cards: { k: string; a: string; b: string; d: string | null; hint: string }[] = [
    {
      k: filtered ? "Vendido nos campos" : "Vendido",
      a: money(fa.sold),
      b: money(fb.sold),
      d: percentOver(fa.sold, fb.sold),
      hint: "Valor vendido",
    },
    {
      k: filtered ? "OS com esses campos" : "Ordens de serviço",
      a: fa.os === null ? "—" : fa.os.toLocaleString("pt-BR"),
      b: fb.os === null ? "—" : fb.os.toLocaleString("pt-BR"),
      d: fa.os !== null && fb.os !== null ? percentOver(fa.os, fb.os) : null,
      hint: filtered ? "OS que tiveram ao menos um dos campos" : "Número de OS",
    },
    {
      k: filtered ? "Ticket médio das OS com esses campos" : "Ticket médio",
      a: fa.ticket === null ? "—" : money(fa.ticket),
      b: fb.ticket === null ? "—" : money(fb.ticket),
      d: fa.ticket !== null && fb.ticket !== null ? percentOver(fa.ticket, fb.ticket) : null,
      hint: filtered ? "Total da OS inteira ÷ número de OS" : "Vendido ÷ número de OS",
    },
  ];
  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="Resumo do comparativo">
      {cards.map((c) => (
        <div key={c.k} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="text-sm font-semibold">{c.k}</p>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase" style={{ color: COLOR_A }}>
                A
              </p>
              <p className="text-xl font-extrabold tabular-nums">{c.a}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase" style={{ color: COLOR_B }}>
                B
              </p>
              <p className="text-xl font-extrabold tabular-nums">{c.b}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A sobre B: <b className="text-foreground">{c.d ?? "—"}</b>
          </p>
        </div>
      ))}
      {(a.loading || b.loading) && (
        <p className="text-xs text-muted-foreground md:col-span-3">Calculando as OS…</p>
      )}
    </section>
  );
}

function OsPanel({
  a,
  b,
}: {
  a: { title: string; data: OsData | null; enabled: boolean; loading: boolean };
  b: { title: string; data: OsData | null; enabled: boolean; loading: boolean };
}) {
  const cats = Object.keys(categoryLabels) as Category[];
  const line = (x: typeof a, c: Category) => {
    const v = x.data?.categories[c];
    if (!v || !x.data) return { os: "—", share: "—", ticket: "—" };
    return {
      os: v.osCount.toLocaleString("pt-BR"),
      share: x.data.osCount
        ? `${((v.osCount / x.data.osCount) * 100).toFixed(1).replace(".", ",")}%`
        : "—",
      ticket: v.osCount ? money(Math.round(v.osTotalCents / v.osCount)) : "—",
    };
  };
  if (!a.enabled && !b.enabled) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">OS que tiveram cada campo</h2>
      <p className="max-w-[75ch] text-sm text-muted-foreground">
        Mostra em quantas OS houve pneus, peças, óleos ou serviços, quanto isso representa do total
        de OS e o ticket médio dessas OS. O valor da OS é o total dela inteira (peças mais mão de
        obra, por exemplo), não só do campo.
      </p>
      {a.data && b.data && (
        <CompareBars
          data={cats.map((c) => ({
            name: categoryLabels[c],
            A: a.data!.osCount ? (a.data!.categories[c].osCount / a.data!.osCount) * 100 : 0,
            B: b.data!.osCount ? (b.data!.categories[c].osCount / b.data!.osCount) * 100 : 0,
          }))}
          nameA={a.title}
          nameB={b.title}
          unit="percent"
          height={260}
          label="Gráfico da porcentagem de OS que tiveram cada categoria"
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">OS que tiveram…</th>
              {[a, b].map((x, i) => (
                <th
                  key={i}
                  colSpan={3}
                  className="px-2 text-center font-semibold"
                  style={{ color: i === 0 ? COLOR_A : COLOR_B }}
                >
                  {i === 0 ? "A" : "B"} · {x.title}
                </th>
              ))}
            </tr>
            <tr className="text-right text-[11px] uppercase tracking-wide text-muted-foreground">
              <th />
              {[0, 1].flatMap((i) => [
                <th key={`o${i}`} className="px-2 font-semibold">
                  OS
                </th>,
                <th key={`s${i}`} className="px-2 font-semibold">
                  % das OS
                </th>,
                <th key={`t${i}`} className="px-2 font-semibold">
                  Ticket médio
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border font-bold">
              <td className="py-2 pr-2">Todas as OS</td>
              {[a, b].map((x, i) => (
                <td key={i} colSpan={3} className="px-2 text-right">
                  {x.data
                    ? `${x.data.osCount.toLocaleString("pt-BR")} OS · ticket ${x.data.osCount ? money(Math.round(x.data.osTotalCents / x.data.osCount)) : "—"}`
                    : x.enabled
                      ? x.loading
                        ? "Calculando…"
                        : "—"
                      : "Não se aplica"}
                </td>
              ))}
            </tr>
            {cats.map((c) => {
              const la = line(a, c);
              const lb = line(b, c);
              return (
                <tr key={c} className="border-t border-border">
                  <td className="py-2 pr-2">{categoryLabels[c]}</td>
                  <td className="px-2 text-right">{la.os}</td>
                  <td className="px-2 text-right text-muted-foreground">{la.share}</td>
                  <td className="px-2 text-right">{la.ticket}</td>
                  <td className="px-2 text-right">{lb.os}</td>
                  <td className="px-2 text-right text-muted-foreground">{lb.share}</td>
                  <td className="px-2 text-right">{lb.ticket}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Side-by-side horizontal bars, one pair per row, the two sides in the same two colors everywhere. */
function CompareBars({
  data,
  nameA,
  nameB,
  unit,
  height,
  label,
}: {
  data: { name: string; A: number; B: number }[];
  nameA: string;
  nameB: string;
  unit: "money" | "percent";
  height: number;
  label: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fmt = (v: number) =>
    unit === "money" ? money(Math.round(v * 100)) : `${v.toFixed(1).replace(".", ",")}%`;
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={label}>
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) =>
                unit === "money"
                  ? v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
                  : `${v}%`
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={170}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              formatter={(v) => fmt(Number(v))}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            />
            <Legend />
            <Bar dataKey="A" name={nameA} fill={COLOR_A} radius={[0, 4, 4, 0]} />
            <Bar dataKey="B" name={nameB} fill={COLOR_B} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
