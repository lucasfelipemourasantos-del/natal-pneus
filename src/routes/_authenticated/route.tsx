import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { loadAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const access = await loadAccess();
    if (!access) throw redirect({ to: "/auth", search: { perfil: "funcionario" } });
    if (!access.isAdmin && access.profile?.status !== "approved") throw redirect({ to: "/aguardando" });
    return { access };
  },
  component: () => <Outlet />,
});
