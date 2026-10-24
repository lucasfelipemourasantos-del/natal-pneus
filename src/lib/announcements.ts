import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Announcement = Tables<"announcements">;

export const announcementCategories: Record<string, string> = {
  aviso: "Aviso geral",
  ferias: "Férias",
  exames: "Exames",
  cursos: "Cursos",
  eventos: "Eventos",
};

export function todayIso(now = new Date()) {
  const d = new Date(now.toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A comunicado shows while active and inside its period (the database applies the audience). */
export function isLive(
  a: Pick<Announcement, "active" | "starts_on" | "ends_on">,
  today = todayIso(),
) {
  return a.active && a.starts_on <= today && (a.ends_on === null || a.ends_on >= today);
}

/** Comunicados the signed-in user can see now, newest first, and which of them he still has to confirm. */
export const myAnnouncementsOptions = (userId: string) =>
  queryOptions({
    queryKey: ["announcements", "mine", userId],
    queryFn: async () => {
      const [list, reads] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .order("starts_on", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", userId),
      ]);
      // Before the database update (0014) the tables do not exist: behave as "no comunicados".
      if (list.error || reads.error)
        return { items: [] as Announcement[], unread: [] as Announcement[] };
      const read = new Set((reads.data ?? []).map((r) => r.announcement_id));
      const items = (list.data ?? []).filter((a) => isLive(a));
      return { items, unread: items.filter((a) => !read.has(a.id)).reverse() };
    },
    staleTime: 60_000,
  });

export async function confirmReading(announcementId: string, userId: string) {
  const { error } = await supabase
    .from("announcement_reads")
    .insert({ announcement_id: announcementId, user_id: userId });
  if (error && error.code !== "23505")
    throw new Error("Não foi possível registrar a leitura. Tente de novo.");
}

export function audienceLabel(a: Pick<Announcement, "audience_unit" | "audience_job">) {
  const parts = [
    a.audience_unit ? `Loja ${a.audience_unit}` : null,
    a.audience_job ? a.audience_job : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Todos";
}

export function periodLabel(a: Pick<Announcement, "starts_on" | "ends_on">) {
  const f = (d: string) => d.split("-").reverse().join("/");
  return a.ends_on ? `${f(a.starts_on)} a ${f(a.ends_on)}` : `Desde ${f(a.starts_on)}`;
}
