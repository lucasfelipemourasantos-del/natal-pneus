import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls, uploadFile } from "@/lib/files";

export const Route = createFileRoute("/_authenticated/admin-insignias")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Insígnias — Natal Pneus" },
      { name: "description", content: "Cadastre as insígnias entregues aos colaboradores." },
      { property: "og:title", content: "Insígnias — Natal Pneus" },
      { property: "og:description", content: "Cadastre as insígnias entregues aos colaboradores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminInsignias,
});

const input = "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary";

function AdminInsignias() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["badges-admin"],
    queryFn: async () => {
      const badges = (await supabase.from("badges").select("*").order("created_at", { ascending: false })).data ?? [];
      return { badges, urls: await signedUrls("badges", badges.map((b) => b.image_path)) };
    },
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const file = f.get("image") as File;
      const image_path = file?.size ? await uploadFile("badges", file) : null;
      const { error } = await supabase.from("badges").insert({ name: String(f.get("name")), description: String(f.get("description") ?? ""), image_path });
      if (error) throw error;
      form.reset();
      qc.invalidateQueries({ queryKey: ["badges-admin"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, path: string | null) {
    if (!confirm("Excluir esta insígnia? Ela sai do histórico de todos.")) return;
    if (path) await supabase.storage.from("badges").remove([path]);
    await supabase.from("badges").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["badges-admin"] });
  }

  return (
    <PortalShell title="Insígnias" eyebrow="Área do administrador">
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Nova insígnia</h2>
          <label className="block text-sm font-medium">Nome<input name="name" required className={input} /></label>
          <label className="block text-sm font-medium">Descrição<input name="description" placeholder="Ex.: 1 ano de Natal Pneus" className={input} /></label>
          <label className="block text-sm font-medium">Imagem (PNG de preferência)<input name="image" type="file" accept="image/*" required className={`${input} py-2`} /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button disabled={busy} className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Enviando…" : "Salvar insígnia"}</button>
          <p className="text-xs text-muted-foreground">Para entregar, vá em Contas e toque em “Insígnias” no colaborador.</p>
        </form>
        <section className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.badges.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma insígnia cadastrada.</p>}
          {data?.badges.map((b) => (
            <article key={b.id} className="flex flex-col items-center rounded-xl border border-border bg-card p-5 text-center">
              <div className="grid size-24 place-items-center rounded-full bg-muted ring-2 ring-accent">
                {b.image_path && data.urls[b.image_path] ? <img src={data.urls[b.image_path]} alt={b.name} className="size-20 object-contain" /> : <Award className="text-accent" size={40} />}
              </div>
              <h3 className="mt-3 font-semibold">{b.name}</h3>
              <p className="text-sm text-muted-foreground">{b.description}</p>
              <button onClick={() => remove(b.id, b.image_path)} className="mt-3 text-xs font-semibold text-destructive">Excluir</button>
            </article>
          ))}
        </section>
      </div>
    </PortalShell>
  );
}
