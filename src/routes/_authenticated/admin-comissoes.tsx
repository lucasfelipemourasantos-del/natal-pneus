import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { CircleCheck, FileUp, Trash2, TriangleAlert } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { importCommission, readCommissionAdmin } from "@/lib/commission.functions";
import { monthLabel } from "@/lib/commissions";
import {
  countSales,
  sectionCheck,
  type ParsedReport,
  type SellerSection,
} from "@/lib/decision-report";
import { fieldClass } from "@/lib/portal-data";
import { money } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/admin-comissoes")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Importar comissões — Natal Pneus" },
      {
        name: "description",
        content:
          "Importe os relatórios de comissão do Decision e vincule os vendedores às contas do portal.",
      },
      { property: "og:title", content: "Importar comissões — Natal Pneus" },
      { property: "og:description", content: "Importe os relatórios de comissão do Decision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminComissoes,
});

type Entry = {
  key: string;
  fileName: string;
  report: ParsedReport;
  section: SellerSection;
  unit: string;
  diff: { soldDiff: number; commissionDiff: number };
  status: "pronto" | "importando" | "importado" | "erro";
  message?: string;
};

const kindLabel: Record<string, string> = {
  sintetico: "PDF sintético",
  analitico: "PDF analítico",
  api: "Decision (API)",
};
const adminKey = ["commission-admin"];

function AdminComissoes() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: adminKey, queryFn: () => readCommissionAdmin() });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setReading(true);
    setNotice("");
    const { readDecisionPdf } = await import("@/lib/decision-pdf");
    const next: Entry[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const report = await readDecisionPdf(file);
        for (const section of report.sellers)
          next.push({
            key: `${file.name}-${section.sellerCode}-${crypto.randomUUID()}`,
            fileName: file.name,
            report,
            section,
            unit: report.unitCode ?? "",
            diff: sectionCheck(report.kind, section),
            status: "pronto",
          });
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "não foi possível ler o PDF."}`,
        );
      }
    }
    setEntries((prev) => [...prev.filter((p) => p.status !== "importado"), ...next]);
    setFileErrors(errors);
    setReading(false);
  }

  const ready = entries.filter(
    (e) =>
      e.status !== "importado" && e.unit && e.diff.soldDiff === 0 && e.diff.commissionDiff === 0,
  );

  async function importAll() {
    setBusy(true);
    setNotice("");
    let done = 0;
    for (const entry of ready) {
      setEntries((list) =>
        list.map((e) => (e.key === entry.key ? { ...e, status: "importando" } : e)),
      );
      const { report, section } = entry;
      try {
        await importCommission({
          data: {
            kind: report.kind,
            unit_code: entry.unit as "NP1" | "NP2" | "NP3" | "NP4",
            seller_code: section.sellerCode,
            seller_name: section.sellerName,
            period_start: report.periodStart,
            period_end: report.periodEnd,
            total_sold_cents: section.totalSoldCents,
            total_commission_cents: section.totalCommissionCents,
            allowance_cents: section.allowanceCents,
            file_name: entry.fileName.slice(0, 200),
            lines:
              report.kind === "sintetico"
                ? section.groups.map((g) => ({
                    group_name: g.group,
                    rate_bp: g.rateBp,
                    sold_cents: g.soldCents,
                    commission_cents: g.commissionCents,
                  }))
                : section.items.map((i) => ({
                    sale_number: i.sale,
                    product_code: i.product,
                    description: i.description,
                    quantity: i.quantity,
                    total_cents: i.totalCents,
                    rate_bp: i.rateBp,
                    commission_cents: i.commissionCents,
                  })),
          },
        });
        done++;
        setEntries((list) =>
          list.map((e) => (e.key === entry.key ? { ...e, status: "importado" } : e)),
        );
      } catch (err) {
        setEntries((list) =>
          list.map((e) =>
            e.key === entry.key
              ? {
                  ...e,
                  status: "erro",
                  message: err instanceof Error ? err.message : "Falha ao importar.",
                }
              : e,
          ),
        );
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
    setNotice(`${done} ${done === 1 ? "relatório importado" : "relatórios importados"}.`);
    setBusy(false);
  }

  async function removeReport(id: string) {
    const { error: err } = await supabase.from("commission_reports").delete().eq("id", id);
    if (err) setNotice("Não foi possível excluir o relatório.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
  }

  async function linkSeller(code: number, profileId: string) {
    const { error: err } = await supabase
      .from("decision_sellers")
      .update({ profile_id: profileId || null })
      .eq("code", code);
    setNotice(err ? "Essa conta já está vinculada a outro vendedor." : "Vínculo salvo.");
    await qc.invalidateQueries({ queryKey: adminKey });
  }

  async function setMinAverage(code: number, enabled: boolean) {
    const { error: err } = await supabase
      .from("decision_sellers")
      .update({ min_average: enabled })
      .eq("code", code);
    setNotice(
      err
        ? "Não foi possível salvar. A atualização do banco (0013) já foi aplicada?"
        : enabled
          ? "Este vendedor passa a usar a média mínima."
          : "Este vendedor volta a usar a própria média.",
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
  }

  async function setPartsGoal(code: number, enabled: boolean) {
    const { error: err } = await supabase
      .from("decision_sellers")
      .update({ parts_goal: enabled })
      .eq("code", code);
    setNotice(
      err
        ? "Não foi possível salvar. A atualização do banco (0013) já foi aplicada?"
        : enabled
          ? "Meta de peças ligada para este vendedor."
          : "Vendedor sem meta de peças.",
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
  }

  async function setActive(code: number, active: boolean) {
    const { error: err } = await supabase
      .from("decision_sellers")
      .update({ active })
      .eq("code", code);
    setNotice(
      err
        ? "Não foi possível salvar. A atualização do banco (0018) já foi aplicada?"
        : active
          ? "Vendedor em atividade."
          : "Vendedor só para histórico: sem conta vinculada e sem abertura de OS por voz.",
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
  }

  async function setIgnored(code: number, ignored: boolean) {
    const { error: err } = await supabase
      .from("decision_sellers")
      .update({ ignored })
      .eq("code", code);
    setNotice(
      err
        ? "Não foi possível salvar."
        : ignored
          ? "Usuário ignorado."
          : "Usuário volta a contar como vendedor.",
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: adminKey }),
      qc.invalidateQueries({ queryKey: ["commissions"] }),
    ]);
  }

  return (
    <PortalShell title="Comissões do Decision" eyebrow="Gestão · ADM RH">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Atualização automática</h2>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          As comissões vêm direto do Decision, pela API, e são conferidas com os totais do próprio
          Decision antes de serem gravadas.
        </p>
        <p className="mt-3 text-sm font-semibold">
          {data?.syncedAt
            ? `Última atualização: ${new Date(data.syncedAt).toLocaleString("pt-BR")}`
            : "Ainda não houve atualização pela API."}
        </p>
      </section>

      <details className="mt-6 rounded-xl border border-border bg-card p-5">
        <summary className="cursor-pointer text-lg font-bold">
          Plano B: enviar PDFs do Decision
        </summary>
        <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
          Use só se a API estiver fora do ar. Envie os PDFs <b>Comissões sintético por vendedor</b>{" "}
          e <b>Comissões analítico por vendedor</b> de cada loja. O sistema lê, confere se as linhas
          somam os totais impressos e só então permite importar. Reenviar o mesmo mês substitui o
          anterior.
        </p>
        <label
          htmlFor="commission-files"
          className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <FileUp size={18} aria-hidden="true" /> {reading ? "Lendo PDFs…" : "Escolher PDFs"}
        </label>
        <input
          id="commission-files"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          disabled={reading || busy}
          onChange={onFiles}
        />
        {fileErrors.map((m) => (
          <p key={m} role="alert" className="mt-3 text-sm text-destructive">
            {m}
          </p>
        ))}
      </details>

      {entries.length > 0 && (
        <section className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Conferência antes de importar</h2>
            <div className="flex gap-2">
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setEntries([])}>
                Limpar
              </Button>
              <Button type="button" disabled={busy || !ready.length} onClick={importAll}>
                {busy
                  ? "Importando…"
                  : `Importar ${ready.length} ${ready.length === 1 ? "relatório" : "relatórios"}`}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">Arquivo</th>
                  <th className="px-2 font-semibold">Tipo</th>
                  <th className="px-2 font-semibold">Loja</th>
                  <th className="px-2 font-semibold">Mês</th>
                  <th className="px-2 font-semibold">Vendedor</th>
                  <th className="px-2 text-right font-semibold">Vendido</th>
                  <th className="px-2 text-right font-semibold">Comissão</th>
                  <th className="px-2 text-right font-semibold">Linhas</th>
                  <th className="pl-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const ok = e.diff.soldDiff === 0 && e.diff.commissionDiff === 0;
                  return (
                    <tr key={e.key} className="border-t border-border align-middle">
                      <td className="max-w-48 truncate py-2.5 pr-2" title={e.fileName}>
                        {e.fileName}
                      </td>
                      <td className="px-2">{kindLabel[e.report.kind]}</td>
                      <td className="px-2">
                        {e.report.unitCode ? (
                          e.unit
                        ) : (
                          <select
                            aria-label={`Loja do arquivo ${e.fileName}`}
                            value={e.unit}
                            disabled={e.status === "importado"}
                            onChange={(ev) =>
                              setEntries((l) =>
                                l.map((x) =>
                                  x.key === e.key ? { ...x, unit: ev.target.value } : x,
                                ),
                              )
                            }
                            className={`${fieldClass} mt-0 min-h-9`}
                          >
                            <option value="">Escolha</option>
                            {["NP1", "NP2", "NP3", "NP4"].map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2">{monthLabel(e.report.periodStart)}</td>
                      <td className="whitespace-nowrap px-2">
                        {e.section.sellerCode} · {e.section.sellerName}
                      </td>
                      <td className="whitespace-nowrap px-2 text-right">
                        {money(e.section.totalSoldCents)}
                      </td>
                      <td className="whitespace-nowrap px-2 text-right">
                        {money(e.section.totalCommissionCents)}
                      </td>
                      <td className="whitespace-nowrap px-2 text-right">
                        {e.report.kind === "sintetico"
                          ? `${e.section.groups.length} grupos`
                          : `${e.section.items.length} itens · ${countSales(e.section.items)} OS`}
                      </td>
                      <td className="pl-2">
                        {e.status === "importado" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-success">
                            <CircleCheck size={15} aria-hidden="true" />
                            Importado
                          </span>
                        ) : e.status === "erro" ? (
                          <span className="text-destructive">{e.message}</span>
                        ) : e.status === "importando" ? (
                          <span className="text-muted-foreground">Importando…</span>
                        ) : !ok ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <TriangleAlert size={15} aria-hidden="true" />
                            Não confere ({money(e.diff.soldDiff)})
                          </span>
                        ) : !e.unit ? (
                          <span className="text-muted-foreground">Escolha a loja</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-success">
                            <CircleCheck size={15} aria-hidden="true" />
                            Confere
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {notice && (
        <p role="status" className="mt-4 text-sm font-semibold">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {data && (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Relatórios importados</h2>
              <Link to="/comissoes" className="text-sm font-semibold text-primary hover:underline">
                Ver comissões →
              </Link>
            </div>
            {!data.reports.length ? (
              <p className="text-sm text-muted-foreground">Nenhum relatório importado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">Mês</th>
                      <th className="px-2 font-semibold">Loja</th>
                      <th className="px-2 font-semibold">Vendedor</th>
                      <th className="px-2 font-semibold">Tipo</th>
                      <th className="px-2 text-right font-semibold">Vendido</th>
                      <th className="px-2 text-right font-semibold">Comissão</th>
                      <th className="pl-2">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reports.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="whitespace-nowrap py-2 pr-2">{monthLabel(r.competence)}</td>
                        <td className="px-2">{r.unit_code}</td>
                        <td className="whitespace-nowrap px-2">
                          {r.seller_code} ·{" "}
                          {data.sellers.find((s) => s.code === r.seller_code)?.name}
                        </td>
                        <td className="px-2">{kindLabel[r.kind]}</td>
                        <td className="whitespace-nowrap px-2 text-right">
                          {money(r.total_sold_cents)}
                        </td>
                        <td className="whitespace-nowrap px-2 text-right">
                          {money(r.total_commission_cents)}
                        </td>
                        <td className="pl-2 text-right">
                          <ConfirmDelete
                            onConfirm={() => removeReport(r.id)}
                            label={`${kindLabel[r.kind]} ${r.unit_code} ${r.seller_code} ${monthLabel(r.competence)}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">Vendedores do Decision</h2>
            <p className="text-sm text-muted-foreground">
              Vincule cada código do Decision à conta do vendedor no portal. Assim ele vê as
              próprias comissões.
            </p>
            {!data.sellers.length ? (
              <p className="text-sm text-muted-foreground">
                Os vendedores aparecem aqui depois da primeira sincronização.
              </p>
            ) : (
              [...data.sellers]
                .sort(
                  (a, b) =>
                    Number(a.ignored) - Number(b.ignored) || a.name.localeCompare(b.name, "pt-BR"),
                )
                .map((s) => (
                  <div
                    key={s.code}
                    className={`space-y-1 border-t border-border pt-3 ${s.ignored ? "opacity-70" : ""}`}
                  >
                    <label
                      htmlFor={`seller-link-${s.code}`}
                      className="block text-sm font-semibold"
                    >
                      {s.code} · {s.name}
                    </label>
                    {s.active === false && (
                      <p className="text-xs font-semibold text-muted-foreground">
                        Só para histórico
                      </p>
                    )}
                    {!s.ignored && s.active !== false && (
                      <select
                        id={`seller-link-${s.code}`}
                        value={s.profile_id ?? ""}
                        onChange={(e) => linkSeller(s.code, e.target.value)}
                        className={`${fieldClass} mt-0`}
                      >
                        <option value="">Sem conta vinculada</option>
                        {data.people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.email}
                            {p.unit_code ? ` · ${p.unit_code}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        id={`seller-ignored-${s.code}`}
                        type="checkbox"
                        checked={s.ignored}
                        onChange={(e) => setIgnored(s.code, e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      Não é vendedor (estoque, gerência): ignorar nas comissões e metas
                    </label>
                    {!s.ignored && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          id={`seller-active-${s.code}`}
                          type="checkbox"
                          checked={s.active === false}
                          onChange={(e) => setActive(s.code, !e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        Só para histórico (não está mais em atividade)
                      </label>
                    )}
                    {!s.ignored && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          id={`seller-goal-off-${s.code}`}
                          type="checkbox"
                          checked={s.parts_goal === false}
                          onChange={(e) => setPartsGoal(s.code, !e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        Sem meta de peças (não aparece meta para este vendedor)
                      </label>
                    )}
                    {!s.ignored && s.parts_goal !== false && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          id={`seller-min-average-${s.code}`}
                          type="checkbox"
                          checked={s.min_average === true}
                          onChange={(e) => setMinAverage(s.code, e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        Usa a média mínima (a menor média entre os vendedores ativos)
                      </label>
                    )}
                  </div>
                ))
            )}
          </section>
        </div>
      )}
    </PortalShell>
  );
}

function ConfirmDelete({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label={`Excluir ${label}`}
        title="Excluir"
        onClick={() => setAsking(true)}
      >
        <Trash2 />
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Button variant="destructive" size="sm" type="button" onClick={onConfirm}>
        Excluir
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </span>
  );
}
