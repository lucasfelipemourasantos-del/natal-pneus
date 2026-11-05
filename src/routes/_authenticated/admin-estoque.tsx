import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lock } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { monthLabel } from "@/lib/commissions";
import { fieldClass } from "@/lib/portal-data";
import { isPurchase } from "@/lib/purchases";
import { readPurchaseItems, readPurchases } from "@/lib/purchases.functions";
import { money } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/admin-estoque")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Controle de estoque — Gestão — Natal Pneus" },
      {
        name: "description",
        content: "Notas fiscais de entrada por loja, com fornecedor, valor e itens.",
      },
      { property: "og:title", content: "Controle de estoque — Gestão — Natal Pneus" },
      { property: "og:description", content: "Compras (notas de entrada) por loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEstoque,
});

const KINDS = [
  { key: "compras", label: "Compras" },
  { key: "transferencias", label: "Transferências" },
  { key: "devolucoes", label: "Devoluções" },
  { key: "todas", label: "Todas as notas" },
] as const;
type KindKey = (typeof KINDS)[number]["key"];

function lastMonths(count: number) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const day = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function AdminEstoque() {
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[0]!);
  const [unit, setUnit] = useState("");
  const [kind, setKind] = useState<KindKey>("compras");
  const { data, isPending, error } = useQuery({
    queryKey: ["purchases", month],
    queryFn: () => readPurchases({ data: { month } }),
  });

  const supplierName = (code: number | null) => {
    const s = data?.suppliers.find((x) => x.code === code);
    return s ? (s.fantasy ?? s.name) : code === null ? "—" : `Fornecedor ${code}`;
  };
  const all = data?.notes ?? [];
  const inUnit = all.filter((n) => !unit || n.unit_code === unit);
  const counted = new Set(
    inUnit
      .filter((n) =>
        isPurchase(
          {
            nota: n.nota,
            kind: n.kind,
            total_cents: n.total_cents,
            advance_notes: n.advance_notes,
          },
          all.map((o) => ({
            nota: o.nota,
            kind: o.kind,
            total_cents: o.total_cents,
            advance_notes: o.advance_notes,
          })),
        ),
      )
      .map((n) => n.nota),
  );
  const shown = inUnit.filter((n) =>
    kind === "compras"
      ? counted.has(n.nota)
      : kind === "transferencias"
        ? n.kind === 2
        : kind === "devolucoes"
          ? n.kind === 3 || n.kind === 4
          : true,
  );
  const purchases = inUnit.filter((n) => counted.has(n.nota));
  const total = purchases.reduce((t, n) => t + n.total_cents, 0);
  const byUnit = ["NP1", "NP2", "NP3", "NP4"].map((u) => ({
    unit: u,
    cents: all.filter((n) => n.unit_code === u).reduce((t, n) => t + n.total_cents, 0),
  }));
  const transfers = inUnit.filter((n) => n.kind === 2);

  return (
    <PortalShell title="Controle de estoque" eyebrow="Gestão · ADM RH">
      <p className="flex items-start gap-3 rounded-xl border border-border bg-warning-soft p-4 text-sm">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <b>Etapa 1: entradas.</b> Mostra as notas fiscais de compra dadas entrada em cada loja. O
          destino de cada item (OS ou estoque) entra quando o Decision liberar os movimentos de
          estoque.
        </span>
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mês
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(`${m}-01`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Loja
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass}>
            <option value="">Todas as lojas</option>
            {["NP1", "NP2", "NP3", "NP4"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notas
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as KindKey)}
            className={fieldClass}
          >
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending && <p className="mt-6 text-muted-foreground">Carregando…</p>}
      {error && (
        <p role="alert" className="mt-6 text-destructive">
          {error.message}
        </p>
      )}
      {data && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Compras do mês</p>
              <p className="text-2xl font-extrabold tabular-nums">{money(total)}</p>
              <p className="text-xs text-muted-foreground">{purchases.length} notas de compra</p>
            </div>
            {byUnit
              .filter((u) => !unit || u.unit === unit)
              .map((u) => (
                <div key={u.unit} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{u.unit}</p>
                  <p className="text-xl font-extrabold tabular-nums">{money(u.cents)}</p>
                </div>
              ))}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Transferências entre lojas</p>
              <p className="text-xl font-extrabold tabular-nums">{transfers.length} notas</p>
              <p className="text-xs text-muted-foreground">Não são compra</p>
            </div>
          </section>

          <section className="mt-6 min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">
              Notas de {monthLabel(`${month}-01`)} ({shown.length})
            </h2>
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma nota neste filtro. Se o mês é novo, a atualização do Decision traz as notas
                a cada 30 minutos.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {shown.map((n) => (
                  <details key={n.nota} className="group py-2">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="w-12 tabular-nums text-muted-foreground">
                        {day(n.received_on)}
                      </span>
                      <span className="w-12 font-semibold">{n.unit_code}</span>
                      <span className="min-w-48 flex-1 font-semibold">
                        {supplierName(n.supplier_code)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        NF {n.number ?? "—"}
                        {n.series && n.series !== "0" ? `/${n.series}` : ""}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                        {n.kind_name}
                        {n.kind === 0 && !counted.has(n.nota) && n.advance_notes.length
                          ? " · já contada no adiantamento"
                          : ""}
                      </span>
                      <span className="w-28 text-right font-semibold tabular-nums">
                        {money(n.total_cents)}
                      </span>
                    </summary>
                    <NoteItems nota={n.nota} warehouse={n.warehouse} />
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </PortalShell>
  );
}

function NoteItems({ nota, warehouse }: { nota: number; warehouse: number }) {
  const { data, isPending } = useQuery({
    queryKey: ["purchase-items", nota],
    queryFn: () => readPurchaseItems({ data: { nota } }),
  });
  return (
    <div className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3">
      <p className="mb-2 text-xs text-muted-foreground">Almoxarifado {warehouse}</p>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando itens…</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pr-2 font-semibold">Item</th>
              <th className="px-2 text-right font-semibold">Qtd</th>
              <th className="px-2 text-right font-semibold">Valor unitário</th>
              <th className="pl-2 text-right font-semibold">Valor do item</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((i) => (
              <tr key={i.position} className="border-t border-border">
                <td className="py-1.5 pr-2">
                  {i.product_code} · {i.description}
                  {i.is_service ? " (serviço)" : ""}
                </td>
                <td className="px-2 text-right">{i.quantity}</td>
                <td className="px-2 text-right">{money(i.unit_cents)}</td>
                <td className="pl-2 text-right">{money(i.item_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
