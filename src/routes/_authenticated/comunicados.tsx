import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellOff } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { AttachmentLink, CategoryTag } from "@/components/announcements";
import { myAnnouncementsOptions, periodLabel } from "@/lib/announcements";

export const Route = createFileRoute("/_authenticated/comunicados")({
  head: () => ({
    meta: [
      { title: "Comunicados — Portal Natal Pneus" },
      { name: "description", content: "Comunicados do RH da Natal Pneus em vigor." },
      { property: "og:title", content: "Comunicados — Portal Natal Pneus" },
      { property: "og:description", content: "Comunicados do RH em vigor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Comunicados,
});

function Comunicados() {
  const { access } = Route.useRouteContext();
  const { data, isPending } = useQuery(myAnnouncementsOptions(access.userId));
  const items = data?.items ?? [];
  return (
    <PortalShell title="Comunicados" eyebrow="Recados do RH">
      {isPending ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : !items.length ? (
        <section className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <BellOff className="text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">Nenhum comunicado em vigor</h2>
          <p className="mt-2 text-sm text-muted-foreground">Os comunicados do RH aparecem aqui.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <article key={a.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <CategoryTag category={a.category} />
                <span className="text-xs text-muted-foreground">{periodLabel(a)}</span>
              </div>
              <h2 className="text-lg font-bold text-balance">{a.title}</h2>
              <p className="max-w-[75ch] whitespace-pre-wrap text-sm leading-6">{a.body}</p>
              <AttachmentLink a={a} />
            </article>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
