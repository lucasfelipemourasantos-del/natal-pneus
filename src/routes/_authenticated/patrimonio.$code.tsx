import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canManageAssets } from "@/lib/access";
import {
  DOC_TYPE_LABEL,
  DUE_LABEL,
  assetSummary,
  STATUS_LABEL,
  addMonths,
  assetLink,
  assetUrls,
  dueState,
  formatDate,
  todayISO,
  uploadAssetFile,
  type Asset,
  type AssetFile,
  type AssetLog,
  type Maintenance,
} from "@/lib/assets";
import { fieldClass } from "@/lib/portal-data";
import { money, parseCents } from "@/lib/results";

export const Route = createFileRoute("/_authenticated/patrimonio/$code")({
  beforeLoad: ({ context }) => {
    if (!canManageAssets(context.access)) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Equipamento — Patrimônio — Natal Pneus" },
      { name: "description", content: "Ficha do equipamento com fotos, documentos e manutenções." },
      { property: "og:title", content: "Equipamento — Patrimônio — Natal Pneus" },
      { property: "og:description", content: "Ficha do equipamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetPage,
});

const reais = (cents: number | null) =>
  cents === null
    ? ""
    : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function AssetPage() {
  const { code } = Route.useParams();
  const { access } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState("orcamento");
  const today = todayISO();

  const asset = useQuery({
    queryKey: ["asset", code],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("*").eq("code", code).maybeSingle();
      return (data as Asset | null) ?? null;
    },
  });
  const a = asset.data ?? null;
  const detail = useQuery({
    queryKey: ["asset-detail", a?.id],
    enabled: Boolean(a),
    queryFn: async () => {
      const id = a!.id;
      const [files, maintenance, log] = await Promise.all([
        supabase.from("asset_files").select("*").eq("asset_id", id).order("created_at"),
        supabase
          .from("asset_maintenance")
          .select("*")
          .eq("asset_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("asset_log").select("*").eq("asset_id", id).order("at", { ascending: false }),
      ]);
      const fileRows = (files.data ?? []) as AssetFile[];
      return {
        files: fileRows,
        maintenance: (maintenance.data ?? []) as Maintenance[],
        log: (log.data ?? []) as AssetLog[],
        urls: await assetUrls(fileRows.map((f) => f.storage_path)),
      };
    },
  });
  const d = detail.data;

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["asset", code] }),
      qc.invalidateQueries({ queryKey: ["asset-detail"] }),
      qc.invalidateQueries({ queryKey: ["assets"] }),
    ]);

  async function run(task: () => Promise<string | void>) {
    setNotice("");
    setBusy(true);
    try {
      const done = await task();
      if (done) setNotice(done);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(
    e: ChangeEvent<HTMLInputElement>,
    kind: "foto" | "video" | "documento",
    maintenanceId?: string,
  ) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!a || !files.length) return;
    await run(async () => {
      for (const file of files) await uploadAssetFile(a, file, kind, maintenanceId, docType);
      return kind === "documento" ? "Documento anexado." : "Enviado.";
    });
  }

  if (asset.isPending)
    return (
      <PortalShell title="Equipamento" eyebrow="Patrimônio">
        <p className="text-muted-foreground">Carregando…</p>
      </PortalShell>
    );
  if (!a)
    return (
      <PortalShell title="Equipamento" eyebrow="Patrimônio">
        <p className="text-muted-foreground">
          Equipamento não encontrado, ou ele é de outra loja.{" "}
          <Link to="/patrimonio" className="font-semibold text-primary hover:underline">
            Voltar ao patrimônio
          </Link>
        </p>
      </PortalShell>
    );

  const retired = a.status === "baixado";
  const due = retired ? null : dueState(a.next_preventive, today);
  const media = (d?.files ?? []).filter((f) => f.kind !== "documento" && !f.maintenance_id);
  const docs = (d?.files ?? []).filter((f) => f.kind === "documento");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    await run(async () => {
      const preventive = f.get("preventive_applicable") === "on";
      const { error } = await supabase
        .from("assets")
        .update({
          name: String(f.get("name")).trim(),
          category: text("category"),
          serial_number: text("serial_number"),
          supplier: text("supplier"),
          notes: text("notes"),
          purchase_date: text("purchase_date"),
          purchase_cents: text("purchase") ? parseCents(text("purchase")!) : null,
          estimated_cents: text("estimated") ? parseCents(text("estimated")!) : null,
          preventive_applicable: preventive,
          preventive_interval_months:
            preventive && text("interval") ? Number(text("interval")) : null,
          next_preventive: preventive ? text("next_preventive") : null,
          ...(retired ? {} : { status: String(f.get("status")) }),
          ...(access.isAdmin ? { unit_code: String(f.get("unit_code")) } : {}),
        })
        .eq("id", a!.id);
      if (error) throw new Error("Não foi possível salvar. Confira os dados.");
      setEditing(false);
      return "Equipamento atualizado.";
    });
  }

  async function retire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const { error } = await supabase
        .from("assets")
        .update({
          status: "baixado",
          retired_at: String(f.get("retired_at")),
          retired_reason: String(f.get("reason")).trim() || null,
        })
        .eq("id", a!.id);
      if (error) throw new Error("Não foi possível dar baixa.");
      setRetiring(false);
      return "Baixa registrada. O histórico do equipamento foi mantido.";
    });
  }

  async function reactivate() {
    await run(async () => {
      const { error } = await supabase
        .from("assets")
        .update({ status: "ativo", retired_at: null, retired_reason: null })
        .eq("id", a!.id);
      if (error) throw new Error("Não foi possível reativar.");
      return "Equipamento reativado.";
    });
  }

  async function remove() {
    if (!window.confirm(`Excluir ${a!.code} e todo o histórico? Isso não pode ser desfeito.`))
      return;
    await run(async () => {
      const paths = (d?.files ?? []).map((f) => f.storage_path);
      if (paths.length) await supabase.storage.from("assets").remove(paths);
      const { error } = await supabase.from("assets").delete().eq("id", a!.id);
      if (error) throw new Error("Só o ADM RH exclui equipamentos.");
      await navigate({ to: "/patrimonio" });
    });
  }

  return (
    <PortalShell title={`${a.code} · ${a.name}`} eyebrow="Patrimônio">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/patrimonio" className="text-sm font-semibold text-primary hover:underline">
            ← Todos os equipamentos
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancelar edição" : "Editar"}
            </Button>
            {retired ? (
              (access.isAdmin) && (
                <Button variant="outline" onClick={reactivate} disabled={busy}>
                  Reativar
                </Button>
              )
            ) : (
              <Button variant="outline" onClick={() => setRetiring((v) => !v)}>
                Dar baixa
              </Button>
            )}
            {access.isAdmin && (
              <Button variant="outline" onClick={remove} disabled={busy}>
                Excluir
              </Button>
            )}
          </div>
        </div>

        {notice && (
          <p role="status" className="text-sm font-semibold text-primary">
            {notice}
          </p>
        )}

        {retiring && (
          <form onSubmit={retire} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">Dar baixa (equipamento finalizado)</h2>
            <p className="text-sm text-muted-foreground">
              Use quando o item ficou inutilizável, foi vendido ou perdido. Ele sai da lista de
              itens em uso, e todo o histórico fica guardado.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Data da baixa
                <input
                  name="retired_at"
                  type="date"
                  required
                  defaultValue={today}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium">
                Motivo
                <input
                  name="reason"
                  maxLength={500}
                  placeholder="Ex.: inutilizável, vendido, extraviado"
                  className={fieldClass}
                />
              </label>
            </div>
            <Button disabled={busy}>Confirmar baixa</Button>
          </form>
        )}

        <Dashboard
          asset={a}
          maintenance={d?.maintenance ?? []}
          files={d?.files ?? []}
          today={today}
        />

        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${retired ? "bg-muted text-muted-foreground" : "bg-success-soft text-success"}`}
            >
              {STATUS_LABEL[a.status] ?? a.status}
            </span>
            {due && (
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                {DUE_LABEL[due]}
              </span>
            )}
            <span className="text-sm text-muted-foreground">Loja {a.unit_code}</span>
          </div>
          {retired && (
            <p className="text-sm">
              Baixado em <b>{formatDate(a.retired_at)}</b>
              {a.retired_reason ? ` — ${a.retired_reason}` : ""}
            </p>
          )}
          {editing ? (
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Nome
                  <input
                    name="name"
                    required
                    maxLength={160}
                    defaultValue={a.name}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Categoria
                  <input
                    name="category"
                    maxLength={80}
                    defaultValue={a.category ?? ""}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Número de série
                  <input
                    name="serial_number"
                    maxLength={80}
                    defaultValue={a.serial_number ?? ""}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Fornecedor
                  <input
                    name="supplier"
                    maxLength={160}
                    defaultValue={a.supplier ?? ""}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Data da compra
                  <input
                    name="purchase_date"
                    type="date"
                    defaultValue={a.purchase_date ?? ""}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Valor da compra
                  <input
                    name="purchase"
                    inputMode="decimal"
                    defaultValue={reais(a.purchase_cents)}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Valor estimado hoje
                  <input
                    name="estimated"
                    inputMode="decimal"
                    defaultValue={reais(a.estimated_cents)}
                    className={fieldClass}
                  />
                </label>
                {!retired && (
                  <label className="block text-sm font-medium">
                    Situação
                    <select name="status" defaultValue={a.status} className={fieldClass}>
                      <option value="ativo">Ativo</option>
                      <option value="em_manutencao">Em manutenção</option>
                    </select>
                  </label>
                )}
                {(access.isAdmin) && (
                  <label className="block text-sm font-medium">
                    Loja
                    <input
                      name="unit_code"
                      required
                      defaultValue={a.unit_code}
                      className={fieldClass}
                    />
                  </label>
                )}
              </div>
              <label className="block text-sm font-medium">
                Observações
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={2000}
                  defaultValue={a.notes ?? ""}
                  className={fieldClass}
                />
              </label>
              <fieldset className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-semibold">Manutenção preventiva</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="preventive_applicable"
                    type="checkbox"
                    defaultChecked={a.preventive_applicable}
                    className="size-4 accent-primary"
                  />
                  Este equipamento tem manutenção preventiva
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    A cada quantos meses
                    <input
                      name="interval"
                      type="number"
                      min={1}
                      max={120}
                      defaultValue={a.preventive_interval_months ?? ""}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Próxima manutenção
                    <input
                      name="next_preventive"
                      type="date"
                      defaultValue={a.next_preventive ?? ""}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </fieldset>
              <Button disabled={busy}>Salvar alterações</Button>
            </form>
          ) : (
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Info label="Categoria" value={a.category} />
              <Info label="Número de série" value={a.serial_number} />
              <Info label="Fornecedor" value={a.supplier} />
              <Info
                label="Data da compra"
                value={a.purchase_date ? formatDate(a.purchase_date) : null}
              />
              <Info
                label="Valor da compra"
                value={a.purchase_cents !== null ? money(a.purchase_cents) : null}
              />
              <Info
                label="Valor estimado hoje"
                value={a.estimated_cents !== null ? money(a.estimated_cents) : null}
              />
              <Info
                label="Manutenção preventiva"
                value={
                  a.preventive_applicable
                    ? `A cada ${a.preventive_interval_months ?? "?"} meses · próxima em ${formatDate(a.next_preventive)}`
                    : "Não se aplica"
                }
              />
              <Info label="Observações" value={a.notes} />
            </dl>
          )}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="space-y-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Fotos e vídeos</h2>
              <div className="flex flex-wrap gap-2">
                <CaptureButton
                  label="Tirar foto"
                  accept="image/*"
                  capture
                  disabled={busy}
                  onChange={(e) => onFile(e, "foto")}
                />
                <CaptureButton
                  label="Gravar vídeo curto"
                  accept="video/*"
                  capture
                  disabled={busy}
                  onChange={(e) => onFile(e, "video")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As fotos e os vídeos são feitos na hora, pela câmera do celular. Vídeos até 25 MB.
            </p>
            {media.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((f) => (
                  <li key={f.id} className="overflow-hidden rounded-lg border border-border">
                    {d?.urls[f.storage_path] &&
                      (f.kind === "video" ? (
                        <video
                          src={d.urls[f.storage_path]}
                          controls
                          preload="metadata"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <a href={d.urls[f.storage_path]} target="_blank" rel="noreferrer">
                          <img
                            src={d.urls[f.storage_path]}
                            alt={`Foto de ${a.name}`}
                            loading="lazy"
                            className="aspect-square w-full object-cover"
                          />
                        </a>
                      ))}
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">
                      {formatDate(f.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma foto ainda.</p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Documentos</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Tipo do documento"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className={fieldClass + " mt-0 w-auto"}
                >
                  {Object.entries(DOC_TYPE_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <CaptureButton
                  label="Anexar"
                  accept="application/pdf,image/*"
                  disabled={busy}
                  onChange={(e) => onFile(e, "documento")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Escolha o tipo (orçamento, nota de serviço…) e anexe o PDF ou a foto. Até 25 MB cada.
            </p>
            <FileList files={docs} urls={d?.urls ?? {}} empty="Nenhum documento anexado." />
          </section>
        </div>

        <MaintenanceSection
          asset={a}
          items={d?.maintenance ?? []}
          files={d?.files ?? []}
          urls={d?.urls ?? {}}
          busy={busy}
          run={run}
          today={today}
        />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <LabelSection asset={a} />

          <section className="space-y-2 rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-bold">Histórico do equipamento</h2>
            {d?.log.length ? (
              <ul className="divide-y divide-border text-sm">
                {d.log.map((l) => (
                  <li key={l.id} className="py-2">
                    <b className="capitalize">{l.action}</b> em{" "}
                    {new Date(l.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem registros.</p>
            )}
          </section>
        </div>
      </div>
    </PortalShell>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function CaptureButton({
  label,
  accept,
  capture,
  disabled,
  onChange,
}: {
  label: string;
  accept: string;
  capture?: boolean;
  disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        {...(capture ? { capture: "environment" as const } : {})}
        multiple={!capture}
        onChange={onChange}
        className="hidden"
        aria-label={label}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}

function FileList({
  files,
  urls,
  empty,
}: {
  files: AssetFile[];
  urls: Record<string, string>;
  empty: string;
}) {
  if (!files.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0 break-words">
            {f.doc_type && (
              <b className="mr-2 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                {DOC_TYPE_LABEL[f.doc_type] ?? f.doc_type}
              </b>
            )}
            {f.file_name}
          </span>
          {urls[f.storage_path] && (
            <a
              href={urls[f.storage_path]}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Abrir
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function MaintenanceSection({
  asset,
  items,
  files,
  urls,
  busy,
  run,
  today,
}: {
  asset: Asset;
  items: Maintenance[];
  files: AssetFile[];
  urls: Record<string, string>;
  busy: boolean;
  run: (task: () => Promise<string | void>) => Promise<void>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [attachType, setAttachType] = useState("nota_servico");
  const [kind, setKind] = useState<"preventiva" | "corretiva">("corretiva");
  const [status, setStatus] = useState<"realizada" | "agendada">("realizada");
  const pending = useRef<File[]>([]);

  async function nextAfter(date: string) {
    if (kind !== "preventiva" || !asset.preventive_applicable) return;
    const next =
      status === "realizada"
        ? asset.preventive_interval_months
          ? addMonths(date, asset.preventive_interval_months)
          : null
        : date;
    if (next) await supabase.from("assets").update({ next_preventive: next }).eq("id", asset.id);
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const date = String(f.get("date"));
    const form = e.currentTarget;
    await run(async () => {
      const { data, error } = await supabase
        .from("asset_maintenance")
        .insert({
          asset_id: asset.id,
          kind,
          status,
          scheduled_for: status === "agendada" ? date : null,
          performed_at: status === "realizada" ? date : null,
          description: text("description"),
          service_note: text("service_note"),
          provider: text("provider"),
          cost_cents: text("cost") ? parseCents(text("cost")!) : null,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("Não foi possível registrar a manutenção.");
      for (const file of pending.current)
        await uploadAssetFile(asset, file, "documento", data.id, attachType);
      pending.current = [];
      await nextAfter(date);
      form.reset();
      setOpen(false);
      return status === "agendada" ? "Manutenção agendada." : "Manutenção registrada.";
    });
  }

  async function markDone(m: Maintenance) {
    await run(async () => {
      const { error } = await supabase
        .from("asset_maintenance")
        .update({ status: "realizada", performed_at: today })
        .eq("id", m.id);
      if (error) throw new Error("Não foi possível atualizar.");
      if (
        m.kind === "preventiva" &&
        asset.preventive_applicable &&
        asset.preventive_interval_months
      )
        await supabase
          .from("assets")
          .update({ next_preventive: addMonths(today, asset.preventive_interval_months) })
          .eq("id", asset.id);
      return "Manutenção marcada como realizada hoje.";
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Manutenções</h2>
        <Button variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Registrar ou agendar"}
        </Button>
      </div>
      {open && (
        <form onSubmit={add} className="space-y-4 rounded-lg border border-border p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              Tipo
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                className={fieldClass}
              >
                <option value="corretiva">Corretiva</option>
                {asset.preventive_applicable && <option value="preventiva">Preventiva</option>}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className={fieldClass}
              >
                <option value="realizada">Já realizada</option>
                <option value="agendada">Agendar</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              {status === "agendada" ? "Data agendada" : "Data da manutenção"}
              <input name="date" type="date" required defaultValue={today} className={fieldClass} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Descrição do serviço
            <textarea name="description" rows={2} maxLength={2000} className={fieldClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              Nota de serviço (número)
              <input name="service_note" maxLength={80} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium">
              Quem fez
              <input name="provider" maxLength={160} className={fieldClass} />
            </label>
            <label className="block text-sm font-medium">
              Valor
              <input name="cost" inputMode="decimal" placeholder="350,00" className={fieldClass} />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Tipo do anexo
            <select
              value={attachType}
              onChange={(e) => setAttachType(e.target.value)}
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
            Nota de serviço e documentos (PDF ou foto)
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              onChange={(e) => {
                pending.current = [...(e.target.files ?? [])];
              }}
              className={fieldClass}
            />
          </label>
          <Button disabled={busy}>Salvar manutenção</Button>
        </form>
      )}
      {items.length ? (
        <ul className="divide-y divide-border text-sm">
          {items.map((m) => (
            <li key={m.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="capitalize">{m.kind}</b>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.status === "agendada" ? "bg-accent text-accent-foreground" : "bg-success-soft text-success"}`}
                >
                  {m.status === "agendada"
                    ? `Agendada para ${formatDate(m.scheduled_for)}`
                    : `Realizada em ${formatDate(m.performed_at)}`}
                </span>
                {m.status === "agendada" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => markDone(m)}>
                    Marcar como realizada hoje
                  </Button>
                )}
              </div>
              {m.description && <p>{m.description}</p>}
              <p className="text-xs text-muted-foreground">
                {[
                  m.service_note ? `Nota de serviço ${m.service_note}` : null,
                  m.provider,
                  m.cost_cents !== null ? money(m.cost_cents) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <FileList
                files={files.filter((f) => f.maintenance_id === m.id)}
                urls={urls}
                empty=""
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada.</p>
      )}
    </section>
  );
}

function LabelSection({ asset }: { asset: Asset }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(assetLink(asset.code ?? ""), { width: 240, margin: 1 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [asset.code]);

  function print() {
    const w = window.open("", "_blank", "width=420,height=520");
    if (!w) return;
    w.document.write(
      `<!doctype html><title>Etiqueta ${escapeHtml(asset.code ?? "")}</title>
<body style="font-family:sans-serif;text-align:center;margin:16px">
<img src="${qr}" width="240" height="240" alt="QR Code"/>
<div style="font-size:26px;font-weight:700;margin-top:8px">${escapeHtml(asset.code ?? "")}</div>
<div style="font-size:14px">${escapeHtml(asset.name)}</div>
<div style="font-size:11px;color:#555;margin-top:4px">Natal Pneus · Patrimônio</div>
<script>window.onload=function(){window.print()}</script></body>`,
    );
    w.document.close();
  }

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-5">
      {qr ? (
        <img src={qr} width={140} height={140} alt={`QR Code de ${asset.code}`} />
      ) : (
        <div className="size-[140px] rounded-lg bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 space-y-2">
        <h2 className="text-lg font-bold">Etiqueta com QR Code</h2>
        <p className="max-w-[55ch] text-sm text-muted-foreground">
          Cole no equipamento. Quem ler o QR Code abre esta ficha (precisa entrar no portal e ter
          acesso à loja).
        </p>
        <Button variant="outline" onClick={print} disabled={!qr}>
          Imprimir etiqueta
        </Button>
      </div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Registro geral: the equipment at a glance. */
function Dashboard({
  asset,
  maintenance,
  files,
  today,
}: {
  asset: Asset;
  maintenance: Maintenance[];
  files: AssetFile[];
  today: string;
}) {
  const s = assetSummary(asset, maintenance, today);
  const due = asset.status === "baixado" ? null : dueState(asset.next_preventive, today);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">Registro geral</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Manutenções feitas"
          value={String(s.done)}
          sub={`${s.preventive} preventiva(s) · ${s.corrective} corretiva(s)`}
        />
        <Tile
          label="Gasto com serviços"
          value={money(s.costCents)}
          sub={s.withoutCost ? `${s.withoutCost} sem valor informado` : undefined}
        />
        <Tile label="Última manutenção" value={formatDate(s.last)} />
        <Tile
          label="Próxima preventiva"
          value={asset.preventive_applicable ? formatDate(asset.next_preventive) : "Não se aplica"}
          sub={due ? DUE_LABEL[due] : s.scheduled ? `${s.scheduled} agendada(s)` : undefined}
        />
        <Tile
          label="Valor"
          value={asset.estimated_cents !== null ? money(asset.estimated_cents) : "—"}
          sub={asset.purchase_cents !== null ? `Compra: ${money(asset.purchase_cents)}` : undefined}
        />
        <Tile
          label="Tempo de uso"
          value={s.age ?? "—"}
          sub={`${files.filter((f) => f.kind !== "documento").length} foto(s) · ${files.filter((f) => f.kind === "documento").length} doc(s)`}
        />
      </div>
    </section>
  );
}
