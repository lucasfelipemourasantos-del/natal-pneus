import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, Clock3, LockKeyhole, Search } from "lucide-react";
import { DemoNotice, PortalShell, ProgressBar } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/cursos")({
  head: () => ({ meta: [
    { title: "Meus cursos — Portal Natal Pneus" }, { name: "description", content: "Trilhas de capacitação atribuídas ao colaborador Natal Pneus." },
    { property: "og:title", content: "Meus cursos — Portal Natal Pneus" }, { property: "og:description", content: "Capacitação por função, nível e especialidade." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: CursosPage,
});

const courses = [
  { title: "Fundamentos de pneus e serviços", area: "Produtos e serviços", level: "Iniciante", progress: 65, status: "Em andamento", lessons: "4 de 6 aulas" },
  { title: "Atendimento que gera confiança", area: "Atendimento", level: "Iniciante", progress: 28, status: "Em andamento", lessons: "2 de 7 aulas" },
  { title: "Integração Natal Pneus", area: "Cultura", level: "Trilha comum", progress: 100, status: "Concluído", lessons: "5 de 5 aulas" },
];

function CursosPage() {
  return <PortalShell title="Meus cursos" eyebrow="Academia Natal Pneus">
    <DemoNotice />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Conteúdos atribuídos à sua função e ao seu momento de desenvolvimento.</p>
      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-muted-foreground sm:w-72"><Search size={18} /><span className="sr-only">Buscar curso</span><input className="w-full bg-transparent text-sm text-foreground outline-none" placeholder="Buscar curso" /></label>
    </div>
    <div className="mt-6 flex flex-wrap gap-2">
      {['Todos','Em andamento','Concluídos','Em preparação'].map((item, i) => <button key={item} className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${i === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}>{item}</button>)}
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => <article key={course.title} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between"><span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">{course.level}</span>{course.progress === 100 ? <CheckCircle2 className="text-success" /> : <Clock3 className="text-primary" />}</div>
        <p className="mt-5 text-xs font-semibold uppercase text-primary">{course.area}</p><h2 className="mt-2 text-lg font-semibold">{course.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{course.status}</p><div className="mt-auto pt-6"><ProgressBar value={course.progress} label={course.lessons} /></div>
      </article>)}
      <article className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary p-6 text-center">
        <span className="grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground"><LockKeyhole /></span><h2 className="mt-4 text-lg font-semibold">Venda consultiva</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Conteúdo em preparação. Você será avisado quando estiver disponível.</p>
      </article>
    </div>
  </PortalShell>;
}