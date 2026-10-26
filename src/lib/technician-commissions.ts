import { GOAL_HISTORY_MONTHS, monthsBefore, type ReportRow } from "@/lib/commissions";

/** Technician (service) commissions: one report per store, person and month, kind "tecnico". Never mixed with seller sales. */
export type TechRole =
  "mecanico" | "alinhador" | "balanceador" | "borracheiro" | "chefe" | "supervisor" | "outros";

const ROLE_LABELS: Record<TechRole, string> = {
  mecanico: "Mecânicos",
  alinhador: "Alinhadores",
  balanceador: "Balanceadores",
  borracheiro: "Borracheiros",
  chefe: "Chefes de pista",
  supervisor: "Supervisores",
  outros: "Outras funções",
};

function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/** Groups the Decision job function (MECANICO 2, BALANCEADOR 1...) and, without one, the technician's name hint. */
export function roleGroup(decisionRole: string | null | undefined, name = ""): TechRole {
  const text = plain(`${decisionRole ?? ""} ${decisionRole ? "" : name}`);
  if (text.includes("MECANIC")) return "mecanico";
  if (text.includes("ALINHA")) return "alinhador";
  if (text.includes("BALANCE")) return "balanceador";
  if (text.includes("BORRACH")) return "borracheiro";
  if (text.includes("CHEFE")) return "chefe";
  if (text.includes("SUPERVIS")) return "supervisor";
  return "outros";
}
export const roleLabel = (role: TechRole) => ROLE_LABELS[role];
export const ROLE_ORDER = Object.keys(ROLE_LABELS) as TechRole[];

export type TechMonth = {
  soldCents: number;
  commissionCents: number;
  units: string[];
  groups: { group_name: string; rate_bp: number; sold_cents: number; commission_cents: number }[];
};

/** Everything one person earned in one month, across stores. */
export function techMonth(reports: ReportRow[], code: number, competence: string): TechMonth {
  const mine = reports.filter(
    (r) => r.kind === "tecnico" && r.seller_code === code && r.competence === competence,
  );
  const groups = new Map<string, TechMonth["groups"][number]>();
  for (const r of mine)
    for (const g of r.commission_report_groups ?? []) {
      const key = `${g.group_name}|${g.rate_bp}`;
      const cur = groups.get(key) ?? { ...g, sold_cents: 0, commission_cents: 0 };
      cur.sold_cents += g.sold_cents;
      cur.commission_cents += g.commission_cents;
      groups.set(key, cur);
    }
  return {
    soldCents: mine.reduce((t, r) => t + r.total_sold_cents, 0),
    commissionCents: mine.reduce((t, r) => t + r.total_commission_cents, 0),
    units: [...new Set(mine.map((r) => r.unit_code))].sort(),
    groups: [...groups.values()].sort((a, b) => b.commission_cents - a.commission_cents),
  };
}

/** Month totals (last 12 months plus the viewed one, ascending) for one person or for a whole group of people. */
export function techSeries(reports: ReportRow[], codes: number[], competence: string) {
  const set = new Set(codes);
  return [...monthsBefore(competence, GOAL_HISTORY_MONTHS)]
    .reverse()
    .concat(competence)
    .map((month) => {
      const rows = reports.filter(
        (r) => r.kind === "tecnico" && r.competence === month && set.has(r.seller_code),
      );
      return {
        competence: month,
        soldCents: rows.reduce((t, r) => t + r.total_sold_cents, 0),
        commissionCents: rows.reduce((t, r) => t + r.total_commission_cents, 0),
      };
    });
}
