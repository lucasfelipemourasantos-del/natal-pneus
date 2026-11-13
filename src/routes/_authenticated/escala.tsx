import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
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

type View = WorkUnit | "resumo";

type Patch = { unit_code?: string; sector?: string; abilities?: Abilities };

const NEXT_LEVEL: Record<string, LevelKey | undefined> = {
  "": "principal",
  principal: "complementar",
  complementar: "potencial",
  potencial: undefined,
};

const fnLabel = (k: FunctionKey) =>
  (FUNCTIONS.find((f) => f.key === k)?.label ?? k).replace(" (apoio das 4 lojas)", "");

/** Pessoas que cobrem uma função (principal ou complementar); motorista conta o grupo todo. */
function coverOf(fn: FunctionKey, group: PersonRow[], all: PersonRow[]) {
  const pool = fn === "motorista" ? all : group;
  const cover = pool.filter((x) => {
    const l = levelOf(x, fn);
    return l === "principal" || l === "complementar";
  }).length;
  const potential = pool.filter((x) => levelOf(x, fn) === "potencial").length;
  return { cover, potential };
}

type Line = { key: string; d: string; level: LevelKey };

/**
 * Mapa mental de uma loja por vez: à esquerda o que a loja precisa, à direita os funcionários.
 * Ao clicar num funcionário, traça uma linha até cada função que ele exerce.
 */
function MindMap({ people, onSaved }: { people: PersonRow[]; onSaved: () => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("NP4");
  const [selPerson, setSelPerson] = useState<string | null>(null);
  const [selFn, setSelFn] = useState<FunctionKey | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [error, setError] = useState("");
  const picked = people.find((x) => x.id === selPerson) ?? null;

  /** Saves a change on screen first and then in the database; remembers how to undo it. */
  async function save(id: string, patch: Patch, text: string, isUndo = false) {
    const person = people.find((x) => x.id === id);
    if (!person) return;
    const prev: Patch = {
      unit_code: person.unit_code,
      sector: person.sector,
      abilities: person.abilities ?? {},
    };
    setError("");
    qc.setQueryData<PersonRow[]>(["workforce-people"], (cur) =>
      (cur ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
    const { error: err } = await supabase
      .from("workforce_people")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError("Não foi possível salvar. Tente de novo.");
      onSaved();
      return;
    }
    setNotice(isUndo ? null : { text, undo: () => void save(id, prev, "", true) });
  }

  function pickPerson(id: string) {
    setSelFn(null);
    setSelPerson((cur) => (cur === id ? null : id));
  }

  function clickFunction(fn: FunctionKey) {
    if (picked) {
      const current = levelOf(picked, fn) ?? "";
      const next = NEXT_LEVEL[current];
      const abilities: Abilities = { ...(picked.abilities ?? {}) };
      if (next) abilities[fn] = next;
      else delete abilities[fn];
      void save(
        picked.id,
        { abilities },
        `${shortName(picked.name)} · ${fnLabel(fn)}: ${next ? LEVELS.find((l) => l.key === next)?.label : "não faz"}`,
      );
    } else {
      setSelFn((cur) => (cur === fn ? null : fn));
    }
  }

  function changeView(v: View) {
    setView(v);
    setSelPerson(null);
    setSelFn(null);
  }

  return (
    <div className="space-y-5">
      <div
        className="flex flex-wrap items-center gap-2 print:hidden"
        role="tablist"
        aria-label="Loja"
      >
        {UNITS.map((u) => {
          const group = people.filter((x) => x.unit_code === u);
          const missing = FUNCTIONS.filter((f) => coverOf(f.key, group, people).cover === 0).length;
          return (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={view === u}
              onClick={() => changeView(u)}
              className={`min-h-12 rounded-xl border px-4 text-left ${view === u ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"}`}
            >
              <span className="block text-base font-extrabold">{u}</span>
              <span className="block text-[11px] opacity-80">
                {group.length} pessoas{missing > 0 ? ` · ${missing} sem cobertura` : ""}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={view === "resumo"}
          onClick={() => changeView("resumo")}
          className={`min-h-12 rounded-xl border px-4 text-base font-bold ${view === "resumo" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"}`}
        >
          Resumo das 4 lojas
        </button>
      </div>

      {view === "resumo" ? (
        <Summary people={people} onOpen={changeView} />
      ) : (
        <StoreBoard
          unit={view}
          people={people}
          picked={picked}
          selFn={selFn}
          onPickPerson={pickPerson}
          onClickFunction={clickFunction}
          onMoveUnit={(id, unit) => {
            const p = people.find((x) => x.id === id);
            void save(id, { unit_code: unit }, `${shortName(p?.name ?? "")} foi para ${unit}`);
            setSelPerson(null);
          }}
          onEdit={setEditing}
          onClear={() => {
            setSelPerson(null);
            setSelFn(null);
          }}
        />
      )}

      {(notice || error) && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            notice && (
              <>
                {notice.text}
                {notice.undo && (
                  <Button size="sm" variant="outline" onClick={notice.undo}>
                    Desfazer
                  </Button>
                )}
              </>
            )
          )}
        </p>
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
    </div>
  );
}

function StoreBoard({
  unit,
  people,
  picked,
  selFn,
  onPickPerson,
  onClickFunction,
  onMoveUnit,
  onEdit,
  onClear,
}: {
  unit: WorkUnit;
  people: PersonRow[];
  picked: PersonRow | null;
  selFn: FunctionKey | null;
  onPickPerson: (id: string) => void;
  onClickFunction: (fn: FunctionKey) => void;
  onMoveUnit: (id: string, unit: string) => void;
  onEdit: (p: PersonRow) => void;
  onClear: () => void;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const fnRefs = useRef<Record<string, HTMLElement | null>>({});
  const personRefs = useRef<Record<string, HTMLElement | null>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const sectorOrder = (s: string) => SECTORS.findIndex((x) => x.key === s);
  const group = people
    .filter((x) => x.unit_code === unit)
    .sort((a, b) => sectorOrder(a.sector) - sectorOrder(b.sector) || a.name.localeCompare(b.name));
  const others = people.filter((x) => x.unit_code !== unit);
  const found = search.trim()
    ? others.filter((x) => x.name.toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const pickedHere = picked && picked.unit_code === unit ? picked : null;

  // Recalculates the lines after every render; only updates state when something moved.
  useLayoutEffect(() => {
    const draw = () => {
      const board = boardRef.current;
      if (!board) return;
      const box = board.getBoundingClientRect();
      const pairs: { fn: FunctionKey; id: string; level: LevelKey }[] = [];
      if (pickedHere) {
        for (const f of FUNCTIONS) {
          const l = levelOf(pickedHere, f.key);
          if (l) pairs.push({ fn: f.key, id: pickedHere.id, level: l });
        }
      } else if (selFn) {
        for (const x of group) {
          const l = levelOf(x, selFn);
          if (l) pairs.push({ fn: selFn, id: x.id, level: l });
        }
      }
      const next: Line[] = [];
      for (const p of pairs) {
        const a = fnRefs.current[p.fn]?.getBoundingClientRect();
        const b = personRefs.current[p.id]?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.right - box.left;
        const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left;
        const y2 = b.top + b.height / 2 - box.top;
        const bend = Math.max(40, (x2 - x1) / 2);
        next.push({
          key: `${p.fn}:${p.id}`,
          level: p.level,
          d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`,
        });
      }
      setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  });

  const LINE_STYLE: Record<LevelKey, { w: number; o: number; dash?: string }> = {
    principal: { w: 4, o: 1 },
    complementar: { w: 3, o: 0.65 },
    potencial: { w: 2.5, o: 0.7, dash: "7 6" },
  };

  return (
    <section data-print-keep className="space-y-4" aria-label={UNIT_NAME[unit]}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-extrabold">
            {unit}{" "}
            <span className="text-base font-semibold text-muted-foreground">
              {UNIT_NAME[unit].split(" · ")[1]} · {group.length} pessoas
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{DEFAULT_HOURS}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {LEVELS.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <svg width="28" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="27"
                  y2="4"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth={LINE_STYLE[l.key].w}
                  strokeOpacity={LINE_STYLE[l.key].o}
                  strokeDasharray={LINE_STYLE[l.key].dash}
                />
              </svg>
              {l.label}
            </span>
          ))}
        </div>
      </header>

      {pickedHere && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-primary/5 p-3 print:hidden">
          <b className="text-base">{pickedHere.name}</b>
          <Button size="sm" variant="outline" onClick={() => onEdit(pickedHere)}>
            Editar funções
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            Mover para
            <select
              value={pickedHere.unit_code}
              onChange={(e) => onMoveUnit(pickedHere.id, e.target.value)}
              className={`${fieldClass} !w-24`}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={onClear}>
            Limpar
          </Button>
        </div>
      )}

      <div
        ref={boardRef}
        className="relative grid gap-x-24 gap-y-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            O que a loja precisa
          </h3>
          <ul className="space-y-2">
            {FUNCTIONS.map((fn) => {
              const { cover, potential } = coverOf(fn.key, group, people);
              const mine = pickedHere ? levelOf(pickedHere, fn.key) : undefined;
              const lit = selFn === fn.key;
              const tone =
                cover === 0
                  ? "border-destructive/60"
                  : cover === 1
                    ? "border-warning/70"
                    : "border-border";
              return (
                <li key={fn.key}>
                  <button
                    ref={(el) => {
                      fnRefs.current[fn.key] = el;
                    }}
                    type="button"
                    onClick={() => onClickFunction(fn.key)}
                    aria-pressed={lit}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-left ${tone} ${mine ? LEVEL_STYLE[mine] : "bg-card"} ${lit ? "ring-2 ring-primary" : ""}`}
                  >
                    <span className="text-lg font-bold leading-tight">{fnLabel(fn.key)}</span>
                    <span className="text-right text-xs leading-tight">
                      {mine ? (
                        <b className="text-sm">{LEVELS.find((l) => l.key === mine)?.label}</b>
                      ) : cover === 0 ? (
                        <b className="text-destructive">Ninguém cobre</b>
                      ) : cover === 1 ? (
                        <b>Só 1 pessoa</b>
                      ) : (
                        <b>{cover} pessoas</b>
                      )}
                      {potential > 0 && !mine && (
                        <span className="block opacity-70">+{potential} podem aprender</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const id = e.dataTransfer.getData("text/plain");
            if (id) onMoveUnit(id, unit);
          }}
          className={`rounded-xl ${dragOver ? "bg-primary/10" : ""}`}
        >
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Funcionários da {unit}
          </h3>
          <ul className="space-y-2">
            {group.map((x) => {
              const sec = SECTORS.find((s) => s.key === x.sector);
              const isPicked = picked?.id === x.id;
              const lit = selFn ? levelOf(x, selFn) : undefined;
              const count = FUNCTIONS.filter((f) => levelOf(x, f.key)).length;
              return (
                <li key={x.id}>
                  <button
                    ref={(el) => {
                      personRefs.current[x.id] = el;
                    }}
                    type="button"
                    onClick={() => onPickPerson(x.id)}
                    aria-pressed={isPicked}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 bg-card px-4 py-2 text-left ${isPicked ? "border-primary ring-2 ring-primary" : lit ? "border-primary" : "border-border"}`}
                    style={{ borderLeftColor: sec?.color, borderLeftWidth: 8 }}
                  >
                    <span className="min-w-0">
                      <span className="block text-xl font-extrabold leading-tight">
                        {shortName(x.name)}
                        {x.rotates && (
                          <Repeat2
                            size={16}
                            className="ml-1.5 inline text-primary"
                            aria-label="Faz rodízio entre lojas"
                          />
                        )}
                        {x.status === "a_confirmar" && (
                          <span className="ml-2 rounded-full bg-warning-soft px-2 text-[11px] font-bold">
                            a confirmar
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-muted-foreground">{x.role}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      {lit ? (
                        <b className={`rounded-full px-2 py-0.5 text-xs ${LEVEL_STYLE[lit]}`}>
                          {LEVELS.find((l) => l.key === lit)?.label}
                        </b>
                      ) : (
                        `${count} funções`
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary"
        >
          {lines.map((l) => (
            <g key={l.key}>
              <path
                d={l.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={LINE_STYLE[l.level].w}
                strokeOpacity={LINE_STYLE[l.level].o}
                strokeDasharray={LINE_STYLE[l.level].dash}
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>
      </div>

      <p className="max-w-[80ch] text-xs text-muted-foreground print:hidden">
        Clique num funcionário para traçar o que ele faz. Com ele selecionado, clique numa função da
        esquerda para mudar a linha: principal, complementar, potencial e sem linha. Sem funcionário
        selecionado, clicar numa função mostra quem a exerce.
      </p>

      <details className="rounded-xl border border-border bg-card p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-bold">
          Outras lojas (ocultas) · {others.length} pessoas. Buscar um funcionário
        </summary>
        <div className="mt-3 space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite o nome"
            aria-label="Buscar funcionário de outra loja"
            className={fieldClass}
          />
          {search.trim() && found.length === 0 && (
            <p className="text-sm text-muted-foreground">Ninguém encontrado nas outras lojas.</p>
          )}
          <ul className="space-y-1.5">
            {found.slice(0, 12).map((x) => (
              <li
                key={x.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", x.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
              >
                <span>
                  <b className="text-base">{shortName(x.name)}</b>{" "}
                  <span className="text-sm text-muted-foreground">
                    {x.unit_code} · {x.role}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => onMoveUnit(x.id, unit)}>
                  Trazer para {unit}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

/** Quick look at the 4 stores: how well each function is covered, plus rotations and pending checks. */
function Summary({ people, onOpen }: { people: PersonRow[]; onOpen: (u: WorkUnit) => void }) {
  const unconfirmed = people.filter((x) => x.status === "a_confirmar");
  const special = people.filter((x) => x.rotates || x.rotation_note);
  return (
    <div className="space-y-5">
      <div className="mx-auto w-fit rounded-2xl border-2 border-primary bg-card px-8 py-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Grupo Natal Pneus</p>
        <p className="text-2xl font-extrabold">{people.length} colaboradores nas 4 lojas</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {UNITS.map((u) => {
          const group = people.filter((x) => x.unit_code === u);
          return (
            <section
              key={u}
              data-print-keep
              className="rounded-2xl border border-border bg-card p-4"
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold">
                  {u}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {group.length} pessoas
                  </span>
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="print:hidden"
                  onClick={() => onOpen(u)}
                >
                  Abrir loja
                </Button>
              </header>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {FUNCTIONS.map((fn) => {
                  const { cover } = coverOf(fn.key, group, people);
                  return (
                    <li
                      key={fn.key}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm ${cover === 0 ? "border-destructive/60 text-destructive" : cover === 1 ? "border-warning/70" : "border-border"}`}
                    >
                      <span className="font-semibold">{fnLabel(fn.key)}</span>
                      <b>{cover}</b>
                    </li>
                  );
                })}
              </ul>
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

      {unconfirmed.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground print:hidden">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {unconfirmed.length} pessoas marcadas "a confirmar":{" "}
          {unconfirmed.map((x) => shortName(x.name)).join(", ")}.
        </p>
      )}
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
    if (err)
      return setError("Não foi possível salvar. A atualização do banco (0035) já foi aplicada?");
    onSaved();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Funções de {person.name}</DialogTitle>
          <DialogDescription>
            Principal: faz hoje. Complementar: faz quando precisa. Potencial: pode aprender, ainda
            não faz.
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
