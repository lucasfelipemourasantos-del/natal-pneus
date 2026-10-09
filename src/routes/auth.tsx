import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { homeFor, loadAccess } from "@/lib/access";

type Perfil = "funcionario" | "admin";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { perfil: Perfil } => ({
    perfil: s["perfil"] === "admin" ? "admin" : "funcionario",
  }),
  head: () => ({
    meta: [
      { title: "Acesso — Natal Pneus" },
      { name: "description", content: "Entre no portal Natal Pneus como funcionário ou administrador." },
      { property: "og:title", content: "Acesso — Natal Pneus" },
      { property: "og:description", content: "Entre no portal Natal Pneus como funcionário ou administrador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const input = "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary";

function AuthPage() {
  const { perfil } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"entrar" | "cadastro">("entrar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = perfil === "admin";
  const signup = mode === "cadastro";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    try {
      if (signup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/aguardando",
            data: {
              full_name: f.get("full_name"),
              phone: f.get("phone"),
            },
          },
        });
        if (error) throw error;
        setNotice("Cadastro enviado. Confirme seu e-mail pelo link que enviamos; depois o administrador aprovará seu acesso.");
        setMode("entrar");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("E-mail ou senha incorretos, ou e-mail ainda não confirmado.");
      const access = await loadAccess();
      if (!access) throw new Error("Não foi possível entrar.");
      if (isAdmin && !access.isAdmin) {
        await supabase.auth.signOut();
        throw new Error("Esta conta não tem permissão de administrador.");
      }
      navigate({ to: homeFor(access), replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md">
        <Link to="/" className="block"><img src={logoAsset.url} alt="Natal Pneus" className="mx-auto h-auto w-[170px]" /></Link>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
            <Link to="/auth" search={{ perfil: "funcionario" }} className={`rounded-md py-2 text-center ${!isAdmin ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Funcionário</Link>
            <Link to="/auth" search={{ perfil: "admin" }} className={`rounded-md py-2 text-center ${isAdmin ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Administrador</Link>
          </div>
          {(
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setMode("entrar"); setError(null); }} className={`min-h-10 rounded-lg border text-sm font-semibold ${!signup ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Entrar</button>
              <button type="button" onClick={() => { setMode("cadastro"); setError(null); setNotice(null); }} className={`min-h-10 rounded-lg border text-sm font-semibold ${signup ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Criar login</button>
            </div>
          )}
          <h1 className="mt-6 text-xl font-bold">
            {signup ? "Criar login" : isAdmin ? "Login do administrador" : "Login do funcionário"}
          </h1>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {signup && (
              <>
                <label className="block text-sm font-medium">Nome completo<input name="full_name" required className={input} /></label>
                <label className="block text-sm font-medium">Telefone<input name="phone" type="tel" required autoComplete="tel" placeholder="(84) 90000-0000" className={input} /></label>
              </>
            )}
            <label className="block text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" className={input} /></label>
            <label className="block text-sm font-medium">Senha<input name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className={input} /></label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p className="rounded-lg bg-success-soft p-3 text-sm text-success">{notice}</p>}
            <button disabled={busy} className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? "Aguarde…" : signup ? "Criar login" : "Entrar"}
            </button>
          </form>
          {(
            <button type="button" onClick={() => { setMode(signup ? "entrar" : "cadastro"); setError(null); }} className="mt-4 w-full text-center text-sm font-semibold text-primary hover:underline">
              {signup ? "Já tenho login — entrar" : "Não tem login? Criar login"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
