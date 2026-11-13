/** Quadro funcional (base da escala 5x2): lojas, setores e as 53 pessoas, conforme o quadro do RH de 12/11/2026. */

export const UNITS = ["NP1", "NP2", "NP3", "NP4"] as const;
export type WorkUnit = (typeof UNITS)[number];

export const UNIT_NAME: Record<WorkUnit, string> = {
  NP1: "Natal Pneus 1 · Prudente de Morais",
  NP2: "Natal Pneus 2 · Nevaldo Rocha",
  NP3: "Natal Pneus 3 · Salgado Filho",
  NP4: "Natal Pneus 4 · Roberto Freire",
};

/** Opening hours given by the RH (all four stores): Monday to Friday 7h30-17h30, Saturday 8h-12h, Sunday closed. */
export const DEFAULT_HOURS = "Segunda a sexta, 7h30 às 17h30 · sábado, 8h às 12h · domingo fechado";

export const SECTORS = [
  { key: "gerencia", label: "Gerência", color: "oklch(0.55 0.13 300)" },
  { key: "vendas", label: "Vendas", color: "oklch(0.6 0.15 35)" },
  { key: "caixa", label: "Caixa", color: "oklch(0.6 0.12 160)" },
  { key: "pista", label: "Pista (oficina)", color: "oklch(0.55 0.1 230)" },
  { key: "estoque", label: "Estoque", color: "oklch(0.65 0.13 85)" },
  { key: "administrativo", label: "Administrativo e financeiro", color: "oklch(0.55 0.05 255)" },
  { key: "apoio", label: "Apoio (ASG e motorista)", color: "oklch(0.6 0.03 255)" },
] as const;
export type SectorKey = (typeof SECTORS)[number]["key"];

export const EMPLOYERS = {
  AA: "Álvares e Álvares",
  NP: "Natal Pneus Ltda.",
  AS: "Natal Assessoria",
} as const;

export type Person = {
  name: string;
  unit: WorkUnit;
  employer: string;
  cbo: string;
  cbo_title: string;
  role: string;
  sector: SectorKey;
  /** What else the person can do (accumulated functions, light/heavy line...). */
  skills: string[];
  rotates: boolean;
  rotation_note: string;
  /** "a_confirmar": added from the RH sheet, not confirmed by the RH yet. */
  status: "confirmado" | "a_confirmar";
  notes: string;
};

/** People of one store grouped by sector, in the order of SECTORS. */
export function bySector<T extends { sector: string }>(people: T[]) {
  return SECTORS.map((s) => ({ ...s, people: people.filter((x) => x.sector === s.key) })).filter(
    (s) => s.people.length > 0,
  );
}

export const shortName = (full: string) => {
  const parts = full
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/);
  return parts.length <= 2
    ? parts.join(" ")
    : `${parts[0]} ${parts[1] === "de" || parts[1] === "da" || parts[1] === "do" ? parts[2] : parts[1]}`;
};

/** Minimum structure every store must have working (RH, 13/11/2026). The driver is shared by the 4 stores. */
export const FUNCTIONS = [
  { key: "supervisor", label: "Supervisor" },
  { key: "vendedor", label: "Vendedor" },
  { key: "chefe_pista", label: "Chefe de pista" },
  { key: "mecanico", label: "Mecânico" },
  { key: "alinhador", label: "Alinhador" },
  { key: "borracheiro", label: "Borracheiro" },
  { key: "balanceador", label: "Balanceador" },
  { key: "estoquista", label: "Estoquista" },
  { key: "caixa", label: "Caixa" },
  { key: "asg", label: "ASG" },
  { key: "motorista", label: "Motorista (apoio das 4 lojas)" },
] as const;
export type FunctionKey = (typeof FUNCTIONS)[number]["key"];

/** principal = does it today · complementar = does when needed · potencial = could learn, doesn't do yet. */
export const LEVELS = [
  { key: "principal", label: "Principal", short: "P", rank: 3 },
  { key: "complementar", label: "Complementar", short: "C", rank: 2 },
  { key: "potencial", label: "Potencial", short: "Pot", rank: 1 },
] as const;
export type LevelKey = (typeof LEVELS)[number]["key"];

/** Comissão técnica: funções de gerência e administrativas. Ficam fora do campo (não entram nas 11 camisas). */
export const STAFF = [
  { key: "gerente", label: "Gerente" },
  { key: "gerente_atacado", label: "Gerente de atacado" },
  { key: "comprador", label: "Comprador" },
  { key: "financeiro", label: "Financeiro" },
  { key: "rh", label: "RH" },
  { key: "dp", label: "DP" },
  { key: "marketing", label: "Suporte de marketing" },
  { key: "conciliacao_cartoes", label: "Conciliação de cartões de crédito" },
] as const;
export type StaffKey = (typeof STAFF)[number]["key"];

/** Qualquer função que uma pessoa pode ter: as 11 do campo ou as da comissão técnica. */
export type AbilityKey = FunctionKey | StaffKey;

export type Abilities = Partial<Record<AbilityKey, LevelKey>>;
