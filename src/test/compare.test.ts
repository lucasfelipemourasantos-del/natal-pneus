import { describe, expect, it } from "vitest";
import type { OsRow, ReportRow } from "@/lib/commissions";
import { fieldRows, selectFields, sideResult, ticketOf, type Source } from "@/lib/compare";

const report = (
  seller: number,
  unit: string,
  month: string,
  groups: [string, number][],
): ReportRow => ({
  id: `${seller}-${unit}-${month}`,
  kind: "api",
  unit_code: unit,
  seller_code: seller,
  competence: month,
  total_sold_cents: groups.reduce((t, g) => t + g[1], 0),
  total_commission_cents: 0,
  allowance_cents: 0,
  commission_report_groups: groups.map(([group_name, sold_cents]) => ({
    group_name,
    rate_bp: 100,
    sold_cents,
    commission_cents: 0,
  })),
});

const month = "2026-10-01";
const apiReports = [
  report(10, "NP1", month, [
    ["PEÇAS", 100000],
    ["PNEUS, CAMARAS, PROTETORES E PITOS", 300000],
    ["ALINHAMENTO E BALANCEAMENTO", 50000],
  ]),
  report(11, "NP1", month, [["PEÇAS", 40000]]),
  report(20, "NP4", month, [
    ["PEÇAS", 70000],
    ["MÃO DE OBRA INTERNA", 30000],
  ]),
  report(99, "NP1", month, [["PEÇAS", 999999]]), // ignored user
];
const apiOs: OsRow[] = [
  { report_id: "10-NP1-" + month, unit_code: "NP1", seller_code: 10, os_count: 10 },
  { report_id: "11-NP1-" + month, unit_code: "NP1", seller_code: 11, os_count: 5 },
  { report_id: "20-NP4-" + month, unit_code: "NP4", seller_code: 20, os_count: 4 },
];
const source: Source = {
  apiReports,
  apiOs,
  techReports: [],
  techOs: [],
  ignored: new Set([99]),
  extra: [
    {
      competence: month,
      unit_code: "NP1",
      seller_code: 53,
      seller_name: "HUMBERTO",
      sales_count: 3,
      sold_cents: 200000,
    },
  ],
};

describe("comparison of two sides", () => {
  it("adds a store's sellers by field, leaves ignored users out and adds sellers without commission", () => {
    const np1 = sideResult(source, { kind: "loja", unit: "NP1", code: null, month });
    expect(np1.soldCents).toBe(100000 + 300000 + 50000 + 40000 + 200000);
    expect(np1.noDetailCents).toBe(200000);
    expect(np1.osCount).toBe(10 + 5 + 3);
    expect(np1.fields.find((f) => f.label === "PEÇAS")!.soldCents).toBe(140000);
    expect(ticketOf(np1.soldCents, np1.osCount)).toBe(Math.round(690000 / 18));
  });

  it("compares one person and filters by chosen fields", () => {
    const seller = sideResult(source, { kind: "vendedor", unit: "", code: 10, month });
    expect(seller.soldCents).toBe(450000);
    const onlyParts = selectFields(seller, new Set(["PECAS"]));
    expect(onlyParts.soldCents).toBe(100000);
    expect(selectFields(seller, new Set()).soldCents).toBe(450000);
  });

  it("shows a seller without commission with the totals only", () => {
    const h = sideResult(source, { kind: "vendedor", unit: "", code: 53, month });
    expect(h.soldCents).toBe(200000);
    expect(h.fields).toEqual([]);
    expect(h.osCount).toBe(3);
  });

  it("lists the fields of both sides together, by category", () => {
    const np1 = sideResult(source, { kind: "loja", unit: "NP1", code: null, month });
    const np4 = sideResult(source, { kind: "loja", unit: "NP4", code: null, month });
    const rows = fieldRows(np1, np4);
    expect(rows.map((c) => c.category)).toEqual(["pneus", "servicos", "pecas"]);
    const parts = rows.find((c) => c.category === "pecas")!;
    expect([parts.a, parts.b]).toEqual([140000, 70000]);
  });
});
