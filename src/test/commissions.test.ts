import { describe, expect, it } from "vitest";
import {
  countSales,
  moneyToCents,
  parseDecisionReport,
  rateToBp,
  sectionCheck,
  type PdfText,
} from "@/lib/decision-report";
import {
  categoryOf,
  goalBaseMonth,
  monthsBefore,
  partsGoal,
  referenceFor,
  sellerMonth,
  type ReportRow,
} from "@/lib/commissions";

// Positions follow the Decision PDF layout (x, y from the bottom-left, w = text width).
const t = (str: string, x: number, y: number, w = str.length * 5): PdfText => ({ str, x, y, w });
const header = (kind: "sintético" | "analítico") => [
  t(`Comissões ${kind} por vendedor no período de 01/04/2026 a 30/04/2026`, 54, 800, 311),
  t("NATAL PNEUS 4", 54, 817, 63),
];

const sintetico: PdfText[] = [
  ...header("sintético"),
  t("Produto / serviço", 64, 777, 66),
  t("Total vendido", 332, 778, 52),
  t("Comissão", 412, 778, 38),
  t("Valor comissão", 476, 778, 59),
  t("Vendedor: 900 - TESTE", 246, 758, 104),
  t("PEÇAS", 64, 746, 27),
  t("1.000,00", 353, 746, 31),
  t("1,00", 434, 746, 16),
  t("10,00", 515, 746, 20),
  t("PNEUS, CAMARAS, PROTETORES E PITOS", 64, 733, 166),
  t("2.000,00", 353, 733, 31),
  t("0,50", 434, 733, 16),
  t("10,00", 515, 733, 20),
  t("PNEUS, CAMARAS, PROTETORES E PITOS", 64, 720, 166),
  t("3.000,00", 353, 720, 31),
  t("1,00", 434, 720, 16),
  t("30,00", 515, 720, 20),
  t("ALINHAMENTO E BALANCEAMENTO", 64, 707, 140),
  t("500,00", 360, 707, 24),
  t("2,50", 434, 707, 16),
  t("12,50", 515, 707, 20),
  t("Totais do vendedor:", 141, 580, 77),
  t("4", 252, 580, 9),
  t("6.500,00", 353, 580, 31),
  t("62,50", 515, 580, 20),
  t("Total de OS:", 171, 565, 47),
  t("0", 257, 565, 4),
  t("Ajuda de custo:", 391, 565, 60),
  t("0,00", 519, 566, 16),
  t("62,50", 515, 554, 20),
  t("Total geral de OS:", 149, 537, 69),
  t("0", 257, 536, 4),
  t("Totais do relatório:", 378, 537, 73),
  t("62,50", 515, 536, 20),
];

const analiticoHeader = [
  ...header("analítico"),
  t("Venda", 29, 777, 24),
  t("Prod / serv", 59, 777, 42),
  t("Descrição", 110, 777, 38),
  t("Qtd", 372, 777, 14),
  t("Total item", 417, 777, 38),
  t("Comissão", 477, 777, 38),
  t("Valor", 557, 777, 20),
  t("Vendedor: 900 - TESTE", 246, 758, 104),
];
const item = (
  y: number,
  sale: string | null,
  code: string,
  desc: string,
  qty: string,
  total: string,
  rate: string,
  value: string,
) => [
  ...(sale ? [t(sale, 26, y, 27)] : []),
  t(code, 60, y + 1, 22),
  t(desc, 109, y + 1, 120),
  t(qty, 373, y, 16),
  t(total, 455 - total.length * 5, y, total.length * 5),
  t(rate, 489, y, 23),
  t(value, 577 - value.length * 5, y, value.length * 5),
];
const analiticoPage1 = [
  ...analiticoHeader,
  ...item(746, "100001", "41625", "BALANCEAMENTO SUV", "4,00", "500,00", "2,50%", "12,50"),
  ...item(733, null, "1013788", "PNEU 265/70R16", "2,00", "2.000,00", "0,50%", "10,00"),
  ...item(720, "100002", "64435", "FILTRO OLEO MOTOR", "1,00", "1.000,00", "1,00%", "10,00"),
];
const analiticoPage2 = [
  ...analiticoHeader,
  ...item(746, null, "1013634", "PNEU 225/55R18", "4,00", "3.000,00", "1,00%", "30,00"),
  t("Total de OS:", 60, 600, 47),
  t("0", 120, 600, 4),
  t("Totais do vendedor:", 300, 600, 70),
  t("6.500,00", 424, 600, 31),
  t("62,50", 557, 600, 20),
];

describe("Decision report reader", () => {
  it("parses Brazilian money and commission rates", () => {
    expect(moneyToCents("100.053,04")).toBe(10005304);
    expect(moneyToCents("-12,50")).toBe(-1250);
    expect(rateToBp("2,50%")).toBe(250);
    expect(rateToBp("0,35")).toBe(35);
    expect(() => moneyToCents("12.5")).toThrow();
  });

  it("reads the sintético groups and confirms they add up to the printed totals", () => {
    const r = parseDecisionReport([sintetico]);
    expect(r).toMatchObject({
      kind: "sintetico",
      unitCode: "NP4",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    const s = r.sellers[0]!;
    expect(s).toMatchObject({
      sellerCode: 900,
      sellerName: "TESTE",
      totalSoldCents: 650000,
      totalCommissionCents: 6250,
      allowanceCents: 0,
    });
    expect(s.groups).toHaveLength(4);
    expect(s.groups[1]).toEqual({
      group: "PNEUS, CAMARAS, PROTETORES E PITOS",
      rateBp: 50,
      soldCents: 200000,
      commissionCents: 1000,
    });
    expect(sectionCheck("sintetico", s)).toEqual({ soldDiff: 0, commissionDiff: 0 });
  });

  it("carries the sale number to following lines and across pages, counting each OS once", () => {
    const r = parseDecisionReport([analiticoPage1, analiticoPage2]);
    const s = r.sellers[0]!;
    expect(s.items.map((i) => i.sale)).toEqual(["100001", "100001", "100002", "100002"]);
    expect(s.items[0]).toMatchObject({
      product: "41625",
      description: "BALANCEAMENTO SUV",
      quantity: 4,
      totalCents: 50000,
      rateBp: 250,
      commissionCents: 1250,
    });
    expect(countSales(s.items)).toBe(2);
    expect(sectionCheck("analitico", s)).toEqual({ soldDiff: 0, commissionDiff: 0 });
  });

  it("rejects PDFs that are not Decision commission reports", () => {
    expect(() => parseDecisionReport([[t("Outro relatório", 54, 800)]])).toThrow(
      /não é um relatório/,
    );
  });
});

const groups = (parts: number) => [
  { group_name: "PEÇAS", rate_bp: 100, sold_cents: parts, commission_cents: parts / 100 },
  {
    group_name: "PNEUS, CAMARAS, PROTETORES E PITOS",
    rate_bp: 50,
    sold_cents: 200000,
    commission_cents: 1000,
  },
  {
    group_name: "PNEUS, CAMARAS, PROTETORES E PITOS",
    rate_bp: 100,
    sold_cents: 300000,
    commission_cents: 3000,
  },
  { group_name: "OLEOS E QUIMICOS", rate_bp: 100, sold_cents: 10000, commission_cents: 100 },
];
const report = (
  id: string,
  kind: string,
  unit: string,
  competence: string,
  sold: number,
  commission: number,
  parts = 100000,
): ReportRow => ({
  id,
  kind,
  unit_code: unit,
  seller_code: 900,
  competence,
  total_sold_cents: sold,
  total_commission_cents: commission,
  allowance_cents: 0,
  commission_report_groups: kind === "sintetico" ? groups(parts) : [],
});

describe("Seller month", () => {
  it("adds every store the seller sold in, keeps pneus in one row and computes OS and ticket médio", () => {
    const reports = [
      report("s4", "sintetico", "NP4", "2026-04-01", 610000, 5100),
      report("a4", "analitico", "NP4", "2026-04-01", 610000, 5100),
      report("s1", "sintetico", "NP1", "2026-04-01", 610000, 5100),
      report("a1", "analitico", "NP1", "2026-04-01", 610000, 5100),
    ];
    const os = [
      { report_id: "a4", unit_code: "NP4", seller_code: 900, os_count: 8 },
      { report_id: "a1", unit_code: "NP1", seller_code: 900, os_count: 2 },
    ];
    const m = sellerMonth(reports, os, 900, "2026-04-01");
    expect(m.soldCents).toBe(1220000);
    expect(m.osCount).toBe(10);
    expect(m.ticketCents).toBe(122000);
    expect(m.byUnit.map((u) => [u.unit, u.check])).toEqual([
      ["NP1", "conferido"],
      ["NP4", "conferido"],
    ]);
    const tires = m.groups.find((g) => g.category === "pneus")!;
    expect(tires).toMatchObject({ soldCents: 1000000, commissionCents: 8000, rateBp: null });
    expect(m.composition.find((c) => c.category === "pecas")!.soldCents).toBe(200000);
    expect(sellerMonth(reports, os, 900, "2026-04-01", "NP4").soldCents).toBe(610000);
  });

  it("flags a store whose analítico is missing or does not match", () => {
    const m = sellerMonth(
      [
        report("s4", "sintetico", "NP4", "2026-04-01", 610000, 5100),
        report("a4", "analitico", "NP4", "2026-04-01", 600000, 5100),
      ],
      [],
      900,
      "2026-04-01",
    );
    expect(m.byUnit[0]!.check).toBe("divergente");
    expect(
      sellerMonth([report("s4", "sintetico", "NP4", "2026-04-01", 1, 1)], [], 900, "2026-04-01")
        .osCount,
    ).toBeNull();
  });
});

describe("Peças goal", () => {
  /** Twelve months before April/2026 (2025-04 … 2026-03) with the given peças values, oldest first. */
  const months12 = [
    "2025-04-01",
    "2025-05-01",
    "2025-06-01",
    "2025-07-01",
    "2025-08-01",
    "2025-09-01",
    "2025-10-01",
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
  ];
  const series = (values: number[]) =>
    values.map((v, i) => report(`s${i}`, "sintetico", "NP4", months12[i]!, 1, 1, v));

  it("uses only the PEÇAS group, the 12 previous months without the worst one, and Bronze/Prata/Ouro at +20/25/30%", () => {
    expect(categoryOf("PEÇAS")).toBe("pecas");
    expect(categoryOf("OLEOS E QUIMICOS")).toBe("oleos");
    expect(monthsBefore("2026-04-01", 2)).toEqual(["2026-03-01", "2026-02-01"]);
    // 11 months of 1.000.000 and one vacation month of 100.000 (the worst, dropped)
    const reports = [
      ...series([
        1000000, 1000000, 1000000, 100000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000,
        1000000, 1000000,
      ]),
      report("old", "sintetico", "NP4", "2025-03-01", 1, 1, 9900000), // 13 months back: ignored
      report("a", "sintetico", "NP4", "2026-04-01", 1, 1, 1250000),
    ];
    const g = partsGoal(reports, 900, "2026-04-01");
    expect(g.dropped).toEqual({ month: "2025-07-01", cents: 100000 });
    expect(g.used).toHaveLength(11);
    expect(g.months).toBe(11);
    expect(g.averageCents).toBe(1000000);
    expect(g.tiers.map((t) => t.targetCents)).toEqual([1200000, 1250000, 1300000]);
    expect(g.currentCents).toBe(1250000);
    expect(g.reached?.label).toBe("Prata");
    expect(g.next?.label).toBe("Ouro");
    expect(g.history).toHaveLength(12);
    expect(g.history[0]!.month).toBe("2025-04-01");
    expect(g.history.at(-1)).toEqual({ month: "2026-03-01", cents: 1000000 });
  });

  it("averages the 11 months that remain, so a very good month raises the base only a little", () => {
    const g = partsGoal(
      series([
        800000, 900000, 1000000, 1100000, 1200000, 1300000, 1400000, 1500000, 600000, 1000000,
        1000000, 3000000,
      ]),
      900,
      "2026-04-01",
    );
    expect(g.dropped?.cents).toBe(600000);
    expect(g.averageCents).toBe(
      Math.round(
        (800000 +
          900000 +
          1000000 +
          1100000 +
          1200000 +
          1300000 +
          1400000 +
          1500000 +
          1000000 +
          1000000 +
          3000000) /
          11,
      ),
    );
  });

  it("does not count the evaluated month in the base", () => {
    const g = partsGoal(
      [
        ...series(Array(12).fill(1000000)),
        report("now", "sintetico", "NP4", "2026-04-01", 1, 1, 5000000),
      ],
      900,
      "2026-04-01",
    );
    expect(g.averageCents).toBe(1000000);
    expect(g.reached?.label).toBe("Ouro");
    expect(g.next).toBeNull();
  });

  it("gives no goal to a seller who never sold peças instead of marking every tier as reached", () => {
    const zero = partsGoal(
      [
        report("a", "sintetico", "NP4", "2026-03-01", 1, 1, 0),
        report("b", "sintetico", "NP4", "2026-04-01", 1, 1, 0),
      ],
      900,
      "2026-04-01",
    );
    expect(zero.noPartsHistory).toBe(true);
    expect(zero.tiers.every((t) => t.targetCents === null)).toBe(true);
    expect(zero.reached).toBeNull();
    expect(zero.next).toBeNull();
  });

  it("with short history averages the months the seller has and only drops the worst from 6 months on", () => {
    const three = partsGoal(
      [
        report("a", "sintetico", "NP4", "2026-03-01", 1, 1, 600000),
        report("b", "sintetico", "NP4", "2026-02-01", 1, 1, 900000),
        report("c", "sintetico", "NP4", "2026-01-01", 1, 1, 300000),
      ],
      900,
      "2026-04-01",
    );
    expect(three.dropped).toBeNull();
    expect(three.months).toBe(3);
    expect(three.averageCents).toBe(600000);
    const six = partsGoal(
      [
        ...["2026-03-01", "2026-02-01", "2026-01-01", "2025-12-01", "2025-11-01"].map((m, i) =>
          report(`x${i}`, "sintetico", "NP4", m, 1, 1, 1000000),
        ),
        report("low", "sintetico", "NP4", "2025-10-01", 1, 1, 100000),
      ],
      900,
      "2026-04-01",
    );
    expect(six.dropped?.cents).toBe(100000);
    expect(six.months).toBe(5);
    expect(six.averageCents).toBe(1000000);
    const none = partsGoal(
      [report("a", "sintetico", "NP4", "2026-04-01", 1, 1, 800000)],
      900,
      "2026-04-01",
    );
    expect(none.averageCents).toBeNull();
    expect(none.tiers.every((t) => t.targetCents === null)).toBe(true);
  });

  it("uses a reference base (borrowed from another seller) while keeping the seller own peças of the month", () => {
    const reports = [
      ...series(Array(12).fill(100000)),
      report("now", "sintetico", "NP4", "2026-04-01", 1, 1, 2300000),
    ];
    const own = partsGoal(reports, 900, "2026-04-01");
    expect(own.averageCents).toBe(100000);
    expect(own.reached?.label).toBe("Ouro");
    const borrowed = partsGoal(reports, 900, "2026-04-01", {
      refCode: 126,
      baseCents: 2000000,
      months: 11,
      droppedMonth: "2025-07-01",
    });
    expect(borrowed.averageCents).toBe(2000000);
    expect(borrowed.months).toBe(11);
    expect(borrowed.used).toEqual([]);
    expect(borrowed.dropped).toBeNull();
    expect(borrowed.reference?.refCode).toBe(126);
    expect(borrowed.tiers.map((t) => t.targetCents)).toEqual([2400000, 2500000, 2600000]);
    expect(borrowed.currentCents).toBe(2300000);
    expect(borrowed.reached).toBeNull();
    expect(borrowed.next?.label).toBe("Bronze");
    expect(
      referenceFor(
        [{ seller_code: 900, ref_code: 126, base_cents: 5, months: 3, dropped_month: null }],
        900,
      )?.baseCents,
    ).toBe(5);
    expect(referenceFor([], 900)).toBeNull();
  });
});

describe("Fixed peças goal base", () => {
  const monthly = (code: number, month: string, cents: number) =>
    report(`r${code}${month}`, "sintetico", "NP4", month, 1, 1, cents);
  // 2025-10 … 2026-09 (the 12 months before October/2026): 1.000.000 each, one bad month of 100.000.
  const base = [
    "2025-10-01",
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01",
    "2026-08-01",
    "2026-09-01",
  ].map((m, i) => monthly(900, m, i === 3 ? 100000 : 1000000));

  it("keeps the same base from October to December/2026", () => {
    const reports = [
      ...base,
      monthly(900, "2026-10-01", 5000000), // a huge October must not lift November's base
      monthly(900, "2026-11-01", 1200000),
    ];
    const oct = partsGoal(reports, 900, "2026-10-01");
    const nov = partsGoal(reports, 900, "2026-11-01");
    const dec = partsGoal(reports, 900, "2026-12-01");
    expect(oct.averageCents).toBe(1000000);
    expect(nov.averageCents).toBe(oct.averageCents);
    expect(dec.averageCents).toBe(oct.averageCents);
    expect(nov.tiers.map((x) => x.targetCents)).toEqual(oct.tiers.map((x) => x.targetCents));
    expect(nov.currentCents).toBe(1200000);
    expect(nov.history).toHaveLength(12);
    expect(nov.history.at(-1)!.month).toBe("2026-09-01");
  });

  it("slides month by month outside the fixed period", () => {
    expect(goalBaseMonth("2026-09-01")).toBe("2026-09-01");
    expect(goalBaseMonth("2026-12-01")).toBe("2026-10-01");
    expect(goalBaseMonth("2027-01-01")).toBe("2027-01-01");
  });
});
