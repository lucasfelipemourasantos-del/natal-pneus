import { describe, expect, it } from "vitest";
import {
  allocateLedger,
  isPurchase,
  itemTotalCents,
  purchaseRows,
  type ApiPurchase,
  type ApiMovement,
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

describe("destination of purchased items from the stock ledger", () => {
  const note = (nota: number, qty: number, tipo = 0): ApiPurchase => ({
    nota,
    numero: String(nota),
    serie: "1",
    chave: null,
    loja: 2,
    almoxarifado: 2,
    fornecedor: 1,
    tipo,
    tipoNome: "Faturada",
    dataEmissao: "2026-10-02",
    dataRecepcao: "2026-10-02",
    valorTotal: 100,
    valorDesconto: 0,
    itens: [{ ...item, produto: 7, quantidade: qty, valorIcmsSt: 0 }],
  });
  const move = (
    movimento: number,
    tipo: string,
    data: string,
    quantidade: number,
    extra: Partial<ApiMovement> = {},
  ): ApiMovement => ({
    movimento,
    almoxarifado: 2,
    almoxarifadoDestino: null,
    produto: 7,
    tipo,
    tipoNome: tipo,
    entrada: tipo.startsWith("E"),
    data,
    quantidade,
    venda: null,
    notaRecebida: null,
    ...extra,
  });
  const sales = new Map([[11, { placa: "ABC1D23", cliente: "CLIENTE" }]]);

  it("takes first from the stock that was already there, then from the purchase", () => {
    const { exits } = allocateLedger(
      [note(1, 5)],
      [
        move(1, "E1", "2026-10-02", 5, { notaRecebida: 1 }),
        move(2, "S1", "2026-10-05", 3, { venda: 11 }),
      ],
      new Map([["2|7", 2]]),
      sales,
    );
    // 2 units were already in stock: only 1 of the 3 sold comes from this purchase
    expect(exits.map((e) => [e.nota, e.sale, e.quantity, e.plate])).toEqual([
      [1, 11, 1, "ABC1D23"],
    ]);
  });

  it("shows a transfer with its destination store and the kind of movement", () => {
    const { exits } = allocateLedger(
      [note(1, 4)],
      [
        move(1, "E1", "2026-10-02", 4, { notaRecebida: 1 }),
        move(2, "S2", "2026-10-06", 4, { almoxarifadoDestino: 3 }),
      ],
      new Map(),
      sales,
    );
    expect(exits.map((e) => [e.kind, e.dest_warehouse, e.quantity, e.sale])).toEqual([
      ["S2", 3, 4, null],
    ]);
  });

  it("ignores transfers-in and faturadas covered by an advance, and records the last sale", () => {
    const advance = note(4, 5, 1);
    const covered = {
      ...note(5, 5),
      itens: [{ ...item, produto: 7, quantidade: 5, valorIcmsSt: 0, notaAdiantamento: 4 }],
    };
    const { exits, lastSale } = allocateLedger(
      [advance, covered],
      [
        move(1, "E1", "2026-10-02", 5, { notaRecebida: 5 }),
        move(2, "E1", "2026-10-03", 5, { notaRecebida: 4 }),
        move(3, "S1", "2026-10-08", 2, { venda: 11 }),
      ],
      new Map(),
      sales,
    );
    expect(exits.every((e) => e.nota === 4 || e.nota === 5)).toBe(true);
    expect(lastSale.get("2|7")).toBe("2026-10-08");
  });
});
