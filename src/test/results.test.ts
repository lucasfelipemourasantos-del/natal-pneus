import { describe, it, expect } from "vitest";
import { parseCents, periodTotal, compare, rangeFor } from "@/lib/results";
const row = (dimension: string, amount_cents: number) => ({
  dimension,
  amount_cents,
  competence: "2026-10-01",
  unit_code: "NP1",
  employee_id: null,
  sector_id: null,
});
describe("Revenue rules from October addendum", () => {
  it("preserves R$ 0,00 as a real result", () => {
    expect(parseCents("0,00")).toBe(0);
    expect(periodTotal([row("store", 0)], "store", "2026-10", "2026-10", [])).toBe(0);
  });
  it("keeps missing data separate from zero", () =>
    expect(periodTotal([], "store", "2026-10", "2026-10", [])).toBeNull());
  it("never sums store, sector and employee levels together", () =>
    expect(
      periodTotal(
        [row("store", 10000), row("sector", 10000), row("employee", 10000)],
        "store",
        "2026-10",
        "2026-10",
        [],
      ),
    ).toBe(10000));
  it("uses exact monetary cents", () => expect(parseCents("1.250,37")).toBe(125037));
  it("does not calculate percent with zero base", () =>
    expect(compare(10000, 0)).toEqual({ difference: 10000, percent: null }));
  it("does not calculate absent comparisons", () =>
    expect(compare(null, 100)).toEqual({ difference: null, percent: null }));
  it("calculates value and percent differences", () =>
    expect(compare(15000, 10000)).toEqual({ difference: 5000, percent: 50 }));
  it("supports semester periods", () =>
    expect(rangeFor("semester", 2026, 1, 2)).toEqual({ start: "2026-07", end: "2026-12" }));
  it("supports annual periods", () =>
    expect(rangeFor("year", 2025, 1, 1)).toEqual({ start: "2025-01", end: "2025-12" }));
  it("filters a store without mixing NP1 and NP2", () =>
    expect(
      periodTotal(
        [row("store", 100), { ...row("store", 200), unit_code: "NP2" }],
        "store",
        "2026-10",
        "2026-10",
        ["NP1"],
      ),
    ).toBe(100));
});
