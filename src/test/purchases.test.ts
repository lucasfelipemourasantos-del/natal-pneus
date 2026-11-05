import { describe, expect, it } from "vitest";
import {
  allocateExits,
  isPurchase,
  itemTotalCents,
  purchaseRows,
  type ApiPurchase,
  type SaleLine,
} from "@/lib/purchases";

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

describe("probable destination of purchased items", () => {
  const note = (nota: number, received: string, qty: number): ApiPurchase => ({
    nota,
    numero: String(nota),
    serie: "1",
    chave: null,
    loja: 2,
    almoxarifado: 2,
    fornecedor: 1,
    tipo: 0,
    tipoNome: "Faturada",
    dataEmissao: received,
    dataRecepcao: received,
    valorTotal: 100,
    valorDesconto: 0,
    itens: [{ ...item, produto: 7, quantidade: qty, valorIcmsSt: 0 }],
  });
  const sale = (venda: number, data: string, qtd: number, loja = 2): SaleLine => ({
    loja,
    venda,
    placa: "ABC1D23",
    cliente: "CLIENTE",
    data,
    produto: 7,
    quantidade: qtd,
  });

  it("takes the oldest note first and only sales after the entry, in the same store", () => {
    const rows = allocateExits(
      [note(2, "2026-10-10", 5), note(1, "2026-10-02", 2)],
      [
        sale(10, "2026-10-01", 1),
        sale(11, "2026-10-05", 3),
        sale(12, "2026-10-12", 1),
        sale(13, "2026-10-12", 1, 3),
      ],
    );
    expect(rows.map((r) => [r.nota, r.sale, r.quantity])).toEqual([
      [1, 11, 2],
      [2, 12, 1],
    ]);
  });

  it("ignores transfers and faturadas covered by an advance", () => {
    const transfer = { ...note(3, "2026-10-02", 5), tipo: 2 };
    const advance = { ...note(4, "2026-10-02", 5), tipo: 1 };
    const covered = {
      ...note(5, "2026-10-03", 5),
      itens: [{ ...item, produto: 7, quantidade: 5, valorIcmsSt: 0, notaAdiantamento: 4 }],
    };
    const rows = allocateExits([transfer, advance, covered], [sale(20, "2026-10-08", 2)]);
    expect(rows.map((r) => r.nota)).toEqual([4]);
  });
});
