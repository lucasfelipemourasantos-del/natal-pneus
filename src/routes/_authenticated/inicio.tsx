import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Award, Bell, BookOpen, Target, TrendingUp } from "lucide-react";

import cityAtNight from "@/assets/cidade-noturna.jpg";
import {
  DemoNotice,
  PortalShell,
  ProgressBar,
  SectionHeading,
  Stat,
} from "@/components/portal-shell";
import { demoShortDate } from "@/lib/demo-dates";
import { phraseOfWeek } from "@/lib/weekly-phrases";
import { CategoryTag } from "@/components/announcements";
import { myAnnouncementsOptions } from "@/lib/announcements";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Início — Portal Natal Pneus" },
      {
        name: "description",
        content:
          "Visão inicial de cursos, metas, comunicados e trajetória do colaborador Natal Pneus.",
      },
      { property: "og:title", content: "Início — Portal Natal Pneus" },
      {
        property: "og:description",
        content: "Capacitação, desempenho e reconhecimento em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { access } = Route.useRouteContext();
  const { data: notices } = useQuery(myAnnouncementsOptions(access.userId));
  const latest = notices?.items.slice(0, 3) ?? [];
  return (
    <PortalShell title="Olá. Seja bem-vindo(a)!" eyebrow="Portal do colaborador">
      <DemoNotice />
      <section
        aria-label="Frase da semana"
        className="relative flex min-h-56 items-center overflow-hidden rounded-xl border border-border bg-black p-6 text-white sm:p-10"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${cityAtNight})`,
            filter: "saturate(0.55) brightness(0.48) contrast(1.08)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20"
        />
        <blockquote className="relative z-10 max-w-[30ch] text-2xl font-bold leading-tight text-balance sm:text-3xl">
          <span aria-hidden="true" className="mb-5 block h-px w-11 bg-[oklch(0.86_0.005_255)]" />
          {phraseOfWeek()}
        </blockquote>
      </section>

      {latest.length > 0 && (
        <section
          aria-labelledby="home-notices"
          className="mt-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="home-notices" className="inline-flex items-center gap-2 text-base font-bold">
              <Bell size={18} className="text-primary" aria-hidden="true" /> Comunicados
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {notices!.items.length}
              </span>
            </h2>
            <Link to="/comunicados" className="text-sm font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {latest.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <CategoryTag category={a.category} />
                <Link
                  to="/comunicados"
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={BookOpen}
          label="Cursos em andamento"
          value="2"
          detail="1 atividade nesta semana"
        />
        <Stat icon={Award} label="Cursos concluídos" value="6" detail="Desde sua entrada" />
        <Stat
          icon={Target}
          label="Meta semanal"
          value="84%"
          detail={`Atualizado em ${demoShortDate()}`}
        />
        <Stat
          icon={TrendingUp}
          label="Sequência de estudo"
          value="4 sem."
          detail="Continue avançando"
        />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
        <section>
          <SectionHeading title="Continue aprendendo" action="Ver todos" to="/cursos" />
          <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-sidebar text-primary sm:w-44">
                <BookOpen size={44} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
                    Iniciante
                  </span>
                  <span className="text-xs text-muted-foreground">Produtos e serviços</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">Fundamentos de pneus e serviços</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Aprenda os conceitos essenciais para orientar cada cliente com segurança.
                </p>
                <div className="mt-5">
                  <ProgressBar value={65} label="4 de 6 aulas" />
                </div>
                <Link
                  to="/cursos"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  Continuar curso <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeading title="Sua trajetória" action="Ver trajetória" to="/trajetoria" />
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center rounded-xl bg-accent text-2xl font-black text-accent-foreground">
                3
              </div>
              <div>
                <p className="text-lg font-semibold">3 anos de história</p>
                <p className="text-sm text-muted-foreground">3 conquistas por tempo de casa</p>
              </div>
            </div>
            <div className="mt-6 flex gap-2" aria-label="Três marcos anuais conquistados">
              {[1, 2, 3].map((year) => (
                <span
                  key={year}
                  className="grid size-12 place-items-center rounded-lg border-2 border-accent bg-warning-soft text-sm font-bold"
                >
                  {year}º
                </span>
              ))}
              <span className="grid size-12 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
                4º
              </span>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              Seu próximo marco será celebrado em 18 de março de 2027.
            </p>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
