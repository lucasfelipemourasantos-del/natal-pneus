import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Award, CircleDollarSign, Target, TrendingUp } from "lucide-react";
import { PortalShell, Stat } from "@/components/portal-shell";
import { canSeeCommissions } from "@/lib/access";
import { readCommissions } from "@/lib/commission.functions";
import { monthLabel, partsGoal, referenceFor } from "@/lib/commissions";
import { fieldClass } from "@/lib/portal-data";
import { money } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Minhas metas — Portal Natal Pneus" },
      {
        name: "description",
        content: "Meta de peças do vendedor: base, faixas Bronze, Prata e Ouro e progresso do mês.",
      },
      { property: "og:title", content: "Minhas metas — Portal Natal Pneus" },
      { property: "og:description", content: "Meta de peças e progresso do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MetasPage,
});

const tierColor: Record<string, string> = {
  bronze: "oklch(0.62 0.11 55)",
  prata: "oklch(0.7 0.012 255)",
  ouro: "oklch(0.8 0.15 85)",
};

function currentMonthStart() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function shortMonth(competence: string) {
  const [y = 0, m = 1] = competence.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
}

function MetasPage() {
  const { access } = Route.useRouteContext();
  const [competence, setCompetence] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const allowed = canSeeCommissions(access);
  const { data, isPending, error } = useQuery({
    queryKey: ["commissions", competence],
    queryFn: () => readCommissions({ data: { competence } }),
    enabled: allowed,
  });

  if (!allowed)
    return (
      <PortalShell title="Minhas metas" eyebrow="Desempenho">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Metas ainda não disponíveis para a sua função</h2>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            As metas de peças valem para os vendedores. As demais funções entram aqui em breve. Se
            você é vendedor e vê esta mensagem, peça ao RH para ligar o seu código do Decision à sua
            conta.
          </p>
        </section>
      </PortalShell>
    );
  if (isPending)
    return (
      <PortalShell title="Minhas metas" eyebrow="Desempenho">
        <p className="text-muted-foreground">Carregando…</p>
      </PortalShell>
    );
  if (error)
    return (
      <PortalShell title="Minhas metas" eyebrow="Desempenho">
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      </PortalShell>
    );
  if (!data.competence)
    return (
      <PortalShell title="Minhas metas" eyebrow="Desempenho">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Ainda não há dados de vendas</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            As metas aparecem aqui depois da primeira atualização com os dados do Decision.
          </p>
        </section>
      </PortalShell>
    );

  const month = data.competence;
  const ignored = new Set(data.sellers.filter((s) => s.ignored).map((s) => s.code));
  const codes = [
    ...new Set(
      data.reports
        .filter((r) => r.competence === month && !ignored.has(r.seller_code))
        .map((r) => r.seller_code),
    ),
  ];
  const leader = Boolean(access.canReadAll || access.isAdmin);
  const sellers = (leader ? codes : codes.filter((c) => c === access.sellerCode))
    .map((code) => ({
      code,
      name: data.sellers.find((s) => s.code === code)?.name ?? `Vendedor ${code}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const sellerCode = sellers.some((s) => s.code === picked) ? picked! : (sellers[0]?.code ?? null);
  const seller = sellers.find((s) => s.code === sellerCode);
  const sellerName = (code: number) =>
    data.sellers.find((s) => s.code === code)?.name ?? `Vendedor ${code}`;
  const goalOff = data.sellers.find((s) => s.code === sellerCode)?.parts_goal === false;
  const reference = referenceFor(data.goalRefs, sellerCode);
  const goal =
    sellerCode === null || goalOff ? null : partsGoal(data.reports, sellerCode, month, reference);
  const inProgress = month === currentMonthStart();

  const scale = goal
    ? Math.max(
        goal.tiers.at(-1)?.targetCents ?? 0,
        goal.currentCents ?? 0,
        ...goal.history.map((h) => h.cents ?? 0),
        1,
      )
    : 1;
  const barMax = goal
    ? Math.max(
        goal.currentCents ?? 0,
        ...goal.history.map((h) => h.cents ?? 0),
        goal.tiers.at(-1)?.targetCents ?? 0,
        1,
      )
    : 1;
  const growth =
    goal && goal.averageCents && goal.currentCents !== null && !goal.noPartsHistory
      ? ((goal.currentCents - goal.averageCents) / goal.averageCents) * 100
      : null;
  const usedMonths = new Set(goal?.used.map((b) => b.month));
  const droppedMonth = goal?.dropped?.month ?? null;

  return (
    <PortalShell title="Minhas metas" eyebrow="Desempenho">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Minhas metas · Peças
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-balance">
            {seller ? `${seller.code} · ${seller.name}` : "Sem vendedor"} — {monthLabel(month)}
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mês
            <select
              id="goal-month"
              value={month}
              onChange={(e) => setCompetence(e.target.value)}
              className={fieldClass}
            >
              {data.available.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          {sellers.length > 1 && (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vendedor
              <select
                id="goal-seller"
                value={sellerCode ?? ""}
                onChange={(e) => setPicked(Number(e.target.value))}
                className={fieldClass}
              >
                {sellers.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {goalOff ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Sem meta de peças</h3>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            Este vendedor não tem meta de peças. As vendas e a comissão continuam na tela de
            comissões.
          </p>
          <Link
            to="/comissoes"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Ver comissões →
          </Link>
        </section>
      ) : !goal ? (
        <p className="mt-6 text-muted-foreground">Não há vendas suas neste mês.</p>
      ) : goal.noPartsHistory ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Sem meta de peças</h3>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            Não há vendas de peças nos últimos 6 meses para formar a base da meta. Quando houver, a
            meta aparece aqui.
          </p>
        </section>
      ) : goal.averageCents === null ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Aguardando histórico</h3>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            A meta usa a média dos últimos 12 meses de peças, sem o pior mês. Ainda não há meses
            anteriores suficientes para calcular.
          </p>
        </section>
      ) : (
        <div className="mt-6 space-y-6">
          <p className="max-w-[75ch] text-sm text-muted-foreground">
            <b className="text-foreground">Como a meta é calculada:</b>{" "}
            {goal.reference ? (
              <>
                a base é a <b className="text-foreground">média mínima</b>: a menor média de peças
                entre os vendedores ativos (últimos 12 meses, sem o pior mês)
                {leader
                  ? ` — hoje a de ${goal.reference.refCode} · ${sellerName(goal.reference.refCode)}`
                  : ""}
                . Ela é usada no lugar do seu histórico próprio.
              </>
            ) : (
              <>
                a base é a média das peças dos últimos 12 meses, sem o pior mês
                {goal.months < 11
                  ? ` (por ora ${goal.months} meses, o histórico ainda é curto)`
                  : ""}
                , somando todas as lojas em que você vendeu.
              </>
            )}{" "}
            Bronze é a base +20%, Prata +25% e Ouro +30%.
            {inProgress && (
              <b className="text-foreground">
                {" "}
                Mês em andamento: o valor de peças é parcial
                {data.syncedAt
                  ? ` e foi atualizado em ${new Date(data.syncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
                .
              </b>
            )}
          </p>

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Resumo da meta">
            <Stat
              icon={Target}
              label="Base da meta"
              value={money(goal.averageCents)}
              detail={
                goal.reference
                  ? "Média mínima"
                  : `Média de ${goal.months} ${goal.months === 1 ? "mês" : "meses"}${goal.dropped ? " (sem o pior)" : ""}`
              }
            />
            <Stat
              icon={CircleDollarSign}
              label="Peças no mês"
              value={money(goal.currentCents ?? 0)}
              detail="Todas as lojas"
            />
            <Stat
              icon={TrendingUp}
              label="Sobre a base"
              value={
                growth === null
                  ? "—"
                  : `${growth >= 0 ? "+" : ""}${growth.toFixed(1).replace(".", ",")}%`
              }
              detail="Peças do mês ÷ base"
            />
            <Stat
              icon={Award}
              label="Faixa atual"
              value={goal.reached?.label ?? "Nenhuma"}
              detail={
                goal.next && goal.currentCents !== null
                  ? `Faltam ${money(goal.next.targetCents! - goal.currentCents)} para o ${goal.next.label}`
                  : "Todas as faixas atingidas"
              }
            />
          </section>

          <section
            className="space-y-3 rounded-xl border border-border bg-card p-5"
            aria-labelledby="goal-progress"
          >
            <h3 id="goal-progress" className="text-lg font-bold">
              Progresso até as faixas
            </h3>
            <div
              className="relative mt-8 h-4 rounded-full bg-muted"
              role="img"
              aria-label={`Peças ${money(goal.currentCents ?? 0)}. ${goal.tiers.map((t) => `${t.label} ${money(t.targetCents)}`).join(". ")}`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-sales-parts"
                style={{ width: `${Math.min(100, ((goal.currentCents ?? 0) / scale) * 100)}%` }}
              />
              {goal.tiers.map((t) => (
                <div
                  key={t.key}
                  className="absolute -bottom-1.5 -top-7 w-0.5 bg-foreground/50"
                  style={{ left: `${((t.targetCents ?? 0) / scale) * 100}%` }}
                >
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold">
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>R$ 0</span>
              <span>{money(scale)}</span>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3" aria-label="Faixas de bônus">
            {goal.tiers.map((t) => {
              const done =
                goal.currentCents !== null &&
                t.targetCents !== null &&
                goal.currentCents >= t.targetCents;
              return (
                <div
                  key={t.key}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
                >
                  <span className="inline-flex items-center gap-2 font-extrabold">
                    <span
                      className="size-3 rounded-full"
                      style={{ background: tierColor[t.key] }}
                    />
                    {t.label}
                    {done && (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold uppercase text-success">
                        atingida
                      </span>
                    )}
                  </span>
                  <span className="text-xl font-extrabold tabular-nums">
                    {money(t.targetCents)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Base +{t.growth}%
                    {!done && goal.currentCents !== null && t.targetCents !== null
                      ? ` · faltam ${money(t.targetCents - goal.currentCents)}`
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">Bônus: a definir pelo RH</span>
                </div>
              );
            })}
          </section>

          <section
            className="space-y-3 rounded-xl border border-border bg-card p-5"
            aria-labelledby="goal-history"
          >
            <h3 id="goal-history" className="text-lg font-bold">
              Peças vendidas por mês
            </h3>
            <p className="text-sm text-muted-foreground">
              Em amarelo, os meses que formam a base. O pior mês (cinza claro, tracejado) fica de
              fora. O mês avaliado está em vermelho.
            </p>
            <div
              className="grid h-44 items-end gap-1.5 border-b border-border pb-0 sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${goal.history.length + 1}, minmax(0, 1fr))` }}
            >
              {[...goal.history, { month, cents: goal.currentCents }].map((h, i, all) => {
                const isCurrent = i === all.length - 1;
                const color = isCurrent
                  ? "bg-primary"
                  : h.month === droppedMonth
                    ? "border border-dashed border-muted-foreground bg-transparent"
                    : usedMonths.has(h.month)
                      ? "bg-sales-parts"
                      : "bg-sales-oils";
                return (
                  <div
                    key={h.month}
                    className="flex h-full flex-col items-center justify-end gap-1"
                  >
                    <span className="hidden text-[10px] tabular-nums text-muted-foreground lg:block">
                      {h.cents === null
                        ? ""
                        : `${(h.cents / 100000).toFixed(1).replace(".", ",")}k`}
                    </span>
                    <div
                      className={`w-full max-w-9 rounded-t-md ${color}`}
                      style={{ height: `${h.cents ? Math.max(2, (h.cents / barMax) * 78) : 0}%` }}
                      title={`${monthLabel(h.month)}: ${money(h.cents ?? 0)}`}
                    />
                  </div>
                );
              })}
            </div>
            <div
              className="grid gap-1.5 sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${goal.history.length + 1}, minmax(0, 1fr))` }}
            >
              {[...goal.history, { month, cents: goal.currentCents }].map((h) => (
                <span
                  key={h.month}
                  className="text-center text-[10px] text-muted-foreground sm:text-[11px]"
                >
                  {shortMonth(h.month)}
                </span>
              ))}
            </div>
          </section>

          <p className="text-sm">
            <Link to="/comissoes" className="font-semibold text-primary hover:underline">
              Ver minhas comissões →
            </Link>
          </p>
        </div>
      )}
    </PortalShell>
  );
}
