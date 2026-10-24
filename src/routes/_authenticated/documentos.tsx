import { createFileRoute } from "@tanstack/react-router";
import { FileText, Lock } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Meus documentos — Portal Natal Pneus" },
      {
        name: "description",
        content: "Recibos de pagamento, cartão de ponto e recibos de férias enviados pelo RH.",
      },
      { property: "og:title", content: "Meus documentos — Portal Natal Pneus" },
      { property: "og:description", content: "Seus documentos de trabalho enviados pelo RH." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeusDocumentos,
});

const examples = [
  ["Recibo de pagamento", "Outubro de 2026"],
  ["Cartão de ponto", "Outubro de 2026"],
  ["Recibo de férias", "Quando houver"],
];

function MeusDocumentos() {
  return (
    <PortalShell title="Meus documentos" eyebrow="Documentos do RH">
      <section className="relative overflow-hidden rounded-xl border border-border bg-sidebar p-6 text-sidebar-foreground sm:p-8">
        <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
          Em breve
        </span>
        <h2 className="mt-5 max-w-[30ch] text-2xl font-bold text-balance sm:text-3xl">
          Seus recibos e documentos de trabalho, no portal.
        </h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-sidebar-muted">
          O RH vai enviar aqui o seu recibo de pagamento, o cartão de ponto e os recibos de férias.
          Só você e o RH têm acesso. O documento físico continua sendo entregue normalmente.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="como">
        <h2 id="como" className="text-xl font-semibold">
          Como vai aparecer
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {examples.map(([title, when]) => (
            <li
              key={title}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 opacity-80"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                <FileText size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{title}</span>
                <span className="block text-xs text-muted-foreground">{when}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          Ao abrir cada documento você confirma com “Recebi e estou ciente”. A função será liberada
          depois das medidas de segurança e do seu aceite para receber documentos pelo portal.
        </p>
      </section>
    </PortalShell>
  );
}
