/**
 * Turns the Decision API "Comissão de Vendedores Discriminado" response into one report per store and seller,
 * in the shape public.replace_api_commissions expects. Self-contained so the sync script can run it with plain Node.
 */
export type ApiCommissionItem = {
  loja: number;
  venda: number;
  data: string;
  produto: number | string;
  descricao: string | null;
  quantidade: number;
  precoUnitario: number;
  descontoUnitario: number;
  acrescimoUnitario: number;
  valorItem: number;
  /** Plate of the vehicle of the OS (null when the sale has no OS). */
  placa?: string | null | undefined;
  vendedor: number;
  vendedorNome: string | null;
  percentual: number;
  valorComissao: number;
  /** Null when the Decision has no class/subclass rule for the product (seen in Jan/2026). */
  regra: string | null;
};
export type ApiCommissionTotal = {
  loja: number;
  pessoa: number;
  nome: string;
  itens: number;
  base: number;
  comissao: number;
};
/** Item of the "Comissão de Técnicos" response (VENDAS_R21): same as a seller item, but keyed by technician. */
export type ApiTechnicianItem = Omit<ApiCommissionItem, "vendedor" | "vendedorNome"> & {
  tecnico: number;
  tecnicoNome: string | null;
};
export type ApiTechnicianCommissions = Omit<ApiCommissions, "itens"> & {
  itens: ApiTechnicianItem[];
};

export type ApiCommissions = {
  periodo: { de: string; ate: string };
  lojas: number[];
  totais: ApiCommissionTotal[];
  itens: ApiCommissionItem[];
};

export type SyncReport = {
  seller_code: number;
  seller_name: string;
  total_sold_cents: number;
  total_commission_cents: number;
  content_hash: string;
  groups: { group_name: string; rate_bp: number; sold_cents: number; commission_cents: number }[];
  items: {
    sale_number: string;
    product_code: string;
    description: string;
    quantity: number;
    total_cents: number;
    rate_bp: number;
    commission_cents: number;
    sold_at: string;
    unit_price_cents: number;
    unit_discount_cents: number;
    unit_surcharge_cents: number;
    rule: string;
    plate: string | null;
  }[];
};

const cents = (v: number) => Math.round(v * 100);
export const NO_RULE = "SEM GRUPO NO DECISION";

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reports grouped by store code ("NP1".."NP4"). Throws when item sums differ from the totals the API printed. */
export async function buildApiReports(api: ApiCommissions): Promise<Map<string, SyncReport[]>> {
  const byKey = new Map<string, ApiCommissionItem[]>();
  for (const item of api.itens) {
    const key = `${item.loja}:${item.vendedor}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const out = new Map<string, SyncReport[]>(api.lojas.map((l) => [`NP${l}`, []]));
  for (const [key, list] of byKey) {
    const [loja = 0, seller = 0] = key.split(":").map(Number);
    const items = list
      .slice()
      .sort(
        (a, b) =>
          a.data.localeCompare(b.data) ||
          a.venda - b.venda ||
          String(a.produto).localeCompare(String(b.produto)),
      )
      .map((i) => ({
        sale_number: String(i.venda),
        product_code: String(i.produto),
        description: (i.descricao ?? "").trim(),
        quantity: i.quantidade,
        total_cents: cents(i.valorItem),
        rate_bp: Math.round(i.percentual * 100),
        commission_cents: cents(i.valorComissao),
        sold_at: i.data,
        unit_price_cents: cents(i.precoUnitario),
        unit_discount_cents: cents(i.descontoUnitario),
        unit_surcharge_cents: cents(i.acrescimoUnitario),
        rule: (i.regra ?? "").trim() || NO_RULE,
        plate: (i.placa ?? "").trim().toUpperCase() || null,
      }));
    const groupMap = new Map<string, SyncReport["groups"][number]>();
    for (const i of items) {
      const g = groupMap.get(`${i.rule}|${i.rate_bp}`) ?? {
        group_name: i.rule,
        rate_bp: i.rate_bp,
        sold_cents: 0,
        commission_cents: 0,
      };
      g.sold_cents += i.total_cents;
      g.commission_cents += i.commission_cents;
      groupMap.set(`${i.rule}|${i.rate_bp}`, g);
    }
    const sold = items.reduce((s, i) => s + i.total_cents, 0);
    const commission = items.reduce((s, i) => s + i.commission_cents, 0);
    const printed = api.totais.find((t) => t.loja === loja && t.pessoa === seller);
    if (printed && (cents(printed.base) !== sold || cents(printed.comissao) !== commission))
      throw new Error(`Itens não batem com o total do Decision: loja ${loja}, vendedor ${seller}.`);
    const unit = `NP${loja}`;
    if (!out.has(unit)) out.set(unit, []);
    out.get(unit)!.push({
      seller_code: seller,
      seller_name: (list[0]!.vendedorNome ?? "").trim() || `VENDEDOR ${seller}`,
      total_sold_cents: sold,
      total_commission_cents: commission,
      content_hash: await sha256(JSON.stringify(items)),
      groups: [...groupMap.values()].sort((a, b) => b.sold_cents - a.sold_cents),
      items,
    });
  }
  return out;
}

/** Technician items keyed like seller items, so the same report builder (and its totals check) serves both. */
export function technicianAsSeller(api: ApiTechnicianCommissions): ApiCommissions {
  return {
    ...api,
    itens: api.itens.map(({ tecnico, tecnicoNome, ...item }) => ({
      ...item,
      vendedor: tecnico,
      vendedorNome: tecnicoNome,
    })),
  };
}

/** "2026-04" → first and last day of the month. */
export function monthRange(month: string) {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    competence: `${y}-${mm}-01`,
    de: `${y}-${mm}-01`,
    ate: `${y}-${mm}-${String(last).padStart(2, "0")}`,
  };
}
