import { describe, expect, it } from "vitest";
import { rateLabel, supervisorMonth, type SupervisorRow } from "@/lib/supervisor";

const row = (group_name: string, sold: number, commission: number, code = 145): SupervisorRow => ({
  seller_code: code,
  unit_code: "NP1",
  competence: "2026-10-01",
  period_end: "2026-10-27",
  group_name,
  sold_cents: Math.round(sold * 100),
  rate_bp: 45,
  commission_cents: Math.round(commission * 100),
});

describe("supervisor commission (mirror of the Decision report)", () => {
  it("shows exactly the printed values, without recalculating", () => {
    const rows = [
      row("OLEOS E QUIMICOS", 10094.44, 45.43),
      row("PECAS", 43738.54, 196.82),
      row("PNEUS, CAMARAS, PROTETORES E PITOS", 391355.09, 1761.08),
      row("SERVICOS", 77686.54, 350.58),
    ];
    const v = supervisorMonth(rows, 145, "2026-10-01");
    expect(v.soldCents).toBe(52287461);
    expect(v.commissionCents).toBe(235391);
    expect(v.periodEnd).toBe("2026-10-27");
  });

  it("ignores other codes and months", () => {
    expect(supervisorMonth([row("PECAS", 100, 1, 999)], 145, "2026-10-01").groups).toHaveLength(0);
    expect(supervisorMonth([row("PECAS", 100, 1)], 145, "2026-09-01").soldCents).toBe(0);
  });

  it("formats the rate", () => {
    expect(rateLabel(45)).toBe("0,45%");
  });
});
