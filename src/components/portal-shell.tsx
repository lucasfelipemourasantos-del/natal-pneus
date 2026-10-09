import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Building2,
  ChevronRight,
  Gauge,
  Home,
  ShieldCheck,
  LogOut,
  Target,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import logoAsset from "@/assets/natal-pneus-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/access";

const navigation = [
  { to: "/inicio" as const, label: "Início", icon: Home },
  { to: "/cursos" as const, label: "Meus cursos", icon: BookOpen },
  { to: "/metas" as const, label: "Minhas metas", icon: Target },
  { to: "/trajetoria" as const, label: "Minha trajetória", icon: Award },
  { to: "/empresa" as const, label: "Empresa", icon: Building2 },
];

export function PortalShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const context = useRouteContext({ strict: false }) as { access?: import("@/lib/access").Access };
  const access = context.access ?? { userId: "", profile: null, isAdmin: false };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const name = access.profile?.full_name || access.profile?.email || "Colaborador";
  const role = access.isAdmin ? "Administrador" : access.profile?.job_role || "Colaborador";
  const unit = access.profile?.unit || (access.isAdmin ? "Administração" : "");
  const links = access.isAdmin
    ? [...navigation, { to: "/admin" as const, label: "Acessos", icon: ShieldCheck }]
    : navigation;
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { perfil: access.isAdmin ? "admin" : "funcionario" }, replace: true });
  }
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <Link to="/inicio" aria-label="Natal Pneus — início" className="block px-2 py-2">
          <img src={logoAsset.url} alt="Natal Pneus" className="h-auto w-[168px]" />
        </Link>
        <nav className="mt-10 space-y-1" aria-label="Navegação principal">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="group flex min-h-11 items-center gap-3 rounded-lg border-l-2 border-transparent px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "border-primary bg-sidebar-accent text-sidebar-foreground" }}
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border pt-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initials(name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-sidebar-muted">{role}</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Sair" className="grid size-9 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:static">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-10">
            <Link to="/inicio" className="lg:hidden" aria-label="Natal Pneus — início">
              <img src={logoAsset.url} alt="Natal Pneus" className="h-auto w-[142px]" />
            </Link>
            <div className="hidden lg:block">
              {eyebrow && <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>}
              <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-foreground">{name}</p>
                <p className="text-xs text-muted-foreground">{unit}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initials(name)}</span>
              <button type="button" onClick={signOut} aria-label="Sair" className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"><LogOut size={18} /></button>
            </div>
          </div>
          <nav className="flex overflow-x-auto border-t border-border px-2 lg:hidden" aria-label="Navegação principal">
            {links.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="flex min-w-max flex-1 flex-col items-center gap-1 border-b-2 border-transparent px-3 py-2 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "border-primary text-primary" }}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-7 lg:hidden">
            {eyebrow && <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export function SectionHeading({ title, action, to }: { title: string; action?: string; to?: "/cursos" | "/metas" | "/trajetoria" | "/empresa" }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {action && to && (
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {action}<ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Stat({ icon: Icon = Gauge, label, value, detail }: { icon?: typeof Gauge; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
        <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon size={20} /></span>
      </div>
    </div>
  );
}

export function DemoNotice() {
  return <p className="mb-5 text-xs font-medium text-muted-foreground">Visualização com dados demonstrativos</p>;
}

export { Award, BookOpen, Building2, Target, UserRound };