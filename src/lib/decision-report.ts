/** Reads Decision "Comissões sintético/analítico por vendedor" reports from positioned PDF text. */
export type PdfText = { str: string; x: number; y: number; w: number };
export type ReportKind = "sintetico" | "analitico";
export type GroupLine = {
  group: string;
  rateBp: number;
  soldCents: number;
  commissionCents: number;
};
export type ItemLine = {
  sale: string;
  product: string;
  description: string;
  quantity: number;
  totalCents: number;
  rateBp: number;
  commissionCents: number;
};
export type SellerSection = {
  sellerCode: number;
  sellerName: string;
  totalSoldCents: number;
  totalCommissionCents: number;
  allowanceCents: number;
  groups: GroupLine[];
  items: ItemLine[];
};
export type ParsedReport = {
  kind: ReportKind;
  store: string;
  unitCode: string | null;
  periodStart: string;
  periodEnd: string;
  sellers: SellerSection[];
};

const MONEY = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const RATE = /^-?\d{1,3},\d{2}%?$/;

export function moneyToCents(value: string): number {
  const v = value.trim();
  if (!MONEY.test(v)) throw new Error(`Valor inválido no relatório: "${value}".`);
  const negative = v.startsWith("-");
  const [whole = "0", dec = "0"] = v.replace("-", "").replace(/\./g, "").split(",");
  const cents = Number(whole) * 100 + Number(dec);
  return negative ? -cents : cents;
}

/** "2,50%" → 250 (hundredths of a percent). */
export function rateToBp(value: string): number {
  const v = value.trim().replace("%", "");
  if (!RATE.test(v)) throw new Error(`Percentual inválido no relatório: "${value}".`);
  const [whole = "0", dec = "0"] = v.split(",");
  return Number(whole) * 100 + Number(dec);
}

function toIsoDate(br: string) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

function lines(items: PdfText[]): PdfText[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: PdfText[][] = [];
  for (const it of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last[0]!.y - it.y) <= 3) last.push(it);
    else out.push([it]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}

const text = (l: PdfText[]) => l.map((i) => i.str.trim()).join(" ");
const right = (i: PdfText) => i.x + i.w;

type Column = "quantity" | "sold" | "rate" | "commission";
type Anchor = { key: Column; right: number };
function nearest(item: PdfText, anchors: Anchor[]): Column | null {
  let best: Anchor | null = null;
  for (const a of anchors)
    if (!best || Math.abs(right(item) - a.right) < Math.abs(right(item) - best.right)) best = a;
  return best && Math.abs(right(item) - best.right) <= 25 ? best.key : null;
}

function find(l: PdfText[], label: string) {
  return l.find((i) => i.str.trim().toLowerCase() === label.toLowerCase());
}

export function parseDecisionReport(pages: PdfText[][]): ParsedReport {
  let kind: ReportKind | null = null;
  let periodStart = "";
  let periodEnd = "";
  let store = "";
  const sellers: SellerSection[] = [];
  let current: SellerSection | null = null;
  let sale = "";

  for (const page of pages) {
    const pageLines = lines(page);
    let headerY: number | null = null;
    let nameLeft = 0;
    let saleLimit = 0;
    let productLimit = 0;
    let numericLeft = 0;
    let anchors: Anchor[] = [];

    for (const l of pageLines) {
      const t = text(l);
      const title =
        /Comiss(?:õ|o)es (sint[eé]tico|anal[ií]tico) por vendedor no per[ií]odo de (\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/i.exec(
          t,
        );
      if (title) {
        kind = title[1]!.toLowerCase().startsWith("s") ? "sintetico" : "analitico";
        periodStart = toIsoDate(title[2]!);
        periodEnd = toIsoDate(title[3]!);
        continue;
      }
      const storeItem = l.find((i) => /^NATAL PNEUS\b/i.test(i.str.trim()));
      if (storeItem && !store) store = storeItem.str.trim();

      if (headerY === null) {
        if (kind === "sintetico" && find(l, "Valor comissão")) {
          headerY = l[0]!.y;
          const total = find(l, "Total vendido")!;
          nameLeft = find(l, "Produto / serviço")?.x ?? 0;
          numericLeft = total.x - 15;
          anchors = [
            { key: "sold", right: right(total) },
            { key: "rate", right: right(find(l, "Comissão")!) },
            { key: "commission", right: right(find(l, "Valor comissão")!) },
          ];
        } else if (kind === "analitico" && find(l, "Total item")) {
          headerY = l[0]!.y;
          const qtd = find(l, "Qtd")!;
          saleLimit = find(l, "Prod / serv")!.x - 10;
          productLimit = find(l, "Descrição")!.x - 10;
          numericLeft = qtd.x - 10;
          anchors = [
            { key: "quantity", right: right(qtd) },
            { key: "sold", right: right(find(l, "Total item")!) },
            { key: "rate", right: right(find(l, "Comissão")!) },
            { key: "commission", right: right(find(l, "Valor")!) },
          ];
        }
        continue;
      }

      const seller = /^Vendedor:\s*(\d+)\s*-\s*(.+)$/i.exec(t);
      if (seller) {
        const code = Number(seller[1]);
        if (!current || current.sellerCode !== code) {
          current = {
            sellerCode: code,
            sellerName: seller[2]!.trim(),
            totalSoldCents: NaN,
            totalCommissionCents: NaN,
            allowanceCents: 0,
            groups: [],
            items: [],
          };
          sellers.push(current);
          sale = "";
        }
        continue;
      }
      if (/Total geral de OS|Totais do relatório/i.test(t)) continue;

      const numbers: Partial<Record<Column, string>> = {};
      for (const i of l) {
        if (i.x < numericLeft) continue;
        const key = nearest(i, anchors);
        if (key) numbers[key] = i.str.trim();
      }

      if (/Totais do vendedor:/i.test(t)) {
        if (!current) throw new Error("Totais encontrados antes do nome do vendedor.");
        current.totalSoldCents = moneyToCents(numbers.sold ?? "");
        current.totalCommissionCents = moneyToCents(numbers.commission ?? "");
        continue;
      }
      if (/Ajuda de custo:/i.test(t)) {
        if (current && numbers.commission)
          current.allowanceCents = moneyToCents(numbers.commission);
        continue;
      }

      const labels = l.filter((i) => i.x < numericLeft);
      if (!labels.length) continue; // e.g. the total after "Ajuda de custo"
      if (!current) throw new Error("Linha de venda encontrada antes do nome do vendedor.");

      if (kind === "sintetico") {
        current.groups.push({
          group: labels
            .filter((i) => i.x >= nameLeft - 10)
            .map((i) => i.str.trim())
            .join(" "),
          rateBp: rateToBp(numbers.rate ?? ""),
          soldCents: moneyToCents(numbers.sold ?? ""),
          commissionCents: moneyToCents(numbers.commission ?? ""),
        });
      } else {
        const saleItem = labels.find((i) => i.x < saleLimit);
        if (saleItem) sale = saleItem.str.trim();
        if (!sale) throw new Error("Item sem número de venda no relatório analítico.");
        current.items.push({
          sale,
          product: labels
            .filter((i) => i.x >= saleLimit && i.x < productLimit)
            .map((i) => i.str.trim())
            .join(" "),
          description: labels
            .filter((i) => i.x >= productLimit)
            .map((i) => i.str.trim())
            .join(" "),
          quantity: moneyToCents(numbers.quantity ?? "") / 100,
          totalCents: moneyToCents(numbers.sold ?? ""),
          rateBp: rateToBp(numbers.rate ?? ""),
          commissionCents: moneyToCents(numbers.commission ?? ""),
        });
      }
    }
  }

  if (!kind) throw new Error("Este PDF não é um relatório de comissões por vendedor do Decision.");
  if (!sellers.length) throw new Error("Nenhum vendedor encontrado no relatório.");
  for (const s of sellers)
    if (Number.isNaN(s.totalSoldCents) || Number.isNaN(s.totalCommissionCents))
      throw new Error(
        `Os totais do vendedor ${s.sellerCode} não foram encontrados. O PDF está completo?`,
      );
  const unit = /NATAL PNEUS\s*(\d)/i.exec(store);
  return {
    kind,
    store,
    unitCode: unit && Number(unit[1]) <= 4 ? `NP${unit[1]}` : null,
    periodStart,
    periodEnd,
    sellers,
  };
}

/** Differences between the report's printed totals and the sum of its lines (0 = conferido). */
export function sectionCheck(kind: ReportKind, s: SellerSection) {
  const lines =
    kind === "sintetico"
      ? s.groups.map((g) => [g.soldCents, g.commissionCents] as const)
      : s.items.map((i) => [i.totalCents, i.commissionCents] as const);
  const sold = lines.reduce((sum, [v]) => sum + v, 0);
  const commission = lines.reduce((sum, [, c]) => sum + c, 0);
  return { soldDiff: sold - s.totalSoldCents, commissionDiff: commission - s.totalCommissionCents };
}

/** Distinct OS (sale numbers) in an analítico section. */
export function countSales(items: ItemLine[]) {
  return new Set(items.map((i) => i.sale)).size;
}
