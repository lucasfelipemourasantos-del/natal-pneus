import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { homeFor, loadAccess } from "@/lib/access";

export const Route = createFileRoute("/aguardando")({
  ssr: false,
  beforeLoad: async () => {
    const access = await loadAccess();
    if (!access) throw redirect({ to: "/auth", search: { perfil: "funcionario" } });
    if (homeFor(access) !== "/aguardando") throw redirect({ to: homeFor(access) });
    return { access };
  },
  head: () => ({
    meta: [
      { title: "Status do cadastro — Natal Pneus" },
      { name: "description", content: "Acompanhe a aprovação do seu acesso ao portal Natal Pneus." },
      { property: "og:title", content: "Status do cadastro — Natal Pneus" },
      { property: "og:description", content: "Acompanhe a aprovação do seu acesso ao portal Natal Pneus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Waiting,
});

function Waiting() {
  const { access } = Route.useRouteContext();
  const navigate = useNavigate();
  const p = access.profile;
  const suspended = p?.status === "suspended";
  const rejected = p?.status === "rejected";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <img src={logoAsset.url} alt="Natal Pneus" className="h-auto w-[150px]" />
        <h1 className="mt-6 text-xl font-bold">{suspended ? "Acesso suspenso" : rejected ? "Cadastro não aprovado" : "Pendente de aprovação"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rejected ? "Seu pedido não foi aprovado. Entre em contato com o RH." : suspended
            ? "Seu acesso foi suspenso. Procure o administrador da sua unidade."
            : "O administrador recebeu seu pedido e vai liberar seu acesso em breve."}
        </p>
        <dl className="mt-5 space-y-2 text-sm">
          {[["Nome", p?.full_name], ["E-mail", p?.email], ["Telefone", p?.phone]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border pb-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
          ))}
        </dl>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { perfil: "funcionario" }, replace: true }); }}
          className="mt-6 min-h-11 w-full rounded-lg border border-border text-sm font-semibold hover:bg-muted"
        >Sair</button>
      </div>
    </main>
  );
}
