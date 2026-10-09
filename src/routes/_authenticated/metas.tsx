import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CircleDollarSign, Target, TrendingUp } from "lucide-react";
import { DemoNotice, PortalShell, ProgressBar, Stat } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/metas")({ head: () => ({ meta: [
  { title: "Minhas metas — Portal Natal Pneus" }, { name: "description", content: "Acompanhamento individual de metas e resultados publicados." },
  { property: "og:title", content: "Minhas metas — Portal Natal Pneus" }, { property: "og:description", content: "Resultados semanais individuais do colaborador." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
] }), component: MetasPage });

function MetasPage() { return <PortalShell title="Minhas metas" eyebrow="Desempenho">
  <DemoNotice />
  <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Acompanhe somente seus indicadores publicados.</p><span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium"><CalendarDays size={17} /> 05 a 11 out. 2026</span></div>
  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Stat icon={Target} label="Meta semanal" value="R$ 20.000" detail="Vendas realizadas" /><Stat icon={CircleDollarSign} label="Realizado" value="R$ 16.800" detail="Atualizado em 09 out. 2026" /><Stat icon={TrendingUp} label="Atingimento" value="84%" detail="R$ 3.200 restantes" /></div>
  <section className="mt-8 rounded-xl border border-border bg-card p-6 shadow-card">
    <div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="text-xs font-bold uppercase text-primary">Vendas semanais</p><h2 className="mt-2 text-xl font-semibold">Você está perto da meta</h2></div><span className="self-start rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">Em andamento</span></div>
    <div className="mt-8"><ProgressBar value={84} label="Atingimento da meta" /></div>
    <div className="mt-8 grid grid-cols-5 items-end gap-3 border-b border-border pb-2" aria-label="Histórico visual de resultados de segunda a sexta">
      {[52,68,44,80,62].map((h,i) => <div key={i} className="flex flex-col items-center gap-2"><div className="w-full max-w-16 rounded-t-md bg-primary/90" style={{height:`${h*1.5}px`}} /><span className="text-xs text-muted-foreground">{['Seg','Ter','Qua','Qui','Sex'][i]}</span></div>)}
    </div>
  </section>
  <section className="mt-8"><h2 className="text-xl font-semibold">Histórico semanal</h2><div className="mt-4 overflow-hidden rounded-xl border border-border bg-card"><div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 bg-secondary px-5 py-3 text-xs font-semibold text-muted-foreground"><span>Período</span><span>Realizado</span><span>Atingimento</span></div>{[['28 set. – 04 out.','R$ 19.200','96%'],['21 – 27 set.','R$ 21.450','107%'],['14 – 20 set.','R$ 17.800','89%']].map(r=><div key={r[0]} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-t border-border px-5 py-4 text-sm"><span>{r[0]}</span><span className="font-medium">{r[1]}</span><span className="font-semibold">{r[2]}</span></div>)}</div></section>
</PortalShell> }