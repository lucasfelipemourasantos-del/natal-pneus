import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  GOAL_HISTORY_MONTHS,
  categoryOf,
  goalBaseMonth,
  groupKey,
  monthsBefore,
  type Category,
} from "@/lib/commissions";
import type { LaborGoalRow, TeamRow } from "@/lib/technician-commissions";

const NO_GOALS = [] as LaborGoalRow[];
const NO_TEAMS = [] as TeamRow[];
const NO_NAMES = [] as { code: number; name: string }[];
type ExtraClient = {
  from: (t: "sales_without_commission") => {
    select: (c: string) => {
      gte: (
        c: string,
        v: string,
      ) => {
        lte: (c: string, v: string) => PromiseLike<{ data: ExtraRow[] | null; error: unknown }>;
      };
    };
  };
};
type ExtraRow = {
  unit_code: string;
  competence: string;
  seller_code: number;
  seller_name: string;
  sales_count: number;
  sold_cents: number;
};

/** Sales of sellers who earn no commission (only sales; they add to the store total). Empty until the 0026 update. */
async function salesWithoutCommission(supabase: ExtraClient, from: string, to: string) {
  const { data, error } = await supabase
    .from("sales_without_commission")
    .select("unit_code,competence,seller_code,seller_name,sales_count,sold_cents")
    .gte("competence", from)
    .lte("competence", to);
  return error ? NO_EXTRA : (data ?? NO_EXTRA);
}
const NO_EXTRA = [] as {
  unit_code: string;
  competence: string;
  seller_code: number;
  seller_name: string;
  sales_count: number;
  sold_cents: number;
}[];

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
        noCommission: NO_EXTRA,
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
      noCommission: await salesWithoutCommission(
        context.supabase as unknown as ExtraClient,
        oldest,
        competence,
      ),
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
          "report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,rule,plate",
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
        noCommission: NO_EXTRA,
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
      noCommission: NO_EXTRA,
    };
  });

/**
 * Composition of the OS (sales) of a month: how many OS had each category (pneus, peças, óleos, serviços) and, for the
 * fields the person selected, how many OS contain any of them. The value of an OS is its whole total (every item of the
 * sale), so the average ticket of "OS with peças" counts the labor and tires sold in the same OS.
 * Only items with commission exist in the Decision reports, so the totals follow the same rule as the commission screens.
 */
export const readOsComposition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      competence: z.string().regex(/^\d{4}-\d{2}-01$/),
      unit: z
        .string()
        .regex(/^NP[1-4]$/)
        .nullable(),
      sellerCode: z.number().int().positive().nullable(),
      fields: z.array(z.string().max(160)).max(80),
    }),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("commission_reports")
      .select("id,unit_code,seller_code")
      .eq("kind", "api")
      .eq("competence", data.competence);
    if (data.unit) query = query.eq("unit_code", data.unit);
    if (data.sellerCode) query = query.eq("seller_code", data.sellerCode);
    const [reports, ignoredRows] = await Promise.all([
      query,
      context.supabase.from("decision_sellers").select("code").eq("ignored", true),
    ]);
    if (reports.error) throw new Error("Não foi possível consultar as OS.");
    const ignored = new Set((ignoredRows.data ?? []).map((r) => r.code));
    // A single seller was asked for on purpose; stores and the network leave the ignored users out.
    const rows = (reports.data ?? []).filter((r) => data.sellerCode || !ignored.has(r.seller_code));
    const unitOf = new Map(rows.map((r) => [r.id, r.unit_code]));
    const wanted = new Set(data.fields);
    const sales = new Map<
      string,
      { total: number; selected: number; fields: Set<string>; cats: Set<Category> }
    >();
    const ids = rows.map((r) => r.id);
    const page = 1000;
    for (let i = 0; i < ids.length; i += 15) {
      const chunk = ids.slice(i, i + 15);
      for (let from = 0; from < 30000; from += page) {
        const { data: items, error } = await context.supabase
          .from("commission_report_items")
          .select("report_id,sale_number,total_cents,rule")
          .in("report_id", chunk)
          .order("report_id")
          .order("position")
          .range(from, from + page - 1);
        if (error) throw new Error("Não foi possível consultar as OS.");
        for (const item of items ?? []) {
          const rule = item.rule ?? "SEM GRUPO NO DECISION";
          const key = `${unitOf.get(item.report_id) ?? ""}|${item.sale_number}`;
          const sale = sales.get(key) ?? {
            total: 0,
            selected: 0,
            fields: new Set(),
            cats: new Set(),
          };
          const field = groupKey(rule);
          sale.total += item.total_cents;
          if (wanted.has(field)) sale.selected += item.total_cents;
          sale.fields.add(field);
          sale.cats.add(categoryOf(rule));
          sales.set(key, sale);
        }
        if ((items ?? []).length < page) break;
      }
    }
    const byCategory = { pneus: [0, 0], servicos: [0, 0], pecas: [0, 0], oleos: [0, 0] } as Record<
      Category,
      [number, number]
    >;
    let osTotal = 0;
    const withSelection = { osCount: 0, osTotalCents: 0, selectedCents: 0 };
    for (const sale of sales.values()) {
      osTotal += sale.total;
      for (const c of sale.cats) {
        byCategory[c][0] += 1;
        byCategory[c][1] += sale.total;
      }
      if ([...sale.fields].some((f) => wanted.has(f))) {
        withSelection.osCount += 1;
        withSelection.osTotalCents += sale.total;
        withSelection.selectedCents += sale.selected;
      }
    }
    return {
      osCount: sales.size,
      osTotalCents: osTotal,
      categories: Object.fromEntries(
        (Object.keys(byCategory) as Category[]).map((c) => [
          c,
          { osCount: byCategory[c][0], osTotalCents: byCategory[c][1] },
        ]),
      ) as Record<Category, { osCount: number; osTotalCents: number }>,
      withSelection: data.fields.length ? withSelection : null,
    };
  });
