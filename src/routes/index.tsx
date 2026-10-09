import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Award, BookOpen, Megaphone, Target, TrendingUp } from "lucide-react";

import { DemoNotice, PortalShell, ProgressBar, SectionHeading, Stat } from "@/components/portal-shell";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Início — Portal Natal Pneus" },
    { name: "description", content: "Visão inicial de cursos, metas, comunicados e trajetória do colaborador Natal Pneus." },
    { property: "og:title", content: "Início — Portal Natal Pneus" },
    { property: "og:description", content: "Capacitação, desempenho e reconhecimento em um só lugar." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

function Index() {
  return (
    <PortalShell title="Olá, André. Bom dia!" eyebrow="Portal do colaborador">
      <DemoNotice />
      <section className="relative overflow-hidden rounded-xl bg-foreground p-6 text-card sm:p-8">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground"><Megaphone size={14} /> COMUNICADO</span>
          <h2 className="mt-5 text-2xl font-bold sm:text-3xl">Semana da Segurança começa na próxima segunda</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-sidebar-muted">Confira a programação da sua unidade e participe das atividades de prevenção.</p>
          <Link to="/empresa" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">Ler comunicado <ArrowRight size={17} /></Link>
        </div>
        <div className="absolute -bottom-10 right-8 hidden size-52 rotate-12 rounded-xl border-[22px] border-primary opacity-25 md:block" />
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={BookOpen} label="Cursos em andamento" value="2" detail="1 atividade nesta semana" />
        <Stat icon={Award} label="Cursos concluídos" value="6" detail="Desde sua entrada" />
        <Stat icon={Target} label="Meta semanal" value="84%" detail="Atualizado em 09 out. 2026" />
        <Stat icon={TrendingUp} label="Sequência de estudo" value="4 sem." detail="Continue avançando" />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
        <section>
          <SectionHeading title="Continue aprendendo" action="Ver todos" to="/cursos" />
          <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-foreground text-primary sm:w-44"><BookOpen size={44} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-accent-foreground">Iniciante</span><span className="text-xs text-muted-foreground">Produtos e serviços</span></div>
                <h3 className="mt-3 text-lg font-semibold">Fundamentos de pneus e serviços</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Aprenda os conceitos essenciais para orientar cada cliente com segurança.</p>
                <div className="mt-5"><ProgressBar value={65} label="4 de 6 aulas" /></div>
                <Link to="/cursos" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Continuar curso <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeading title="Sua trajetória" action="Ver trajetória" to="/trajetoria" />
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center rounded-xl bg-accent text-2xl font-black text-accent-foreground">3</div>
              <div><p className="text-lg font-semibold">3 anos de história</p><p className="text-sm text-muted-foreground">3 conquistas por tempo de casa</p></div>
            </div>
            <div className="mt-6 flex gap-2" aria-label="Três marcos anuais conquistados">
              {[1,2,3].map((year) => <span key={year} className="grid size-12 place-items-center rounded-lg border-2 border-accent bg-warning-soft text-sm font-bold">{year}º</span>)}
              <span className="grid size-12 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">4º</span>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">Seu próximo marco será celebrado em 18 de março de 2027.</p>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}