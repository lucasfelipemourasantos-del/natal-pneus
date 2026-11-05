import { describe, expect, it } from "vitest";
import { isPurchase, itemTotalCents, purchaseRows, type ApiPurchase } from "@/lib/purchases";

const item = {
  produto: 1501,
  descricao: "PNEU 175/70 R13",
  servico: false,
  cfop: "1403",
  quantidade: 200,
  valorUnitario: 335.15,
  desconto: 0,
  valorIcmsSt: 20162.62,
  valorIpi: 0,
  valorFrete: 0,
  valorSeguro: 0,
  valorEncargos: 0,
  notaAdiantamento: null,
};

describe("purchase notes", () => {
  it("values the item as the Decision does: ST and the rest are for the whole item", () => {
    expect(itemTotalCents(item)).toBe(8719262);
  });

  it("maps a note to the store code and cents", () => {
    const note: ApiPurchase = {
      nota: 310245,
      numero: "45871",
      serie: "1",
      chave: null,
      loja: 3,
      almoxarifado: 3,
      fornecedor: 572,
      tipo: 0,
      tipoNome: "Faturada",
      dataEmissao: "2026-08-03",
      dataRecepcao: "2026-08-05",
      valorTotal: 87192.62,
      valorDesconto: 0,
      itens: [item],
    };
    const [row] = purchaseRows([note]);
    expect(row?.unit_code).toBe("NP3");
    expect(row?.total_cents).toBe(8719262);
    expect(row?.items[0]?.item_total_cents).toBe(8719262);
  });

  it("counts purchases only: not transfers, returns, nor a faturada covered by an advance", () => {
    const notes = [
      { nota: 1, kind: 0, total_cents: 100, advance_notes: [] },
      { nota: 2, kind: 2, total_cents: 100, advance_notes: [] },
      { nota: 3, kind: 4, total_cents: 100, advance_notes: [] },
      { nota: 4, kind: 1, total_cents: 5000, advance_notes: [] },
      { nota: 5, kind: 0, total_cents: 5000, advance_notes: [4] },
    ];
    expect(notes.filter((n) => isPurchase(n, notes)).map((n) => n.nota)).toEqual([1, 4]);
  });
});
