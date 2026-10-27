import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { GOAL_HISTORY_MONTHS, goalBaseMonth, monthsBefore } from "@/lib/commissions";
import type { LaborGoalRow, TeamRow } from "@/lib/technician-commissions";

const NO_GOALS = [] as LaborGoalRow[];
const NO_TEAMS = [] as TeamRow[];
const NO_NAMES = [] as { code: number; name: string }[];

type ProfilesClient = {
  from: (t: "profiles") => {
    select: (c: string) => {
      in: (
        c: string,
        v: string[],
      ) => PromiseLike<{ data: { id: string; full_name: string }[] | null }>;
    };
  };
};

/** Full name the employee typed at signup, for each linked Decision code (leadership sees all, a person sees his own). */
async function linkedNames(
  supabase: ProfilesClient,
  sellers: { code: number; profile_id: string | null }[],
) {
  const ids = [...new Set(sellers.flatMap((s) => (s.profile_id ? [s.profile_id] : [])))];
  if (!ids.length) return NO_NAMES;
  const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids);
  const byId = new Map((data ?? []).map((p) => [p.id, p.full_name]));
  return sellers.flatMap((s) => {
    const name = s.profile_id ? byId.get(s.profile_id) : undefined;
    return name ? [{ code: s.code, name }] : [];
  });
}

type GoalRefs = Database["public"]["Functions"]["parts_goal_reference_base"]["Returns"];

const month = z.string().regex(/^\d{4}-\d{2}-01$/);

/** Months with reports, plus the chosen month and the 6 before it (for the peças goal). RLS limits sellers to their own rows. */
export const readCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ competence: month.nullable() }))
  .handler(async ({ data, context }) => {
    const [months, sync] = await Promise.all([
      context.supabase
        .from("commission_reports")
        .select("competence")
        .neq("kind", "tecnico")
        .order("competence", { ascending: false }),
      context.supabase
        .from("decision_sync_status")
        .select("synced_at")
        .eq("scope", "comissoes")
        .maybeSingle(),
    ]);
    if (months.error) throw new Error("Não foi possível consultar as comissões.");
    const syncedAt = sync.data?.synced_at ?? null;
    const available = [...new Set((months.data ?? []).map((r) => r.competence))];
    const competence = data.competence ?? available[0] ?? null;
    if (!competence)
      return {
        available,
        competence,
        syncedAt,
        reports: [],
        os: [],
        sellers: [],
        goalRefs: [],
        goals: NO_GOALS,
        teams: NO_TEAMS,
        names: NO_NAMES,
      };
    const oldest = monthsBefore(goalBaseMonth(competence), GOAL_HISTORY_MONTHS).at(-1)!;
    const [reports, os, sellers, refs] = await Promise.all([
      context.supabase
        .from("commission_reports")
        .select(
          "id,kind,unit_code,seller_code,competence,total_sold_cents,total_commission_cents,allowance_cents,imported_at,file_name,commission_report_groups(group_name,rate_bp,sold_cents,commission_cents)",
        )
        .neq("kind", "tecnico")
        .gte("competence", oldest)
        .lte("competence", competence),
      context.supabase.rpc("commission_os_summary", { _competence: competence }),
      context.supabase.from("decision_sellers").select("*").order("name"),
      // "Média mínima" bases (Erivan/Israel use the lowest regular seller's). The seller only gets his own line. If the database
      // update (0013) is not applied yet this call fails and the page simply uses each seller's own base.
      context.supabase.rpc("parts_goal_reference_base", { _competence: goalBaseMonth(competence) }),
    ]);
    for (const res of [reports, os, sellers])
      if (res.error) throw new Error("Não foi possível consultar as comissões.");
    return {
      available,
      competence,
      syncedAt,
      reports: reports.data ?? [],
      os: os.data ?? [],
      sellers: sellers.data ?? [],
      goalRefs: refs.error ? [] : (refs.data ?? []),
      goals: NO_GOALS,
      teams: NO_TEAMS,
      names: await linkedNames(context.supabase as unknown as ProfilesClient, sellers.data ?? []),
    };
  });

/** Sold items behind the chosen seller/month (RLS: leadership or the seller himself). */
export const readCommissionItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ reportIds: z.array(z.string().uuid()).max(20) }))
  .handler(async ({ data, context }) => {
    if (!data.reportIds.length) return [];
    const reports = await context.supabase
      .from("commission_reports")
      .select("id,unit_code")
      .in("id", data.reportIds);
    if (reports.error) throw new Error("Não foi possível consultar os itens.");
    const unitOf = new Map((reports.data ?? []).map((r) => [r.id, r.unit_code]));
    const page = 1000; // PostgREST returns at most 1000 rows per request
    const rows = [];
    for (let from = 0; from < 20000; from += page) {
      const { data: chunk, error } = await context.supabase
        .from("commission_report_items")
        .select(
          "report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,rule",
        )
        .in("report_id", data.reportIds)
        .order("report_id")
        .order("position")
        .range(from, from + page - 1);
      if (error) throw new Error("Não foi possível consultar os itens.");
      rows.push(...(chunk ?? []));
      if ((chunk ?? []).length < page) break;
    }
    return rows.map((i) => ({ ...i, unit_code: unitOf.get(i.report_id) ?? "" }));
  });

/** ADM RH import screen: imported reports, Decision sellers and the accounts they can be linked to. */
export const readCommissionAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("can_read_all");
    if (!admin) throw new Error("Acesso não autorizado.");
    const [reports, sellers, people, sync] = await Promise.all([
      context.supabase
        .from("commission_reports")
        .select(
          "id,kind,unit_code,seller_code,competence,total_sold_cents,total_commission_cents,file_name,imported_at",
        )
        .neq("kind", "tecnico")
        .order("competence", { ascending: false })
        .order("imported_at", { ascending: false })
        .limit(500),
      context.supabase.from("decision_sellers").select("*").order("name"),
      context.supabase
        .from("profiles")
        .select("id,full_name,email,unit_code,status")
        .eq("status", "approved")
        .order("full_name"),
      context.supabase
        .from("decision_sync_status")
        .select("synced_at")
        .eq("scope", "comissoes")
        .maybeSingle(),
    ]);
    for (const res of [reports, sellers, people])
      if (res.error) throw new Error("Não foi possível consultar as comissões.");
    return {
      reports: reports.data ?? [],
      sellers: sellers.data ?? [],
      people: people.data ?? [],
      syncedAt: sync.data?.synced_at ?? null,
    };
  });

const money = z.number().int().min(-9e12).max(9e12);
const rate = z.number().int().min(-10000).max(10000);
export const importCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      kind: z.enum(["sintetico", "analitico"]),
      unit_code: z.enum(["NP1", "NP2", "NP3", "NP4"]),
      seller_code: z.number().int().positive(),
      seller_name: z.string().min(1).max(120),
      period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      total_sold_cents: money,
      total_commission_cents: money,
      allowance_cents: money,
      file_name: z.string().max(200),
      lines: z
        .array(
          z.union([
            z.object({
              group_name: z.string().min(1).max(200),
              rate_bp: rate,
              sold_cents: money,
              commission_cents: money,
            }),
            z.object({
              sale_number: z.string().min(1).max(40),
              product_code: z.string().max(40),
              description: z.string().max(300),
              quantity: z.number().min(-1e9).max(1e9),
              total_cents: money,
              rate_bp: rate,
              commission_cents: money,
            }),
          ]),
        )
        .min(1)
        .max(20000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("import_commission_report", { _report: data });
    if (error)
      throw new Error(
        error.message.includes("do not match")
          ? "As linhas do relatório não somam os totais impressos. Gere o PDF de novo no Decision."
          : "Não foi possível importar o relatório.",
      );
    return { ok: true };
  });

/** Operators (mechanics, aligners, balancers...): same shape as readCommissions, from the "tecnico" reports. RLS limits an operator to his own rows. */
export const readTechCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ competence: month.nullable() }))
  .handler(async ({ data, context }) => {
    const [months, sync] = await Promise.all([
      context.supabase
        .from("commission_reports")
        .select("competence")
        .eq("kind", "tecnico")
        .order("competence", { ascending: false }),
      context.supabase
        .from("decision_sync_status")
        .select("synced_at")
        .eq("scope", "comissoes")
        .maybeSingle(),
    ]);
    if (months.error) throw new Error("Não foi possível consultar as comissões.");
    const syncedAt = sync.data?.synced_at ?? null;
    const available = [...new Set((months.data ?? []).map((r) => r.competence))];
    const competence = data.competence ?? available[0] ?? null;
    if (!competence)
      return {
        available,
        competence,
        syncedAt,
        reports: [],
        os: [],
        sellers: [],
        goalRefs: [],
        goals: NO_GOALS,
        teams: NO_TEAMS,
        names: NO_NAMES,
      };
    const oldest = monthsBefore(competence, GOAL_HISTORY_MONTHS).at(-1)!;
    const [reports, os, sellers, goals, teams] = await Promise.all([
      context.supabase
        .from("commission_reports")
        .select(
          "id,kind,unit_code,seller_code,competence,total_sold_cents,total_commission_cents,allowance_cents,imported_at,file_name,commission_report_groups(group_name,rate_bp,sold_cents,commission_cents)",
        )
        .eq("kind", "tecnico")
        .gte("competence", oldest)
        .lte("competence", competence),
      context.supabase.rpc("technician_os_summary", { _competence: competence }),
      context.supabase.from("decision_sellers").select("*").order("name"),
      context.supabase.from("technician_goals").select("seller_code,tier,target_cents,bonus_cents"),
      context.supabase.rpc("team_commission", { _competence: competence }),
    ]);
    for (const res of [reports, sellers])
      if (res.error) throw new Error("Não foi possível consultar as comissões.");
    return {
      available,
      competence,
      syncedAt,
      reports: reports.data ?? [],
      // Until migration 0016 is applied the OS count is simply unavailable (shown as "—").
      os: os.error ? [] : (os.data ?? []),
      sellers: sellers.data ?? [],
      goalRefs: [] as GoalRefs,
      // Until migration 0017 is applied there are simply no goals or teams.
      goals: goals.error ? NO_GOALS : (goals.data ?? NO_GOALS),
      teams: teams.error ? NO_TEAMS : (teams.data ?? NO_TEAMS),
      names: await linkedNames(context.supabase as unknown as ProfilesClient, sellers.data ?? []),
    };
  });
