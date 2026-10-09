import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const readManagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: all, error: roleError } = await context.supabase.rpc("can_read_all");
    if (roleError || !all) throw new Error("Acesso não autorizado.");
    const [p, r, s, b, e, a] = await Promise.all([
      context.supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      context.supabase.from("user_roles").select("*"),
      context.supabase.from("sectors").select("*").order("name"),
      context.supabase.from("badges").select("*"),
      context.supabase.from("employee_badges").select("*"),
      context.supabase
        .from("admin_audit")
        .select("id,actor_id,action,table_name,record_id,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    for (const res of [p, r, s, b, e, a])
      if (res.error) throw new Error("Não foi possível consultar os registros.");
    return {
      people: p.data ?? [],
      roles: r.data ?? [],
      sectors: s.data ?? [],
      badges: b.data ?? [],
      awarded: e.data ?? [],
      audit: a.data ?? [],
    };
  });
export const reviewAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "suspended", "rejected"]),
      unit: z.enum(["NP1", "NP2", "NP3", "NP4"]).nullable(),
      job: z.string().min(1).max(100),
      sector: z.string().uuid().nullable(),
      role: z.enum(["employee", "director", "general_manager", "supervisor"]),
      producer: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_employee", {
      _id: data.id,
      _status: data.status,
      _unit: data.unit as unknown as string,
      _job: data.job,
      _sector: data.sector as unknown as string,
      _role: data.role,
      _producer: data.producer,
    });
    if (error)
      throw new Error("Não foi possível salvar. Confirme e-mail, unidade, função e setor.");
    return { ok: true };
  });
export const readResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [r, s, p] = await Promise.all([
      context.supabase.from("sales_results").select("*").order("competence"),
      context.supabase.from("sectors").select("*"),
      context.supabase.from("profiles").select("*"),
    ]);
    for (const res of [r, s, p])
      if (res.error) throw new Error("Não foi possível consultar os resultados.");
    return { rows: r.data ?? [], sectors: s.data ?? [], people: p.data ?? [] };
  });
