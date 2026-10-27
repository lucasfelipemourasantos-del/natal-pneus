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

/** Only the "MÃO DE OBRA INTERNA" group counts for the mechanics' labor goal (not externa, higienização, etc.). */
export const LABOR_GROUP = "MAO DE OBRA INTERNA";

export type LaborGoalRow = {
  seller_code: number;
  tier: string;
  target_cents: number;
  bonus_cents: number;
};
export type TeamRow = {
  team_id: string;
  team_name: string;
  unit_code: string;
  member_codes: number[];
  sold_cents: number;
  commission_cents: number;
};

/** True for the "MÃO DE OBRA INTERNA" group, the base of the mechanics' goal. */
export function isLaborGroup(groupName: string) {
  return plain(groupName) === LABOR_GROUP;
}

const TIER_ORDER = ["bronze", "prata", "ouro"] as const;
const TIER_LABEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

/** Labor sold by one person in a month and where it stands against his bronze, prata and ouro goals. Null: no goal registered. */
export function laborGoal(
  reports: ReportRow[],
  code: number,
  competence: string,
  goals: LaborGoalRow[],
) {
  const mine = goals.filter((g) => g.seller_code === code);
  if (!mine.length) return null;
  const currentCents = techMonth(reports, code, competence)
    .groups.filter((g) => plain(g.group_name) === LABOR_GROUP)
    .reduce((sum, g) => sum + g.sold_cents, 0);
  const tiers = TIER_ORDER.flatMap((key) => {
    const row = mine.find((g) => g.tier === key);
    return row
      ? [
          {
            key,
            label: TIER_LABEL[key],
            targetCents: row.target_cents,
            bonusCents: row.bonus_cents,
            reached: currentCents >= row.target_cents,
          },
        ]
      : [];
  });
  const reached = [...tiers].reverse().find((x) => x.reached) ?? null;
  const next = tiers.find((x) => !x.reached) ?? null;
  return { currentCents, tiers, reached, next, bonusCents: reached?.bonusCents ?? 0 };
}

/** Pooled team commission shared equally: what each member receives. */
export function teamShare(team: Pick<TeamRow, "commission_cents" | "member_codes">) {
  return Math.round(team.commission_cents / Math.max(1, team.member_codes.length));
}

export const ROLE_SINGULAR: Record<TechRole, string> = {
  mecanico: "Mecânico",
  alinhador: "Alinhador",
  balanceador: "Balanceador",
  borracheiro: "Borracheiro",
  chefe: "Chefe de pista",
  supervisor: "Supervisor",
  outros: "Outra função",
};
/** Types the RH can set on a person (a person may have more than one). */
export const OPERATOR_KEYS = [
  "mecanico",
  "alinhador",
  "balanceador",
  "borracheiro",
  "chefe",
] as const;

type PersonTypes = {
  operator_roles?: string[] | null;
  decision_role?: string | null;
  name?: string;
};

/** Types of a person: the ones the RH set, otherwise a guess from the Decision function. */
export function operatorTypes(person: PersonTypes | undefined): TechRole[] {
  const set = (person?.operator_roles ?? []).filter((r): r is TechRole => r in ROLE_LABELS);
  return set.length ? set : [roleGroup(person?.decision_role, person?.name)];
}

/** "Alinhador e Balanceador" */
export function typesLabel(types: TechRole[]) {
  return types.map((t) => ROLE_SINGULAR[t]).join(" e ");
}
