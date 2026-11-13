// Carrega o quadro funcional (53 pessoas) na tabela workforce_people. Pode rodar de novo: pessoas já existentes (mesmo nome)
// não são alteradas, para não apagar o que você editou no portal.
// Uso: node scripts/seed-workforce.ts
import { readFileSync } from "node:fs";
import { SEED_PEOPLE } from "./workforce-seed.local.ts";
import { SEED_ABILITIES } from "./workforce-abilities.local.ts";

const raw = readFileSync(new URL("../.env.sync.local", import.meta.url), "utf8");
const env: Record<string, string> = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
const key = env["SUPABASE_SECRET_KEY"]!;
const base = env["SUPABASE_URL"]!;

const rows = SEED_PEOPLE.map((p) => ({
  name: p.name,
  unit_code: p.unit,
  employer: p.employer,
  cbo: p.cbo,
  cbo_title: p.cbo_title,
  role: p.role,
  sector: p.sector,
  skills: p.skills,
  rotates: p.rotates,
  rotation_note: p.rotation_note,
  status: p.status,
  notes: p.notes,
  abilities: SEED_ABILITIES[p.name] ?? {},
}));

const hdr = {
  apikey: key,
  ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  "Content-Type": "application/json",
};
const res = await fetch(`${base}/rest/v1/workforce_people?on_conflict=name`, {
  method: "POST",
  headers: {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    "Content-Type": "application/json",
    Prefer: "resolution=ignore-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});
console.log(
  res.ok
    ? `quadro funcional: ${rows.length} pessoas enviadas`
    : `ERRO ${res.status}: ${await res.text()}`,
);

// Funções: só preenche quem ainda está sem nenhuma (não apaga o que você editou no portal).
let filled = 0;
for (const [name, abilities] of Object.entries(SEED_ABILITIES)) {
  const r = await fetch(
    `${base}/rest/v1/workforce_people?name=eq.${encodeURIComponent(name)}&abilities=eq.%7B%7D`,
    { method: "PATCH", headers: { ...hdr, Prefer: "return=representation" }, body: JSON.stringify({ abilities }) },
  );
  if (r.ok) filled += ((await r.json()) as unknown[]).length;
  else console.log(`ERRO funções (${r.status}): ${await r.text()}`);
}
console.log(`funções preenchidas: ${filled} pessoas`);
