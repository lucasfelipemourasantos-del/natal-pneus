import { money } from "@/lib/results";
import type { laborGoal } from "@/lib/technician-commissions";

/** Labor goal of a mechanic (bronze, prata, ouro, each with a bonus). Without a registered goal it says "em breve". */
export function LaborGoalCard({ goal }: { goal: ReturnType<typeof laborGoal> }) {
  if (!goal)
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-bold">Meta de mão de obra</h3>
        <span className="inline-block rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
          Em breve
        </span>
        <p className="text-xs text-muted-foreground">
          A meta desta função ainda está sendo elaborada.
        </p>
      </section>
    );
  const top = goal.tiers.at(-1)?.targetCents ?? 1;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-bold">Meta de mão de obra</h3>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xl font-extrabold tabular-nums">{money(goal.currentCents)}</span>
        <span className="text-xs text-muted-foreground">
          {goal.next
            ? `de ${money(goal.next.targetCents)} (${goal.next.label})`
            : "Todas as faixas atingidas"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, (goal.currentCents / top) * 100)}%` }}
        />
      </div>
      <ul className="divide-y divide-border text-sm tabular-nums">
        {goal.tiers.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-semibold">
              {t.label}
              {t.reached && (
                <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                  atingida
                </span>
              )}
            </span>
            <span className="text-muted-foreground">
              {money(t.targetCents)} · bônus {money(t.bonusCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {goal.reached
          ? `Bônus do mês: ${money(goal.bonusCents)} (faixa ${goal.reached.label}). `
          : ""}
        {goal.next
          ? `Faltam ${money(goal.next.targetCents - goal.currentCents)} para a faixa ${goal.next.label}. `
          : ""}
        Conta só o grupo Mão de obra interna, somando todas as lojas.
      </p>
    </section>
  );
}
