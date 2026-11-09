import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { customerNoticeSchema, validSignature } from "@/lib/customer-webhook";

/**
 * Receives the NP-API notice of a customer type change (Decision). The signature (HMAC-SHA256 of the exact body, with the secret
 * shared with the Decision) is checked first; a repeated notice (same id) is answered 200 without saving again. Always answers
 * fast: the Decision gives up after 10 seconds and sends the notice again.
 */
export const Route = createFileRoute("/api/public/decision-cliente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WEBHOOK_CLIENTE_SEGREDO"];
        if (!secret) return new Response("Server configuration error", { status: 500 });
        const body = await request.text();
        if (!(await validSignature(secret, body, request.headers.get("x-npapi-assinatura"))))
          return new Response("Unauthorized", { status: 401 });

        let notice;
        try {
          notice = customerNoticeSchema.parse(JSON.parse(body));
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Server configuration error", { status: 500 });

        const supabase = createClient(url, key, { auth: { persistSession: false } });
        const { data, error } = await supabase.rpc("record_customer_type_change", {
          _secret: secret,
          _notice: notice.id,
          _code: notice.registroId,
          _name: notice.clienteNome ?? "",
          _old: Number(notice.valorAntigo),
          _new: Number(notice.valorNovo),
          _old_name: notice.valorAntigoNome ?? "",
          _new_name: notice.valorNovoNome ?? "",
          _event_at: notice.dataEvento.replace(" ", "T"),
        });
        // A failure to save makes the Decision try again later: answer 500, not 2xx.
        if (error) return new Response("Could not save", { status: 500 });
        return Response.json({ ok: true, duplicate: data === false });
      },
    },
  },
});
