import { describe, expect, it } from "vitest";
import { buildApiReports, monthRange, type ApiCommissions } from "@/lib/decision-sync";
import { sellerMonth, type ReportRow } from "@/lib/commissions";

const item = (
  loja: number,
  venda: number,
  vendedor: number,
  regra: string,
  percentual: number,
  valor: number,
  comissao: number,
) => ({
  loja,
  venda,
  data: `2026-04-0${(venda % 9) + 1} 10:00:00`,
  produto: 1000 + venda,
  descricao: `ITEM ${venda}`,
  quantidade: 1,
  precoUnitario: valor,
  descontoUnitario: 0,
  acrescimoUnitario: 0,
  valorItem: valor,
  vendedor,
  vendedorNome: `VENDEDOR ${vendedor}`,
  percentual,
  valorComissao: comissao,
  regra,
});

const api: ApiCommissions = {
  periodo: { de: "2026-04-01", ate: "2026-04-30" },
  lojas: [1, 4],
  totais: [
    { loja: 4, pessoa: 900, nome: "VENDEDOR 900", itens: 3, base: 1300.1, comissao: 20.51 },
    { loja: 1, pessoa: 900, nome: "VENDEDOR 900", itens: 1, base: 100, comissao: 1 },
  ],
  itens: [
    item(4, 10, 900, "PEÇAS", 1, 1000.1, 10.01),
    item(4, 10, 900, "ALINHAMENTO E BALANCEAMENTO", 2.5, 100, 2.5),
    item(4, 11, 900, "PNEUS, CAMARAS, PROTETORES E PITOS", 4, 200, 8),
    item(1, 12, 900, "PEÇAS", 1, 100, 1),
  ],
};

describe("Decision API sync", () => {
  it("builds one report per store and seller, grouped by rule and percentage, with matching totals", async () => {
    const byUnit = await buildApiReports(api);
    const np4 = byUnit.get("NP4")![0]!;
    expect(np4).toMatchObject({
      seller_code: 900,
      total_sold_cents: 130010,
      total_commission_cents: 2051,
    });
    expect(np4.groups.map((g) => [g.group_name, g.rate_bp, g.sold_cents])).toEqual([
      ["PEÇAS", 100, 100010],
      ["PNEUS, CAMARAS, PROTETORES E PITOS", 400, 20000],
      ["ALINHAMENTO E BALANCEAMENTO", 250, 10000],
    ]);
    expect(np4.items[0]).toMatchObject({
      sale_number: "10",
      total_cents: 100010,
      rate_bp: 100,
      rule: "PEÇAS",
    });
    expect(byUnit.get("NP1")![0]!.total_sold_cents).toBe(10000);
    expect(np4.content_hash).toBe((await buildApiReports(api)).get("NP4")![0]!.content_hash);
  });

  it("refuses data whose items do not add up to the Decision totals", async () => {
    const broken = { ...api, totais: [{ ...api.totais[0]!, base: 999 }, api.totais[1]!] };
    await expect(buildApiReports(broken)).rejects.toThrow(/não batem/);
  });

  it("keeps items the Decision sent without a group instead of stopping the sync", async () => {
    const noRule = { ...item(4, 20, 112, "", 0.35, 100, 0.35), regra: null };
    const byUnit = await buildApiReports({ ...api, totais: [], itens: [noRule] });
    expect(byUnit.get("NP4")![0]!.groups[0]!.group_name).toBe("SEM GRUPO NO DECISION");
  });

  it("knows the first and last day of a month", () => {
    expect(monthRange("2026-02")).toEqual({
      competence: "2026-02-01",
      de: "2026-02-01",
      ate: "2026-02-28",
    });
  });

  it("prefers the API report over PDFs of the same store, so nothing is counted twice", () => {
    const groups = [{ group_name: "PEÇAS", rate_bp: 100, sold_cents: 5000, commission_cents: 50 }];
    const row = (id: string, kind: string, sold: number): ReportRow => ({
      id,
      kind,
      unit_code: "NP4",
      seller_code: 900,
      competence: "2026-04-01",
      total_sold_cents: sold,
      total_commission_cents: 50,
      allowance_cents: 0,
      commission_report_groups: kind === "analitico" ? [] : groups,
    });
    const m = sellerMonth(
      [row("pdf-s", "sintetico", 5000), row("pdf-a", "analitico", 5000), row("api", "api", 5000)],
      [{ report_id: "api", unit_code: "NP4", seller_code: 900, os_count: 3 }],
      900,
      "2026-04-01",
    );
    expect(m.soldCents).toBe(5000);
    expect(m.groups[0]!.soldCents).toBe(5000);
    expect(m.osCount).toBe(3);
    expect(m.reportIds).toEqual(["api"]);
    expect(m.byUnit[0]!.check).toBe("conferido");
  });
});
