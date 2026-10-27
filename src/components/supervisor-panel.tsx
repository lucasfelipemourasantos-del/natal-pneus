import { CommissionCharts } from "@/components/commission-charts";
import { monthLabel } from "@/lib/commissions";
import { money } from "@/lib/results";
import { rateLabel, supervisorMonth, supervisorSeries, type SupervisorRow } from "@/lib/supervisor";

/** Commission of a supervisor: a fixed rate on the total sold by the store in the month. */
export function SupervisorPanel({
  rows,
  code,
  month,
  partialCompetence,
}: {
  rows: SupervisorRow[];
  code: number;
  month: string;
  partialCompetence: string | null;
}) {
  const v = supervisorMonth(rows, code, month);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Vendido pela loja ${v.unit ?? ""}`} value={money(v.soldCents)} />
        <Stat
          label="Atualizado até"
          value={
            v.periodEnd ? new Date(v.periodEnd + "T12:00:00").toLocaleDateString("pt-BR") : "—"
          }
        />
        <Stat label="Sua comissão" value={money(v.commissionCents)} strong />
      </div>
      <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-bold">Total da loja por grupo — {monthLabel(month)}</h3>
        {v.groups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Grupo</th>
                  <th className="py-2 pr-3 text-right">Vendido</th>
                  <th className="py-2 pr-3 text-right">Taxa</th>
                  <th className="py-2 text-right">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {v.groups.map((g) => (
                  <tr key={g.name} className="border-t border-border">
                    <td className="py-2 pr-3">{g.name}</td>
                    <td className="py-2 pr-3 text-right">{money(g.soldCents)}</td>
                    <td className="py-2 pr-3 text-right">{rateLabel(g.rateBp)}</td>
                    <td className="py-2 text-right">{money(g.commissionCents)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-extrabold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right">{money(v.soldCents)}</td>
                  <td />
                  <td className="py-2 text-right">{money(v.commissionCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            O relatório de supervisor deste mês ainda não foi lançado pelo RH.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Valores copiados do relatório "Comissões por Supervisor" do Decision, como ele traz. A
          comissão do supervisor é uma taxa sobre o total vendido pela loja {v.unit ?? ""} no mês.
        </p>
      </section>
      <CommissionCharts
        points={supervisorSeries(rows, code, month)}
        partialCompetence={partialCompetence}
      />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl tabular-nums ${strong ? "font-extrabold text-primary" : "font-bold"}`}
      >
        {value}
      </p>
    </div>
  );
}
