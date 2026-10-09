import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/files";
import { catalogOptions, fieldClass } from "@/lib/portal-data";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-cursos")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Gerenciar cursos — Natal Pneus" },
      { name: "description", content: "Publique cursos com materiais e vídeos para os colaboradores." },
      { property: "og:title", content: "Gerenciar cursos — Natal Pneus" },
      { property: "og:description", content: "Publique cursos com materiais e vídeos para os colaboradores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCursos,
});

const input = "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary";

function AdminCursos() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: catalog } = useQuery(catalogOptions);
  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const file = f.get("file") as File | null;
      const file_path = file && file.size ? await uploadFile("course-files", file) : null;
      const { error } = await supabase.from("courses").insert({
        title: String(f.get("title")),
        description: String(f.get("description") ?? ""),
        area: String(f.get("area") ?? ""),
        level: String(f.get("level") ?? ""),
        target_job_role: String(f.get("target_job_role") ?? "") || null,
        unit_code: String(f.get("unit_code") ?? "") || null,
        video_url: String(f.get("video_url") ?? "") || null,
        file_path,
        file_name: file && file.size ? file.name : null,
      });
      if (error) throw error;
      form.reset();
      qc.invalidateQueries({ queryKey: ["courses"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, path: string | null) {
    if (!confirm("Excluir este curso?")) return;
    if (path) await supabase.storage.from("course-files").remove([path]);
    await supabase.from("courses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["courses"] });
  }

  return (
    <PortalShell title="Gerenciar cursos" eyebrow="Área do administrador">
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Novo curso</h2>
          <label className="block text-sm font-medium">Título<input name="title" required className={input} /></label>
          <label className="block text-sm font-medium">Descrição<textarea name="description" rows={3} className={`${input} py-2`} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Área<input name="area" placeholder="Atendimento" className={input} /></label>
            <label className="block text-sm font-medium">Nível<input name="level" placeholder="Iniciante" className={input} /></label>
          </div>
          <label className="block text-sm font-medium">Material (PDF, vídeo, apresentação — até 50 MB)<input name="file" type="file" className={`${input} py-2`} /></label>
          <label className="block text-sm font-medium">Função destinatária<select name="target_job_role" className={fieldClass}><option value="">Todas as funções</option>{catalog?.jobs.map(j=><option key={j.id}>{j.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Unidade destinatária<select name="unit_code" className={fieldClass}><option value="">Todas as lojas</option>{catalog?.units.map(u=><option key={u.code}>{u.code}</option>)}</select></label>
          <label className="block text-sm font-medium">Link de vídeo (opcional)<input name="video_url" type="url" placeholder="https://" className={input} /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} className="min-h-11 w-full">{busy ? "Enviando…" : "Publicar curso"}</Button>
        </form>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cursos publicados ({courses.length})</h2>
          {courses.length === 0 && <p className="text-sm text-muted-foreground">Nenhum curso publicado ainda.</p>}
          {courses.map((c) => (
            <article key={c.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">{[c.area, c.level].filter(Boolean).join(" · ")}</p>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.file_name ?? "Sem arquivo"}{c.video_url ? " · com vídeo" : ""}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => remove(c.id, c.file_path)}>Excluir</Button>
            </article>
          ))}
        </section>
      </div>
    </PortalShell>
  );
}
