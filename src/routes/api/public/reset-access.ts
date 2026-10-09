import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Temporary, single-account maintenance operation explicitly authorized by the account owner.
export const Route = createFileRoute("/api/public/reset-access")({
  server: { handlers: { POST: async ({ request }) => {
    const bearer = request.headers.get("Authorization") ?? "";
    if (!bearer.startsWith("Bearer ")) return new Response(null, { status: 401 });
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) return new Response(null, { status: 503 });
    const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: bearer } } });
    const { data: auth, error } = await client.auth.getUser(bearer.slice(7));
    const target = "b2eebd4e-ab6e-49a2-9906-a479522d6357";
    if (error || auth.user?.id !== target) return new Response(null, { status: 403 });
    const { data: admin } = await client.rpc("has_role", { _user_id: target, _role: "admin" });
    if (!admin) return new Response(null, { status: 403 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const checks = await Promise.all([
      supabaseAdmin.from("sales_results").select("id", { count: "exact", head: true }).or(`employee_id.eq.${target},created_by.eq.${target},updated_by.eq.${target}`),
      supabaseAdmin.from("courses").select("id", { count: "exact", head: true }).eq("created_by", target),
      supabaseAdmin.from("employee_badges").select("id", { count: "exact", head: true }).eq("user_id", target),
      supabaseAdmin.from("admin_audit").select("id", { count: "exact", head: true }).eq("actor_id", target),
    ]);
    if (checks.some(c => c.error || c.count !== 0)) return new Response(null, { status: 409 });
    const result = await supabaseAdmin.auth.admin.deleteUser(target);
    return Response.json({ deleted: !result.error }, { status: result.error ? 500 : 200 });
  } } },
});