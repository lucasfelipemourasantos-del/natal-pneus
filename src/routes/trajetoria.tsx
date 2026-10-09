import { createFileRoute } from "@tanstack/react-router";
import { Award, BookOpen, CalendarHeart, Star } from "lucide-react";
import { DemoNotice, PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/trajetoria")({ head: () => ({ meta: [
  { title: "Minha trajetória — Portal Natal Pneus" }, { name: "description", content: "Marcos, conquistas e tempo de empresa do colaborador." },
  { property: "og:title", content: "Minha trajetória — Portal Natal Pneus" }, { property: "og:description", content: "Reconhecimento da história de cada colaborador." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
] }), component: TrajetoriaPage });

function TrajetoriaPage() { return <PortalShell title="Minha trajetória" eyebrow="Reconhecimento">
  <DemoNotice />
  <section className="overflow-hidden rounded-xl bg-foreground p-6 text-card sm:p-8"><div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center"><div className="grid size-36 place-items-center rounded-xl bg-accent text-5xl font-black text-accent-foreground"><span className="relative">AM<span className="absolute -right-5 -top-5 text-primary"><Star fill="currentColor" size={28} /></span></span></div><div><p className="text-sm font-bold uppercase text-accent">Desde 18 de março de 2023</p><h2 className="mt-3 text-3xl font-bold">3 anos construindo essa história</h2><p className="mt-3 max-w-xl text-sm leading-6 text-sidebar-muted">Cada marco representa um ano completo de dedicação à Natal Pneus.</p></div></div></section>
  <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
    <section><h2 className="text-xl font-semibold">Linha do tempo</h2><div className="mt-5 space-y-0">
      {[['2026','3 anos de Natal Pneus','Terceiro marco anual conquistado.',Award],['2025','2 anos de história','Segundo marco anual conquistado.',CalendarHeart],['2024','Primeiro ano completo','Seu primeiro marco na empresa.',Star],['2023','Início da jornada','Entrada validada em 18 de março.',BookOpen]].map(([year,title,desc,Icon],i)=><div key={String(year)} className="grid grid-cols-[48px_1fr] gap-4"><div className="flex flex-col items-center"><span className={`grid size-11 place-items-center rounded-lg ${i===0?'bg-primary text-primary-foreground':'bg-accent text-accent-foreground'}`}><Icon size={20}/></span>{i<3&&<span className="h-full w-px bg-border"/>}</div><div className="pb-8"><p className="text-xs font-bold text-primary">{year}</p><h3 className="mt-1 font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div></div>)}
    </div></section>
    <section><h2 className="text-xl font-semibold">Conquistas de aprendizagem</h2><div className="mt-5 space-y-3">{[['Primeira trilha concluída','Integração Natal Pneus concluída',BookOpen],['Explorador do conhecimento','6 cursos concluídos',Award]].map(([title,desc,Icon])=><div key={String(title)} className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-card"><span className="grid size-12 place-items-center rounded-lg bg-warning-soft"><Icon size={22}/></span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{desc}</p></div></div>)}<div className="rounded-xl border border-dashed border-border bg-secondary p-5"><p className="font-semibold">Próxima conquista</p><p className="mt-1 text-sm text-muted-foreground">Conclua uma trilha intermediária para desbloquear.</p></div></div></section>
  </div>
</PortalShell> }