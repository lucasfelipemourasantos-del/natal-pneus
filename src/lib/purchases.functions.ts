import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const month = z.string().regex(/^\d{4}-\d{2}$/);

/** Purchase notes received in the month (admin only: RLS). Items come apart, when a note is opened. */
export const readPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ month }))
  .handler(async ({ data, context }) => {
    const from = `${data.month}-01`;
    const [y = 0, m = 1] = data.month.split("-").map(Number);
    const to = `${data.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const notes: {
      nota: number;
      unit_code: string;
      warehouse: number;
      number: string | null;
      series: string | null;
      supplier_code: number | null;
      kind: number;
      kind_name: string;
      received_on: string;
      total_cents: number;
    }[] = [];
    for (let start = 0; start < 20000; start += 1000) {
      const { data: rows, error } = await context.supabase
        .from("purchase_notes")
        .select(
          "nota,unit_code,warehouse,number,series,supplier_code,kind,kind_name,received_on,total_cents",
        )
        .gte("received_on", from)
        .lte("received_on", to)
        .order("received_on", { ascending: false })
        .order("nota", { ascending: false })
        .range(start, start + 999);
      if (error) throw new Error("Não foi possível consultar as compras.");
      notes.push(...(rows ?? []));
      if ((rows ?? []).length < 1000) break;
    }
    // Which notes point to an advance note (the same purchase, counted once).
    const advance = new Map<number, number[]>();
    for (let i = 0; i < notes.length; i += 100) {
      const ids = notes.slice(i, i + 100).map((n) => n.nota);
      const { data: rows } = await context.supabase
        .from("purchase_note_items")
        .select("nota,advance_note")
        .in("nota", ids)
        .not("advance_note", "is", null);
      for (const r of rows ?? [])
        if (r.advance_note !== null)
          advance.set(r.nota, [...new Set([...(advance.get(r.nota) ?? []), r.advance_note])]);
    }
    const suppliers = await context.supabase.from("suppliers").select("code,name,fantasy");
    return {
      notes: notes.map((n) => ({ ...n, advance_notes: advance.get(n.nota) ?? [] })),
      suppliers: suppliers.data ?? [],
    };
  });

export const readPurchaseItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ nota: z.number().int() }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("purchase_note_items")
      .select("position,product_code,description,is_service,quantity,unit_cents,item_total_cents")
      .eq("nota", data.nota)
      .order("position");
    if (error) throw new Error("Não foi possível consultar os itens.");
    return rows ?? [];
  });
