import { describe, expect, it } from "vitest";
import { WEEKLY_PHRASES, isoWeek, phraseOfWeek } from "@/lib/weekly-phrases";

describe("Frase da semana", () => {
  it("has the 52 approved phrases, all different", () => {
    expect(WEEKLY_PHRASES).toHaveLength(52);
    expect(new Set(WEEKLY_PHRASES).size).toBe(52);
  });

  it("changes on Monday and stays the same the whole week", () => {
    expect(isoWeek(new Date(2026, 9, 19))).toBe(43); // segunda
    expect(isoWeek(new Date(2026, 9, 25))).toBe(43); // domingo
    expect(isoWeek(new Date(2026, 9, 26))).toBe(44); // segunda seguinte
    expect(phraseOfWeek(new Date(2026, 9, 19))).toBe(phraseOfWeek(new Date(2026, 9, 25)));
    expect(phraseOfWeek(new Date(2026, 9, 26))).not.toBe(phraseOfWeek(new Date(2026, 9, 25)));
    expect(phraseOfWeek(new Date(2026, 9, 24))).toBe(WEEKLY_PHRASES[42]);
  });

  it("wraps week 53 to the first phrase", () => {
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    expect(phraseOfWeek(new Date(2026, 11, 31))).toBe(WEEKLY_PHRASES[0]);
  });
});
