import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, UserRound } from "lucide-react";

import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar no portal — Natal Pneus" },
      { name: "description", content: "Acesso ao portal do colaborador e à área administrativa da Natal Pneus." },
      { property: "og:title", content: "Entrar no portal — Natal Pneus" },
      { property: "og:description", content: "Acesso ao portal do colaborador e à área administrativa da Natal Pneus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-3xl text-center">
        <img src={logoAsset.url} alt="Natal Pneus" className="mx-auto h-auto w-[200px]" />
        <h1 className="mt-8 text-3xl font-bold sm:text-4xl">Portal do colaborador</h1>
        <p className="mt-3 text-muted-foreground">Escolha como deseja entrar.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link to="/auth" search={{ perfil: "funcionario" }} className="rounded-xl border border-border bg-card p-6 text-left shadow-[var(--shadow-card)] transition-colors hover:border-primary">
            <UserRound className="text-primary" size={28} aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold">Sou funcionário</h2>
            <p className="mt-1 text-sm text-muted-foreground">Entre ou solicite seu cadastro para acessar cursos, metas e trajetória.</p>
          </Link>
          <Link to="/auth" search={{ perfil: "admin" }} className="rounded-xl border border-border bg-card p-6 text-left shadow-[var(--shadow-card)] transition-colors hover:border-primary">
            <ShieldCheck className="text-accent" size={28} aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold">Sou administrador</h2>
            <p className="mt-1 text-sm text-muted-foreground">Aprove cadastros e gerencie o acesso dos colaboradores.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
