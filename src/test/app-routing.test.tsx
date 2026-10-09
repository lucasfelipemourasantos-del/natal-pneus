import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

describe("Access rules", () => {
  it("sends pending employees to the status page and admins to the admin area", async () => {
    const { homeFor } = await import("@/lib/access");
    const base = { userId: "u", profile: null } as const;
    expect(homeFor({ ...base, isAdmin: true })).toBe("/admin");
    expect(homeFor({ ...base, isAdmin: false, profile: { status: "pending" } as never })).toBe("/aguardando");
    expect(homeFor({ ...base, isAdmin: false, profile: { status: "suspended" } as never })).toBe("/aguardando");
    expect(homeFor({ ...base, isAdmin: false, profile: { status: "rejected" } as never })).toBe("/aguardando");
    expect(homeFor({ ...base, isAdmin: false, profile: { status: "approved" } as never })).toBe("/inicio");
  });
});
