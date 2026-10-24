import { createFileRoute } from "@tanstack/react-router";
import { CarFront, CheckCircle2, Mic, Package, ShieldCheck, UserRound } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/abrir-os")({
  head: () => ({
    meta: [
      { title: "Abrir OS por voz — Portal Natal Pneus" },
      {
        name: "description",
        content:
          "Abertura de ordem de serviço no Decision por comando de voz, para o vendedor externo.",
      },
      { property: "og:title", content: "Abrir OS por voz — Portal Natal Pneus" },
      { property: "og:description", content: "Abertura de OS por voz, integrada ao Decision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbrirOs,
});

const steps = [
  {
    icon: UserRound,
    title: "Cliente",
    text: "Nome completo, CPF, telefone e e-mail. Pelo CEP o endereço vem sozinho; só o número é pedido. Se o cliente já existir no Decision, essa etapa é pulada.",
  },
  {
    icon: CarFront,
    title: "Veículo",
    text: "Placa, modelo e ano. Se a placa já estiver cadastrada, os dados aparecem prontos.",
  },
  {
    icon: Package,
    title: "Produtos e serviços",
    text: "O vendedor diz o que o cliente vai levar; o portal procura no cadastro do Decision e lê as opções para ele escolher.",
  },
  {
    icon: ShieldCheck,
    title: "Conferência",
    text: "Tudo é lido em voz alta e mostrado na tela. Nada vai para o Decision sem a confirmação do vendedor.",
  },
  {
    icon: CheckCircle2,
    title: "OS aberta",
    text: "O Decision abre a OS oficial e o portal informa o número. O vendedor só repassa esse número ao supervisor da loja.",
  },
];

function AbrirOs() {
  return (
    <PortalShell title="Abrir OS por voz" eyebrow="Vendedor externo">
      <section className="relative overflow-hidden rounded-xl border border-border bg-sidebar p-6 text-sidebar-foreground sm:p-8">
        <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
          Em breve
        </span>
        <h2 className="mt-5 max-w-[28ch] text-2xl font-bold text-balance sm:text-3xl">
          Abra a ordem de serviço falando, de onde estiver.
        </h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-sidebar-muted">
          O portal conduz a abertura passo a passo, no mesmo padrão do Decision: ele pergunta, o
          vendedor responde por voz e, ao final, recebe o número da OS oficial. Sem precisar ligar
          para a loja.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex min-h-12 cursor-not-allowed items-center gap-2 rounded-full bg-primary/40 px-6 text-sm font-semibold text-primary-foreground"
          >
            <Mic size={18} aria-hidden="true" /> Iniciar abertura por voz
          </button>
          <span className="text-xs text-sidebar-muted">
            Disponível após a liberação da integração de abertura de OS no Decision.
          </span>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="text-xl font-semibold">
          Como vai funcionar
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Passo {i + 1}
                </span>
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Exemplo de conversa</h2>
        <div className="mt-4 space-y-2 text-sm">
          {[
            ["Portal", "Qual o CPF do cliente?"],
            ["Vendedor", "Um dois três, quatro cinco seis, sete oito nove, zero zero."],
            [
              "Portal",
              "CPF 123.456.789-00. Cliente João da Silva encontrado. Qual a placa do carro?",
            ],
            ["Vendedor", "ABC um D dois três."],
            ["Portal", "Placa ABC1D23, Gol 2015. Quais produtos e serviços?"],
            ["Vendedor", "Quatro pneus 175 70 aro 14, alinhamento e balanceamento."],
            ["Portal", "Confere a OS? … OS aberta. Número 169942."],
          ].map(([who, text], i) => (
            <p
              key={i}
              className={`max-w-[46ch] rounded-xl px-4 py-2 ${who === "Portal" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"}`}
            >
              <b className="mr-1">{who}:</b>
              {text}
            </p>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Exemplo ilustrativo. Dados fictícios.</p>
      </section>
    </PortalShell>
  );
}
