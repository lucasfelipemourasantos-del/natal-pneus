import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  announcementCategories,
  confirmReading,
  myAnnouncementsOptions,
  periodLabel,
  type Announcement,
} from "@/lib/announcements";
import { signedUrls } from "@/lib/files";

/** Opens a private attachment with a temporary link. */
export function AttachmentLink({ a, className = "" }: { a: Announcement; className?: string }) {
  const [busy, setBusy] = useState(false);
  if (!a.attachment_path) return null;
  async function open() {
    setBusy(true);
    const urls = await signedUrls("announcements", [a.attachment_path]);
    setBusy(false);
    const url = urls[a.attachment_path!];
    if (url) window.open(url, "_blank", "noopener");
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className={`inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline ${className}`}
    >
      <Paperclip size={16} aria-hidden="true" />
      {busy ? "Abrindo…" : (a.attachment_name ?? "Abrir anexo")}
    </button>
  );
}

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
      {announcementCategories[category] ?? "Aviso"}
    </span>
  );
}

/**
 * Required reading: while the user has comunicados he has not confirmed, they cover the screen one at a time
 * and the portal cannot be used until he clicks "Li e estou ciente". The ADM RH (who writes them) is not blocked.
 */
export function AnnouncementGate({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    ...myAnnouncementsOptions(userId),
    enabled: Boolean(userId) && !isAdmin,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const current = data?.unread[0];

  useEffect(() => {
    if (current) dialog.current?.focus();
  }, [current?.id]);

  if (isAdmin || !current) return null;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await confirmReading(current!.id, userId);
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a leitura.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation">
      <div
        ref={dialog}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        aria-describedby="announcement-body"
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Bell size={16} aria-hidden="true" /> Comunicado
            {data!.unread.length > 1 && (
              <span className="text-muted-foreground">· 1 de {data!.unread.length}</span>
            )}
          </span>
          <CategoryTag category={current.category} />
        </div>
        <h2 id="announcement-title" className="text-xl font-bold text-balance">
          {current.title}
        </h2>
        <p id="announcement-body" className="whitespace-pre-wrap text-sm leading-6">
          {current.body}
        </p>
        <AttachmentLink a={current} />
        <p className="text-xs text-muted-foreground">{periodLabel(current)}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="button" onClick={confirm} disabled={busy} className="min-h-11">
          {busy ? "Registrando…" : "Li e estou ciente"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Confirme a leitura para continuar usando o portal.
        </p>
      </div>
    </div>
  );
}

/** Bell in the header with how many comunicados are in effect for the user. */
export function AnnouncementBell({ userId }: { userId: string }) {
  const { data } = useQuery({ ...myAnnouncementsOptions(userId), enabled: Boolean(userId) });
  const count = data?.items.length ?? 0;
  return (
    <Link
      to="/comunicados"
      aria-label={count ? `Comunicados: ${count}` : "Comunicados"}
      title="Comunicados"
      className="relative grid size-10 place-items-center rounded-full text-foreground hover:bg-muted"
    >
      <Bell size={20} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}
