import { describe, expect, it } from "vitest";
import { audienceLabel, isLive, periodLabel } from "@/lib/announcements";

describe("Comunicados", () => {
  const base = { active: true, starts_on: "2026-11-01", ends_on: "2026-11-30" };
  it("shows only while active and inside the period", () => {
    expect(isLive(base, "2026-10-31")).toBe(false);
    expect(isLive(base, "2026-11-01")).toBe(true);
    expect(isLive(base, "2026-11-30")).toBe(true);
    expect(isLive(base, "2026-12-01")).toBe(false);
    expect(isLive({ ...base, ends_on: null }, "2027-05-01")).toBe(true);
    expect(isLive({ ...base, active: false }, "2026-11-10")).toBe(false);
  });
  it("describes audience and period in plain words", () => {
    expect(audienceLabel({ audience_unit: null, audience_job: null })).toBe("Todos");
    expect(audienceLabel({ audience_unit: "NP2", audience_job: "Vendedor" })).toBe(
      "Loja NP2 · Vendedor",
    );
    expect(periodLabel(base)).toBe("01/11/2026 a 30/11/2026");
    expect(periodLabel({ starts_on: "2026-11-01", ends_on: null })).toBe("Desde 01/11/2026");
  });
});
