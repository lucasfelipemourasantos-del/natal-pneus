import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/assets";
import { docStatus, needsAttention } from "@/lib/doc-status";
import type { Database } from "@/integrations/supabase/types";

export * from "@/lib/doc-status";

type Tables = Database["public"]["Tables"];
export type CompanyDoc = Tables["company_documents"]["Row"];
export type CompanyDocFile = Tables["company_document_files"]["Row"];

/** Documents (current ones) expiring in 45 days or already expired. 0 when the database update was not applied yet. */
export async function countDocAlerts() {
  const { data } = await supabase
    .from("company_documents")
    .select("expires_at")
    .is("superseded_by", null)
    .not("expires_at", "is", null);
  const today = todayISO();
  return (data ?? []).filter((d) => needsAttention(docStatus(d.expires_at, today))).length;
}
