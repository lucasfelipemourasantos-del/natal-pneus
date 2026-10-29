import { Link, useLocation, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BellRing,
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  FileUp,
  FolderLock,
  FolderOpen,
  Gauge,
  Home,
  ShieldCheck,
  LogOut,
  Megaphone,
  Mic,
  Printer,
  Target,
  UserRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import logo from "@/assets/natal-pneus-logo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  canSeeCommissions,
  hasAllStoresAccess,
  initials,
  canOpenOs,
  canManageAssets,
  type Access,
} from "@/lib/access";
import { useQuery } from "@tanstack/react-query";
import { countDocAlerts } from "@/lib/company-docs";
import { catalogOptions } from "@/lib/portal-data";
import { Button } from "@/components/ui/button";
import { PrintMenu } from "@/components/print-menu";
import { AnnouncementBell, AnnouncementGate } from "@/components/announcements";
import { ChartNoAxesCombined } from "lucide-react";

type NavLink = {
  to:
    | "/inicio"
    | "/cursos"
    | "/metas"
    | "/comissoes"
    | "/abrir-os"
    | "/patrimonio"
    | "/comunicados"
    | "/documentos"
    | "/admin-documentos"
    | "/admin-alertas"
    | "/admin-estoque"
    | "/admin-comunicados"
    | "/trajetoria"
    | "/empresa"
    | "/resultados"
    | "/comparativos"
    | "/documentos-empresa"
    | "/unidades"
    | "/admin"
    | "/admin-cursos"
    | "/admin-insignias"
    | "/admin-comissoes";
  label: string;
  icon: typeof Home;
};

/** "Meu espaço" is personal; "Gestão" holds leadership and ADM RH tools. */
function navGroups(
  access: Pick<
    Access,
    | "isAdmin"
    | "canReadAll"
    | "isProducer"
    | "sellerCode"
    | "sellerActive"
    | "hasSales"
    | "hasService"
    | "profile"
  >,
) {
  const personal: NavLink[] = [
    { to: "/inicio", label: "Início", icon: Home },
    { to: "/metas", label: "Minhas metas", icon: Target },
    ...(canSeeCommissions(access)
      ? [{ to: "/comissoes" as const, label: "Comissões", icon: Wallet }]
      : []),
    { to: "/cursos", label: "Meus cursos", icon: BookOpen },
    ...(canOpenOs(access)
      ? [{ to: "/abrir-os" as const, label: "Abrir OS por voz", icon: Mic }]
      : []),
    ...(canManageAssets(access)
      ? [{ to: "/patrimonio" as const, label: "Patrimônio", icon: Boxes }]
      : []),
    { to: "/documentos", label: "Meus documentos", icon: FileText },
    { to: "/trajetoria", label: "Minha trajetória", icon: Award },
    { to: "/empresa", label: "Empresa", icon: Building2 },
  ];
  const management: NavLink[] = access.canReadAll
    ? [
        { to: "/unidades", label: "Lojas e funções", icon: Building2 },
        { to: "/admin", label: access.isAdmin ? "Contas" : "Colaboradores", icon: ShieldCheck },
        ...(access.isAdmin
          ? [
              {
                to: "/comparativos" as const,
                label: "Vendas e resultados",
                icon: ChartNoAxesCombined,
              },
              { to: "/admin-comunicados" as const, label: "Comunicados", icon: Megaphone },
              { to: "/admin-documentos" as const, label: "Documentos", icon: FolderLock },
              {
                to: "/documentos-empresa" as const,
                label: "Documentos da empresa",
                icon: FolderOpen,
              },
              { to: "/admin-alertas" as const, label: "Alertas de clientes", icon: BellRing },
              { to: "/admin-estoque" as const, label: "Controle de estoque", icon: Warehouse },
              { to: "/admin-comissoes" as const, label: "Comissões do Decision", icon: FileUp },
              { to: "/admin-cursos" as const, label: "Gerenciar cursos", icon: BookOpen },
              { to: "/admin-insignias" as const, label: "Reconhecimentos", icon: Award },
            ]
          : []),
      ]
    : [];
  return [
    { label: "Meu espaço", links: personal },
    ...(management.length ? [{ label: "Gestão", links: management }] : []),
  ];
}

export function PortalShell({
  title,
  eyebrow,
  printable,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** Shows the "Gerar PDF" button (ADM only) and prints a header with the logo, title and date. */
  printable?: boolean;
  children: ReactNode;
}) {
  const context = useRouteContext({ strict: false }) as { access?: Access };
  const access = context.access ?? { userId: "", profile: null, isAdmin: false };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const name = access.profile?.full_name || access.profile?.email || "Colaborador";
  const role = access.isAdmin ? "ADM RH" : access.profile?.job_role || "Colaborador";
  const { data: catalog } = useQuery(catalogOptions);
  // Company documents close to expiry or expired: a number next to the menu item (ADM only).
  const { data: docAlerts = 0 } = useQuery({
    queryKey: ["company-docs-alerts"],
    enabled: access.isAdmin,
    retry: false,
    queryFn: countDocAlerts,
  });
  const allStores = hasAllStoresAccess(access);
  const store = allStores
    ? undefined
    : catalog?.units.find((u) => u.code === access.profile?.unit_code);
  const unit = allStores ? "Todas as lojas" : store ? `Natal Pneus · ${store.code}` : "";
  const groups = navGroups(access);
  const pathname = useLocation({ select: (l) => l.pathname });
  const management = groups.find((g) => g.label === "Gestão");
  const inManagement = Boolean(management?.links.some((l) => l.to === pathname));
  /** "Gestão" stays closed to keep the menu short; it opens on click, or by itself when one of its screens is open. */
  const [managementOpen, setManagementOpen] = useState(inManagement);
  const showManagement = managementOpen || inManagement;
  const personalLinks = groups.find((g) => g.label === "Meu espaço")?.links ?? [];
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr] print:block">
      <aside className="hidden min-h-screen flex-col bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex print:!hidden">
        <Link to="/inicio" aria-label="Natal Pneus — início" className="block px-2 py-2">
          <img src={logo} alt="Natal Pneus" className="h-auto w-[168px]" />
        </Link>
        <nav className="mt-10 space-y-6" aria-label="Navegação principal">
          {groups.map((group) => {
            const collapsible = group.label === "Gestão";
            const open = !collapsible || showManagement;
            return (
              <div key={group.label} className="space-y-1">
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => setManagementOpen(!showManagement)}
                    aria-expanded={open}
                    aria-controls="nav-gestao"
                    className="flex w-full items-center justify-between rounded-md px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-sidebar-muted/70 hover:text-sidebar-foreground"
                  >
                    {group.label}
                    {docAlerts > 0 && !open && (
                      <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold normal-case text-white">
                        {docAlerts}
                      </span>
                    )}
                    <ChevronDown
                      size={15}
                      aria-hidden="true"
                      className={`transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-sidebar-muted/70">
                    {group.label}
                  </p>
                )}
                <div
                  id={collapsible ? "nav-gestao" : undefined}
                  hidden={!open}
                  className="space-y-1"
                >
                  {group.links.map(({ to, label, icon: Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      activeOptions={{ exact: true }}
                      className="group flex min-h-11 items-center gap-3 rounded-lg border-l-2 border-transparent px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeProps={{
                        className: "border-primary bg-sidebar-accent text-sidebar-foreground",
                      }}
                    >
                      <Icon size={19} aria-hidden="true" />
                      {label}
                      {to === "/documentos-empresa" && docAlerts > 0 && (
                        <span
                          className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold text-white"
                          aria-label={`${docAlerts} documento(s) vencendo`}
                        >
                          {docAlerts}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-sidebar-border pt-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-sidebar-muted">{role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={signOut}
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={17} />
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:static print:hidden">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-10">
            <Link to="/inicio" className="lg:hidden" aria-label="Natal Pneus — início">
              <img src={logo} alt="Natal Pneus" className="h-auto w-[142px]" />
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
              {access.userId && <AnnouncementBell userId={access.userId} />}
              <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {initials(name)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={signOut}
                aria-label="Sair"
                title="Sair"
                className="lg:hidden"
              >
                <LogOut size={18} />
              </Button>
            </div>
          </div>
          <nav
            className="flex overflow-x-auto border-t border-border px-2 lg:hidden"
            aria-label="Navegação principal"
          >
            {[...personalLinks, ...(showManagement ? (management?.links ?? []) : [])].map(
              ({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: true }}
                  className="flex min-w-max flex-1 flex-col items-center gap-1 border-b-2 border-transparent px-3 py-2 text-[11px] font-medium text-muted-foreground"
                  activeProps={{ className: "border-primary text-primary" }}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                  {to === "/documentos-empresa" && docAlerts > 0 && (
                    <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                      {docAlerts}
                    </span>
                  )}
                </Link>
              ),
            )}
            {management && (
              <button
                type="button"
                onClick={() => setManagementOpen(!showManagement)}
                aria-expanded={showManagement}
                className="flex min-w-max flex-1 flex-col items-center gap-1 border-b-2 border-transparent px-3 py-2 text-[11px] font-medium text-muted-foreground"
              >
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={showManagement ? "rotate-180" : ""}
                />
                {showManagement ? "Fechar gestão" : "Gestão"}
              </button>
            )}
          </nav>
        </header>
        {access.userId && <AnnouncementGate userId={access.userId} isAdmin={access.isAdmin} />}
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-7 lg:hidden">
            {eyebrow && <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>}
            <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
          </div>
          <div
            data-print-keep
            className="mb-5 hidden items-center justify-between gap-4 border-b border-border pb-3 print:flex"
          >
            <img src={logo} alt="Natal Pneus" className="h-auto w-[130px]" />
            <div className="text-right">
              <p className="text-lg font-bold">{title}</p>
              <p className="text-xs text-muted-foreground">
                {eyebrow ? `${eyebrow} · ` : ""}Emitido em{" "}
                {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            </div>
          </div>
          {printable && access.isAdmin && (
            <div className="mb-4 flex justify-end print:hidden">
              <PrintMenu />
            </div>
          )}
          {children}
          {store && (
            <footer className="mt-10 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold">
                Natal Pneus <span className="font-normal">· {store.code}</span>
              </p>
              <p>
                {store.legal_name} · CNPJ {store.cnpj}
              </p>
              <p>{store.address}</p>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

export function SectionHeading({
  title,
  action,
  to,
}: {
  title: string;
  action?: string;
  to?: "/cursos" | "/metas" | "/trajetoria" | "/empresa";
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {action && to && (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {action}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function Stat({
  icon: Icon = Gauge,
  label,
  value,
  detail,
}: {
  icon?: typeof Gauge;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export function DemoNotice() {
  return (
    <p className="mb-5 text-xs font-medium text-muted-foreground">
      Visualização com dados demonstrativos
    </p>
  );
}

export { Award, BookOpen, Building2, Target, UserRound };
