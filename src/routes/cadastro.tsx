import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";
import { catalogOptions, fieldClass } from "@/lib/portal-data";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth-flow";
export const Route = createFileRoute("/cadastro")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogOptions),
  head: () => ({
    meta: [
      { title: "Criar cadastro — Natal Pneus" },
      { name: "description", content: "Solicite seu acesso por unidade e função." },
      { property: "og:title", content: "Criar cadastro — Natal Pneus" },
      { property: "og:description", content: "Solicite seu acesso por unidade e função." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Signup,
});
function Signup() {
  const { data } = useSuspenseQuery(catalogOptions);
  const [unit, setUnit] = useState("");
  const [job, setJob] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const allStores = Boolean(data.jobs.find((j) => j.name === job)?.all_stores);
  const store = allStores ? undefined : data.units.find((u) => u.code === unit);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!job) return setError("Selecione a função.");
    if (!allStores && !store) return setError("Selecione a unidade.");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const { error } = await supabase.auth.signUp({
        email: String(f.get("email")).trim(),
        password: String(f.get("password")),
        options: {
          emailRedirectTo: window.location.origin + "/confirmar-email",
          data: {
            full_name: String(f.get("full_name")).trim(),
            unit_code: allStores ? "ALL" : unit,
            job_role: job,
          },
        },
      });
      if (error) throw new Error(authErrorMessage(error, "signup"));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível solicitar o cadastro.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <img src={logoAsset.url} alt="Natal Pneus" className="h-auto w-[175px]" />
        <h1 className="mt-8 text-2xl font-semibold">Criar cadastro</h1>
        {done ? (
          <div className="mt-6">
            <p role="status" className="text-success">
              Cadastro enviado. Confirme seu e-mail pelo link recebido e entre para acompanhar seu
              acesso.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/">Voltar para entrar</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Função exercida ou que irá exercer
              <select
                name="job_role"
                required
                value={job}
                onChange={(e) => {
                  setJob(e.target.value);
                  setUnit("");
                }}
                className={fieldClass}
              >
                <option value="">Selecione a função</option>
                {data.jobs.map((j) => (
                  <option key={j.id} value={j.name}>
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Unidade
              {allStores ? (
                <input
                  readOnly
                  aria-readonly
                  value="Todas as lojas — NP1, NP2, NP3 e NP4"
                  className={fieldClass + " cursor-not-allowed opacity-80"}
                />
              ) : (
                <select
                  required
                  disabled={!job}
                  name="unit_code"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className={fieldClass + " disabled:opacity-60"}
                >
                  <option value="">{job ? "Selecione a unidade" : "Escolha a função primeiro"}</option>
                  {data.units.map((u) => (
                    <option key={u.code} value={u.code}>
                      Natal Pneus · {u.code}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {store && (
              <div className="border-l-2 border-primary pl-3">
                <p className="font-semibold">
                  Natal Pneus{" "}
                  <span className="text-xs font-normal text-muted-foreground">{store.code}</span>
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {store.legal_name}
                  <br />
                  CNPJ {store.cnpj}
                </p>
              </div>
            )}
            <label className="block text-sm font-medium">
              Nome completo
              <input
                name="full_name"
                autoComplete="name"
                minLength={3}
                maxLength={200}
                required
                className={fieldClass}
              />
            </label>
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
            <label className="block text-sm font-medium">
              Senha
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                className={fieldClass}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} className="min-h-11 w-full">
              {busy ? "Enviando…" : "Solicitar cadastro"}
            </Button>
            <Button asChild variant="link" className="w-full">
              <Link to="/">Já tenho conta — entrar</Link>
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
