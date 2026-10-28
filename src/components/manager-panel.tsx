import { CommissionCharts } from "@/components/commission-charts";
import { monthLabel, type ReportRow } from "@/lib/commissions";
import {
  MANAGER_RULE,
  managerMonth,
  managerSeries,
  type SalesWithoutCommission,
} from "@/lib/manager-commission";
import { cleanName } from "@/lib/names";
import { fieldClass } from "@/lib/portal-data";
import { money } from "@/lib/results";

/** Commission of the manager: a fixed rate on the valid sales of NP1, NP2 and NP3. */
export function ManagerPanel({
  reports,
  ignored,
  extra,
  month,
  months,
  onMonth,
  nameOf,
  partialCompetence,
}: {
  reports: ReportRow[];
  ignored: Set<number>;
  extra: SalesWithoutCommission[];
  month: string;
  months: string[];
  onMonth: (month: string) => void;
  nameOf: (code: number) => string;
  partialCompetence: string | null;
}) {
  const m = managerMonth(reports, ignored, extra, month);
  const rate = (MANAGER_RULE.rateBp / 100).toFixed(2).replace(".", ",");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Comissões · Gerente
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-balance">
            {MANAGER_RULE.name} — {monthLabel(month)}
          </h2>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mês
          <select value={month} onChange={(e) => onMonth(e.target.value)} className={fieldClass}>
            {months.map((x) => (
              <option key={x} value={x}>
                {monthLabel(x)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="max-w-[75ch] text-sm text-muted-foreground">
        Comissão de <b className="text-foreground">{rate}%</b> sobre as vendas válidas de{" "}
        {MANAGER_RULE.units.join(", ")}, de qualquer vendedor (o Humberto entra, mesmo sem
        comissão). Ficam de fora a NP4, vendas de supervisor, o código do próprio gerente e os
        usuários de estoque. As transferências entre lojas ainda não são separadas pelo Decision:
        quando o nome do cliente chegar, elas saem da base. Este valor é uma referência.
      </p>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Resumo do gerente">
        {[
          {
            k: "Base de vendas",
            v: money(m.baseCents),
            d: MANAGER_RULE.units.join(" + "),
            hl: false,
          },
          { k: "Taxa", v: `${rate}%`, d: "sobre a base", hl: false },
          { k: "Comissão do gerente", v: money(m.commissionCents), d: monthLabel(month), hl: true },
          {
            k: "Fora da base (NP4)",
            v: money(m.np4Cents),
            d: "vendas da NP4 não contam",
            hl: false,
          },
        ].map((t) => (
          <div
            key={t.k}
            className={`flex flex-col gap-1.5 rounded-xl border bg-card p-4 ${t.hl ? "border-primary shadow-[inset_0_3px_0_var(--primary)]" : "border-border"}`}
          >
            <span className="text-sm text-muted-foreground">{t.k}</span>
            <span className="text-xl font-extrabold tabular-nums sm:text-2xl">{t.v}</span>
            <span className="text-xs text-muted-foreground">{t.d}</span>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-bold">Vendas que entram, por loja</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Loja / vendedor</th>
                <th className="px-2 text-right font-semibold">Vendido</th>
                <th className="pl-2 text-right font-semibold">Comissão {rate}%</th>
              </tr>
            </thead>
            <tbody>
              {m.units.flatMap((u) => [
                <tr key={u.unit} className="border-t border-border bg-accent/20 font-bold">
                  <td className="py-2 pr-2">{u.unit}</td>
                  <td className="px-2 text-right">{money(u.soldCents)}</td>
                  <td className="pl-2 text-right">
                    {money(Math.round((u.soldCents * MANAGER_RULE.rateBp) / 10000))}
                  </td>
                </tr>,
                ...[
                  ...u.sellers.map((s) => ({
                    key: `${u.unit}-${s.code}`,
                    name: nameOf(s.code),
                    tag: "",
                    cents: s.soldCents,
                  })),
                  ...u.noCommission.map((s) => ({
                    key: `${u.unit}-sem-${s.code}`,
                    name: cleanName(s.name),
                    tag: "Sem comissão",
                    cents: s.soldCents,
                  })),
                ]
                  .sort((a, b) => b.cents - a.cents)
                  .map((s) => (
                    <tr key={s.key} className="border-t border-border">
                      <td className="py-2 pl-4 pr-2">
                        {s.name}
                        {s.tag && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                            {s.tag}
                          </span>
                        )}
                      </td>
                      <td className="px-2 text-right">{money(s.cents)}</td>
                      <td className="pl-2 text-right text-muted-foreground">
                        {money(Math.round((s.cents * MANAGER_RULE.rateBp) / 10000))}
                      </td>
                    </tr>
                  )),
              ])}
              <tr className="border-t border-border font-extrabold">
                <td className="py-2 pr-2">Total</td>
                <td className="px-2 text-right">{money(m.baseCents)}</td>
                <td className="pl-2 text-right">{money(m.commissionCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {m.ignoredList.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-bold">Vendas que ficam de fora</h3>
          <p className="text-sm text-muted-foreground">
            Usuários de estoque, supervisor e o código do gerente, nas lojas{" "}
            {MANAGER_RULE.units.join(", ")}.
          </p>
          <ul className="divide-y divide-border text-sm tabular-nums">
            {m.ignoredList.map((i) => (
              <li key={`${i.code}-${i.unit}`} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {i.code} · {nameOf(i.code)} · {i.unit}
                </span>
                <span>{money(i.soldCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommissionCharts
        points={managerSeries(reports, ignored, extra, month)}
        partialCompetence={partialCompetence}
      />
    </div>
  );
}
