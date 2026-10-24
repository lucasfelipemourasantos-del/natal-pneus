import { createFileRoute, redirect } from "@tanstack/react-router";
import { AlertTriangle, CarFront, FileText, Lock, PackageCheck, Warehouse } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

export const Route = createFileRoute("/_authenticated/admin-estoque")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Controle de estoque — Gestão — Natal Pneus" },
      {
        name: "description",
        content: "Conferência entre compras (notas fiscais de entrada) e o destino de cada item.",
      },
      { property: "og:title", content: "Controle de estoque — Gestão — Natal Pneus" },
      { property: "og:description", content: "Compras x destino de cada item: OS ou estoque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminEstoque,
});

const steps = [
  {
    icon: FileText,
    title: "1. Entrada da nota",
    text: "O funcionário dá entrada na nota fiscal de compra no Decision. Cada item entra no estoque da loja.",
  },
  {
    icon: CarFront,
    title: "2. Destino de cada item",
    text: "O portal acompanha para onde cada item foi: para uma OS (com o carro, o modelo e a placa) ou se continua no estoque.",
  },
  {
    icon: PackageCheck,
    title: "3. Conferência automática",
    text: "No fim do dia, ou na manhã seguinte, o portal confere tudo o que foi comprado com o que saiu em OS.",
  },
  {
    icon: AlertTriangle,
    title: "4. Alerta de item parado",
    text: "Item que segue em estoque gera um alerta, para o balanço confirmar se ele está mesmo lá.",
  },
];

/** Illustrative purchase, fictitious data. */
const example = {
  supplier: "Fornecedor Exemplo Autopeças LTDA",
  invoice: "NF 004.512",
  date: "23/10/2026",
  unit: "NP2",
  item: "Pastilha de freio dianteira (cód. 40853)",
  qty: 10,
  minimum: true,
  destinations: [
    {
      kind: "os" as const,
      qty: 2,
      os: "169950",
      car: "Gol 1.6 2015",
      plate: "ABC1D23",
      date: "23/10",
    },
    {
      kind: "os" as const,
      qty: 2,
      os: "169958",
      car: "Onix 1.0 2020",
      plate: "QWE4R56",
      date: "23/10",
    },
    {
      kind: "os" as const,
      qty: 2,
      os: "169971",
      car: "HB20 1.0 2019",
      plate: "RTY7U89",
      date: "24/10",
    },
    { kind: "stock" as const, qty: 4 },
  ],
};

function AdminEstoque() {
  const out = example.destinations.filter((d) => d.kind === "os").reduce((t, d) => t + d.qty, 0);
  const stock = example.qty - out;
  return (
    <PortalShell title="Controle de estoque" eyebrow="Gestão · ADM RH">
      <p className="flex items-start gap-3 rounded-xl border border-border bg-warning-soft p-4 text-sm">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <b>Experimental, em preparação.</b> Começa a funcionar quando a API do Decision liberar as
          compras (notas fiscais de entrada) e os movimentos de estoque. Os dados abaixo são
          ilustrativos.
        </span>
      </p>

      <section className="mt-6" aria-labelledby="como">
        <h2 id="como" className="text-lg font-bold">
          Como funciona
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }) => (
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
        </ol>
      </section>

      <section
        className="mt-6 rounded-xl border border-border bg-card p-5"
        aria-labelledby="exemplo"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="exemplo" className="text-lg font-bold">
            Conferência de compra
          </h2>
          <span className="text-xs text-muted-foreground">
            Exemplo ilustrativo, dados fictícios
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Fornecedor", example.supplier],
            ["Nota fiscal", `${example.invoice} · ${example.date}`],
            ["Loja", example.unit],
            ["Item comprado", `${example.qty} × ${example.item}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div
          className="mt-5"
          role="img"
          aria-label={`${out} de ${example.qty} itens saíram em OS, ${stock} em estoque`}
        >
          <div className="flex h-4 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${(out / example.qty) * 100}%` }} />
            <div className="bg-accent" style={{ width: `${(stock / example.qty) * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" /> Saíram em OS:{" "}
              <b className="text-foreground">{out}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent" /> Em estoque:{" "}
              <b className="text-foreground">{stock}</b>
            </span>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2 font-semibold">Destino</th>
                <th className="px-2 text-right font-semibold">Qtd</th>
                <th className="px-2 font-semibold">OS</th>
                <th className="px-2 font-semibold">Veículo</th>
                <th className="px-2 font-semibold">Placa</th>
                <th className="pl-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {example.destinations.map((d, i) =>
                d.kind === "os" ? (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2.5 pr-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <CarFront size={15} aria-hidden="true" /> Saiu em OS
                      </span>
                    </td>
                    <td className="px-2 text-right tabular-nums">{d.qty}</td>
                    <td className="px-2 tabular-nums">{d.os}</td>
                    <td className="px-2">{d.car}</td>
                    <td className="px-2 tabular-nums">{d.plate}</td>
                    <td className="pl-2 tabular-nums">{d.date}</td>
                  </tr>
                ) : (
                  <tr key={i} className="border-t border-border bg-warning-soft/60">
                    <td className="py-2.5 pr-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Warehouse size={15} aria-hidden="true" /> Em estoque
                      </span>
                    </td>
                    <td className="px-2 text-right tabular-nums">{d.qty}</td>
                    <td className="px-2 text-muted-foreground" colSpan={4}>
                      Aguardando saída · conferir no balanço
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <p className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <AlertTriangle size={16} className="text-primary" aria-hidden="true" />
            <b>Alerta:</b> {stock} itens desta nota seguem em estoque. Conferir no balanço da{" "}
            {example.unit}.
          </p>
          {example.minimum && (
            <p className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-muted-foreground">
              Compra mínima exigida pelo fornecedor: a sobra é esperada, mas continua na
              conferência.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">O que o painel vai trazer</h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>• Todas as compras do dia por loja, com fornecedor e número da nota.</li>
          <li>• Cada item comprado com o destino: OS (carro, modelo e placa) ou estoque.</li>
          <li>• Conferência automática no fim do dia ou na manhã seguinte.</li>
          <li>• Alerta de itens parados em estoque, para o balanço físico.</li>
          <li>• Marcação de compras com quantidade mínima do fornecedor.</li>
          <li>• Itens que saíram por outra loja (transferência) ou devolução ao fornecedor.</li>
        </ul>
      </section>
    </PortalShell>
  );
}
