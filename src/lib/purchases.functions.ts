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
    // Per note: which advance note it points to (the same purchase, counted once) and how many product units are still in stock
    // (bought minus the probable exits; empty exits mean nothing was matched, so the whole quantity is still there).
    const advance = new Map<number, number[]>();
    const bought = new Map<number, number>();
    const exited = new Map<number, number>();
    let exitsReady = true;
    for (let i = 0; i < notes.length; i += 50) {
      const ids = notes.slice(i, i + 50).map((n) => n.nota);
      const { data: items } = await context.supabase
        .from("purchase_note_items")
        .select("nota,quantity,is_service,advance_note")
        .in("nota", ids)
        .range(0, 9999);
      for (const r of items ?? []) {
        if (r.advance_note !== null)
          advance.set(r.nota, [...new Set([...(advance.get(r.nota) ?? []), r.advance_note])]);
        if (!r.is_service) bought.set(r.nota, (bought.get(r.nota) ?? 0) + Number(r.quantity));
      }
      const { data: exits, error: exitsError } = await context.supabase
        .from("purchase_exits")
        .select("nota,quantity")
        .in("nota", ids)
        .range(0, 9999);
      if (exitsError) exitsReady = false;
      for (const r of exits ?? [])
        exited.set(r.nota, (exited.get(r.nota) ?? 0) + Number(r.quantity));
    }
    const suppliers = await context.supabase
      .from("suppliers")
      .select("code,name,fantasy")
      .range(0, 4999);
    return {
      notes: notes.map((n) => ({
        ...n,
        advance_notes: advance.get(n.nota) ?? [],
        in_stock: Math.max(0, (bought.get(n.nota) ?? 0) - (exited.get(n.nota) ?? 0)),
      })),
      suppliers: suppliers.data ?? [],
      exitsReady,
    };
  });

export const readPurchaseItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ nota: z.number().int() }))
  .handler(async ({ data, context }) => {
    const [items, exits] = await Promise.all([
      context.supabase
        .from("purchase_note_items")
        .select("position,product_code,description,is_service,quantity,unit_cents,item_total_cents")
        .eq("nota", data.nota)
        .order("position"),
      context.supabase
        .from("purchase_exits")
        .select(
          "position,movement,kind,kind_name,dest_warehouse,sale,plate,client,moved_on,quantity",
        )
        .eq("nota", data.nota)
        .order("moved_on"),
    ]);
    if (items.error) throw new Error("Não foi possível consultar os itens.");
    return { items: items.data ?? [], exits: exits.error ? [] : (exits.data ?? []) };
  });

/**
 * Stock that has not left for a while: balance per warehouse (stores only) whose last sale seen in the last 62 days is older than
 * the limit, or that had no sale at all in that period. Value = balance × cost. Admin only (RLS).
 */
export const readStalledStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      warehouse: z.number().int().min(1).max(4).nullable(),
      days: z.number().int().min(1).max(62),
    }),
  )
  .handler(async ({ data, context }) => {
    const limit = new Date(Date.now() - data.days * 86_400_000).toISOString().slice(0, 10);
    const rows: {
      warehouse: number;
      product: number;
      balance: number;
      cost_cents: number;
      last_sale_on: string | null;
    }[] = [];
    for (let start = 0; start < 30000; start += 1000) {
      let query = context.supabase
        .from("stock_balances")
        .select("warehouse,product,balance,cost_cents,last_sale_on")
        .gt("balance", 0)
        .lte("warehouse", 4)
        .or(`last_sale_on.is.null,last_sale_on.lt.${limit}`)
        .order("warehouse")
        .order("product")
        .range(start, start + 999);
      if (data.warehouse) query = query.eq("warehouse", data.warehouse);
      const { data: page, error } = await query;
      if (error) throw new Error("Não foi possível consultar o estoque.");
      rows.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
    }
    const valued = rows
      .map((r) => ({ ...r, value_cents: Math.round(Number(r.balance) * Number(r.cost_cents)) }))
      .sort((a, b) => b.value_cents - a.value_cents);
    const top = valued.slice(0, 40);
    const names = await context.supabase
      .from("products")
      .select("product,description")
      .in(
        "product",
        top.map((r) => r.product),
      );
    const nameOf = new Map((names.data ?? []).map((n) => [n.product, n.description]));
    return {
      items: valued.length,
      valueCents: valued.reduce((t, r) => t + r.value_cents, 0),
      top: top.map((r) => ({ ...r, description: nameOf.get(r.product) ?? `Produto ${r.product}` })),
    };
  });
