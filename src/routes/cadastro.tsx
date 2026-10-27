import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/natal-pneus-logo.png";
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
/** "72, 206" -> [72, 206] */
function parseCodes(text: string) {
  return [
    ...new Set(
      text
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ]
    .filter((n) => Number.isInteger(n) && n > 0 && n < 1_000_000)
    .slice(0, 5);
}

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
      const { data: signed, error } = await supabase.auth.signUp({
        email: String(f.get("email")).trim().toLowerCase(),
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
      if (signed.session) {
        const codes = parseCodes(String(f.get("decision_codes") ?? ""));
        if (codes.length) {
          // Never blocks the signup: anything not confirmed here is decided by the RH.
          await supabase.rpc("claim_decision_codes", { _codes: codes });
        }
        window.location.assign("/aguardando");
        return;
      }
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
        <img src={logo} alt="Natal Pneus" className="h-auto w-[175px]" />
        <h1 className="mt-8 text-2xl font-semibold">Criar cadastro</h1>
        {done ? (
          <div className="mt-6">
            <p role="status" className="text-success">
              Cadastro enviado. Entre com seu e-mail e senha para acompanhar a liberação pelo RH.
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
                  <option value="">
                    {job ? "Selecione a unidade" : "Escolha a função primeiro"}
                  </option>
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
              Código no Decision (vendedores e operadores)
              <input
                name="decision_codes"
                inputMode="numeric"
                maxLength={30}
                placeholder="Ex.: 207"
                className={fieldClass}
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                É o mesmo código das suas comissões. Se tiver mais de um, separe por vírgula. O
                sistema confere com o seu nome completo; se não bater, o RH confirma.
              </span>
            </label>
            <label className="block text-sm font-medium">
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
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
