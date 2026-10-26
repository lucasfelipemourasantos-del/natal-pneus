import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Award, Bell, BookOpen, Target, Wallet } from "lucide-react";

import cityAtNight from "@/assets/cidade-noturna.jpg";
import { PortalShell, SectionHeading, Stat } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import { readCommissions } from "@/lib/commission.functions";
import { partsGoal, referenceFor, sellerMonth } from "@/lib/commissions";
import { money } from "@/lib/results";
import { completeYears, tenureStatus } from "@/lib/tenure";
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
  const { data: courses } = useQuery({
    queryKey: ["home-courses"],
    queryFn: async () =>
      (await supabase.from("courses").select("*").order("created_at", { ascending: false })).data ??
      [],
  });
  const lastCourse = courses?.[0] ?? null;
  const { data: commissions } = useQuery({
    queryKey: ["commissions", null],
    queryFn: () => readCommissions({ data: { competence: null } }),
    enabled: Boolean(access.sellerCode),
  });
  const admission = access.profile?.admission_date ?? null;
  const years = admission ? completeYears(admission) : null;
  const tenure = tenureStatus(years ?? 0);

  let goalValue = "Em breve";
  let goalDetail = "Metas para a sua função em breve";
  let commissionValue = "Em breve";
  let commissionDetail = "Comissões para a sua função em breve";
  if (access.sellerCode) {
    goalValue = "—";
    goalDetail = "Carregando seus dados";
    commissionValue = "—";
    commissionDetail = "Carregando seus dados";
  }
  if (access.sellerCode && commissions?.competence) {
    const code = access.sellerCode;
    const month = commissions.competence;
    const updated = commissions.syncedAt
      ? `Atualizado em ${new Date(commissions.syncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
      : "Dados do Decision";
    const view = sellerMonth(commissions.reports, commissions.os, code, month);
    commissionValue = money(view.commissionCents);
    commissionDetail = updated;
    const off = commissions.sellers.find((s) => s.code === code)?.parts_goal === false;
    const goal = off
      ? null
      : partsGoal(commissions.reports, code, month, referenceFor(commissions.goalRefs, code));
    if (!goal || goal.noPartsHistory || goal.averageCents === null) {
      goalValue = "Sem meta";
      goalDetail = "Meta de peças não se aplica a você";
    } else {
      goalValue = goal.reached ? goal.reached.label : "Em andamento";
      goalDetail = goal.next
        ? `Próxima faixa, ${goal.next.label}: ${money(goal.next.targetCents ?? 0)} em peças`
        : "Todas as faixas atingidas";
    }
  }
  return (
    <PortalShell title="Olá. Seja bem-vindo(a)!" eyebrow="Portal do colaborador">
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
          value="0"
          detail={courses?.length ? "Acompanhamento em breve" : "Cursos em breve"}
        />
        <Stat
          icon={Award}
          label="Cursos concluídos"
          value="0"
          detail={courses?.length ? "Acompanhamento em breve" : "Cursos em breve"}
        />
        <Stat icon={Target} label="Meta de peças do mês" value={goalValue} detail={goalDetail} />
        <Stat
          icon={Wallet}
          label="Comissão do mês"
          value={commissionValue}
          detail={commissionDetail}
        />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
        <section>
          <SectionHeading title="Continue aprendendo" action="Ver todos" to="/cursos" />
          {lastCourse ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-sidebar text-primary sm:w-44">
                  <BookOpen size={44} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {lastCourse.level && (
                      <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
                        {lastCourse.level}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{lastCourse.area}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{lastCourse.title}</h3>
                  {lastCourse.description && (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {lastCourse.description}
                    </p>
                  )}
                  <Link
                    to="/cursos"
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Ver curso <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-secondary p-6 text-center">
              <div>
                <BookOpen className="mx-auto text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">Cursos em breve</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Os cursos aparecerão aqui assim que forem publicados.
                </p>
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHeading title="Sua trajetória" action="Ver trajetória" to="/trajetoria" />
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            {years === null ? (
              <p className="text-sm leading-6 text-muted-foreground">
                A data de admissão ainda não foi informada pelo RH. Quando for, sua trajetória
                aparece aqui.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="grid size-16 place-items-center rounded-xl bg-accent text-2xl font-black text-accent-foreground">
                    {years}
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {years} {years === 1 ? "ano" : "anos"} de casa
                    </p>
                    <p className="text-sm text-muted-foreground">Insígnia {tenure.current.name}</p>
                  </div>
                </div>
                {tenure.next && admission && (
                  <p className="mt-5 text-sm leading-6 text-muted-foreground">
                    Próxima insígnia: <strong>{tenure.next.name}</strong>, em{" "}
                    {nextMilestone(admission, tenure.next.years)}.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

function nextMilestone(admission: string, years: number) {
  const [y = 0, m = 1, d = 1] = admission.split("-").map(Number);
  return new Date(y + years, m - 1, d, 12).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
