import { describe, expect, it } from "vitest";
import type { ReportRow } from "@/lib/commissions";
import { managerMonth } from "@/lib/manager-commission";

const report = (seller: number, unit: string, month: string, sold: number): ReportRow => ({
  id: `${seller}-${unit}-${month}`,
  kind: "api",
  unit_code: unit,
  seller_code: seller,
  competence: month,
  total_sold_cents: sold,
  total_commission_cents: sold / 100,
  allowance_cents: 0,
  commission_report_groups: [
    { group_name: "PEÇAS", rate_bp: 100, sold_cents: sold, commission_cents: sold / 100 },
  ],
});

describe("manager commission (0,21% over NP1, NP2 and NP3)", () => {
  const month = "2026-10-01";
  const reports = [
    report(37, "NP1", month, 1000000), // seller NP1
    report(145, "NP1", month, 200000), // Israel supervisor code: ignored
    report(36, "NP2", month, 500000), // seller NP2
    report(207, "NP3", month, 300000), // seller NP3
    report(137, "NP3", month, 100000), // stock user: ignored
    report(205, "NP4", month, 900000), // NP4 never counts
    report(1, "NP3", month, 50000), // the manager's own code: ignored
  ];
  const extra = [
    {
      competence: month,
      unit_code: "NP2",
      seller_code: 53,
      seller_name: "HUMBERTO",
      sales_count: 3,
      sold_cents: 400000,
    },
    {
      competence: month,
      unit_code: "NP4",
      seller_code: 53,
      seller_name: "HUMBERTO",
      sales_count: 1,
      sold_cents: 999999,
    },
  ];

  it("adds NP1-NP3 valid sales, Humberto included, and leaves the rest out", () => {
    const m = managerMonth(reports, new Set([145, 137, 1]), extra, month);
    expect(m.baseCents).toBe(1000000 + 500000 + 400000 + 300000);
    expect(m.commissionCents).toBe(Math.round((2200000 * 21) / 10000));
    expect(m.units.map((u) => [u.unit, u.soldCents])).toEqual([
      ["NP1", 1000000],
      ["NP2", 900000],
      ["NP3", 300000],
    ]);
    expect(m.np4Cents).toBe(900000);
    expect(m.ignoredList.map((i) => [i.code, i.unit, i.soldCents]).sort()).toEqual([
      [1, "NP3", 50000],
      [137, "NP3", 100000],
      [145, "NP1", 200000],
    ]);
  });
});
