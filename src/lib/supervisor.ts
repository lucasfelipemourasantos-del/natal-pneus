import { GOAL_HISTORY_MONTHS, monthsBefore } from "@/lib/commissions";

/** One group of the Decision "Comissões por Supervisor" report, typed in by the RH as printed. */
export type SupervisorRow = {
  seller_code: number;
  unit_code: string;
  competence: string;
  period_end: string;
  group_name: string;
  sold_cents: number;
  rate_bp: number;
  commission_cents: number;
};

/** Mirror of the Decision report: values are shown as printed, never recalculated. */
export function supervisorMonth(rows: SupervisorRow[], code: number, competence: string) {
  const mine = rows.filter((r) => r.seller_code === code && r.competence === competence);
  const groups = mine
    .map((r) => ({
      name: r.group_name,
      soldCents: Number(r.sold_cents),
      rateBp: r.rate_bp,
      commissionCents: Number(r.commission_cents),
    }))
    .sort((a, b) => b.soldCents - a.soldCents);
  return {
    unit: mine[0]?.unit_code ?? null,
    periodEnd: mine[0]?.period_end ?? null,
    groups,
    soldCents: groups.reduce((t, g) => t + g.soldCents, 0),
    commissionCents: groups.reduce((t, g) => t + g.commissionCents, 0),
  };
}

export function supervisorSeries(rows: SupervisorRow[], code: number, competence: string) {
  return [...monthsBefore(competence, GOAL_HISTORY_MONTHS)]
    .reverse()
    .concat(competence)
    .map((month) => {
      const v = supervisorMonth(rows, code, month);
      return { competence: month, soldCents: v.soldCents, commissionCents: v.commissionCents };
    });
}

/** 45 -> "0,45%" */
export function rateLabel(rateBp: number) {
  return `${(rateBp / 100).toFixed(2).replace(".", ",")}%`;
}
