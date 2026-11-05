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
