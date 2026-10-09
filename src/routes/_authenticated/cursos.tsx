import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, LockKeyhole } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/cursos")({
  head: () => ({ meta: [
    { title: "Meus cursos — Portal Natal Pneus" }, { name: "description", content: "Trilhas de capacitação atribuídas ao colaborador Natal Pneus." },
    { property: "og:title", content: "Meus cursos — Portal Natal Pneus" }, { property: "og:description", content: "Capacitação por função, nível e especialidade." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: CursosPage,
});

function CursosPage() {
  const { data } = useQuery({ queryKey: ["courses-employee"], queryFn: async () => {
    const courses = (await supabase.from("courses").select("*").order("created_at", { ascending: false })).data ?? [];
    return { courses, urls: await signedUrls("course-files", courses.map((c) => c.file_path)) };
  } });
  return <PortalShell title="Meus cursos" eyebrow="Academia Natal Pneus">
    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Conteúdos publicados pela Natal Pneus para o seu desenvolvimento.</p>
    <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {data?.courses.length === 0 && <article className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary p-6 text-center"><LockKeyhole className="text-muted-foreground" /><h2 className="mt-4 font-semibold">Nenhum curso publicado ainda</h2><p className="mt-2 text-sm text-muted-foreground">Você verá aqui os cursos assim que forem publicados.</p></article>}
      {data?.courses.map((c) => <article key={c.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between">{c.level ? <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">{c.level}</span> : <span />}<BookOpen className="text-primary" /></div>
        <p className="mt-5 text-xs font-semibold uppercase text-primary">{c.area}</p><h2 className="mt-2 text-lg font-semibold">{c.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          {c.file_path && data.urls[c.file_path] && <a href={data.urls[c.file_path]} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Abrir material</a>}
          {c.video_url && <a href={c.video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Assistir vídeo</a>}
        </div>
      </article>)}
    </div>
  </PortalShell>;
}
