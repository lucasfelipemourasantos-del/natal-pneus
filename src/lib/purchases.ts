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

export type ApiBalance = {
  almoxarifado: number;
  produto: number;
  saldo: number;
  custo: number;
};

export type ApiProduct = {
  produto: number;
  descricao: string;
  servico: boolean;
  classeDescricao: string | null;
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

/** One stock movement of the Decision (/estoque/movimentos). */
export type ApiMovement = {
  movimento: number;
  almoxarifado: number;
  almoxarifadoDestino: number | null;
  produto: number;
  tipo: string;
  tipoNome: string;
  entrada: boolean;
  data: string;
  quantidade: number;
  venda: number | null;
  notaRecebida: number | null;
};

export type SaleInfo = { placa: string | null; cliente: string | null };

export type ExitRow = {
  nota: number;
  position: number;
  movement: number;
  kind: string;
  kind_name: string;
  dest_warehouse: number | null;
  sale: number | null;
  plate: string | null;
  client: string | null;
  moved_on: string;
  quantity: number;
};

/**
 * Where each purchased item went, from the real stock ledger of the Decision. Per warehouse and product the stock is a queue:
 * what was there before the period first, then each entry in order (purchases of the notes are tracked, the other entries are not).
 * Every exit (sale, transfer, return, adjustment...) takes from the oldest quantity first; the part taken from a tracked purchase
 * becomes a row. The sale number, the transfer destination and the kind of movement are exact; which purchase lot a sale
 * took from is the oldest-first rule.
 */
export function allocateLedger(
  notes: ApiPurchase[],
  movements: ApiMovement[],
  opening: Map<string, number>,
  sales: Map<number, SaleInfo>,
) {
  const advances = new Set(notes.filter((n) => n.tipo === 1).map((n) => n.nota));
  const tracked = new Map<string, { position: number; left: number }[]>();
  const noteById = new Map(notes.map((n) => [n.nota, n]));
  for (const n of notes) {
    if (
      !(n.tipo === 0 || n.tipo === 1) ||
      n.itens.some((i) => i.notaAdiantamento !== null && advances.has(i.notaAdiantamento))
    )
      continue;
    n.itens.forEach((i, index) => {
      if (i.servico) return;
      const key = `${n.nota}|${i.produto}`;
      const list = tracked.get(key) ?? [];
      list.push({ position: index + 1, left: i.quantidade });
      tracked.set(key, list);
    });
  }
  type Slot = { nota: number | null; position: number; left: number };
  const queues = new Map<string, Slot[]>();
  const queue = (key: string) => {
    let q = queues.get(key);
    if (!q) {
      q = [{ nota: null, position: 0, left: opening.get(key) ?? 0 }];
      queues.set(key, q);
    }
    return q;
  };
  const exits: ExitRow[] = [];
  const lastSale = new Map<string, string>();
  const ordered = [...movements].sort(
    (a, b) => a.data.localeCompare(b.data) || a.movimento - b.movimento,
  );
  for (const m of ordered) {
    const key = `${m.almoxarifado}|${m.produto}`;
    const q = queue(key);
    if (m.entrada) {
      const lots =
        m.tipo === "E1" && m.notaRecebida !== null
          ? tracked.get(`${m.notaRecebida}|${m.produto}`)
          : undefined;
      if (m.tipo === "E1" && m.notaRecebida !== null && lots && noteById.has(m.notaRecebida)) {
        let rest = m.quantidade;
        for (const lot of lots) {
          if (rest <= 0) break;
          const take = Math.min(lot.left, rest);
          if (take <= 0) continue;
          lot.left -= take;
          rest -= take;
          q.push({ nota: m.notaRecebida, position: lot.position, left: take });
        }
        if (rest > 0) q.push({ nota: null, position: 0, left: rest });
      } else q.push({ nota: null, position: 0, left: m.quantidade });
      continue;
    }
    if (m.tipo === "S1") lastSale.set(key, m.data);
    let need = m.quantidade;
    for (const slot of q) {
      if (need <= 0) break;
      if (slot.left <= 0) continue;
      const take = Math.min(slot.left, need);
      slot.left -= take;
      need -= take;
      if (slot.nota === null) continue;
      const sale = m.venda !== null ? sales.get(m.venda) : undefined;
      exits.push({
        nota: slot.nota,
        position: slot.position,
        movement: m.movimento,
        kind: m.tipo,
        kind_name: m.tipoNome,
        dest_warehouse: m.almoxarifadoDestino,
        sale: m.venda,
        plate: sale?.placa ?? null,
        client: sale?.cliente ?? null,
        moved_on: m.data,
        quantity: take,
      });
    }
  }
  // The same movement may take from two slots of one purchase item: one row per note, item and movement.
  const merged = new Map<string, ExitRow>();
  for (const e of exits) {
    const k = `${e.nota}|${e.position}|${e.movement}`;
    const cur = merged.get(k);
    if (cur) cur.quantity += e.quantity;
    else merged.set(k, { ...e });
  }
  return { exits: [...merged.values()], lastSale };
}
