import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { CommissionCharts } from "@/components/commission-charts";
import { LaborGoalCard } from "@/components/labor-goal-card";
import { PortalShell } from "@/components/portal-shell";
import { SupervisorPanel } from "@/components/supervisor-panel";
import { supabase } from "@/integrations/supabase/client";
import { supervisorMonth, type SupervisorRow } from "@/lib/supervisor";
import { canSeeCommissions, hasAllStoresAccess } from "@/lib/access";
import {
  readCommissionItems,
  readCommissions,
  readTechCommissions,
} from "@/lib/commission.functions";
import { isTechnicianOnly } from "@/lib/access";
import { cleanName } from "@/lib/names";
import {
  isLaborGroup,
  laborGoal,
  operatorTypes,
  ROLE_ORDER,
  roleLabel,
  teamShare,
  techMonth,
  type TeamRow,
  type TechRole,
  typesLabel,
} from "@/lib/technician-commissions";
import {
  categoryLabels,
  monthLabel,
  partsGoal,
  referenceFor,
  rateLabel,
  currentCompetence,
  sellerMonth,
  sellerSeries,
  storeMonth,
  type Category,
  type UnitCheck,
} from "@/lib/commissions";
import { fieldClass } from "@/lib/portal-data";
import { money } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/comissoes")({
  beforeLoad: ({ context }) => {
    if (!canSeeCommissions(context.access)) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Comissões — Natal Pneus" },
      {
        name: "description",
        content:
          "Comissões, ordens de serviço e ticket médio dos vendedores a partir dos relatórios do Decision.",
      },
      { property: "og:title", content: "Comissões — Natal Pneus" },
      {
        property: "og:description",
        content: "Comissões, ordens de serviço e ticket médio dos vendedores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Comissoes,
});

const barColor: Record<Category, string> = {
  pneus: "bg-sales-tires",
  servicos: "bg-sales-services",
  pecas: "bg-sales-parts",
  oleos: "bg-sales-oils",
};
const checkText: Record<UnitCheck, string> = {
  conferido: "conferido",
  "falta-analitico": "falta o relatório analítico",
  "falta-sintetico": "falta o relatório sintético",
  divergente: "sintético e analítico não batem",
};

type Team = "vendedores" | "operadores";

type CodeLine = { code: number; label: string; cents: number };

/** One person with more than one Decision code (e.g. chefe de pista and mecânico): always separate, with an optional sum. */
function CodesCard({
  lines,
  selected,
  onPick,
}: {
  lines: CodeLine[];
  selected: number | null;
  onPick: (code: number) => void;
}) {
  const [sum, setSum] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Seus códigos</h3>
        <button
          type="button"
          aria-pressed={sum}
          onClick={() => setSum((v) => !v)}
          className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold"
        >
          {sum ? "Ver separado" : "Somar as comissões"}
        </button>
      </div>
      <ul className="divide-y divide-border text-sm tabular-nums">
        {lines.map((l) => (
          <li key={l.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <button
              type="button"
              onClick={() => onPick(l.code)}
              aria-pressed={selected === l.code}
              className={`text-left font-semibold hover:text-primary ${selected === l.code ? "text-primary" : ""}`}
            >
              {l.code} · {l.label}
            </button>
            <b>{money(l.cents)}</b>
          </li>
        ))}
        {sum && (
          <li className="flex justify-between gap-2 py-2 font-extrabold">
            <span>Soma das comissões</span>
            <span>{money(lines.reduce((t, l) => t + l.cents, 0))}</span>
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        As comissões de cada código ficam sempre separadas. Toque em um código para ver os detalhes
        dele.
      </p>
    </section>
  );
}

/** Commission of a pooled team: everyone's commission summed and split equally. The goal stays individual. */
function TeamCard({
  team,
  ownCents,
  members,
}: {
  team: TeamRow;
  ownCents: number;
  members: { code: number; name: string; cents: number }[] | null;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-primary bg-card p-5 shadow-[inset_0_3px_0_var(--primary)]">
      <h3 className="text-lg font-bold">Comissão unificada</h3>
      <p className="text-xs text-muted-foreground">
        {team.team_name}: a comissão de todos é somada e dividida por {team.member_codes.length}.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Soma da equipe</dt>
          <dd className="text-lg font-extrabold tabular-nums">{money(team.commission_cents)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Parte de cada um</dt>
          <dd className="text-lg font-extrabold tabular-nums text-primary">
            {money(teamShare(team))}
          </dd>
        </div>
      </dl>
      <p className="text-sm">
        Comissão individual do Decision: <b className="tabular-nums">{money(ownCents)}</b>
      </p>
      {members && (
        <ul className="divide-y divide-border text-sm tabular-nums">
          {members.map((m) => (
            <li key={m.code} className="flex justify-between gap-2 py-1.5">
              <span>
                {m.code} · {m.name}
              </span>
              <b>{money(m.cents)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sellers and operators (mechanics, aligners, balancers...) are never listed together. */
function TeamSwitch({ team, onChange }: { team: Team; onChange: (t: Team) => void }) {
  const options: { key: Team; label: string }[] = [
    { key: "vendedores", label: "Vendedores" },
    { key: "operadores", label: "Operadores" },
  ];
  return (
    <div
      role="group"
      aria-label="Equipe"
      className="mb-5 inline-flex rounded-lg border border-border p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={team === o.key}
          onClick={() => onChange(o.key)}
          className={`min-h-10 rounded-md px-4 text-sm font-semibold ${team === o.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function percent(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1).replace(".", ",")}%` : "—";
}

function Comissoes() {
  const { access } = Route.useRouteContext();
  const [competence, setCompetence] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [mode, setMode] = useState<"vendedor" | "loja">("vendedor");
  const [team, setTeam] = useState<Team>(isTechnicianOnly(access) ? "operadores" : "vendedores");
  const [role, setRole] = useState<TechRole | "">("");
  const operators = team === "operadores";
  const canPickTeam = hasAllStoresAccess(access) || Boolean(access.hasSales && access.hasService);
  const teamSwitch = canPickTeam ? <TeamSwitch team={team} onChange={setTeam} /> : null;
  const { data, isPending, error } = useQuery({
    queryKey: [operators ? "tech-commissions" : "commissions", competence],
    queryFn: () =>
      operators
        ? readTechCommissions({ data: { competence } })
        : readCommissions({ data: { competence } }),
  });

  // Supervisor commission: mirror of the Decision report typed in by the RH (empty until the 0021 update is applied).
  const supervisor = useQuery({
    queryKey: ["supervisor-commissions"],
    enabled: !operators,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("supervisor_commissions")
        .select(
          "seller_code,unit_code,competence,period_end,group_name,sold_cents,rate_bp,commission_cents",
        );
      return err ? ([] as SupervisorRow[]) : (rows as SupervisorRow[]);
    },
  });

  if (isPending)
    return (
      <PortalShell title="Comissões" eyebrow={operators ? "Operadores" : "Vendedores"}>
        {teamSwitch}
        <p className="text-muted-foreground">Carregando…</p>
      </PortalShell>
    );
  if (error)
    return (
      <PortalShell title="Comissões" eyebrow={operators ? "Operadores" : "Vendedores"}>
        {teamSwitch}
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      </PortalShell>
    );
  if (!data.competence)
    return (
      <PortalShell title="Comissões" eyebrow={operators ? "Operadores" : "Vendedores"}>
        {teamSwitch}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Nenhum relatório de comissão importado ainda</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            As comissões aparecem aqui depois da primeira atualização com os dados do Decision.
          </p>
          {access.isAdmin && (
            <Link
              to="/admin-comissoes"
              className="mt-4 inline-block font-semibold text-primary hover:underline"
            >
              Ver comissões do Decision →
            </Link>
          )}
        </section>
      </PortalShell>
    );

  const month = data.competence;
  const ignored = new Set(data.sellers.filter((s) => s.ignored).map((s) => s.code));
  const inMonth = data.reports.filter((r) => r.competence === month && !ignored.has(r.seller_code));
  /** Name shown in the portal: what the employee typed at signup, otherwise the Decision name without reference tags. */
  const nameOf = (code: number) =>
    data.names.find((n) => n.code === code)?.name ??
    cleanName(data.sellers.find((s) => s.code === code)?.name ?? `Código ${code}`);
  const sellerCodes = [...new Set(inMonth.map((r) => r.seller_code))].filter((code) => {
    const p = data.sellers.find((s) => s.code === code);
    // Generic Decision users (TECNICO PNEUS) only add up in the totals; they are not people.
    if (operators && p?.is_person === false) return false;
    if (!operators || !role) return true;
    return operatorTypes(p).includes(role);
  });
  const supRows = operators ? [] : (supervisor.data ?? []);
  const supCodes = [
    ...new Set([
      ...supRows.map((r) => r.seller_code),
      ...(operators ? [] : data.sellers.filter((s) => s.supervisor_unit).map((s) => s.code)),
    ]),
  ];
  const sellers = (
    access.canReadAll || access.isAdmin
      ? sellerCodes
          .map((code) => ({
            code,
            name: nameOf(code),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      : sellerCodes
          .filter((c) => (access.sellerCodes ?? [access.sellerCode]).includes(c))
          .map((code) => ({ code, name: nameOf(code) }))
  ).concat(
    supCodes.filter((c) => !sellerCodes.includes(c)).map((code) => ({ code, name: nameOf(code) })),
  );
  const sellerCode = sellers.some((s) => s.code === picked) ? picked! : (sellers[0]?.code ?? null);
  const seller = sellers.find((s) => s.code === sellerCode);
  const isSupervisor = sellerCode !== null && supCodes.includes(sellerCode);
  const leader = Boolean(access.canReadAll || access.isAdmin);
  const byStore = leader && mode === "loja";
  const units = [
    ...new Set(
      inMonth.filter((r) => byStore || r.seller_code === sellerCode).map((r) => r.unit_code),
    ),
  ].sort();
  const store = byStore
    ? storeMonth(data.reports, data.os, month, ignored, unit || undefined)
    : null;
  const sellerName = nameOf;

  const view =
    sellerCode === null
      ? null
      : sellerMonth(data.reports, data.os, sellerCode, month, unit || undefined);
  const goalOff = data.sellers.find((s) => s.code === sellerCode)?.parts_goal === false;
  const goal =
    sellerCode === null || goalOff || operators
      ? null
      : partsGoal(data.reports, sellerCode, month, referenceFor(data.goalRefs, sellerCode));
  const labor =
    operators && sellerCode !== null
      ? laborGoal(data.reports, sellerCode, month, data.goals)
      : null;
  const unifiedTeam =
    operators && sellerCode !== null
      ? (data.teams.find((t) => t.member_codes.includes(sellerCode)) ?? null)
      : null;
  const current = data.sellers.find((s) => s.code === sellerCode);
  const siblings = current?.profile_id
    ? data.sellers.filter((s) => s.profile_id === current.profile_id)
    : [];
  const codeLines = siblings.map((s) => ({
    code: s.code,
    label: operators
      ? typesLabel(operatorTypes(s))
      : supCodes.includes(s.code)
        ? "Supervisor"
        : "Vendedor",
    cents: operators
      ? techMonth(data.reports, s.code, month).commissionCents
      : supCodes.includes(s.code)
        ? supervisorMonth(supRows, s.code, month).commissionCents
        : sellerMonth(data.reports, data.os, s.code, month).commissionCents,
  }));
  const allChecked = view?.byUnit.every((u) => u.check === "conferido");

  return (
    <PortalShell title="Comissões" eyebrow={operators ? "Operadores" : "Vendedores"}>
      {teamSwitch}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {byStore
              ? `Comissões · ${operators ? "Equipe de operadores" : "Vendas da equipe"} por loja`
              : `Comissões · ${operators ? "Operadores" : "Vendedores"}`}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold text-balance">
            {byStore
              ? unit || "Todas as lojas"
              : seller
                ? `${seller.code} · ${seller.name}`
                : "Sem vendedor"}{" "}
            — {monthLabel(month)}
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {leader && (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ver por
              <select
                id="commission-mode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "vendedor" | "loja");
                  setUnit("");
                }}
                className={fieldClass}
              >
                <option value="vendedor">Vendedor</option>
                <option value="loja">Loja</option>
              </select>
            </label>
          )}
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mês
            <select
              id="commission-month"
              value={month}
              onChange={(e) => {
                setCompetence(e.target.value);
                setUnit("");
              }}
              className={fieldClass}
            >
              {data.available.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loja
            <select
              id="commission-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={fieldClass}
            >
              <option value="">Todas as lojas</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          {operators && leader && (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Função
              <select
                id="commission-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as TechRole | "");
                  setPicked(null);
                }}
                className={fieldClass}
              >
                <option value="">Todas as funções</option>
                {ROLE_ORDER.map((g) => (
                  <option key={g} value={g}>
                    {roleLabel(g)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!byStore && sellers.length > 1 && (
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vendedor
              <select
                id="commission-seller"
                value={sellerCode ?? ""}
                onChange={(e) => {
                  setPicked(Number(e.target.value));
                  setUnit("");
                }}
                className={fieldClass}
              >
                {sellers.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                    {supCodes.includes(s.code) ? " · Supervisor" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {store ? (
        <StoreView
          store={store}
          unit={unit}
          sellerName={sellerName}
          syncedAt={data.syncedAt}
          extra={data.noCommission.filter(
            (r) => r.competence === month && (!unit || r.unit_code === unit),
          )}
          onPick={(code) => {
            setPicked(code);
            setMode("vendedor");
            setUnit("");
          }}
        />
      ) : isSupervisor && sellerCode !== null ? (
        <div className="mt-6 space-y-6">
          {codeLines.length > 1 && (
            <CodesCard
              lines={codeLines}
              selected={sellerCode}
              onPick={(code) => {
                setPicked(code);
                setUnit("");
              }}
            />
          )}
          <SupervisorPanel
            rows={supRows}
            code={sellerCode}
            month={month}
            partialCompetence={currentCompetence()}
          />
        </div>
      ) : !view ? (
        <p className="mt-6 text-muted-foreground">Não há relatórios seus neste mês.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {allChecked ? (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold text-success">
              <CircleCheck size={17} aria-hidden="true" />
              Conferido com os totais do Decision
              {data.syncedAt && (
                <span className="font-normal">
                  · atualizado em{" "}
                  {new Date(data.syncedAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </p>
          ) : (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-warning-soft px-3 py-1.5 text-sm font-semibold">
              <TriangleAlert size={17} aria-hidden="true" />
              {view.byUnit
                .filter((u) => u.check !== "conferido")
                .map((u) => `${u.unit}: ${checkText[u.check]}`)
                .join(" · ")}
            </p>
          )}

          <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Resumo do mês">
            {[
              {
                k: "Total vendido",
                v: money(view.soldCents),
                d: unit ? `Na loja ${unit}` : "Todas as lojas onde ele vendeu",
                hl: false,
              },
              {
                k: "Comissão do mês",
                v: money(view.commissionCents),
                d: `Ajuda de custo: ${money(view.allowanceCents)}`,
                hl: true,
              },
              {
                k: "Ordens de serviço",
                v: view.osCount === null ? "—" : String(view.osCount),
                d: view.osCount === null ? "Aguardando o analítico" : "Contadas pelo nº da venda",
                hl: false,
              },
              {
                k: "Ticket médio",
                v: view.ticketCents === null ? "—" : money(view.ticketCents),
                d: "Total vendido ÷ nº de OS",
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

          {view.hasSintetico && (
            <section className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-bold">Composição das vendas</h3>
              <div
                className="flex h-[18px] overflow-hidden rounded-md bg-muted"
                role="img"
                aria-label={view.composition
                  .map(
                    (c) => `${categoryLabels[c.category]} ${percent(c.soldCents, view.soldCents)}`,
                  )
                  .join(", ")}
              >
                {view.composition.map((c) => (
                  <div
                    key={c.category}
                    className={barColor[c.category]}
                    style={{
                      width: `${view.soldCents ? Math.max(0, (c.soldCents / view.soldCents) * 100) : 0}%`,
                    }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {view.composition.map((c) => (
                  <div
                    key={c.category}
                    className="flex flex-col gap-0.5 text-xs text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2.5 rounded-sm ${barColor[c.category]}`} />
                      {categoryLabels[c.category]}
                    </span>
                    <b className="text-[15px] tabular-nums text-foreground">{money(c.soldCents)}</b>
                    {percent(c.soldCents, view.soldCents)}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
              <h3 className="text-lg font-bold">Comissão por grupo</h3>
              <p className="text-sm text-muted-foreground">
                Valores do relatório sintético. Pneus aparece em um único campo.
              </p>
              {view.hasSintetico ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Grupo</th>
                        <th className="px-2 text-right font-semibold">Vendido</th>
                        <th className="px-2 text-right font-semibold">% com.</th>
                        <th className="pl-2 text-right font-semibold">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.groups.map((g) => {
                        const goalBase = operators ? isLaborGroup(g.label) : g.category === "pecas";
                        return (
                          <tr
                            key={g.label}
                            className={`border-t border-border ${goalBase ? "bg-accent/20" : ""}`}
                          >
                            <td className="min-w-44 py-2.5 pr-2">
                              {g.label}
                              {goalBase && (
                                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-accent-foreground">
                                  base da meta
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 text-right">
                              {money(g.soldCents).replace("R$", "").trim()}
                            </td>
                            <td className="whitespace-nowrap px-2 text-right">
                              {rateLabel(g.rateBp)}
                            </td>
                            <td className="whitespace-nowrap pl-2 text-right">
                              {money(g.commissionCents).replace("R$", "").trim()}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-border font-extrabold">
                        <td className="py-2.5">Total</td>
                        <td className="px-2 text-right">
                          {money(view.groups.reduce((t, g) => t + g.soldCents, 0))
                            .replace("R$", "")
                            .trim()}
                        </td>
                        <td />
                        <td className="pl-2 text-right">
                          {money(view.groups.reduce((t, g) => t + g.commissionCents, 0))
                            .replace("R$", "")
                            .trim()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aguardando o relatório sintético.</p>
              )}
            </section>

            <div className="min-w-0 space-y-5">
              {codeLines.length > 1 && (
                <CodesCard
                  lines={codeLines}
                  selected={sellerCode}
                  onPick={(code) => {
                    setPicked(code);
                    setUnit("");
                  }}
                />
              )}
              {operators && sellerCode !== null && <LaborGoalCard goal={labor} />}
              {unifiedTeam && sellerCode !== null && (
                <TeamCard
                  team={unifiedTeam}
                  ownCents={techMonth(data.reports, sellerCode, month).commissionCents}
                  members={
                    leader
                      ? unifiedTeam.member_codes.map((code) => ({
                          code,
                          name: nameOf(code),
                          cents: techMonth(data.reports, code, month).commissionCents,
                        }))
                      : null
                  }
                />
              )}
              {goal && (
                <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                  <h3 className="text-lg font-bold">Meta de peças</h3>
                  {goal.averageCents === null || goal.currentCents === null ? (
                    <>
                      <span className="inline-block rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                        Aguardando meses anteriores
                      </span>
                      <p className="text-xl font-extrabold tabular-nums">
                        {money(goal.currentCents)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A meta usa a média das peças dos últimos 12 meses, sem o pior mês, somando
                        todas as lojas. Ainda não há meses anteriores para calcular.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-xl font-extrabold tabular-nums">
                          {money(goal.currentCents)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {goal.next
                            ? `de ${money(goal.next.targetCents)} (${goal.next.label})`
                            : `Faixa ${goal.reached?.label} atingida`}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-sales-parts"
                          style={{
                            width: `${Math.min(100, (goal.currentCents / (goal.next?.targetCents ?? goal.currentCents)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {goal.next
                          ? `Faltam ${money(goal.next.targetCents! - goal.currentCents)} para o ${goal.next.label}.`
                          : "Todas as faixas atingidas."}{" "}
                        {goal.reference
                          ? "Média mínima"
                          : `Base: média de ${goal.months} ${goal.months === 1 ? "mês" : "meses"} de peças${goal.dropped ? " (sem o pior)" : ""}`}{" "}
                        ({money(goal.averageCents)}).{" "}
                        <Link to="/metas" className="font-semibold text-primary hover:underline">
                          Ver minhas metas →
                        </Link>
                      </p>
                    </>
                  )}
                </section>
              )}

              <section className="space-y-3 rounded-xl border border-border bg-card p-5">
                <h3 className="text-lg font-bold">Onde ele vendeu</h3>
                {(["NP1", "NP2", "NP3", "NP4"] as const).map((u) => {
                  const row = view.byUnit.find((b) => b.unit === u);
                  const max = Math.max(...view.byUnit.map((b) => b.soldCents), 1);
                  return (
                    <div
                      key={u}
                      className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 text-sm"
                    >
                      <b>{u}</b>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${row ? (row.soldCents / max) * 100 : 0}%` }}
                        />
                      </div>
                      <span
                        className={`whitespace-nowrap tabular-nums ${row ? "font-bold" : "text-muted-foreground"}`}
                      >
                        {row ? money(row.soldCents) : unit && unit !== u ? "—" : "sem relatório"}
                      </span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  As vendas dele em outras lojas entram aqui e somam na meta pessoal.
                </p>
              </section>
            </div>
          </div>

          <SoldItems
            key={view.reportIds.join(",")}
            reportIds={view.reportIds}
            showPlate={operators}
          />
          {sellerCode !== null && (
            <CommissionCharts
              points={sellerSeries(data.reports, sellerCode, month)}
              partialCompetence={currentCompetence()}
            />
          )}
        </div>
      )}
    </PortalShell>
  );
}

function delta(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`;
}

/** Store or network view: sum of the store's sellers, ignored users left out. */
function StoreView({
  store,
  unit,
  sellerName,
  syncedAt,
  extra,
  onPick,
}: {
  store: ReturnType<typeof storeMonth>;
  /** Sales of sellers who earn no commission: they add to the store billing, nothing else. */
  extra: {
    unit_code: string;
    seller_code: number;
    seller_name: string;
    sales_count: number;
    sold_cents: number;
  }[];
  unit: string;
  sellerName: (code: number) => string;
  syncedAt: string | null;
  onPick: (code: number) => void;
}) {
  const extraSold = extra.reduce((s, r) => s + r.sold_cents, 0);
  const totalSold = store.soldCents + extraSold;
  // The same seller may have sold in more than one store of the view.
  const extraBySeller = [...new Set(extra.map((r) => r.seller_code))].map((code) => {
    const rows = extra.filter((r) => r.seller_code === code);
    return {
      code,
      name: rows[0]!.seller_name,
      units: rows.map((r) => r.unit_code),
      salesCount: rows.reduce((s, r) => s + r.sales_count, 0),
      soldCents: rows.reduce((s, r) => s + r.sold_cents, 0),
    };
  });
  const soldDelta = delta(store.soldCents, store.previous?.soldCents);
  const commissionDelta = delta(store.commissionCents, store.previous?.commissionCents);
  const prev = monthLabel(store.prevMonth);
  return (
    <div className="mt-6 space-y-6">
      <p className="max-w-[75ch] text-sm text-muted-foreground">
        <b className="text-foreground">Vendas da equipe:</b> soma das vendas dos vendedores
        {unit ? ` da ${unit}` : " das quatro lojas"}, como vêm do Decision, mais as vendas de quem
        não recebe comissão (sem comissão e sem meta). Usuários de estoque e gerência ficam de fora.
        Itens sem comissão (como cortesias) não aparecem neste relatório do Decision, por isso o
        valor pode ficar um pouco abaixo do faturamento oficial da loja.
        {syncedAt && (
          <>
            {" "}
            Atualizado em{" "}
            {new Date(syncedAt).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </>
        )}
      </p>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Resumo da loja">
        {[
          {
            k: "Vendas da equipe",
            v: money(totalSold),
            d: extraSold
              ? `Inclui ${money(extraSold)} de vendas sem comissão`
              : soldDelta
                ? `${soldDelta} sobre ${prev}`
                : `Sem dados de ${prev}`,
            hl: true,
          },
          {
            k: "Comissão total",
            v: money(store.commissionCents),
            d: commissionDelta ? `${commissionDelta} sobre ${prev}` : `Sem dados de ${prev}`,
            hl: false,
          },
          {
            k: "Ordens de serviço",
            v: store.osCount === null ? "—" : store.osCount.toLocaleString("pt-BR"),
            d: `${store.sellers.length} vendedores`,
            hl: false,
          },
          {
            k: "Ticket médio",
            v: store.ticketCents === null ? "—" : money(store.ticketCents),
            d: "Vendas ÷ nº de OS",
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

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-bold">Composição das vendas</h3>
        <div
          className="flex h-[18px] overflow-hidden rounded-md bg-muted"
          role="img"
          aria-label={store.composition
            .map((c) => `${categoryLabels[c.category]} ${percent(c.soldCents, store.soldCents)}`)
            .join(", ")}
        >
          {store.composition.map((c) => (
            <div
              key={c.category}
              className={barColor[c.category]}
              style={{
                width: `${store.soldCents ? Math.max(0, (c.soldCents / store.soldCents) * 100) : 0}%`,
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {store.composition.map((c) => (
            <div key={c.category} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-2.5 rounded-sm ${barColor[c.category]}`} />
                {categoryLabels[c.category]}
              </span>
              <b className="text-[15px] tabular-nums text-foreground">{money(c.soldCents)}</b>
              {percent(c.soldCents, store.soldCents)}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">Vendedores {unit ? `da ${unit}` : "da rede"}</h3>
          {store.ignoredSoldCents > 0 && (
            <span className="text-xs text-muted-foreground">
              {money(store.ignoredSoldCents)} de estoque e gerência não entram no total
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Vendedor</th>
                {!unit && <th className="px-2 font-semibold">Lojas</th>}
                <th className="px-2 text-right font-semibold">Vendido</th>
                <th className="px-2 text-right font-semibold">Participação</th>
                <th className="px-2 text-right font-semibold">OS</th>
                <th className="px-2 text-right font-semibold">Ticket médio</th>
                <th className="pl-2 text-right font-semibold">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {store.sellers.map((s) => (
                <tr key={s.code} className="border-t border-border">
                  <td className="min-w-48 py-2.5 pr-2">
                    <button
                      type="button"
                      onClick={() => onPick(s.code)}
                      className="text-left font-semibold hover:text-primary hover:underline"
                    >
                      {s.code} · {sellerName(s.code)}
                    </button>
                  </td>
                  {!unit && <td className="whitespace-nowrap px-2">{s.units.join(", ")}</td>}
                  <td className="whitespace-nowrap px-2 text-right">{money(s.soldCents)}</td>
                  <td className="px-2 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${totalSold ? (s.soldCents / totalSold) * 100 : 0}%` }}
                        />
                      </span>
                      {(totalSold ? (s.soldCents / totalSold) * 100 : 0)
                        .toFixed(1)
                        .replace(".", ",")}
                      %
                    </span>
                  </td>
                  <td className="px-2 text-right">{s.osCount ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    {s.ticketCents === null ? "—" : money(s.ticketCents)}
                  </td>
                  <td className="whitespace-nowrap pl-2 text-right">{money(s.commissionCents)}</td>
                </tr>
              ))}
              {extraBySeller.map((s) => (
                <tr key={`sem-${s.code}`} className="border-t border-border">
                  <td className="min-w-48 py-2.5 pr-2">
                    <span className="font-semibold">
                      {s.code} · {cleanName(s.name)}
                    </span>
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      Sem comissão
                    </span>
                  </td>
                  {!unit && <td className="whitespace-nowrap px-2">{s.units.join(", ")}</td>}
                  <td className="whitespace-nowrap px-2 text-right">{money(s.soldCents)}</td>
                  <td className="px-2 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${totalSold ? (s.soldCents / totalSold) * 100 : 0}%` }}
                        />
                      </span>
                      {(totalSold ? (s.soldCents / totalSold) * 100 : 0)
                        .toFixed(1)
                        .replace(".", ",")}
                      %
                    </span>
                  </td>
                  <td className="px-2 text-right">{s.salesCount}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    {s.salesCount ? money(Math.round(s.soldCents / s.salesCount)) : "—"}
                  </td>
                  <td className="whitespace-nowrap pl-2 text-right text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Item list behind the month (like the analítico), filterable by group, product/description or OS. */
function SoldItems({ reportIds, showPlate }: { reportIds: string[]; showPlate?: boolean }) {
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const {
    data: items,
    isPending,
    error,
  } = useQuery({
    queryKey: ["commission-items", reportIds],
    queryFn: () => readCommissionItems({ data: { reportIds } }),
    enabled: reportIds.length > 0,
  });
  if (!reportIds.length) return null;
  const groups = [...new Set((items ?? []).map((i) => i.rule ?? "").filter(Boolean))].sort();
  const term = search.trim().toLowerCase();
  const shown = (items ?? []).filter(
    (i) =>
      (!group || i.rule === group) &&
      (!term ||
        i.description.toLowerCase().includes(term) ||
        i.product_code.includes(term) ||
        i.sale_number.includes(term) ||
        (i.plate ?? "").toLowerCase().includes(term)),
  );
  const total = shown.reduce((t, i) => t + i.total_cents, 0);
  const commission = shown.reduce((t, i) => t + i.commission_cents, 0);
  const sales = new Set(shown.map((i) => `${i.unit_code}-${i.sale_number}`)).size;
  const multiStore = new Set(shown.map((i) => i.unit_code)).size > 1;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Itens vendidos</h3>
          <p className="text-sm text-muted-foreground">
            {isPending
              ? "Carregando itens…"
              : `${shown.length} itens · ${sales} OS · ${money(total)} vendido · ${money(commission)} de comissão`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Grupo
            <select
              id="items-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className={fieldClass}
            >
              <option value="">Todos os grupos</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Buscar
            <input
              id="items-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Produto, descrição, nº da OS ou placa"
              className={fieldClass}
            />
          </label>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {!isPending && (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">OS</th>
                {showPlate && <th className="px-2 font-semibold">Placa</th>}
                {multiStore && <th className="px-2 font-semibold">Loja</th>}
                <th className="px-2 font-semibold">Data</th>
                <th className="px-2 font-semibold">Produto</th>
                <th className="px-2 font-semibold">Descrição</th>
                <th className="px-2 text-right font-semibold">Qtd</th>
                <th className="px-2 text-right font-semibold">Valor</th>
                <th className="px-2 text-right font-semibold">%</th>
                <th className="pl-2 text-right font-semibold">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={`${i.report_id}-${i.position}`} className="border-t border-border">
                  <td className="py-2 pr-2">{i.sale_number}</td>
                  {showPlate && (
                    <td className="whitespace-nowrap px-2 font-semibold">{i.plate ?? "—"}</td>
                  )}
                  {multiStore && <td className="px-2">{i.unit_code}</td>}
                  <td className="whitespace-nowrap px-2">
                    {i.sold_at ? new Date(i.sold_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-2">{i.product_code}</td>
                  <td className="min-w-56 px-2">{i.description}</td>
                  <td className="px-2 text-right">{String(i.quantity).replace(".", ",")}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    {money(i.total_cents).replace("R$", "").trim()}
                  </td>
                  <td className="whitespace-nowrap px-2 text-right">{rateLabel(i.rate_bp)}</td>
                  <td className="whitespace-nowrap pl-2 text-right">
                    {money(i.commission_cents).replace("R$", "").trim()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <p className="py-4 text-sm text-muted-foreground">Nenhum item encontrado.</p>
          )}
        </div>
      )}
    </section>
  );
}
