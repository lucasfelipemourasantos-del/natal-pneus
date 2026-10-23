import { describe, expect, it } from "vitest";
import { storeMonth, type OsRow, type ReportRow } from "@/lib/commissions";

const report = (
  id: string,
  seller: number,
  unit: string,
  competence: string,
  sold: number,
): ReportRow => ({
  id,
  kind: "api",
  unit_code: unit,
  seller_code: seller,
  competence,
  total_sold_cents: sold,
  total_commission_cents: sold / 100,
  allowance_cents: 0,
  commission_report_groups: [
    { group_name: "PEÇAS", rate_bp: 100, sold_cents: sold / 2, commission_cents: sold / 200 },
    {
      group_name: "PNEUS, CAMARAS, PROTETORES E PITOS",
      rate_bp: 100,
      sold_cents: sold / 2,
      commission_cents: sold / 200,
    },
  ],
});

const reports = [
  report("a", 10, "NP4", "2026-04-01", 100000),
  report("b", 20, "NP4", "2026-04-01", 300000),
  report("c", 20, "NP1", "2026-04-01", 50000),
  report("d", 112, "NP4", "2026-04-01", 70000), // estoque: ignorado
  report("e", 10, "NP4", "2026-03-01", 200000),
  report("f", 20, "NP4", "2026-03-01", 200000),
];
const os: OsRow[] = [
  { report_id: "a", unit_code: "NP4", seller_code: 10, os_count: 4 },
  { report_id: "b", unit_code: "NP4", seller_code: 20, os_count: 6 },
  { report_id: "c", unit_code: "NP1", seller_code: 20, os_count: 1 },
  { report_id: "d", unit_code: "NP4", seller_code: 112, os_count: 9 },
];

describe("Store month (vendas da equipe)", () => {
  it("adds the store's sellers, leaves ignored users out and reports their amount apart", () => {
    const s = storeMonth(reports, os, "2026-04-01", new Set([112]), "NP4");
    expect(s.soldCents).toBe(400000);
    expect(s.commissionCents).toBe(4000);
    expect(s.osCount).toBe(10);
    expect(s.ticketCents).toBe(40000);
    expect(s.ignoredSoldCents).toBe(70000);
    expect(s.sellers.map((x) => [x.code, x.soldCents, Math.round(x.sharePct)])).toEqual([
      [20, 300000, 75],
      [10, 100000, 25],
    ]);
    expect(s.composition.find((c) => c.category === "pecas")!.soldCents).toBe(200000);
    expect(s.previous).toEqual({ soldCents: 400000, commissionCents: 4000 });
  });

  it("covers every store when no store is chosen, counting a seller's sales in each store", () => {
    const s = storeMonth(reports, os, "2026-04-01", new Set([112]));
    expect(s.soldCents).toBe(450000);
    expect(s.osCount).toBe(11);
    expect(s.sellers.find((x) => x.code === 20)!.units).toEqual(["NP1", "NP4"]);
  });
});
