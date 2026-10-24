import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight, BadgePercent, BellRing, Lock, UserPlus } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/admin-alertas")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Alertas de clientes — Gestão — Natal Pneus" },
      {
        name: "description",
        content:
          "Alertas de novos clientes de atacado e de mudanças de tipo de cliente no Decision.",
      },
      { property: "og:title", content: "Alertas de clientes — Gestão — Natal Pneus" },
      {
        property: "og:description",
        content: "Alertas de mudanças de tipo de cliente no Decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAlertas,
});

const rules = [
  {
    icon: UserPlus,
    title: "Novo cliente de atacado",
    text: "Todo cliente cadastrado como atacado gera um alerta.",
  },
  { icon: ArrowRight, title: "Varejo → Frota", text: "Cliente que passou de varejo para frota." },
  {
    icon: ArrowRight,
    title: "Varejo → Atacado",
    text: "Cliente que passou de varejo para atacado.",
  },
  { icon: ArrowRight, title: "Frota → Atacado", text: "Cliente que passou de frota para atacado." },
  {
    icon: BadgePercent,
    title: "Desconto acima do limite",
    text: "Item vendido com desconto maior que o limite permitido ao vendedor.",
  },
];

const examples = [
  [
    "24/10 · 11:20",
    "Desconto de 18% (limite 10%)",
    "OS 169950 · Pneu 205/55R16",
    "NP3",
    "Vendedor 105",
  ],
  [
    "24/10 · 10:42",
    "Novo cliente de atacado",
    "Cód. 58213 · Transportes Exemplo LTDA",
    "NP2",
    "Vendedor 111",
  ],
  ["24/10 · 09:15", "Varejo → Atacado", "Cód. 40177 · Cliente Exemplo", "NP1", "Vendedor 36"],
  ["23/10 · 16:03", "Varejo → Frota", "Cód. 39920 · Locadora Exemplo", "NP4", "Vendedor 185"],
];

function AdminAlertas() {
  return (
    <PortalShell title="Alertas de clientes" eyebrow="Gestão · ADM RH">
      <p className="flex items-start gap-3 rounded-xl border border-border bg-warning-soft p-4 text-sm">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <b>Em preparação.</b> Os alertas começam a funcionar quando a API do Decision liberar os
          dados de clientes (tipo varejo, frota ou atacado e as alterações) e o limite de desconto
          de cada vendedor estiver definido. Os exemplos abaixo são ilustrativos.
        </span>
      </p>

      <section className="mt-6" aria-labelledby="regras">
        <h2 id="regras" className="text-lg font-bold">
          O que gera alerta
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {rules.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="font-semibold">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-[75ch] text-sm text-muted-foreground">
          Cada alerta traz o <b className="text-foreground">código do cliente</b>, a loja, quando
          aconteceu e, se o Decision informar, quem fez o cadastro ou a alteração, para você
          verificar o que aconteceu.
        </p>
      </section>

      <section
        className="mt-6 rounded-xl border border-border bg-card p-5"
        aria-labelledby="exemplos"
      >
        <h2 id="exemplos" className="inline-flex items-center gap-2 text-lg font-bold">
          <BellRing size={18} className="text-primary" aria-hidden="true" /> Alertas recentes
          <span className="text-xs font-normal text-muted-foreground">
            (exemplo ilustrativo, dados fictícios)
          </span>
        </h2>
        <div className="mt-3 overflow-x-auto opacity-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Quando</th>
                <th className="px-2 font-semibold">Alerta</th>
                <th className="px-2 font-semibold">Cliente</th>
                <th className="px-2 font-semibold">Loja</th>
                <th className="pl-2 font-semibold">Feito por</th>
              </tr>
            </thead>
            <tbody>
              {examples.map((r) => (
                <tr key={r.join("|")} className="border-t border-border">
                  <td className="whitespace-nowrap py-2.5 pr-2 tabular-nums">{r[0]}</td>
                  <td className="whitespace-nowrap px-2 font-semibold">{r[1]}</td>
                  <td className="min-w-48 px-2">{r[2]}</td>
                  <td className="px-2">{r[3]}</td>
                  <td className="whitespace-nowrap pl-2 text-muted-foreground">{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Os alertas também poderão aparecer no sininho do topo e, se desejado, chegar por e-mail.
        </p>
      </section>
    </PortalShell>
  );
}
