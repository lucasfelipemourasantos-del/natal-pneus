/** Purchase notes (notas fiscais de entrada) from the Decision API: mapping to table rows and the totals shown in Controle de estoque. */

export type ApiPurchaseItem = {
  produto: number;
  descricao: string;
  servico: boolean;
  cfop: string | null;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  valorIcmsSt: number;
  valorIpi: number;
  valorFrete: number;
  valorSeguro: number;
  valorEncargos: number;
  notaAdiantamento: number | null;
};

export type ApiPurchase = {
  nota: number;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  loja: number;
  almoxarifado: number;
  fornecedor: number | null;
  tipo: number;
  tipoNome: string;
  dataEmissao: string | null;
  dataRecepcao: string;
  valorTotal: number;
  valorDesconto: number;
  itens: ApiPurchaseItem[];
};

/** The part of a sale the destination of purchases needs. */
export type ApiSale = {
  venda: number;
  situacao: string;
  data: string;
  placa: string | null;
  clienteNome: string | null;
  itens: { produto: number; servico: boolean; cancelado: boolean; quantidade: number }[];
};

export type ApiSupplier = {
  fornecedor: number;
  nome: string;
  fantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
};

const cents = (value: number) => Math.round(value * 100);

/**
 * Value of the whole item as the Decision defines it: quantity × unit value − discount + ST + IPI + freight + insurance + charges.
 * Everything but the unit value is already for the whole item, not per unit.
 */
export function itemTotalCents(i: ApiPurchaseItem) {
  return cents(
    i.quantidade * i.valorUnitario -
      i.desconto +
      i.valorIcmsSt +
      i.valorIpi +
      i.valorFrete +
      i.valorSeguro +
      i.valorEncargos,
  );
}

export function purchaseRows(notes: ApiPurchase[]) {
  return notes.map((n) => ({
    nota: n.nota,
    unit_code: `NP${n.loja}`,
    warehouse: n.almoxarifado,
    number: n.numero,
    series: n.serie,
    access_key: n.chave,
    supplier_code: n.fornecedor,
    kind: n.tipo,
    kind_name: n.tipoNome,
    issued_on: n.dataEmissao,
    received_on: n.dataRecepcao,
    total_cents: cents(n.valorTotal),
    discount_cents: cents(n.valorDesconto),
    items: n.itens.map((i) => ({
      product_code: i.produto,
      description: i.descricao,
      is_service: i.servico,
      cfop: i.cfop,
      quantity: i.quantidade,
      unit_cents: cents(i.valorUnitario),
      item_total_cents: itemTotalCents(i),
      advance_note: i.notaAdiantamento,
    })),
  }));
}

export function supplierRows(list: ApiSupplier[]) {
  return list.map((s) => ({
    code: s.fornecedor,
    name: s.nome,
    fantasy: s.fantasia,
    cnpj: s.cnpj,
    city: s.cidade,
    uf: s.uf,
    active: s.ativo,
  }));
}

export type StoredNote = {
  nota: number;
  kind: number;
  total_cents: number;
  advance_notes: number[];
};

/**
 * Real purchases only: "Faturada" (0) and "Adiantamento" (1). Transfers between stores (2) and returns (3, 4) are not purchases.
 * A faturada that points to an advance note is the same purchase as that advance: it counts once (the advance stays).
 */
export function isPurchase(note: StoredNote, all: StoredNote[]) {
  if (note.kind !== 0 && note.kind !== 1) return false;
  if (
    note.kind === 0 &&
    note.advance_notes.some((n) => all.some((o) => o.nota === n && o.kind === 1))
  )
    return false;
  return true;
}

/** A product line of a finished sale (services are left out by the caller). */
export type SaleLine = {
  loja: number;
  venda: number;
  placa: string | null;
  cliente: string | null;
  data: string;
  produto: number;
  quantidade: number;
};

export type ExitRow = {
  nota: number;
  position: number;
  sale: number;
  plate: string | null;
  client: string | null;
  sold_on: string;
  quantity: number;
};

/**
 * Probable destination of each purchased item: the sales of the same product in the same store, after the note was received,
 * taken from the oldest note first. It is an inference (older stock may have been used), shown as "provável".
 * Transfers, returns, services and faturadas already covered by an advance are not allocated.
 */
export function allocateExits(notes: ApiPurchase[], sales: SaleLine[]): ExitRow[] {
  const advances = new Set(notes.filter((n) => n.tipo === 1).map((n) => n.nota));
  const candidates = notes
    .filter(
      (n) =>
        (n.tipo === 0 || n.tipo === 1) &&
        !n.itens.some((i) => i.notaAdiantamento !== null && advances.has(i.notaAdiantamento)),
    )
    .sort((a, b) => a.dataRecepcao.localeCompare(b.dataRecepcao) || a.nota - b.nota);
  const byKey = new Map<
    string,
    { nota: number; position: number; received: string; left: number }[]
  >();
  for (const n of candidates)
    n.itens.forEach((i, index) => {
      if (i.servico) return;
      const key = `${n.loja}|${i.produto}`;
      const list = byKey.get(key) ?? [];
      list.push({
        nota: n.nota,
        position: index + 1,
        received: n.dataRecepcao,
        left: i.quantidade,
      });
      byKey.set(key, list);
    });
  const out = new Map<string, ExitRow>();
  for (const s of [...sales].sort((a, b) => a.data.localeCompare(b.data) || a.venda - b.venda)) {
    let need = s.quantidade;
    for (const slot of byKey.get(`${s.loja}|${s.produto}`) ?? []) {
      if (need <= 0) break;
      if (slot.left <= 0 || slot.received > s.data) continue;
      const take = Math.min(slot.left, need);
      slot.left -= take;
      need -= take;
      const key = `${slot.nota}|${slot.position}|${s.venda}`;
      const row = out.get(key) ?? {
        nota: slot.nota,
        position: slot.position,
        sale: s.venda,
        plate: s.placa,
        client: s.cliente,
        sold_on: s.data,
        quantity: 0,
      };
      row.quantity += take;
      out.set(key, row);
    }
  }
  return [...out.values()];
}
