import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Access = {
  userId: string;
  profile: Profile | null;
  isAdmin: boolean;
  canReadAll?: boolean;
  isProducer?: boolean;
  /** Decision seller code linked to this account, when there is one. */
  sellerCode?: number | null;
};

/** Commission screens: leadership sees every seller, a linked seller sees only himself. */
export function canSeeCommissions(access: Pick<Access, "isAdmin" | "canReadAll" | "sellerCode">): boolean {
  return hasAllStoresAccess(access) || Boolean(access.sellerCode);
}

/** Administrative and leadership scope overrides a professional unit assignment. */
export function hasAllStoresAccess(access: Pick<Access, "isAdmin" | "canReadAll">): boolean {
  return access.isAdmin || Boolean(access.canReadAll);
}

/** Reads the signed-in user's profile and admin role (validated by the auth server). */
export async function loadAccess(): Promise<Access | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [{ data: profile }, { data: isAdmin }, { data: canReadAll }, { data: isProducer }, { data: seller }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    supabase.rpc("can_read_all"),
    supabase.rpc("has_role", { _user_id: user.id, _role: "producer" }),
    supabase.from("decision_sellers").select("code").eq("profile_id", user.id).maybeSingle(),
  ]);
  return { userId: user.id, profile: profile ?? null, isAdmin: Boolean(isAdmin), canReadAll: Boolean(canReadAll), isProducer: Boolean(isProducer), sellerCode: seller?.code ?? null };
}

/** Where a signed-in user belongs: pending/suspended employees only see their status page. */
export function homeFor(access: Access): "/admin" | "/inicio" | "/aguardando" {
  if (access.isAdmin) return "/admin";
  return access.profile?.status === "approved" ? "/inicio" : "/aguardando";
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase() || "NP";
}
