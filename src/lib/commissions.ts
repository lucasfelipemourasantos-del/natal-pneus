/** Month view of a Decision seller: sintético gives sales/commission per group, analítico gives the OS count. */
export type Category = "pneus" | "servicos" | "pecas" | "oleos";
export const categoryLabels: Record<Category, string> = {
  pneus: "Pneus",
  servicos: "Serviços",
  pecas: "Peças",
  oleos: "Óleos e químicos",
};
export const GOAL_TIERS = [
  { key: "bronze", label: "Bronze", growth: 20 },
  { key: "prata", label: "Prata", growth: 25 },
  { key: "ouro", label: "Ouro", growth: 30 },
] as const;

export type ReportRow = {
  id: string;
  kind: string;
  unit_code: string;
  seller_code: number;
  competence: string;
  total_sold_cents: number;
  total_commission_cents: number;
  allowance_cents: number;
  commission_report_groups?: {
    group_name: string;
    rate_bp: number;
    sold_cents: number;
    commission_cents: number;
  }[];
};
export type OsRow = { report_id: string; unit_code: string; seller_code: number; os_count: number };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export function categoryOf(group: string): Category {
  const g = normalize(group);
  if (g.startsWith("PNEUS")) return "pneus";
  if (g === "PECAS") return "pecas";
  if (g.startsWith("OLEOS")) return "oleos";
  return "servicos";
}

export type UnitCheck = "conferido" | "falta-analitico" | "falta-sintetico" | "divergente";

/**
 * Per store, which reports describe the seller's month: the API report when there is one (it carries groups
 * and items), otherwise the PDF sintético (groups) and analítico (OS). Never both, so nothing is counted twice.
 */
function storeSources(list: ReportRow[], unit: string) {
  const api = list.find((r) => r.unit_code === unit && (r.kind === "api" || r.kind === "tecnico"));
  if (api) return { groups: api, sales: api, check: "conferido" as UnitCheck };
  const s = list.find((r) => r.unit_code === unit && r.kind === "sintetico");
  const a = list.find((r) => r.unit_code === unit && r.kind === "analitico");
  const check: UnitCheck = !a
    ? "falta-analitico"
    : !s
      ? "falta-sintetico"
      : s.total_sold_cents === a.total_sold_cents &&
          s.total_commission_cents === a.total_commission_cents
        ? "conferido"
        : "divergente";
  return { groups: s, sales: a, check };
}

/** Key that joins the Decision group spellings of one field (all the pneus groups are one field). */
export function groupKey(groupName: string) {
  return categoryOf(groupName) === "pneus" ? "pneus" : normalize(groupName);
}

export function sellerMonth(
  reports: ReportRow[],
  os: OsRow[],
  sellerCode: number,
  competence: string,
  unit?: string,
) {
  const mine = reports.filter(
    (r) =>
      r.seller_code === sellerCode &&
      r.competence === competence &&
      (!unit || r.unit_code === unit),
  );
  const units = [...new Set(mine.map((r) => r.unit_code))].sort();
  const sources = units.map((u) => ({ unit: u, ...storeSources(mine, u) }));
  const byUnit = sources.map(({ unit: u, groups: s, sales: a, check }) => {
    const main = s ?? a!;
    return {
      unit: u,
      soldCents: main.total_sold_cents,
      commissionCents: main.total_commission_cents,
      allowanceCents: main.allowance_cents,
      osCount: a ? (os.find((o) => o.report_id === a.id)?.os_count ?? 0) : null,
      check,
    };
  });
  const sum = (f: (u: (typeof byUnit)[number]) => number) => byUnit.reduce((t, u) => t + f(u), 0);
  const osKnown = byUnit.every((u) => u.osCount !== null);
  const osCount = byUnit.length && osKnown ? sum((u) => u.osCount ?? 0) : null;
  const soldCents = sum((u) => u.soldCents);

  const rows = new Map<
    string,
    {
      label: string;
      category: Category;
      rates: Set<number>;
      soldCents: number;
      commissionCents: number;
    }
  >();
  const groupReports = sources.flatMap((s) => (s.groups ? [s.groups] : []));
  for (const r of groupReports)
    for (const g of r.commission_report_groups ?? []) {
      const category = categoryOf(g.group_name);
      const key = category === "pneus" ? "pneus" : normalize(g.group_name);
      const row = rows.get(key) ?? {
        label: category === "pneus" ? "Pneus, câmaras, protetores e pitos" : g.group_name,
        category,
        rates: new Set<number>(),
        soldCents: 0,
        commissionCents: 0,
      };
      row.rates.add(g.rate_bp);
      row.soldCents += g.sold_cents;
      row.commissionCents += g.commission_cents;
      rows.set(key, row);
    }
  const groups = [...rows.values()]
    .map((r) => ({ ...r, rateBp: r.rates.size === 1 ? [...r.rates][0]! : null }))
    .sort((a, b) => b.soldCents - a.soldCents);
  const composition = (Object.keys(categoryLabels) as Category[]).map((c) => ({
    category: c,
    soldCents: groups.filter((g) => g.category === c).reduce((t, g) => t + g.soldCents, 0),
  }));

  return {
    byUnit,
    soldCents,
    commissionCents: sum((u) => u.commissionCents),
    allowanceCents: sum((u) => u.allowanceCents),
    osCount,
    ticketCents: osCount ? Math.round(soldCents / osCount) : null,
    groups,
    composition,
    hasSintetico: groupReports.length > 0,
    reportIds: sources.flatMap((s) => (s.sales ? [s.sales.id] : [])),
  };
}

/**
 * Store (or network, without unit) view built from the sellers' commission data: "vendas da equipe".
 * Ignored Decision users (estoque, gerência) stay out of every total; their amount is reported apart.
 * The Decision report only lists items that earn commission, so this is not the store's full billing.
 */
export function storeMonth(
  reports: ReportRow[],
  os: OsRow[],
  competence: string,
  ignored: Set<number>,
  unit?: string,
) {
  const codesIn = (month: string) => [
    ...new Set(
      reports
        .filter((r) => r.competence === month && (!unit || r.unit_code === unit))
        .map((r) => r.seller_code),
    ),
  ];
  const codes = codesIn(competence);
  const sellers = codes
    .filter((c) => !ignored.has(c))
    .map((code) => ({ code, ...sellerMonth(reports, os, code, competence, unit) }))
    .sort((a, b) => b.soldCents - a.soldCents);
  const soldCents = sellers.reduce((t, s) => t + s.soldCents, 0);
  const commissionCents = sellers.reduce((t, s) => t + s.commissionCents, 0);
  const osCount =
    sellers.length && sellers.every((s) => s.osCount !== null)
      ? sellers.reduce((t, s) => t + (s.osCount ?? 0), 0)
      : null;
  const composition = (Object.keys(categoryLabels) as Category[]).map((category) => ({
    category,
    soldCents: sellers.reduce(
      (t, s) => t + (s.composition.find((c) => c.category === category)?.soldCents ?? 0),
      0,
    ),
  }));
  const ignoredSoldCents = codes
    .filter((c) => ignored.has(c))
    .reduce((t, code) => t + sellerMonth(reports, os, code, competence, unit).soldCents, 0);

  const prevMonth = monthsBefore(competence, 1)[0]!;
  const prevSellers = codesIn(prevMonth)
    .filter((c) => !ignored.has(c))
    .map((code) => sellerMonth(reports, [], code, prevMonth, unit));
  const previous = prevSellers.length
    ? {
        soldCents: prevSellers.reduce((t, s) => t + s.soldCents, 0),
        commissionCents: prevSellers.reduce((t, s) => t + s.commissionCents, 0),
      }
    : null;

  return {
    sellers: sellers.map((s) => ({
      code: s.code,
      soldCents: s.soldCents,
      commissionCents: s.commissionCents,
      osCount: s.osCount,
      ticketCents: s.ticketCents,
      units: s.byUnit.map((u) => u.unit),
      sharePct: soldCents ? (s.soldCents / soldCents) * 100 : 0,
    })),
    soldCents,
    commissionCents,
    osCount,
    ticketCents: osCount ? Math.round(soldCents / osCount) : null,
    composition,
    ignoredSoldCents,
    previous,
    prevMonth,
  };
}

export function monthsBefore(competence: string, n: number) {
  const [y = 0, m = 1] = competence.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (i + 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}

export const GOAL_HISTORY_MONTHS = 12;

/**
 * Goal periods: the peças base is formed once, from the 12 months before the first month of the period, and stays fixed
 * until the period ends (it does not slide month by month). A new period is added when the new year's rules start.
 * Months outside any period keep the sliding base (history).
 */
export const GOAL_PERIODS = [{ from: "2026-10-01", to: "2026-12-01" }];

/** Month whose 12 previous months form the peças base of `competence`. */
export function goalBaseMonth(competence: string) {
  return GOAL_PERIODS.find((p) => competence >= p.from && competence <= p.to)?.from ?? competence;
}
/** The worst month (vacation, leave, a bad month) is left out of the base, once there is enough history. */
export const GOAL_MIN_MONTHS_TO_DROP = 6;

/**
 * Peças goal. Peças (all stores the seller sold in) of the month are compared with a base: the average of the
 * 12 months before it without the worst one (so 11 months). With less history the months he has are averaged,
 * and the worst is only dropped from 6 months of history on.
 * Bronze, Prata and Ouro are the base +20%, +25% and +30%.
 */
/** "Média mínima": base of the lowest regular seller, computed by the database for sellers flagged min_average. */
export type GoalReference = {
  refCode: number;
  baseCents: number;
  months: number;
  droppedMonth: string | null;
};

/** The borrowed base of a seller, from the database function rows (null when he uses his own history). */
export function referenceFor(
  refs: {
    seller_code: number;
    ref_code: number;
    base_cents: number;
    months: number;
    dropped_month: string | null;
  }[],
  sellerCode: number | null,
): GoalReference | null {
  const r = refs.find((x) => x.seller_code === sellerCode);
  return r
    ? {
        refCode: r.ref_code,
        baseCents: r.base_cents,
        months: r.months,
        droppedMonth: r.dropped_month,
      }
    : null;
}

export function partsGoal(
  reports: ReportRow[],
  sellerCode: number,
  competence: string,
  reference?: GoalReference | null,
) {
  const parts = (month: string) => {
    const mine = reports.filter((r) => r.seller_code === sellerCode && r.competence === month);
    const list = [...new Set(mine.map((r) => r.unit_code))].flatMap((u) => {
      const g = storeSources(mine, u).groups;
      return g ? [g] : [];
    });
    if (!list.length) return null;
    return list
      .flatMap((r) => r.commission_report_groups ?? [])
      .filter((g) => categoryOf(g.group_name) === "pecas")
      .reduce((t, g) => t + g.sold_cents, 0);
  };
  const history = monthsBefore(goalBaseMonth(competence), GOAL_HISTORY_MONTHS)
    .map((month) => ({ month, cents: parts(month) }))
    .reverse();
  const withData = history.filter((h): h is { month: string; cents: number } => h.cents !== null);
  const worst =
    withData.length >= GOAL_MIN_MONTHS_TO_DROP
      ? [...withData].sort((a, b) => a.cents - b.cents || a.month.localeCompare(b.month))[0]!
      : null;
  const used = worst ? withData.filter((h) => h.month !== worst.month) : withData;
  const ownAverage = used.length
    ? Math.round(used.reduce((t, h) => t + h.cents, 0) / used.length)
    : null;
  /** A seller with a reference uses that seller's base instead of his own. */
  const averageCents = reference ? reference.baseCents : ownAverage;
  /** A seller who never sold peças has no peças goal (a zero base would make every tier "reached"). */
  const noPartsHistory = averageCents !== null && averageCents <= 0;
  const currentCents = parts(competence);
  const tiers = GOAL_TIERS.map((t) => ({
    ...t,
    targetCents:
      averageCents === null || noPartsHistory
        ? null
        : Math.round((averageCents * (100 + t.growth)) / 100),
  }));
  const reached =
    currentCents === null
      ? null
      : ([...tiers]
          .reverse()
          .find((t) => t.targetCents !== null && currentCents >= t.targetCents) ?? null);
  const next =
    currentCents === null
      ? null
      : (tiers.find((t) => t.targetCents !== null && currentCents < t.targetCents) ?? null);
  return {
    currentCents,
    /** Base of the goal: average of the months that count. */
    averageCents,
    /** How many months formed the base (11 when there is a full year of history). */
    months: reference ? reference.months : used.length,
    noPartsHistory,
    /** Months that formed the base (empty when the base comes from a reference seller). */
    used: reference ? [] : used,
    /** The worst month, left out of the base (null when the history is short or the base is borrowed). */
    dropped: reference ? null : worst,
    /** Set when the base is borrowed from another seller. */
    reference: reference ?? null,
    history,
    tiers,
    reached,
    next,
  };
}

export function monthLabel(competence: string) {
  const [y = 0, m = 1] = competence.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function rateLabel(bp: number | null) {
  return bp === null ? "vários" : (bp / 100).toFixed(2).replace(".", ",");
}

/** First day of the current month in Natal (UTC-3), as "AAAA-MM-01". */
export function currentCompetence() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Month totals of one seller over the last 12 months plus the viewed one (ascending), for the charts. */
/**
 * Month series of a store (or of the network, without unit) for the comparison charts: the team's sales plus the sales of
 * sellers without commission. Same shape as sellerSeries, so the same charts serve both.
 */
export function storeSeries(
  reports: ReportRow[],
  competence: string,
  ignored: Set<number>,
  unit: string | undefined,
  extra: { competence: string; unit_code: string; sold_cents: number }[],
) {
  return [...monthsBefore(competence, GOAL_HISTORY_MONTHS)]
    .reverse()
    .concat(competence)
    .map((month) => {
      const s = storeMonth(reports, [], month, ignored, unit);
      const added = extra
        .filter((r) => r.competence === month && (!unit || r.unit_code === unit))
        .reduce((t, r) => t + r.sold_cents, 0);
      return {
        competence: month,
        soldCents: s.soldCents + added,
        commissionCents: s.commissionCents,
      };
    });
}

export function sellerSeries(reports: ReportRow[], sellerCode: number, competence: string) {
  return [...monthsBefore(competence, GOAL_HISTORY_MONTHS)]
    .reverse()
    .concat(competence)
    .map((month) => {
      const v = sellerMonth(reports, [], sellerCode, month);
      return { competence: month, soldCents: v.soldCents, commissionCents: v.commissionCents };
    });
}

export type PeriodReport = {
  id: string;
  total_sold_cents: number;
  total_commission_cents: number;
  os_count: number;
  groups: NonNullable<ReportRow["commission_report_groups"]>;
};

/**
 * Month reports narrowed to some days of the month ("mês quebrado"): totals, groups and the OS count of the days chosen.
 * The reports keep their ids, so the sold items of the same reports can be filtered by day too.
 */
export function applyPeriod(
  reports: ReportRow[],
  os: OsRow[],
  period: PeriodReport[],
  competence: string,
) {
  const byId = new Map(period.map((p) => [p.id, p]));
  const inPeriod = reports.filter((r) => r.competence === competence && byId.has(r.id));
  return {
    reports: reports.map((r) => {
      const p = r.competence === competence ? byId.get(r.id) : undefined;
      return p
        ? {
            ...r,
            total_sold_cents: p.total_sold_cents,
            total_commission_cents: p.total_commission_cents,
            allowance_cents: 0,
            commission_report_groups: p.groups,
          }
        : r;
    }),
    os: [
      ...os.filter((o) => !byId.has(o.report_id)),
      ...inPeriod.map((r) => ({
        report_id: r.id,
        unit_code: r.unit_code,
        seller_code: r.seller_code,
        os_count: byId.get(r.id)!.os_count,
      })),
    ],
  };
}
