import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { catalogOptions, fieldClass } from "@/lib/portal-data";
import { supabase } from "@/integrations/supabase/client";
const sectorsOptions = queryOptions({
  queryKey: ["sectors"],
  queryFn: async () => {
    const r = await supabase.from("sectors").select("*").order("name");
    if (r.error) throw r.error;
    return r.data;
  },
});
export const Route = createFileRoute("/_authenticated/unidades")({
  beforeLoad: ({ context }) => {
    if (!context.access.canReadAll) throw redirect({ to: "/inicio" });
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogOptions),
      context.queryClient.ensureQueryData(sectorsOptions),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Lojas, setores e funções — Natal Pneus" },
      { name: "description", content: "Identificação das quatro lojas e organização das funções." },
      { property: "og:title", content: "Lojas, setores e funções — Natal Pneus" },
      {
        property: "og:description",
        content: "Identificação das quatro lojas e organização das funções.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Units,
});
function Units() {
  const { access } = Route.useRouteContext();
  const { data } = useSuspenseQuery(catalogOptions);
  const { data: sectors } = useSuspenseQuery(sectorsOptions);
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>, type: "unit" | "job" | "sector", id?: string) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const r =
      type === "unit"
        ? await supabase
            .from("units")
            .update({
              legal_name: String(f.get("legal_name")),
              cnpj: String(f.get("cnpj")),
              state_registration: String(f.get("state_registration")),
              address: String(f.get("address")),
              postal_code: String(f.get("postal_code")),
            })
            .eq("code", id ?? "")
        : type === "job"
          ? id
            ? await supabase
                .from("job_functions")
                .update({ name: String(f.get("name")) })
                .eq("id", id)
            : await supabase.from("job_functions").insert({ name: String(f.get("name")) })
          : id
            ? await supabase
                .from("sectors")
                .update({ name: String(f.get("name")) })
                .eq("id", id)
            : await supabase
                .from("sectors")
                .insert({ name: String(f.get("name")), unit_code: String(f.get("unit")) });
    if (r.error) setError("Não foi possível salvar. Verifique os dados e possíveis duplicidades.");
    else {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["portal-catalog"] }),
        qc.invalidateQueries({ queryKey: ["sectors"] }),
      ]);
      if (!id) form.reset();
    }
    setBusy(false);
  }
  return (
    <PortalShell
      title="Lojas, setores e funções"
      eyebrow={access.isAdmin ? "ADM RH" : "Consulta · somente leitura"}
    >
      {error && (
        <p role="alert" className="mb-4 text-destructive">
          {error}
        </p>
      )}
      <section className="grid gap-5 md:grid-cols-2">
        {data.units.map((u) => (
          <article key={u.code} className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xl font-semibold">
              Natal Pneus{" "}
              <span className="text-sm font-normal text-muted-foreground">{u.code}</span>
            </h2>
            <form onSubmit={(e) => save(e, "unit", u.code)} className="mt-4 space-y-3">
              {(
                [
                  ["legal_name", "Razão social"],
                  ["cnpj", "CNPJ"],
                  ["state_registration", "Inscrição estadual"],
                  ["address", "Endereço"],
                  ["postal_code", "CEP"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-xs text-muted-foreground">
                  {label}
                  <input
                    name={key}
                    required
                    maxLength={250}
                    readOnly={!access.isAdmin}
                    defaultValue={u[key]}
                    className={fieldClass}
                  />
                </label>
              ))}
              {access.isAdmin && (
                <Button disabled={busy} type="submit" variant="outline" className="mt-3">
                  Salvar {u.code}
                </Button>
              )}
            </form>
          </article>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Funções</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.jobs.map((j) => (
            <form
              key={j.id}
              onSubmit={(e) => save(e, "job", j.id)}
              className="flex items-center gap-2"
            >
              <input
                aria-label={`Função ${j.name}`}
                name="name"
                maxLength={100}
                required
                readOnly={!access.isAdmin}
                defaultValue={j.name}
                className={fieldClass}
              />
              {access.isAdmin && (
                <Button variant="outline" disabled={busy}>
                  Salvar
                </Button>
              )}
            </form>
          ))}
        </div>
        {access.isAdmin && (
          <form onSubmit={(e) => save(e, "job")} className="mt-4 flex max-w-md items-center gap-2">
            <input
              name="name"
              aria-label="Nova função"
              maxLength={100}
              required
              placeholder="Nova função"
              className={fieldClass}
            />
            <Button disabled={busy}>Adicionar</Button>
          </form>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Setores</h2>
        {!sectors.length && <p className="mt-3 text-muted-foreground">Nenhum setor cadastrado.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sectors.map((s) => (
            <form
              key={s.id}
              onSubmit={(e) => save(e, "sector", s.id)}
              className="flex items-center gap-2"
            >
              <span className="text-xs">{s.unit_code}</span>
              <input
                name="name"
                aria-label={`Setor ${s.name}`}
                maxLength={100}
                required
                readOnly={!access.isAdmin}
                defaultValue={s.name}
                className={fieldClass}
              />
              {access.isAdmin && (
                <Button variant="outline" disabled={busy}>
                  Salvar
                </Button>
              )}
            </form>
          ))}
        </div>
        {access.isAdmin && (
          <form
            onSubmit={(e) => save(e, "sector")}
            className="mt-4 flex max-w-lg flex-wrap items-center gap-2"
          >
            <select
              name="unit"
              aria-label="Unidade do novo setor"
              required
              className={fieldClass + " w-auto"}
            >
              {data.units.map((u) => (
                <option key={u.code}>{u.code}</option>
              ))}
            </select>
            <input
              name="name"
              aria-label="Novo setor"
              required
              maxLength={100}
              placeholder="Novo setor"
              className={fieldClass + " flex-1"}
            />
            <Button disabled={busy}>Adicionar</Button>
          </form>
        )}
      </section>
    </PortalShell>
  );
}
