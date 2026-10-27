import { describe, expect, it } from "vitest";
import { canManageAssets } from "@/lib/access";
import { addMonths, assetSummary, dueState } from "@/lib/assets";

describe("assets helpers", () => {
  it("adds months keeping the day inside shorter months", () => {
    expect(addMonths("2026-10-27", 6)).toBe("2027-04-27");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("flags overdue, due soon and fine preventive dates", () => {
    expect(dueState(null, "2026-10-27")).toBeNull();
    expect(dueState("2026-10-26", "2026-10-27")).toBe("vencida");
    expect(dueState("2026-10-27", "2026-10-27")).toBe("vence_em_breve");
    expect(dueState("2026-11-26", "2026-10-27")).toBe("vence_em_breve");
    expect(dueState("2026-11-27", "2026-10-27")).toBe("em_dia");
  });
});

describe("who can use Patrimônio", () => {
  const profile = (job_role: string, unit_code: string | null, status = "approved") =>
    ({ job_role, unit_code, status }) as never;
  it("opens for the ADM, and for approved chefe de pista or supervisor with a store", () => {
    expect(canManageAssets({ isAdmin: true, profile: null })).toBe(true);
    expect(canManageAssets({ isAdmin: false, profile: profile("Chefe de pista", "NP3") })).toBe(
      true,
    );
    expect(canManageAssets({ isAdmin: false, profile: profile("Supervisor", "NP1") })).toBe(true);
  });
  it("stays closed for directors and managers without that function, others, pending accounts and people without a store", () => {
    expect(canManageAssets({ isAdmin: false, profile: profile("Vendedor", "NP1") })).toBe(false);
    expect(
      canManageAssets({ isAdmin: false, profile: profile("Supervisor", "NP1", "pending") }),
    ).toBe(false);
    expect(canManageAssets({ isAdmin: false, profile: profile("Chefe de pista", null) })).toBe(
      false,
    );
    expect(canManageAssets({ isAdmin: false, canReadAll: true, profile: null } as never)).toBe(
      false,
    );
    expect(canManageAssets({ isAdmin: false, profile: null })).toBe(false);
  });
});

describe("equipment dashboard", () => {
  it("counts services, adds their cost and finds the last one", () => {
    const s = assetSummary(
      { purchase_date: "2024-10-27", next_preventive: null },
      [
        { kind: "preventiva", status: "realizada", cost_cents: 35000, performed_at: "2026-03-10" },
        { kind: "corretiva", status: "realizada", cost_cents: null, performed_at: "2026-08-02" },
        { kind: "preventiva", status: "agendada", cost_cents: 10000, performed_at: null },
      ],
      "2026-10-27",
    );
    expect(s.done).toBe(2);
    expect(s.preventive).toBe(1);
    expect(s.corrective).toBe(1);
    expect(s.scheduled).toBe(1);
    expect(s.costCents).toBe(35000); // the scheduled one does not count yet
    expect(s.withoutCost).toBe(1);
    expect(s.last).toBe("2026-08-02");
    expect(s.age).toBe("2 ano(s)");
  });
});
