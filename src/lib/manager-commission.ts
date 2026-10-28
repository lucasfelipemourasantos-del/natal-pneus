import {
  GOAL_HISTORY_MONTHS,
  monthsBefore,
  sellerMonth,
  storeMonth,
  type ReportRow,
} from "@/lib/commissions";

/**
 * Commission of the manager (Eduardo, Decision code 1): 0,21% over every valid sale of NP1, NP2 and NP3, whoever sold,
 * Humberto included (he earns no commission but his sales count). Left out: NP4, supervisor sales, his own code and the
 * stock users (Magno, César, Felipe, Nivaldo), all marked "ignorado" in the portal.
 * Transfers between stores are not told apart by the Decision yet; when the client name arrives they come out of the base.
 */
export const MANAGER_RULE = {
  code: 1,
  name: "Eduardo José de Albuquerque",
  units: ["NP1", "NP2", "NP3"],
  rateBp: 21,
} as const;

export type SalesWithoutCommission = {
  competence: string;
  unit_code: string;
  seller_code: number;
  seller_name: string;
  sales_count: number;
  sold_cents: number;
};

export function managerMonth(
  reports: ReportRow[],
  ignored: Set<number>,
  extra: SalesWithoutCommission[],
  month: string,
) {
  const units = MANAGER_RULE.units.map((unit) => {
    const team = storeMonth(reports, [], month, ignored, unit);
    const noCommission = extra
      .filter((r) => r.competence === month && r.unit_code === unit)
      .map((r) => ({ code: r.seller_code, name: r.seller_name, soldCents: r.sold_cents }));
    const soldCents = team.soldCents + noCommission.reduce((t, r) => t + r.soldCents, 0);
    return {
      unit,
      soldCents,
      sellers: team.sellers.map((s) => ({ code: s.code, soldCents: s.soldCents })),
      noCommission,
    };
  });
  const baseCents = units.reduce((t, u) => t + u.soldCents, 0);

  // What stays out of the base, with the reason, so the number can be checked.
  const outside = new Map<string, number>();
  const add = (label: string, cents: number) => {
    if (cents) outside.set(label, (outside.get(label) ?? 0) + cents);
  };
  for (const code of ignored) {
    for (const unit of MANAGER_RULE.units) {
      const v = sellerMonth(reports, [], code, month, unit);
      add(`${code}|${unit}`, v.soldCents);
    }
  }
  const ignoredList = [...outside].map(([key, soldCents]) => {
    const [code = "0", unit = ""] = key.split("|");
    return { code: Number(code), unit, soldCents };
  });
  const np4 = storeMonth(reports, [], month, ignored, "NP4");
  const np4Cents = np4.soldCents + np4.ignoredSoldCents;

  return {
    units,
    baseCents,
    commissionCents: Math.round((baseCents * MANAGER_RULE.rateBp) / 10000),
    ignoredList,
    np4Cents,
  };
}

/** Months for the comparison charts: "vendido" is the base, "comissão" the manager's commission. */
export function managerSeries(
  reports: ReportRow[],
  ignored: Set<number>,
  extra: SalesWithoutCommission[],
  competence: string,
) {
  return [...monthsBefore(competence, GOAL_HISTORY_MONTHS)]
    .reverse()
    .concat(competence)
    .map((month) => {
      const m = managerMonth(reports, ignored, extra, month);
      return { competence: month, soldCents: m.baseCents, commissionCents: m.commissionCents };
    });
}
