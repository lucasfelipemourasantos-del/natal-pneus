import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, todayISO } from "@/lib/assets";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  daysUntil,
  docStatus,
  dueText,
  needsAttention,
  type CompanyDoc,
  type CompanyDocFile,
  type DocStatus,
} from "@/lib/company-docs";
import { fieldClass } from "@/lib/portal-data";

export const Route = createFileRoute("/_authenticated/documentos-empresa")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Documentos da empresa — Natal Pneus" },
      {
        name: "description",
        content: "Alvarás, licenças e certidões por loja, com validade e alerta de vencimento.",
      },
      { property: "og:title", content: "Documentos da empresa — Natal Pneus" },
      { property: "og:description", content: "Documentos por loja com alerta de vencimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyDocuments,
});

const UNITS = ["NP1", "NP2", "NP3", "NP4"];
const FOLDERS = [
  { key: "ALL", label: "Todas" },
  { key: "GERAL", label: "Empresa (geral)" },
  ...UNITS.map((u) => ({ key: u, label: u })),
];
const MAX_BYTES = 25 * 1024 * 1024;

const badge: Record<DocStatus, string> = {
  vencido: "bg-destructive/10 text-destructive",
  urgente: "bg-destructive/10 text-destructive",
  atencao: "bg-accent text-accent-foreground",
  em_dia: "bg-success-soft text-success",
  permanente: "bg-muted text-muted-foreground",
};

const folderOf = (d: CompanyDoc) => d.unit_code ?? "GERAL";

async function uploadDocFile(doc: Pick<CompanyDoc, "id" | "unit_code">, file: File) {
  if (file.size > MAX_BYTES) throw new Error("Arquivo maior que 25 MB.");
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${doc.unit_code ?? "GERAL"}/${doc.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("company-docs")
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error("Não foi possível enviar o arquivo.");
  const { error: err } = await supabase
    .from("company_document_files")
    .insert({ document_id: doc.id, storage_path: path, file_name: file.name.slice(0, 200) });
  if (err) throw new Error("O arquivo foi enviado, mas não foi possível registrá-lo.");
}

function CompanyDocuments() {
  const qc = useQueryClient();
  const today = todayISO();
  const [folder, setFolder] = useState("ALL");
  const [form, setForm] = useState<
    { mode: "new" } | { mode: "edit" | "renew"; doc: CompanyDoc } | null
  >(null);
  const [history, setHistory] = useState(false);
  const [notice, setNotice] = useState("");

  const docs = useQuery({
    queryKey: ["company-docs"],
    queryFn: async () => {
      const [d, f] = await Promise.all([
        supabase.from("company_documents").select("*").order("expires_at", { nullsFirst: false }),
        supabase.from("company_document_files").select("*").order("created_at"),
      ]);
      if (d.error)
        throw new Error(
          "Não foi possível consultar os documentos. A atualização do banco (0027) já foi aplicada?",
        );
      const files = (f.data ?? []) as CompanyDocFile[];
      const paths = files.map((x) => x.storage_path);
      const urls: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from("company-docs")
          .createSignedUrls(paths, 3600);
        for (const s of signed ?? []) if (s.signedUrl && s.path) urls[s.path] = s.signedUrl;
      }
      return { docs: (d.data ?? []) as CompanyDoc[], files, urls };
    },
  });

  const all = docs.data?.docs ?? [];
  const current = all.filter((d) => !d.superseded_by);
  const withStatus = current.map((d) => ({ d, status: docStatus(d.expires_at, today) }));
  const alerts = withStatus
    .filter((x) => needsAttention(x.status))
    .sort(
      (x, y) => (daysUntil(x.d.expires_at, today) ?? 0) - (daysUntil(y.d.expires_at, today) ?? 0),
    );
  const inFolder = (d: CompanyDoc) => folder === "ALL" || folderOf(d) === folder;
  const shown = withStatus.filter((x) => inFolder(x.d));
  const old = all.filter((d) => d.superseded_by && inFolder(d));

  const countOf = (key: string) =>
    withStatus.filter((x) => (key === "ALL" || folderOf(x.d) === key) && true).length;
  const alertOf = (key: string) =>
    withStatus.some((x) => (key === "ALL" || folderOf(x.d) === key) && needsAttention(x.status));

  async function remove(d: CompanyDoc) {
    if (!window.confirm(`Excluir "${d.name}" e os arquivos dele? Isso não pode ser desfeito.`))
      return;
    const paths = (docs.data?.files ?? [])
      .filter((f) => f.document_id === d.id)
      .map((f) => f.storage_path);
    if (paths.length) await supabase.storage.from("company-docs").remove(paths);
    const { error } = await supabase.from("company_documents").delete().eq("id", d.id);
    setNotice(error ? "Não foi possível excluir." : "Documento excluído.");
    await qc.invalidateQueries({ queryKey: ["company-docs"] });
    await qc.invalidateQueries({ queryKey: ["company-docs-alerts"] });
  }

  return (
    <PortalShell title="Documentos da empresa" eyebrow="Gestão">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Alvarás, licenças, certidões e contratos, separados por loja. Cada documento tem
            validade, e o portal avisa quando faltar 45 dias, 15 dias e quando vencer.
          </p>
          <Button onClick={() => setForm(form ? null : { mode: "new" })}>
            {form ? "Fechar" : "Novo documento"}
          </Button>
        </div>

        {notice && (
          <p role="status" className="text-sm font-semibold text-primary">
            {notice}
          </p>
        )}

        {form && (
          <DocForm
            key={form.mode + ("doc" in form ? form.doc.id : "")}
            form={form}
            defaultFolder={folder === "ALL" ? "GERAL" : folder}
            onDone={async (msg) => {
              setForm(null);
              setNotice(msg);
              await qc.invalidateQueries({ queryKey: ["company-docs"] });
              await qc.invalidateQueries({ queryKey: ["company-docs-alerts"] });
            }}
          />
        )}

        {docs.error && (
          <p role="alert" className="text-destructive">
            {docs.error.message}
          </p>
        )}

        {alerts.length > 0 && (
          <section
            className="space-y-3 rounded-xl border border-destructive/40 bg-card p-5"
            aria-label="Documentos com vencimento próximo"
          >
            <h2 className="text-lg font-bold text-destructive">
              Atenção: {alerts.length} documento(s) vencendo ou vencidos
            </h2>
            <ul className="divide-y divide-border text-sm">
              {alerts.map(({ d, status }) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <b>{d.unit_code ?? "Geral"}</b> · {DOC_TYPE_LABEL[d.doc_type]} · {d.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge[status]}`}
                    >
                      {dueText(d.expires_at, today)} · {formatDate(d.expires_at)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setForm({ mode: "renew", doc: d })}
                    >
                      Renovar
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div role="tablist" aria-label="Pastas" className="flex flex-wrap gap-2">
          {FOLDERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={folder === f.key}
              onClick={() => setFolder(f.key)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${folder === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}
            >
              {f.label}
              <span className="text-xs opacity-80">({countOf(f.key)})</span>
              {alertOf(f.key) && (
                <span
                  className="size-2 rounded-full bg-destructive"
                  role="img"
                  aria-label="Há documento vencendo"
                />
              )}
            </button>
          ))}
        </div>

        {docs.isPending && <p className="text-muted-foreground">Carregando…</p>}
        {docs.data && !shown.length && (
          <p className="text-muted-foreground">Nenhum documento nesta pasta ainda.</p>
        )}
        {shown.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Documento</th>
                  {folder === "ALL" && <th className="px-4 py-3">Pasta</th>}
                  <th className="px-4 py-3">Emissão</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Arquivos</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ d, status }) => (
                  <DocRow
                    key={d.id}
                    d={d}
                    status={status}
                    today={today}
                    showFolder={folder === "ALL"}
                    files={(docs.data?.files ?? []).filter((f) => f.document_id === d.id)}
                    urls={docs.data?.urls ?? {}}
                    onEdit={() => setForm({ mode: "edit", doc: d })}
                    onRenew={() => setForm({ mode: "renew", doc: d })}
                    onDelete={() => remove(d)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {old.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setHistory((v) => !v)}
              aria-expanded={history}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {history ? "Esconder" : "Mostrar"} histórico de renovados ({old.length})
            </button>
            {history && (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
                {old.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                  >
                    <span>
                      <b>{d.unit_code ?? "Geral"}</b> · {DOC_TYPE_LABEL[d.doc_type]} · {d.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
                      Validade {formatDate(d.expires_at)}
                      {(docs.data?.files ?? [])
                        .filter((f) => f.document_id === d.id)
                        .map((f) => (
                          <a
                            key={f.id}
                            href={docs.data?.urls[f.storage_path]}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary hover:underline"
                          >
                            Abrir
                          </a>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function DocRow({
  d,
  status,
  today,
  showFolder,
  files,
  urls,
  onEdit,
  onRenew,
  onDelete,
}: {
  d: CompanyDoc;
  status: DocStatus;
  today: string;
  showFolder: boolean;
  files: CompanyDocFile[];
  urls: Record<string, string>;
  onEdit: () => void;
  onRenew: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <p className="font-semibold">{d.name}</p>
        <p className="text-xs text-muted-foreground">
          {DOC_TYPE_LABEL[d.doc_type]}
          {d.number ? ` · nº ${d.number}` : ""}
          {d.issuer ? ` · ${d.issuer}` : ""}
        </p>
        {d.notes && <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p>}
      </td>
      {showFolder && <td className="px-4 py-3">{d.unit_code ?? "Geral"}</td>}
      <td className="px-4 py-3">{formatDate(d.issued_at)}</td>
      <td className="px-4 py-3">
        <p>{formatDate(d.expires_at)}</p>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${badge[status]}`}
        >
          {status === "em_dia" || status === "permanente"
            ? STATUS_LABEL[status]
            : dueText(d.expires_at, today)}
        </span>
      </td>
      <td className="px-4 py-3">
        {files.length ? (
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.id}>
                {urls[f.storage_path] ? (
                  <a
                    href={urls[f.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words font-semibold text-primary hover:underline"
                  >
                    {f.file_name}
                  </a>
                ) : (
                  f.file_name
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">Sem arquivo</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onRenew}>
            Renovar
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            Editar
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete}>
            Excluir
          </Button>
        </div>
      </td>
    </tr>
  );
}

function DocForm({
  form,
  defaultFolder,
  onDone,
}: {
  form: { mode: "new" } | { mode: "edit" | "renew"; doc: CompanyDoc };
  defaultFolder: string;
  onDone: (message: string) => Promise<void>;
}) {
  const base = "doc" in form ? form.doc : null;
  const renew = form.mode === "renew";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const files = useRef<File[]>([]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const folder = String(f.get("folder"));
    const payload = {
      unit_code: folder === "GERAL" ? null : folder,
      doc_type: String(f.get("doc_type")),
      name: String(f.get("name")).trim(),
      number: text("number"),
      issuer: text("issuer"),
      issued_at: text("issued_at"),
      expires_at: text("expires_at"),
      notes: text("notes"),
    };
    setBusy(true);
    try {
      if (form.mode === "edit" && base) {
        const { error: err } = await supabase
          .from("company_documents")
          .update(payload)
          .eq("id", base.id);
        if (err) throw new Error("Não foi possível salvar.");
        for (const file of files.current)
          await uploadDocFile({ id: base.id, unit_code: payload.unit_code }, file);
        await onDone("Documento atualizado.");
        return;
      }
      const { data, error: err } = await supabase
        .from("company_documents")
        .insert(payload)
        .select("id,unit_code")
        .single();
      if (err || !data)
        throw new Error("Não foi possível salvar. A atualização do banco (0027) já foi aplicada?");
      for (const file of files.current) await uploadDocFile(data, file);
      if (renew && base) {
        const { error: e2 } = await supabase
          .from("company_documents")
          .update({ superseded_by: data.id })
          .eq("id", base.id);
        if (e2) throw new Error("O novo documento foi salvo, mas o antigo não foi arquivado.");
      }
      await onDone(
        renew ? "Documento renovado. O anterior ficou no histórico." : "Documento salvo.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confira os dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">
        {form.mode === "new" ? "Novo documento" : renew ? "Renovar documento" : "Editar documento"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">
          Pasta
          <select
            name="folder"
            required
            defaultValue={base ? (base.unit_code ?? "GERAL") : defaultFolder}
            className={fieldClass}
          >
            <option value="GERAL">Empresa (geral)</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Tipo
          <select
            name="doc_type"
            required
            defaultValue={base?.doc_type ?? "alvara"}
            className={fieldClass}
          >
            {Object.entries(DOC_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Nome do documento
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={base?.name ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Número
          <input
            name="number"
            maxLength={80}
            defaultValue={base?.number ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Órgão emissor
          <input
            name="issuer"
            maxLength={160}
            defaultValue={base?.issuer ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Data de emissão
          <input
            name="issued_at"
            type="date"
            defaultValue={renew ? "" : (base?.issued_at ?? "")}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Data de validade {renew ? "(nova)" : ""}
          <input
            name="expires_at"
            type="date"
            required={renew}
            defaultValue={renew ? "" : (base?.expires_at ?? "")}
            className={fieldClass}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Deixe em branco se o documento não vence.
          </span>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Observações
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={base?.notes ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="block text-sm font-medium">
        {renew ? "Documento novo (PDF ou foto)" : "Arquivos (PDF ou foto)"}
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            files.current = [...(e.target.files ?? [])];
          }}
          className={fieldClass}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={busy}>{busy ? "Salvando…" : renew ? "Renovar" : "Salvar"}</Button>
    </form>
  );
}
