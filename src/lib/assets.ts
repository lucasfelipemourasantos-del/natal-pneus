import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Asset = Tables["assets"]["Row"];
export type Maintenance = Tables["asset_maintenance"]["Row"];
export type AssetFile = Tables["asset_files"]["Row"];
export type AssetLog = Tables["asset_log"]["Row"];

export const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  em_manutencao: "Em manutenção",
  baixado: "Baixado",
};

/** Today in São Paulo as AAAA-MM-DD. */
export function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** "2026-10-27" + 6 months -> "2027-04-27" (the day is kept inside the shorter months). */
export function addMonths(date: string, months: number) {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type DueState = "vencida" | "vence_em_breve" | "em_dia";

/** Preventive maintenance deadline: overdue, due within `soonDays`, or fine. Null when there is no date. */
export function dueState(next: string | null, today: string, soonDays = 30): DueState | null {
  if (!next) return null;
  if (next < today) return "vencida";
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  return next <= limit.toISOString().slice(0, 10) ? "vence_em_breve" : "em_dia";
}

export const DUE_LABEL: Record<DueState, string> = {
  vencida: "Manutenção vencida",
  vence_em_breve: "Vence em breve",
  em_dia: "Em dia",
};

export function formatDate(date: string | null) {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Address the QR Code points to (opens the item after login). */
export function assetLink(code: string) {
  return `${window.location.origin}/patrimonio/${encodeURIComponent(code)}`;
}

/** Photos are shrunk before upload (a phone photo is several MB); other files go as they are. */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Uploads to the private "assets" bucket (folder = store, then item) and records the file on the item. */
export async function uploadAssetFile(
  asset: Pick<Asset, "id" | "unit_code">,
  file: File,
  kind: "foto" | "video" | "documento",
  maintenanceId?: string,
) {
  const body = kind === "foto" ? await shrinkImage(file) : file;
  if (body.size > MAX_BYTES) throw new Error("Arquivo maior que 25 MB.");
  const ext =
    body.type === "image/jpeg" && kind === "foto" ? "jpg" : (file.name.split(".").pop() ?? "bin");
  const path = `${asset.unit_code}/${asset.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("assets")
    .upload(path, body, { contentType: body.type || file.type });
  if (error) throw new Error("Não foi possível enviar o arquivo.");
  const { error: err } = await supabase.from("asset_files").insert({
    asset_id: asset.id,
    maintenance_id: maintenanceId ?? null,
    kind,
    storage_path: path,
    file_name: file.name.slice(0, 200),
  });
  if (err) throw new Error("O arquivo foi enviado, mas não foi possível registrá-lo.");
}

/** Temporary links for the private files. */
export async function assetUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from("assets").createSignedUrls(paths, 3600);
  return Object.fromEntries(
    (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])),
  ) as Record<string, string>;
}
