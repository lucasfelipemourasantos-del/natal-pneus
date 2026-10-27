import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fieldClass } from "@/lib/portal-data";
import { parseCents } from "@/lib/results";
import { rateLabel } from "@/lib/supervisor";

const GROUPS = ["OLEOS E QUIMICOS", "PECAS", "PNEUS, CAMARAS, PROTETORES E PITOS", "SERVICOS"];

type Line = { sold: string; rate: string; commission: string };
const EMPTY: Line = { sold: "", rate: "0,45", commission: "" };

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The RH types the "Comissões por Supervisor" report of the Decision as printed; the portal mirrors it. */
export function SupervisorEntry({
  supervisors,
}: {
  supervisors: { code: number; name: string; unit: string }[];
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState(supervisors[0]?.code ?? 0);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [until, setUntil] = useState("");
  const [lines, setLines] = useState<Line[]>(GROUPS.map(() => ({ ...EMPTY })));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const supervisor = supervisors.find((s) => s.code === code);
  const competence = `${month}-01`;

  const saved = useQuery({
    queryKey: ["supervisor-commissions-admin", code, competence],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("supervisor_commissions")
        .select("group_name,sold_cents,rate_bp,commission_cents,period_end")
        .eq("seller_code", code)
        .eq("competence", competence);
      return rows ?? [];
    },
  });

  function load() {
    const rows = saved.data ?? [];
    if (!rows.length) return setNotice("Nada lançado para este mês ainda.");
    setUntil(rows[0]!.period_end);
    setLines(
      GROUPS.map((g) => {
        const r = rows.find((x) => x.group_name === g);
        return r
          ? {
              sold: reais(r.sold_cents),
              rate: (r.rate_bp / 100).toFixed(2).replace(".", ","),
              commission: reais(r.commission_cents),
            }
          : { ...EMPTY };
      }),
    );
    setNotice("Valores já lançados carregados.");
  }

  async function save() {
    setNotice("");
    if (!supervisor || !/^\d{4}-\d{2}$/.test(month) || !until)
      return setNotice("Escolha o supervisor, o mês e a data final do relatório.");
    try {
      const rows = GROUPS.flatMap((group_name, i) => {
        const l = lines[i]!;
        if (!l.sold.trim() && !l.commission.trim()) return [];
        return [
          {
            seller_code: supervisor.code,
            unit_code: supervisor.unit,
            competence,
            period_end: until,
            group_name,
            sold_cents: parseCents(l.sold),
            rate_bp: Math.round(Number(l.rate.replace("%", "").replace(",", ".")) * 100),
            commission_cents: parseCents(l.commission),
          },
        ];
      });
      if (!rows.length) return setNotice("Preencha ao menos um grupo do relatório.");
      setBusy(true);
      const del = await supabase
        .from("supervisor_commissions")
        .delete()
        .eq("seller_code", supervisor.code)
        .eq("competence", competence);
      if (del.error)
        throw new Error("Não foi possível salvar. A atualização do banco (0021) já foi aplicada?");
      const ins = await supabase.from("supervisor_commissions").insert(rows);
      if (ins.error) throw new Error("Não foi possível salvar. Confira os valores.");
      setNotice("Relatório do supervisor salvo.");
      await Promise.all([
        saved.refetch(),
        qc.invalidateQueries({ queryKey: ["supervisor-commissions"] }),
      ]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Valor inválido.");
    } finally {
      setBusy(false);
    }
  }

  if (!supervisors.length) return null;
  const total = lines.reduce((t, l) => {
    try {
      return t + (l.commission.trim() ? parseCents(l.commission) : 0);
    } catch {
      return t;
    }
  }, 0);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">Comissão de supervisor</h2>
      <p className="text-sm text-muted-foreground">
        O Decision ainda não envia esse relatório. Digite os valores de "Comissões por Supervisor"
        exatamente como estão impressos; o portal mostra o mesmo para o supervisor.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supervisor
          <select
            value={code}
            onChange={(e) => setCode(Number(e.target.value))}
            className={fieldClass}
          >
            {supervisors.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name} · {s.unit}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Relatório até
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      <div className="space-y-2">
        {GROUPS.map((g, i) => (
          <div key={g} className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_0.6fr_1fr]">
            <span className="text-sm font-semibold">{g}</span>
            {(
              [
                ["sold", "Total vendido", "10.094,44"],
                ["rate", "Comissão %", "0,45"],
                ["commission", "Valor comissão", "45,43"],
              ] as const
            ).map(([key, label, ph]) => (
              <label key={key} className="text-xs text-muted-foreground">
                {label}
                <input
                  inputMode="decimal"
                  placeholder={ph}
                  value={lines[i]![key]}
                  onChange={(e) =>
                    setLines((all) =>
                      all.map((l, j) => (j === i ? { ...l, [key]: e.target.value } : l)),
                    )
                  }
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="text-sm tabular-nums">
        Total da comissão: <b>R$ {reais(total)}</b>
        {" · "}taxa {rateLabel(45)} como padrão
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar relatório"}
        </Button>
        <Button variant="outline" onClick={load}>
          Carregar o que já foi lançado
        </Button>
        {notice && (
          <span role="status" className="text-sm text-muted-foreground">
            {notice}
          </span>
        )}
      </div>
    </section>
  );
}
