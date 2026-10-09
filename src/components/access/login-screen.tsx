import { useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { homeFor, loadAccess } from "@/lib/access";
import { fieldClass } from "@/lib/portal-data";
export function LoginScreen() {
  const navigate = useNavigate();
  const [recover, setRecover] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const f = new FormData(e.currentTarget);
    try {
      const email = String(f.get("email")).trim();
      if (recover) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/nova-senha",
        });
        if (error) throw error;
        setNotice(
          "Se houver uma conta com este e-mail, enviaremos um link para recuperar a senha.",
        );
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: String(f.get("password")),
      });
      if (error) throw new Error("E-mail ou senha incorretos, ou e-mail ainda não confirmado.");
      const access = await loadAccess();
      if (!access) throw new Error("Não foi possível entrar.");
      await navigate({ to: homeFor(access), replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--foreground)/0.06),transparent_60%)]"
      />
      <div className="relative w-full max-w-[380px]">
        <img src={logoAsset.url} alt="Natal Pneus" className="mx-auto h-auto w-[200px] object-contain" />
        <h1 className="mt-8 text-center text-2xl font-semibold">Portal Natal Pneus</h1>
        {recover && (
          <p className="mt-2 text-center text-sm text-muted-foreground">Recuperar senha</p>
        )}
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={255}
              required
              className={fieldClass}
            />
          </label>
          {!recover && (
            <label className="block text-sm font-medium">
              Senha
              <span className="relative block">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className={fieldClass + " pr-11"}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          )}
          <Button disabled={busy} className="min-h-11 w-full shadow-none">
            {busy ? "Aguarde…" : recover ? "Enviar link" : "Entrar"}
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="link"
            className="min-h-11 px-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setRecover(!recover);
              setError("");
              setNotice("");
            }}
          >
            {recover ? "Voltar para entrar" : "Esqueci minha senha"}
          </Button>
          <Button asChild variant="link" className="min-h-11 px-0 text-muted-foreground hover:text-foreground">
            <Link to="/cadastro">Criar cadastro</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
