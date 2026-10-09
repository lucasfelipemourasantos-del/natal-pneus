import { createFileRoute } from "@tanstack/react-router";
import { Award, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { completeYears, tenureStatus, TENURE_BADGES } from "@/lib/tenure";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls } from "@/lib/files";

function MyBadges() {
  const { data } = useQuery({ queryKey: ["my-badges"], queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const rows = (await supabase.from("employee_badges").select("awarded_at, badges(name, description, image_path)").eq("user_id", u.user?.id ?? "").order("awarded_at", { ascending: false })).data ?? [];
    return { rows, urls: await signedUrls("badges", rows.map((r) => r.badges?.image_path ?? null)) };
  } });
  return <section className="mb-8"><h2 className="text-xl font-semibold">Reconhecimentos especiais</h2>
    {data?.rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhum reconhecimento especial ainda.</p>}
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{data?.rows.map((r, i) => { const b = r.badges; if (!b) return null; return <div key={i} className="flex flex-col items-center rounded-xl border border-border bg-card p-4 text-center"><div className="grid size-20 place-items-center rounded-full bg-muted ring-2 ring-accent">{b.image_path && data.urls[b.image_path] ? <img src={data.urls[b.image_path]} alt={b.name} className="size-16 object-contain" /> : <Award className="text-accent" />}</div><p className="mt-2 text-sm font-semibold">{b.name}</p><p className="text-xs text-muted-foreground">{new Date(r.awarded_at).toLocaleDateString("pt-BR")}</p></div>; })}</div>
  </section>;
}

export const Route = createFileRoute("/_authenticated/trajetoria")({ head: () => ({ meta: [
  { title: "Minha trajetória — Portal Natal Pneus" }, { name: "description", content: "Marcos, conquistas e tempo de empresa do colaborador." },
  { property: "og:title", content: "Minha trajetória — Portal Natal Pneus" }, { property: "og:description", content: "Reconhecimento da história de cada colaborador." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
] }), component: TrajetoriaPage });

function TrajetoriaPage() {
  const { access } = Route.useRouteContext();
  const admission = access.profile?.admission_date;
  const years = admission ? completeYears(admission) : null;
  const t = tenureStatus(years ?? 0);
  return <PortalShell title="Minha trajetória" eyebrow="Insígnias de fidelidade">
    <section className="overflow-hidden rounded-xl border border-border bg-sidebar p-6 text-sidebar-foreground sm:p-8">
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex flex-col items-center">
          <img src={t.current.img} alt={`Insígnia ${t.current.name}`} className="size-44 drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]" />
          <div className="mt-2 flex h-6 gap-1 text-accent" aria-label={`${t.stars} estrela(s)`}>{Array.from({ length: t.stars }).map((_, i) => <Star key={i} fill="currentColor" size={22} />)}</div>
        </div>
        <div>
          <p className="text-sm font-bold uppercase text-accent">{admission ? `Desde ${new Date(admission + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}` : "Data de admissão ainda não informada pelo RH"}</p>
          <h2 className="mt-3 text-3xl font-bold">{t.current.name}{years !== null && <span className="text-sidebar-muted"> · {years} {years === 1 ? "ano" : "anos"} de casa</span>}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-sidebar-muted">{t.current.text}</p>
          {t.next && years !== null && <p className="mt-4 text-sm">Próxima insígnia: <strong>{t.next.name}</strong> em {t.next.years - years} {t.next.years - years === 1 ? "ano" : "anos"}.</p>}
        </div>
      </div>
    </section>
    <section className="mt-8"><h2 className="text-xl font-semibold">Todas as insígnias</h2>
      <p className="mt-1 text-sm text-muted-foreground">Cada estrela representa um ano completo após o marco. Na troca de nível, a contagem recomeça.</p>
      <div className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
        {TENURE_BADGES.map((b) => { const got = years !== null && b.years <= years; return <div key={b.years} className="flex flex-col items-center text-center"><img src={b.img} alt={b.name} className={`size-20 ${got ? "" : "opacity-25 grayscale"}`} /><p className="mt-2 text-xs font-bold">{b.years} {b.years === 1 ? "ANO" : "ANOS"}</p><p className="text-xs text-muted-foreground">{b.name}</p></div>; })}
      </div>
    </section>
    <div className="mt-8"><MyBadges /></div>
  </PortalShell>;
}
