import {
  categoryLabels,
  groupKey,
  sellerMonth,
  type Category,
  type OsRow,
  type ReportRow,
} from "@/lib/commissions";
import type { SalesWithoutCommission } from "@/lib/manager-commission";

export type SideKind = "rede" | "loja" | "vendedor" | "operador";
/** One side of a comparison: what is compared (the network, a store, a person) and in which month. */
export type Side = { kind: SideKind; unit: string; code: number | null; month: string };

export type SideField = { key: string; label: string; category: Category; soldCents: number };

export type SideResult = {
  /** Whole sold amount of the side (every field). */
  soldCents: number;
  /** Sold amount that has no field breakdown (sellers without commission, like Humberto). */
  noDetailCents: number;
  osCount: number | null;
  fields: SideField[];
};

export type Source = {
  apiReports: ReportRow[];
  apiOs: OsRow[];
  techReports: ReportRow[];
  techOs: OsRow[];
  ignored: Set<number>;
  extra: SalesWithoutCommission[];
};

const EMPTY: SideResult = { soldCents: 0, noDetailCents: 0, osCount: null, fields: [] };

/** The numbers of one side, from the Decision commission data the portal already has (only values, no OS detail). */
export function sideResult(src: Source, side: Side): SideResult {
  const unit = side.unit || undefined;
  const fields = new Map<string, SideField>();
  const addGroups = (groups: { label: string; category: Category; soldCents: number }[]) => {
    for (const g of groups) {
      const key = groupKey(g.label);
      const cur = fields.get(key) ?? { key, label: g.label, category: g.category, soldCents: 0 };
      cur.soldCents += g.soldCents;
      fields.set(key, cur);
    }
  };

  if (side.kind === "operador") {
    if (side.code === null) return EMPTY;
    const v = sellerMonth(src.techReports, src.techOs, side.code, side.month, unit);
    addGroups(v.groups);
    return {
      soldCents: v.soldCents,
      noDetailCents: 0,
      osCount: v.osCount,
      fields: [...fields.values()],
    };
  }

  const extra = src.extra.filter(
    (r) =>
      r.competence === side.month &&
      (!unit || r.unit_code === unit) &&
      (side.kind === "vendedor" ? r.seller_code === side.code : true),
  );
  const noDetailCents = extra.reduce((t, r) => t + r.sold_cents, 0);
  const extraOs = extra.reduce((t, r) => t + r.sales_count, 0);

  const codes =
    side.kind === "vendedor"
      ? side.code === null
        ? []
        : [side.code]
      : [
          ...new Set(
            src.apiReports
              .filter((r) => r.competence === side.month && (!unit || r.unit_code === unit))
              .map((r) => r.seller_code),
          ),
        ].filter((c) => !src.ignored.has(c));

  let sold = 0;
  let os = 0;
  let osKnown = false;
  for (const code of codes) {
    const v = sellerMonth(src.apiReports, src.apiOs, code, side.month, unit);
    if (!v.soldCents && !v.groups.length) continue;
    sold += v.soldCents;
    addGroups(v.groups);
    if (v.osCount !== null) {
      os += v.osCount;
      osKnown = true;
    }
  }
  const hasOs = osKnown || extraOs > 0;
  return {
    soldCents: sold + noDetailCents,
    noDetailCents,
    osCount: hasOs ? os + extraOs : null,
    fields: [...fields.values()],
  };
}

/** Narrow a side to the chosen fields (an empty selection means everything). */
export function selectFields(result: SideResult, selected: Set<string>) {
  if (!selected.size) return result;
  const fields = result.fields.filter((f) => selected.has(f.key));
  return {
    ...result,
    fields,
    soldCents: fields.reduce((t, f) => t + f.soldCents, 0),
    noDetailCents: 0,
  };
}

export const ticketOf = (soldCents: number, osCount: number | null) =>
  osCount ? Math.round(soldCents / osCount) : null;

/** Union of the fields of both sides, grouped by category and ordered by the larger amount. */
export function fieldRows(a: SideResult, b: SideResult) {
  const rows = new Map<
    string,
    { key: string; label: string; category: Category; a: number; b: number }
  >();
  for (const [side, r] of [
    ["a", a],
    ["b", b],
  ] as const)
    for (const f of r.fields) {
      const cur = rows.get(f.key) ?? {
        key: f.key,
        label: f.label,
        category: f.category,
        a: 0,
        b: 0,
      };
      cur[side] += f.soldCents;
      rows.set(f.key, cur);
    }
  return (Object.keys(categoryLabels) as Category[])
    .map((category) => {
      const list = [...rows.values()]
        .filter((r) => r.category === category)
        .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
      return {
        category,
        label: categoryLabels[category],
        a: list.reduce((t, r) => t + r.a, 0),
        b: list.reduce((t, r) => t + r.b, 0),
        fields: list,
      };
    })
    .filter((c) => c.fields.length);
}

/** "+12,3%" of `current` over `base` (null when there is no base). */
export function percentOver(current: number, base: number) {
  if (!base) return null;
  const pct = ((current - base) / base) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`;
}
