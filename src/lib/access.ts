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
  /** All Decision codes linked to the account (a person may have more than one). */
  sellerCodes?: number[] | undefined;
  /** The linked Decision code is in activity (false: kept only for history, or ignored). */
  sellerActive?: boolean | undefined;
  /** The linked Decision code has sales commissions (seller reports). */
  hasSales?: boolean;
  /** The linked Decision code has service commissions (technician reports). */
  hasService?: boolean;
};

/** Linked to a technician-only code: sees service commissions, not the sellers' sales and peças goal. */
export function isTechnicianOnly(access: Pick<Access, "hasSales" | "hasService">): boolean {
  return Boolean(access.hasService) && !access.hasSales;
}

/** Voice OS opening: leadership, or an active seller (not history-only, not ignored, not technician-only). */
export function canOpenOs(
  access: Pick<
    Access,
    "isAdmin" | "canReadAll" | "sellerCode" | "sellerActive" | "hasSales" | "hasService"
  >,
): boolean {
  return (
    hasAllStoresAccess(access) ||
    (Boolean(access.sellerCode) && access.sellerActive !== false && !isTechnicianOnly(access))
  );
}

/** Peças goal is for sellers; a technician-only account does not get it. */
export function isSeller(
  access: Pick<Access, "isAdmin" | "canReadAll" | "sellerCode" | "hasSales" | "hasService">,
): boolean {
  return hasAllStoresAccess(access) || (Boolean(access.sellerCode) && !isTechnicianOnly(access));
}

/** Commission screens: leadership sees every seller, a linked seller sees only himself. */
export function canSeeCommissions(
  access: Pick<Access, "isAdmin" | "canReadAll" | "sellerCode" | "hasSales" | "hasService">,
): boolean {
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
  const [
    { data: profile },
    { data: isAdmin },
    { data: canReadAll },
    { data: isProducer },
    { data: sellerRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    supabase.rpc("can_read_all"),
    supabase.rpc("has_role", { _user_id: user.id, _role: "producer" }),
    supabase
      .from("decision_sellers")
      .select("code,active,ignored")
      .eq("profile_id", user.id)
      .order("code"),
  ]);
  const rows = sellerRows ?? [];
  const codes = rows.map((r) => r.code);
  const primary = rows.find((r) => r.active && !r.ignored) ?? rows[0];
  let hasSales = false;
  let hasService = false;
  if (codes.length) {
    // RLS limits these to the person's own reports; before migration 0015 the technician check simply counts zero.
    const own = () =>
      supabase
        .from("commission_reports")
        .select("id", { count: "exact", head: true })
        .in("seller_code", codes);
    const [sales, service] = await Promise.all([
      own().neq("kind", "tecnico"),
      own().eq("kind", "tecnico"),
    ]);
    hasSales = (sales.count ?? 0) > 0;
    hasService = (service.count ?? 0) > 0;
  }
  return {
    userId: user.id,
    profile: profile ?? null,
    isAdmin: Boolean(isAdmin),
    canReadAll: Boolean(canReadAll),
    isProducer: Boolean(isProducer),
    sellerCode: primary?.code ?? null,
    sellerCodes: codes,
    sellerActive: rows.length ? rows.some((r) => r.active && !r.ignored) : undefined,
    hasSales,
    hasService,
  };
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
