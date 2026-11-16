// Carrega o calendário de férias (dados em scripts/vacations.local.ts, fora do Git) na tabela workforce_vacations.
// Pode rodar de novo: o que já existe (mesma pessoa e mês) não é alterado.
// Uso: node scripts/seed-vacations.ts
import { readFileSync } from "node:fs";
import { MONTH_KEYS, VACATIONS_BY_MONTH } from "./vacations.local.ts";

const raw = readFileSync(new URL("../.env.sync.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
const key = env["SUPABASE_SECRET_KEY"]!;
const base = env["SUPABASE_URL"]!;
const headers = {
  apikey: key,
  ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  "Content-Type": "application/json",
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[(][^)]*[)]/g, "")
    .toUpperCase()
    .trim();

const res = await fetch(`${base}/rest/v1/workforce_people?select=id,name&active=eq.true`, { headers });
const people = (await res.json()) as { id: string; name: string }[];
const idOf = new Map(people.map((p) => [norm(p.name), p.id]));

const rows: Record<string, unknown>[] = [];
const missing: string[] = [];
for (const { month, key: k } of MONTH_KEYS) {
  for (const v of VACATIONS_BY_MONTH[k] ?? []) {
    const id = idOf.get(norm(v.name));
    if (!id) {
      missing.push(`${v.name} (${month})`);
      continue;
    }
    rows.push({ person_id: id, planned_month: month, status: v.status, note: v.note ?? "" });
  }
}

const out = await fetch(`${base}/rest/v1/workforce_vacations?on_conflict=person_id,planned_month`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
  body: JSON.stringify(rows),
});
console.log(
  out.ok ? `férias: ${rows.length} entradas enviadas` : `ERRO ${out.status}: ${await out.text()}`,
);
if (missing.length) console.log("sem cadastro no portal:", missing.join("; "));
