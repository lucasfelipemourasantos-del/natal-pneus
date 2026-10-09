import { supabase } from "@/integrations/supabase/client";

export async function uploadFile(bucket: "course-files" | "badges", file: File) {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

/** Private buckets: returns temporary links keyed by path. */
export async function signedUrls(bucket: "course-files" | "badges", paths: (string | null)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(list, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])) as Record<string, string>;
}
