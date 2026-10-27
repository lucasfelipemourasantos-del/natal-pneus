import { describe, expect, it } from "vitest";
import {
  buildApiReports,
  technicianAsSeller,
  type ApiTechnicianCommissions,
} from "@/lib/decision-sync";
import { sellerMonth, type ReportRow } from "@/lib/commissions";
import {
  laborGoal,
  roleGroup,
  teamShare,
  techMonth,
  techSeries,
  type LaborGoalRow,
} from "@/lib/technician-commissions";

const tech: ApiTechnicianCommissions = {
  periodo: { de: "2026-10-01", ate: "2026-10-31" },
  lojas: [1],
  totais: [{ loja: 1, pessoa: 182, nome: "MICHEL", itens: 2, base: 300, comissao: 30 }],
  itens: [
    {
      loja: 1,
      venda: 10,
      data: "2026-10-02 10:00:00",
      produto: 1,
      descricao: "ALINHAMENTO",
      quantidade: 1,
      precoUnitario: 100,
      descontoUnitario: 0,
      acrescimoUnitario: 0,
      valorItem: 100,
      tecnico: 182,
      tecnicoNome: "MICHEL",
      percentual: 10,
      valorComissao: 10,
      regra: "SERVICOS",
    },
    {
      loja: 1,
      venda: 11,
      data: "2026-10-03 10:00:00",
      produto: 2,
      descricao: "BALANCEAMENTO",
      quantidade: 1,
      precoUnitario: 200,
      descontoUnitario: 0,
      acrescimoUnitario: 0,
      valorItem: 200,
      tecnico: 182,
      tecnicoNome: "MICHEL",
      percentual: 10,
      valorComissao: 20,
      regra: "SERVICOS",
    },
  ],
};

describe("technician sync", () => {
  it("builds one report per store and technician and keeps the totals check", async () => {
    const out = await buildApiReports(technicianAsSeller(tech));
    const report = out.get("NP1")![0]!;
    expect(report.seller_code).toBe(182);
    expect(report.total_sold_cents).toBe(30000);
    expect(report.total_commission_cents).toBe(3000);
  });

  it("refuses items that do not add up to the printed total", async () => {
    const broken = { ...tech, totais: [{ ...tech.totais[0]!, comissao: 99 }] };
    await expect(buildApiReports(technicianAsSeller(broken))).rejects.toThrow();
  });
});

const report = (
  code: number,
  unit: string,
  competence: string,
  sold: number,
  commission: number,
  kind = "tecnico",
): ReportRow => ({
  id: `${code}-${unit}-${competence}-${kind}`,
  kind,
  unit_code: unit,
  seller_code: code,
  competence,
  total_sold_cents: sold,
  total_commission_cents: commission,
  allowance_cents: 0,
  commission_report_groups: [
    { group_name: "SERVICOS", rate_bp: 1000, sold_cents: sold, commission_cents: commission },
  ],
});

describe("technician months", () => {
  const reports = [
    report(182, "NP1", "2026-10-01", 30000, 3000),
    report(182, "NP2", "2026-10-01", 10000, 1000),
    report(182, "NP1", "2026-09-01", 20000, 2000),
    report(182, "NP1", "2026-10-01", 99999, 9999, "api"),
    report(70, "NP4", "2026-10-01", 50000, 5000),
  ];

  it("sums a person across stores and ignores seller reports", () => {
    const m = techMonth(reports, 182, "2026-10-01");
    expect(m.commissionCents).toBe(4000);
    expect(m.units).toEqual(["NP1", "NP2"]);
    expect(m.groups[0]?.commission_cents).toBe(4000);
  });

  it("builds 13 ascending months, for one person or a group", () => {
    const one = techSeries(reports, [182], "2026-10-01");
    expect(one).toHaveLength(13);
    expect(one.at(-1)).toMatchObject({ competence: "2026-10-01", commissionCents: 4000 });
    expect(one.at(-2)).toMatchObject({ competence: "2026-09-01", commissionCents: 2000 });
    expect(techSeries(reports, [182, 70], "2026-10-01").at(-1)?.commissionCents).toBe(9000);
  });
});

describe("roleGroup", () => {
  it("groups Decision job functions", () => {
    expect(roleGroup("MECANICO 2")).toBe("mecanico");
    expect(roleGroup("MECÂNICO 3")).toBe("mecanico");
    expect(roleGroup("BALANCEADOR 1")).toBe("balanceador");
    expect(roleGroup("CHEFE DE PISTA 1")).toBe("chefe");
    expect(roleGroup("SUPERVISOR")).toBe("supervisor");
    expect(roleGroup(null, "FRANCIELIO ALINHADOR - NP4")).toBe("alinhador");
    expect(roleGroup(null, "TECNICO PNEUS")).toBe("outros");
  });
});

describe("operators use the seller month view", () => {
  it("counts OS and ticket from technician reports like a seller API report", () => {
    const reports = [report(182, "NP1", "2026-10-01", 30000, 3000)];
    const os = [{ report_id: reports[0]!.id, unit_code: "NP1", seller_code: 182, os_count: 3 }];
    const v = sellerMonth(reports, os, 182, "2026-10-01");
    expect(v.commissionCents).toBe(3000);
    expect(v.osCount).toBe(3);
    expect(v.ticketCents).toBe(10000);
    expect(v.byUnit[0]?.check).toBe("conferido");
  });
});

describe("labor goal and pooled team", () => {
  const goals: LaborGoalRow[] = [
    { seller_code: 163, tier: "bronze", target_cents: 877459, bonus_cents: 17800 },
    { seller_code: 163, tier: "prata", target_cents: 957228, bonus_cents: 29500 },
    { seller_code: 163, tier: "ouro", target_cents: 997112, bonus_cents: 50500 },
  ];
  const withGroups = (labor: number, parts: number): ReportRow => ({
    ...report(163, "NP1", "2026-10-01", labor + parts, 1000),
    commission_report_groups: [
      { group_name: "PEÇAS", rate_bp: 200, sold_cents: parts, commission_cents: 0 },
      {
        group_name: "MÃO DE OBRA INTERNA",
        rate_bp: 500,
        sold_cents: labor - 20000,
        commission_cents: 0,
      },
      { group_name: "MÃO DE OBRA EXTERNA", rate_bp: 200, sold_cents: 20000, commission_cents: 0 },
    ],
  });

  it("counts only the internal labor group, not externa, peças or others", () => {
    const g = laborGoal([withGroups(980000, 2000000)], 163, "2026-10-01", goals)!;
    expect(g.currentCents).toBe(960000);
    expect(g.reached?.key).toBe("prata");
    expect(g.bonusCents).toBe(29500);
    expect(g.next?.key).toBe("ouro");
  });

  it("is below bronze with no bonus", () => {
    const g = laborGoal([withGroups(600000, 100)], 163, "2026-10-01", goals)!;
    expect(g.reached).toBeNull();
    expect(g.bonusCents).toBe(0);
    expect(g.next?.key).toBe("bronze");
  });

  it("has no goal for someone without registered tiers", () => {
    expect(laborGoal([withGroups(960000, 0)], 999, "2026-10-01", goals)).toBeNull();
  });

  it("splits the team commission equally", () => {
    expect(teamShare({ commission_cents: 191828, member_codes: [163, 164, 176] })).toBe(63943);
  });
});
