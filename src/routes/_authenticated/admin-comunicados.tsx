import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { AttachmentLink, CategoryTag } from "@/components/announcements";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  announcementCategories,
  audienceLabel,
  isLive,
  periodLabel,
  todayIso,
  type Announcement,
} from "@/lib/announcements";
import { uploadFile } from "@/lib/files";
import { catalogOptions, fieldClass } from "@/lib/portal-data";

export const Route = createFileRoute("/_authenticated/admin-comunicados")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Comunicados — Gestão — Natal Pneus" },
      { name: "description", content: "Publique comunicados do RH e acompanhe quem já leu." },
      { property: "og:title", content: "Comunicados — Gestão — Natal Pneus" },
      { property: "og:description", content: "Publique comunicados do RH." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminComunicados,
});

const key = ["announcements", "admin"];

function AdminComunicados() {
  const qc = useQueryClient();
  const { data: catalog } = useQuery(catalogOptions);
  const { data, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [list, reads, people, admins] = await Promise.all([
        supabase.from("announcements").select("*").order("created_at", { ascending: false }),
        supabase.from("announcement_reads").select("announcement_id,user_id"),
        supabase
          .from("profiles")
          .select("id,full_name,email,unit_code,job_role,status")
          .eq("status", "approved"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (list.error)
        throw new Error(
          "Os comunicados ainda não estão disponíveis. A atualização do banco (0014) já foi aplicada?",
        );
      const adminIds = new Set((admins.data ?? []).map((r) => r.user_id));
      return {
        items: list.data ?? [],
        reads: reads.data ?? [],
        people: (people.data ?? []).filter((p) => !adminIds.has(p.id)),
      };
    },
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [openReaders, setOpenReaders] = useState<string | null>(null);

  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setNotice("");
    try {
      const file = f.get("attachment") as File | null;
      const attachment_path = file && file.size ? await uploadFile("announcements", file) : null;
      const ends = String(f.get("ends_on") ?? "");
      const { error: err } = await supabase.from("announcements").insert({
        title: String(f.get("title")).trim(),
        body: String(f.get("body")).trim(),
        category: String(f.get("category")),
        audience_unit: String(f.get("unit")) || null,
        audience_job: String(f.get("job")) || null,
        starts_on: String(f.get("starts_on")) || todayIso(),
        ends_on: ends || null,
        attachment_path,
        attachment_name: attachment_path ? file!.name.slice(0, 160) : null,
      });
      if (err)
        throw new Error(
          "Não foi possível publicar. Confira as datas (o fim não pode ser antes do início).",
        );
      form.reset();
      setNotice("Comunicado publicado. Ele aparece para o público escolhido no próximo acesso.");
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(a: Announcement, active: boolean) {
    const { error: err } = await supabase.from("announcements").update({ active }).eq("id", a.id);
    setNotice(
      err
        ? "Não foi possível salvar."
        : active
          ? "Comunicado de volta ao ar."
          : "Comunicado retirado do ar.",
    );
    await qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  const audienceOf = (a: Announcement) =>
    (data?.people ?? []).filter(
      (p) =>
        (!a.audience_unit || !p.unit_code || p.unit_code === a.audience_unit) &&
        (!a.audience_job || p.job_role === a.audience_job),
    );

  return (
    <PortalShell title="Comunicados" eyebrow="Gestão · ADM RH">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Novo comunicado</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          O comunicado cobre a tela do funcionário até ele clicar em “Li e estou ciente”. Depois
          fica disponível no sininho. Você acompanha abaixo quem já leu.
        </p>
        <form onSubmit={publish} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Título
            <input
              id="ann-title"
              name="title"
              required
              maxLength={160}
              className={fieldClass}
              placeholder="Ex.: Férias de novembro"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Texto
            <textarea
              id="ann-body"
              name="body"
              required
              maxLength={8000}
              rows={6}
              className={`${fieldClass} py-2 leading-6`}
              placeholder="Escreva o comunicado."
            />
          </label>
          <label className="text-sm">
            Categoria
            <select id="ann-category" name="category" defaultValue="aviso" className={fieldClass}>
              {Object.entries(announcementCategories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Anexo (opcional)
            <input
              id="ann-attachment"
              name="attachment"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              className={`${fieldClass} py-2`}
            />
          </label>
          <label className="text-sm">
            Loja
            <select id="ann-unit" name="unit" defaultValue="" className={fieldClass}>
              <option value="">Todas as lojas</option>
              {catalog?.units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Função
            <select id="ann-job" name="job" defaultValue="" className={fieldClass}>
              <option value="">Todas as funções</option>
              {catalog?.jobs.map((j) => (
                <option key={j.id} value={j.name}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Mostrar a partir de
            <input
              id="ann-start"
              name="starts_on"
              type="date"
              defaultValue={todayIso()}
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            Sair do ar em (opcional)
            <input id="ann-end" name="ends_on" type="date" className={fieldClass} />
          </label>
          <div className="sm:col-span-2">
            <Button disabled={busy}>{busy ? "Publicando…" : "Publicar comunicado"}</Button>
          </div>
        </form>
        {notice && (
          <p role="status" className="mt-3 text-sm font-semibold">
            {notice}
          </p>
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">Publicados</h2>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {data && !data.items.length && (
          <p className="text-sm text-muted-foreground">Nenhum comunicado ainda.</p>
        )}
        {data?.items.map((a) => {
          const audience = audienceOf(a);
          const readers = new Set(
            data.reads.filter((r) => r.announcement_id === a.id).map((r) => r.user_id),
          );
          const done = audience.filter((p) => readers.has(p.id));
          const pending = audience.filter((p) => !readers.has(p.id));
          const live = isLive(a);
          return (
            <article key={a.id} className="space-y-2 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <CategoryTag category={a.category} />
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${live ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {live ? "No ar" : a.active ? "Fora do período" : "Retirado"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {audienceLabel(a)} · {periodLabel(a)}
                </span>
              </div>
              <h3 className="text-base font-bold">{a.title}</h3>
              <p className="max-w-[75ch] whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {a.body}
              </p>
              <AttachmentLink a={a} />
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenReaders(openReaders === a.id ? null : a.id)}
                  className="text-sm font-semibold text-primary hover:underline"
                  aria-expanded={openReaders === a.id}
                >
                  Lido por {done.length} de {audience.length}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setActive(a, !a.active)}
                >
                  {a.active ? "Retirar do ar" : "Colocar de volta no ar"}
                </Button>
              </div>
              {openReaders === a.id && (
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-semibold">Ainda não leram ({pending.length})</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {pending.map((p) => (
                        <li key={p.id}>{p.full_name || p.email}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold">Já leram ({done.length})</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {done.map((p) => (
                        <li key={p.id}>{p.full_name || p.email}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </PortalShell>
  );
}
