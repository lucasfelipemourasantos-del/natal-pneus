import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fieldClass } from "@/lib/portal-data";
import { shortName } from "@/lib/workforce";

export const Route = createFileRoute("/_authenticated/ferias")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Férias — Gestão — Natal Pneus" },
      { name: "description", content: "Cronograma anual de férias do grupo." },
      { property: "og:title", content: "Férias — Gestão — Natal Pneus" },
      { property: "og:description", content: "Cronograma anual de férias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VacationsPage,
});

type PersonLite = { id: string; name: string; unit_code: string; employer: string };
type Vacation = {
  id: string;
  person_id: string;
  planned_month: string;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  status: string;
  note: string;
};

const STATUS = [
  { key: "previsto", label: "Previsto" },
  { key: "confirmado", label: "Confirmado" },
  { key: "a_validar", label: "A validar" },
  { key: "dias_a_definir", label: "Dias a definir" },
  { key: "concedido", label: "Concedido" },
] as const;

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[mo - 1]}/${y}`;
};
/** Calendário: dezembro/2026 (agora) e os 12 meses de 2027. */
const MONTHS = [
  "2026-12",
  ...Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}`),
];

const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

function VacationsPage() {
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["workforce-people-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workforce_people")
        .select("id,name,unit_code,employer")
        .eq("active", true)
        .order("name");
      if (error) throw new Error("Não foi possível consultar as pessoas.");
      return (data ?? []) as PersonLite[];
    },
  });
  const vacations = useQuery({
    queryKey: ["workforce-vacations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workforce_vacations")
        .select("id,person_id,planned_month,start_date,end_date,days,status,note");
      if (error)
        throw new Error(
          "Não foi possível consultar as férias. A atualização do banco (0039) já foi aplicada?",
        );
      return (data ?? []) as Vacation[];
    },
  });
  const [error, setError] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["workforce-vacations"] });
  const person = (id: string) => people.data?.find((p) => p.id === id);

  async function patch(id: string, change: Partial<Vacation>) {
    setError("");
    qc.setQueryData<Vacation[]>(["workforce-vacations"], (cur) =>
      (cur ?? []).map((v) => (v.id === id ? { ...v, ...change } : v)),
    );
    const { error: err } = await supabase
      .from("workforce_vacations")
      .update({ ...change, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError("Não foi possível salvar.");
      void refresh();
    }
  }

  async function remove(id: string) {
    setError("");
    qc.setQueryData<Vacation[]>(["workforce-vacations"], (cur) =>
      (cur ?? []).filter((v) => v.id !== id),
    );
    const { error: err } = await supabase.from("workforce_vacations").delete().eq("id", id);
    if (err) {
      setError("Não foi possível remover.");
      void refresh();
    }
  }

  async function add(personId: string, month: string) {
    setError("");
    const { error: err } = await supabase
      .from("workforce_vacations")
      .insert({ person_id: personId, planned_month: month, status: "previsto" });
    if (err) setError("Essa pessoa já está neste mês, ou não foi possível adicionar.");
    void refresh();
  }

  const all = vacations.data ?? [];
  const noDates = all.filter((v) => !v.start_date || !v.end_date).length;
  const toValidate = all.filter((v) => v.status === "a_validar" || v.status === "dias_a_definir");

  return (
    <PortalShell printable title="Férias" eyebrow="Gestão · ADM RH">
      {(people.isPending || vacations.isPending) && (
        <p className="text-muted-foreground">Carregando…</p>
      )}
      {(people.error || vacations.error) && (
        <p role="alert" className="text-destructive">
          {(people.error ?? vacations.error)?.message}
        </p>
      )}
      {people.data && vacations.data && (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-extrabold">Cronograma anual de férias</h2>
            <p className="mt-1 max-w-[80ch] text-sm text-muted-foreground">
              Dezembro de 2026 é a programação para conceder agora. Janeiro a dezembro de 2027 valem
              para o próximo calendário, e a lista de dezembro vale para os dois anos. Preencha
              início e fim: os dias são calculados. A Casa Dona Lourdes não entra no portal.
            </p>
            <p className="mt-2 text-sm">
              <b>{all.length}</b> entradas · <b>{noDates}</b> ainda sem datas ·{" "}
              <b>{toValidate.length}</b> a validar ou com dias a definir
            </p>
            {error && (
              <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
                {error}
              </p>
            )}
          </section>

          {MONTHS.map((m) => {
            const list = all
              .filter((v) => v.planned_month === m)
              .sort((a, b) =>
                (person(a.person_id)?.name ?? "").localeCompare(person(b.person_id)?.name ?? ""),
              );
            const taken = new Set(list.map((v) => v.person_id));
            return (
              <section
                key={m}
                data-print-keep
                className="rounded-xl border border-border bg-card p-4"
              >
                <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold">
                    {monthLabel(m)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {list.length} {list.length === 1 ? "nome" : "nomes"}
                    </span>
                    {m === "2026-12" && (
                      <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold">
                        conceder agora
                      </span>
                    )}
                  </h3>
                  <label className="flex items-center gap-2 text-xs print:hidden">
                    <span className="sr-only">Adicionar pessoa em {monthLabel(m)}</span>
                    <select
                      id={`add-${m}`}
                      value=""
                      onChange={(e) => e.target.value && void add(e.target.value, m)}
                      className={`${fieldClass} !w-56`}
                    >
                      <option value="">Adicionar pessoa…</option>
                      {people.data
                        .filter((p) => !taken.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.unit_code}
                          </option>
                        ))}
                    </select>
                  </label>
                </header>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguém neste mês.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-1 pr-3 font-semibold">Funcionário</th>
                          <th className="pr-3 font-semibold">Loja</th>
                          <th className="pr-3 font-semibold">Início</th>
                          <th className="pr-3 font-semibold">Fim</th>
                          <th className="pr-3 font-semibold">Dias</th>
                          <th className="pr-3 font-semibold">Situação</th>
                          <th className="pr-3 font-semibold">Observação</th>
                          <th className="print:hidden" />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((v) => (
                          <VacationRow
                            key={v.id}
                            v={v}
                            p={person(v.person_id)}
                            onChange={(c) => void patch(v.id, c)}
                            onRemove={() => void remove(v.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}

function VacationRow({
  v,
  p,
  onChange,
  onRemove,
}: {
  v: Vacation;
  p: PersonLite | undefined;
  onChange: (c: Partial<Vacation>) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(v.note);
  const [confirm, setConfirm] = useState(false);
  const setDates = (start: string | null, end: string | null) => {
    const days = start && end && end >= start ? diffDays(start, end) : v.days;
    onChange({ start_date: start, end_date: end, days: days ?? null });
  };
  const tooLong = (v.days ?? 0) > 30;
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 font-semibold">{p ? shortName(p.name) : "—"}</td>
      <td className="pr-3">{p?.unit_code ?? "—"}</td>
      <td className="pr-3">
        <input
          type="date"
          aria-label="Início das férias"
          value={v.start_date ?? ""}
          onChange={(e) => setDates(e.target.value || null, v.end_date)}
          className={`${fieldClass} !w-36`}
        />
      </td>
      <td className="pr-3">
        <input
          type="date"
          aria-label="Fim das férias"
          value={v.end_date ?? ""}
          onChange={(e) => setDates(v.start_date, e.target.value || null)}
          className={`${fieldClass} !w-36`}
        />
      </td>
      <td className="pr-3">
        <input
          type="number"
          min={1}
          max={60}
          aria-label="Dias de férias"
          value={v.days ?? ""}
          onChange={(e) => onChange({ days: e.target.value ? Number(e.target.value) : null })}
          className={`${fieldClass} !w-20 ${tooLong ? "border-destructive" : ""}`}
        />
        {tooLong && <span className="block text-[11px] text-destructive">mais de 30 dias</span>}
      </td>
      <td className="pr-3">
        <select
          aria-label="Situação"
          value={v.status}
          onChange={(e) => onChange({ status: e.target.value })}
          className={`${fieldClass} !w-40`}
        >
          {STATUS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="pr-3">
        <input
          aria-label="Observação"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== v.note && onChange({ note })}
          className={`${fieldClass} !w-56`}
        />
      </td>
      <td className="print:hidden">
        {confirm ? (
          <span className="flex gap-1">
            <Button size="sm" variant="destructive" onClick={onRemove}>
              Remover
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
              Não
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
            Tirar
          </Button>
        )}
      </td>
    </tr>
  );
}
