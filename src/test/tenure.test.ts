import { describe, expect, it } from "vitest";
import { completeYears, tenureStatus } from "@/lib/tenure";

describe("insígnias de fidelidade", () => {
  it("ingresso é Boas-vindas sem estrelas", () => {
    expect(tenureStatus(0)).toMatchObject({ current: { name: "Boas-vindas" }, stars: 0 });
  });
  it("aos 2 anos: Compromisso com 1 estrela", () => {
    expect(tenureStatus(2)).toMatchObject({ current: { name: "Compromisso" }, stars: 1 });
  });
  it("aos 9 anos: Parceria com 4 estrelas", () => {
    expect(tenureStatus(9)).toMatchObject({ current: { name: "Parceria" }, stars: 4 });
  });
  it("aos 10 anos: Confiança e estrelas recomeçam", () => {
    expect(tenureStatus(10)).toMatchObject({ current: { name: "Confiança" }, stars: 0 });
  });
  it("30 anos é o marco máximo", () => {
    expect(tenureStatus(33)).toMatchObject({ current: { name: "Legado de Honra" }, stars: 0, next: null });
  });
  it("conta só anos completos pela admissão", () => {
    expect(completeYears("2020-10-10", new Date(2026, 9, 9))).toBe(5);
    expect(completeYears("2020-10-09", new Date(2026, 9, 9))).toBe(6);
  });
});
