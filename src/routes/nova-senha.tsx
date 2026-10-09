import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/lib/portal-data";
import { authErrorMessage, resolveEmailLink } from "@/lib/auth-flow";
export const Route = createFileRoute("/nova-senha")({
  head: () => ({
    meta: [
      { title: "Nova senha — Natal Pneus" },
      { name: "description", content: "Redefina sua senha de acesso." },
      { property: "og:title", content: "Nova senha — Natal Pneus" },
      { property: "og:description", content: "Redefina sua senha de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});
function Reset() {
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    resolveEmailLink(true).then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setError("O link expirou ou já foi utilizado. Solicite um novo link de recuperação.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("As senhas não coincidem.");
      setBusy(false);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: String(f.get("password")) });
      if (error) setError(authErrorMessage(error, "reset"));
      else {
        setDone(true);
        setReady(false);
        await supabase.auth.signOut();
      }
    } catch {
      setError("Não foi possível conectar. Tente salvar novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Nova senha</h1>
        {done ? (
          <p role="status" className="mt-5 text-success">
            Senha atualizada.
          </p>
        ) : ready ? (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-sm">
              Nova senha
              <input
                required
                minLength={8}
                name="password"
                type="password"
                autoComplete="new-password"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              Confirme a senha
              <input
                required
                name="confirm"
                type="password"
                autoComplete="new-password"
                className={fieldClass}
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} className="w-full">
              Salvar senha
            </Button>
          </form>
        ) : (
          <p className="mt-5 text-muted-foreground">
            {checking ? "Verificando link…" : error || "Abra o link de recuperação recebido por e-mail."}
          </p>
        )}
        <Button asChild variant="link" className="mt-4 px-0">
          <Link to="/">Voltar para entrar</Link>
        </Button>
      </div>
    </main>
  );
}
