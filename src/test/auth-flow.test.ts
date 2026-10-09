import { describe, expect, it } from "vitest";
import { recoveryAllowed } from "@/lib/auth-flow";

describe("Recovery session rules", () => {
  it("refuses an ordinary login session without recovery intent", () => {
    expect(recoveryAllowed(false, false, true)).toBe(false);
  });
  it("refuses an expired link without a valid session", () => {
    expect(recoveryAllowed(true, false, false)).toBe(false);
  });
  it("accepts a valid recovery link session", () => {
    expect(recoveryAllowed(true, false, true)).toBe(true);
  });
  it("accepts the recovery event after the SDK consumes the link", () => {
    expect(recoveryAllowed(false, true, true)).toBe(true);
  });
});