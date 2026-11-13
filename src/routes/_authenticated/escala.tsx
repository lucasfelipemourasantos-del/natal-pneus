import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Repeat2, TriangleAlert } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fieldClass } from "@/lib/portal-data";
import {
  DEFAULT_HOURS,
  FUNCTIONS,
  LEVELS,
  SECTORS,
  UNITS,
  UNIT_NAME,
  bySector,
  shortName,
  type Abilities,
  type FunctionKey,
  type LevelKey,
  type SectorKey,
  type WorkUnit,
} from "@/lib/workforce";

export const Route = createFileRoute("/_authenticated/escala")({
  beforeLoad: ({ context }) => {
    if (!context.access.isAdmin) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Escala 5x2 — Gestão — Natal Pneus" },
      {
        name: "description",
        content: "Quadro funcional das 4 lojas, mapa mental e organização da escala 5x2.",
      },
      { property: "og:title", content: "Escala 5x2 — Gestão — Natal Pneus" },
      { property: "og:description", content: "Quadro funcional e escala das lojas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EscalaPage,
});

type PersonRow = {
  id: string;
  name: string;
  unit_code: string;
  employer: string;
  cbo: string;
  cbo_title: string;
  role: string;
  sector: string;
  skills: string[];
  rotates: boolean;
  rotation_note: string;
  status: string;
  notes: string;
  abilities: Abilities | null;
};

const COLUMNS =
  "id,name,unit_code,employer,cbo,cbo_title,role,sector,skills,rotates,rotation_note,status,notes,abilities";

const levelOf = (x: PersonRow, fn: FunctionKey): LevelKey | undefined => x.abilities?.[fn];
const LEVEL_STYLE: Record<LevelKey, string> = {
  principal: "bg-primary text-primary-foreground",
  complementar: "bg-primary/20 text-foreground",
  potencial: "border border-dashed border-primary/60 text-muted-foreground",
};

const TABS = [
  { key: "mapa", label: "Mapa mental" },
  { key: "pessoas", label: "Pessoas" },
  { key: "lojas", label: "Funcionamento das lojas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function EscalaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("mapa");
  const people = useQuery({
    queryKey: ["workforce-people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workforce_people")
        .select(COLUMNS)
        .eq("active", true)
        .order("name");
      if (error)
        throw new Error(
          "Não foi possível consultar o quadro. As atualizações do banco (0034 e 0035) já foram aplicadas?",
        );
      return (data ?? []) as unknown as PersonRow[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["workforce-people"] });

  return (
    <PortalShell printable title="Escala 5x2" eyebrow="Gestão · ADM RH">
      <div
        role="tablist"
        aria-label="Seções"
        className="mb-5 inline-flex flex-wrap rounded-lg border border-border p-0.5 print:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {people.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {people.error && (
        <p role="alert" className="text-destructive">
          {people.error.message}
        </p>
      )}
      {people.data && tab === "mapa" && <MindMap people={people.data} onSaved={refresh} />}
      {people.data && tab === "pessoas" && <PeopleTable people={people.data} onSaved={refresh} />}
      {tab === "lojas" && <StoreNotes />}
    </PortalShell>
  );
}

/** Mind map: the group in the center, the 4 stores around it, each store with its sectors and people. */
function MindMap({ people, onSaved }: { people: PersonRow[]; onSaved: () => void }) {
  const [selPerson, setSelPerson] = useState<string | null>(null);
  const [selFn, setSelFn] = useState<FunctionKey | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const picked = people.find((x) => x.id === selPerson) ?? null;
  const unconfirmed = people.filter((x) => x.status === "a_confirmar");
  const special = people.filter((x) => x.rotates || x.rotation_note);
  return (
    <div className="space-y-6">
      <div className="mx-auto w-fit rounded-2xl border-2 border-primary bg-card px-8 py-4 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Grupo Natal Pneus</p>
        <p className="text-2xl font-extrabold">{people.length} colaboradores nas 4 lojas</p>
        <p className="mt-1 text-xs text-muted-foreground">{DEFAULT_HOURS}</p>
      </div>
      <div aria-hidden="true" className="mx-auto h-6 w-px bg-border" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {UNITS.map((u) => {
          const group = people.filter((x) => x.unit_code === u);
          return (
            <section
              key={u}
              data-print-keep
              className="space-y-3 rounded-2xl border border-border bg-card p-4"
              aria-label={UNIT_NAME[u]}
            >
              <header className="border-b border-border pb-2">
                <h2 className="text-lg font-extrabold">{u}</h2>
                <p className="text-xs text-muted-foreground">
                  {UNIT_NAME[u].split(" · ")[1]} · {group.length} pessoas
                </p>
              </header>
              <StructurePanel
                group={group}
                all={people}
                picked={picked}
                selFn={selFn}
                onPickFn={(k) => setSelFn((cur) => (cur === k ? null : k))}
              />
              {bySector(group).map((s) => (
                <div
                  key={s.key}
                  className="space-y-1.5 border-l-4 pl-3"
                  style={{ borderColor: s.color }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-wide"
                    style={{ color: s.color }}
                  >
                    {s.label} · {s.people.length}
                  </p>
                  <ul className="space-y-1">
                    {s.people.map((x) => (
                      <li
                        key={x.id}
                        className={`rounded-md bg-muted/60 px-2 py-1.5 text-sm ${selFn && levelOf(x, selFn) ? "ring-2 ring-primary" : ""} ${picked?.id === x.id ? "outline outline-2 outline-primary" : ""}`}
                        title={[x.name, x.role, x.skills.join(", "), x.rotation_note]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        <button
                          type="button"
                          onClick={() => setSelPerson((cur) => (cur === x.id ? null : x.id))}
                          aria-pressed={picked?.id === x.id}
                          className="font-semibold underline-offset-2 hover:underline"
                        >
                          {shortName(x.name)}
                        </button>
                        {x.rotates && (
                          <Repeat2
                            size={13}
                            className="ml-1 inline text-primary"
                            aria-label="Faz rodízio entre lojas"
                          />
                        )}
                        {x.status === "a_confirmar" && (
                          <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-bold">
                            a confirmar
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">{x.role}</span>
                        {x.skills.length > 0 && (
                          <span className="block text-[11px] text-muted-foreground/80">
                            também: {x.skills.join(", ")}
                          </span>
                        )}
                        {selFn && levelOf(x, selFn) && (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 text-[10px] font-bold ${LEVEL_STYLE[levelOf(x, selFn)!]}`}
                          >
                            {LEVELS.find((l) => l.key === levelOf(x, selFn))?.label}
                          </span>
                        )}
                        {picked?.id === x.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1.5 print:hidden"
                            onClick={() => setEditing(x)}
                          >
                            Editar funções
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {special.length > 0 && (
        <section data-print-keep className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Rodízio e coberturas combinadas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {special.map((x) => (
              <li key={x.id} className="flex flex-wrap gap-x-2">
                <Repeat2 size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <b>{shortName(x.name)}</b> ({x.unit_code}):
                <span className="text-muted-foreground">{x.rotation_note || "faz rodízio"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <EditAbilities
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}

      {unconfirmed.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground print:hidden">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {unconfirmed.length} pessoas marcadas "a confirmar" ainda não foram conferidas com o RH:{" "}
          {unconfirmed.map((x) => shortName(x.name)).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** Minimum structure of one store: how many people cover each function; lights up for the picked person. */
function StructurePanel({
  group,
  all,
  picked,
  selFn,
  onPickFn,
}: {
  group: PersonRow[];
  all: PersonRow[];
  picked: PersonRow | null;
  selFn: FunctionKey | null;
  onPickFn: (k: FunctionKey) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Estrutura mínima {picked ? `· funções de ${shortName(picked.name)}` : ""}
      </p>
      <div className="flex flex-wrap gap-1">
        {FUNCTIONS.map((fn) => {
          const pool = fn.key === "motorista" ? all : group;
          const cover = pool.filter((x) => {
            const l = levelOf(x, fn.key);
            return l === "principal" || l === "complementar";
          }).length;
          const potential = pool.filter((x) => levelOf(x, fn.key) === "potencial").length;
          const mine = picked ? levelOf(picked, fn.key) : undefined;
          const tone =
            cover === 0
              ? "border-destructive/50 text-destructive"
              : cover === 1
                ? "border-warning/60"
                : "border-border";
          return (
            <button
              key={fn.key}
              type="button"
              onClick={() => onPickFn(fn.key)}
              aria-pressed={selFn === fn.key}
              title={
                cover === 0
                  ? "Ninguém cobre esta função"
                  : cover === 1
                    ? "Só 1 pessoa cobre: sem reserva"
                    : `${cover} pessoas cobrem`
              }
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone} ${mine ? LEVEL_STYLE[mine] : ""} ${selFn === fn.key ? "ring-2 ring-primary" : ""}`}
            >
              {fn.label.replace(" (apoio das 4 lojas)", "")} · {cover}
              {potential > 0 ? ` (+${potential})` : ""}
              {mine ? ` · ${LEVELS.find((l) => l.key === mine)?.short}` : ""}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Número = pessoas que cobrem (principal ou complementar); (+n) = potencial. Vermelho: ninguém;
        amarelo: sem reserva. Clique numa função ou numa pessoa para acender.
      </p>
    </div>
  );
}

function EditAbilities({
  person,
  onClose,
  onSaved,
}: {
  person: PersonRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ab, setAb] = useState<Abilities>({ ...(person.abilities ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("workforce_people")
      .update({ abilities: ab, updated_at: new Date().toISOString() })
      .eq("id", person.id);
    setBusy(false);
    if (err) return setError("Não foi possível salvar. A atualização do banco (0035) já foi aplicada?");
    onSaved();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Funções de {person.name}</DialogTitle>
          <DialogDescription>
            Principal: faz hoje. Complementar: faz quando precisa. Potencial: pode aprender, ainda não
            faz.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {FUNCTIONS.map((fn) => (
            <label key={fn.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{fn.label}</span>
              <select
                value={ab[fn.key] ?? ""}
                onChange={(e) =>
                  setAb((cur) => {
                    const next = { ...cur };
                    if (e.target.value) next[fn.key] = e.target.value as LevelKey;
                    else delete next[fn.key];
                    return next;
                  })
                }
                className={`${fieldClass} !w-44`}
              >
                <option value="">Não faz</option>
                {LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeopleTable({ people, onSaved }: { people: PersonRow[]; onSaved: () => void }) {
  const [unit, setUnit] = useState("");
  const [sector, setSector] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const rows = people.filter(
    (x) =>
      (!unit || x.unit_code === unit) &&
      (!sector || x.sector === sector) &&
      (!search || x.name.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Loja
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass}>
            <option value="">Todas</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Setor
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={fieldClass}>
            <option value="">Todos</option>
            {SECTORS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Buscar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome"
            className={fieldClass}
          />
        </label>
        <span className="pb-3 text-sm text-muted-foreground">{rows.length} pessoas</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Nome</th>
              <th className="px-2 font-semibold">Loja</th>
              <th className="px-2 font-semibold">Função informada</th>
              <th className="px-2 font-semibold">CBO</th>
              <th className="px-2 font-semibold">Empregador</th>
              <th className="px-2 font-semibold">Também faz</th>
              <th className="px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="border-t border-border align-top">
                <td className="px-3 py-2 font-semibold">
                  {x.name}
                  {x.status === "a_confirmar" && (
                    <span className="ml-2 rounded-full bg-warning-soft px-1.5 text-[10px] font-bold">
                      a confirmar
                    </span>
                  )}
                </td>
                <td className="px-2">{x.unit_code}</td>
                <td className="px-2">{x.role}</td>
                <td className="px-2 tabular-nums">
                  {x.cbo}
                  <span className="block text-[11px] text-muted-foreground">{x.cbo_title}</span>
                </td>
                <td className="px-2 text-muted-foreground">{x.employer}</td>
                <td className="px-2 text-muted-foreground">{x.skills.join(", ") || "—"}</td>
                <td className="px-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(x)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditPerson
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </div>
  );
}

function EditPerson({
  person,
  onClose,
  onSaved,
}: {
  person: PersonRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState<string>(person.unit_code);
  const [sector, setSector] = useState<string>(person.sector);
  const [role, setRole] = useState(person.role);
  const [skills, setSkills] = useState(person.skills.join(", "));
  const [rotates, setRotates] = useState(person.rotates);
  const [rotationNote, setRotationNote] = useState(person.rotation_note);
  const [status, setStatus] = useState(person.status);
  const [notes, setNotes] = useState(person.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("workforce_people")
      .update({
        unit_code: unit,
        sector,
        role: role.trim(),
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        rotates,
        rotation_note: rotationNote.trim(),
        status,
        notes: notes.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", person.id);
    setBusy(false);
    if (err) return setError("Não foi possível salvar.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{person.name}</DialogTitle>
          <DialogDescription>
            CBO {person.cbo} · {person.cbo_title} · {person.employer}. O CBO e o cargo da folha não
            mudam aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Loja
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={fieldClass}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Setor
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={fieldClass}
            >
              {SECTORS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
            Função informada pelo RH
            <input value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
            Também faz (separe por vírgula)
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Estoquista, Caixa (POS)"
              className={fieldClass}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={rotates}
              onChange={(e) => setRotates(e.target.checked)}
            />
            Faz rodízio entre lojas
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
            Como é o rodízio ou a cobertura combinada
            <textarea
              value={rotationNote}
              onChange={(e) => setRotationNote(e.target.value)}
              rows={2}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Situação do cadastro
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={fieldClass}
            >
              <option value="confirmado">Confirmado</option>
              <option value="a_confirmar">A confirmar com o RH</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
            Observações e acordos internos
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hours and the written manual of how each store works (what each sector needs, who covers what). */
function StoreNotes() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["workforce-unit-notes"],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("workforce_unit_notes")
        .select("unit_code,hours,manual");
      if (err)
        throw new Error(
          "Não foi possível consultar. A atualização do banco (0034) já foi aplicada?",
        );
      return rows ?? [];
    },
  });
  if (isPending) return <p className="text-muted-foreground">Carregando…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error.message}
      </p>
    );
  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-sm text-muted-foreground">
        Escreva aqui como cada loja funciona por inteiro: quantas pessoas precisa em cada setor e em
        cada horário, o que acontece quando alguém falta e quem cobre o quê. É a base da escala e
        das férias.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        {UNITS.map((u) => {
          const row = data?.find((r) => r.unit_code === u);
          return (
            <UnitNote
              key={u}
              unit={u}
              hours={row?.hours ?? DEFAULT_HOURS}
              manual={row?.manual ?? ""}
              onSaved={() => qc.invalidateQueries({ queryKey: ["workforce-unit-notes"] })}
            />
          );
        })}
      </div>
    </div>
  );
}

function UnitNote({
  unit,
  hours: initialHours,
  manual: initialManual,
  onSaved,
}: {
  unit: WorkUnit;
  hours: string;
  manual: string;
  onSaved: () => void;
}) {
  const [hours, setHours] = useState(initialHours);
  const [manual, setManual] = useState(initialManual);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase
      .from("workforce_unit_notes")
      .upsert({ unit_code: unit, hours, manual, updated_at: new Date().toISOString() });
    setBusy(false);
    setMsg(error ? "Não foi possível salvar." : "Salvo.");
    if (!error) onSaved();
  }
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">
        {unit}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {UNIT_NAME[unit].split(" · ")[1]}
        </span>
      </h2>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Horário de funcionamento
        <input value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Como a loja funciona
        <textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          rows={10}
          placeholder="Ex.: A pista precisa de no mínimo 2 técnicos de segunda a sexta e 2 no sábado. A venda precisa de 2 vendedores..."
          className={fieldClass}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
        {msg && (
          <span role="status" className="text-sm text-muted-foreground">
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}
