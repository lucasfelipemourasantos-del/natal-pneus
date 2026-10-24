import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Lock, ShieldCheck, Upload } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { supabase } from "@/integrations/supabase/client";
import { catalogOptions, fieldClass } from "@/lib/portal-data";

export const Route = createFileRoute("/_authenticated/admin-documentos")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Documentos — Gestão — Natal Pneus" },
      {
        name: "description",
        content:
          "Envio de documentos individuais aos funcionários: recibos, cartão de ponto e férias.",
      },
      { property: "og:title", content: "Documentos — Gestão — Natal Pneus" },
      { property: "og:description", content: "Envio de documentos individuais aos funcionários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDocumentos,
});

/** The five companies (CNPJs). The four stores come from the units table; Natal Assessoria has no store yet. */
const ASSESSORIA = {
  key: "ASSESSORIA",
  label: "Natal Assessoria",
  legal: "Natal Assessoria",
  cnpj: "CNPJ a cadastrar",
};

const docTypes = ["Recibo de pagamento", "Cartão de ponto", "Recibo de férias", "Outros"];

function AdminDocumentos() {
  const { data: catalog } = useQuery(catalogOptions);
  const { data: people } = useQuery({
    queryKey: ["documents-preview-people"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,unit_code,job_role,status")
        .eq("status", "approved")
        .order("full_name");
      return data ?? [];
    },
  });
  const companies = [
    ...(catalog?.units ?? []).map((u) => ({
      key: u.code,
      label: `Natal Pneus ${u.code.replace("NP", "")}`,
      legal: u.legal_name,
      cnpj: u.cnpj,
    })),
    ASSESSORIA,
  ];
  const [picked, setPicked] = useState("NP1");
  const company = companies.find((c) => c.key === picked) ?? companies[0];
  const staff = (people ?? []).filter((p) => p.unit_code === company?.key);

  return (
    <PortalShell title="Documentos" eyebrow="Gestão · ADM RH">
      <p className="flex items-start gap-3 rounded-xl border border-border bg-warning-soft p-4 text-sm">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <b>Em preparação.</b> O envio de documentos individuais (recibos, cartão de ponto, férias)
          será liberado depois das medidas de segurança: verificação em duas etapas do ADM, senhas
          mais fortes, aceite de cada funcionário (LGPD), CPF protegido e plano com cópias de
          segurança. Por enquanto esta tela é só uma demonstração e nada é enviado.
        </span>
      </p>

      <section className="mt-6" aria-labelledby="companies">
        <h2 id="companies" className="text-lg font-bold">
          Empresas
        </h2>
        <div
          className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          role="tablist"
          aria-label="Empresas"
        >
          {companies.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={c.key === company?.key}
              onClick={() => setPicked(c.key)}
              className={`flex flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors ${c.key === company?.key ? "border-primary shadow-[inset_0_3px_0_var(--primary)]" : "border-border hover:border-foreground/30"}`}
            >
              <span className="font-bold">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.legal}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{c.cnpj}</span>
            </button>
          ))}
        </div>
      </section>

      {company && (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section
            className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-5"
            aria-labelledby="sent"
          >
            <h2 id="sent" className="text-lg font-bold">
              Funcionários · {company.label}
            </h2>
            {!staff.length ? (
              <p className="text-sm text-muted-foreground">
                {company.key === "ASSESSORIA"
                  ? "Os funcionários da Natal Assessoria aparecerão aqui quando a empresa for cadastrada no portal."
                  : "Nenhum funcionário aprovado nesta empresa ainda."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">Funcionário</th>
                      <th className="px-2 font-semibold">Função</th>
                      <th className="px-2 font-semibold">Documentos enviados</th>
                      <th className="pl-2 font-semibold">Ciência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-2.5 pr-2 font-semibold">{p.full_name || p.email}</td>
                        <td className="px-2 text-muted-foreground">{p.job_role ?? "—"}</td>
                        <td className="px-2 text-muted-foreground">Nenhum</td>
                        <td className="pl-2 text-muted-foreground">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5"
            aria-labelledby="send"
          >
            <h2 id="send" className="inline-flex items-center gap-2 text-lg font-bold">
              <Upload size={18} aria-hidden="true" /> Enviar documentos
            </h2>
            <fieldset disabled className="grid gap-4 opacity-70">
              <label className="text-sm">
                Empresa
                <select
                  id="doc-company"
                  value={company.key}
                  onChange={() => undefined}
                  className={fieldClass}
                >
                  {companies.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Tipo de documento
                <select id="doc-type" defaultValue={docTypes[0]} className={fieldClass}>
                  {docTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Competência
                <input id="doc-month" type="month" className={fieldClass} />
              </label>
              <label className="text-sm">
                Arquivo PDF (todos os recibos em um único arquivo)
                <input
                  id="doc-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className={`${fieldClass} py-2`}
                />
              </label>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <FileText size={16} aria-hidden="true" /> Ler e conferir antes de enviar
              </button>
            </fieldset>
            <ol className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
              <li>
                <b className="text-foreground">1.</b> O portal lê o PDF página por página e
                identifica cada funcionário pelo <b className="text-foreground">nome e CPF</b>.
              </li>
              <li>
                <b className="text-foreground">2.</b> Aparece a conferência: identificados e “para
                conferir”. Nada é enviado sem a sua confirmação.
              </li>
              <li>
                <b className="text-foreground">3.</b> Cada funcionário recebe só a própria página em
                “Meus documentos” e confirma com “Recebi e estou ciente”.
              </li>
            </ol>
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} aria-hidden="true" /> Arquivos em pasta privada; só o
              funcionário e o ADM RH acessam.
            </p>
          </section>
        </div>
      )}
    </PortalShell>
  );
}
