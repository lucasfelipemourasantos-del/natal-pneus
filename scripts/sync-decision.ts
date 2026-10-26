/**
 * Busca as comissões no Decision (API somente leitura) e grava no Supabase.
 * Uso: node scripts/sync-decision.ts [--mes=2026-04 ...]
 * Sem --mes: mês atual e, até o dia 10, também o mês anterior (fechamento).
 * Configuração em .env.sync.local (fora do Git): DECISION_API_URL, DECISION_LOGIN, DECISION_PASSWORD,
 * SUPABASE_URL, SUPABASE_SECRET_KEY.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildApiReports,
  monthRange,
  technicianAsSeller,
  type ApiCommissions,
  type ApiTechnicianCommissions,
} from "../src/lib/decision-sync.ts";

/** Network blips (timeouts, resets) are retried a few times; HTTP errors are returned as-is. */
async function fetchRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

const root = new URL("../", import.meta.url);
const configFile = new URL(".env.sync.local", root);
const tokenFile = new URL(".decision-token.local", root);

function loadConfig() {
  if (!existsSync(configFile))
    throw new Error("Arquivo .env.sync.local não encontrado na pasta do projeto.");
  const env = Object.fromEntries(
    readFileSync(configFile, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*[A-Z_]+\s*=/.test(l))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [
          k!.trim(),
          v
            .join("=")
            .trim()
            .replace(/^"(.*)"$/, "$1"),
        ];
      }),
  );
  const need = [
    "DECISION_API_URL",
    "DECISION_LOGIN",
    "DECISION_PASSWORD",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Preencha em .env.sync.local: ${missing.join(", ")}`);
  return env as Record<string, string>;
}

async function decisionToken(env: Record<string, string>) {
  if (existsSync(tokenFile)) {
    const saved = JSON.parse(readFileSync(tokenFile, "utf8")) as { token: string; expira: string };
    if (new Date(saved.expira).getTime() > Date.now() + 5 * 60_000) return saved.token;
  }
  const res = await fetchRetry(`${env.DECISION_API_URL}/acesso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: env.DECISION_LOGIN, senha: env.DECISION_PASSWORD }),
  });
  const body = (await res.json()) as { token?: string; expira?: string; error?: string };
  if (!res.ok || !body.token)
    throw new Error(`Login no Decision recusado (${res.status}): ${body.error ?? ""}`);
  writeFileSync(tokenFile, JSON.stringify({ token: body.token, expira: body.expira }));
  return body.token;
}

async function decisionGet<T>(
  env: Record<string, string>,
  token: string,
  path: string,
): Promise<T> {
  const res = await fetchRetry(`${env.DECISION_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`Decision ${path} → ${res.status}: ${body.error ?? ""}`);
  return body;
}

async function saveMonth(
  env: Record<string, string>,
  competence: string,
  unit: string,
  reports: unknown[],
  rpc = "replace_api_commissions",
) {
  const key = env.SUPABASE_SECRET_KEY!;
  const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ _competence: competence, _unit: unit, _reports: reports }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      `Supabase recusou ${unit} ${competence} (${res.status}): ${JSON.stringify(body)}`,
    );
  return body as number;
}

/** Job function of each Decision employee, so the portal can group technicians (MECANICO 2, BALANCEADOR 1...). */
async function syncRoles(env: Record<string, string>, token: string) {
  type Employee = { funcionario: number; funcaoNome: string | null };
  const body = await decisionGet<Employee[] | { data?: Employee[]; funcionarios?: Employee[] }>(
    env,
    token,
    "/funcionarios",
  );
  const list = Array.isArray(body) ? body : (body.data ?? body.funcionarios ?? []);
  const roles = Object.fromEntries(
    list.filter((f) => f.funcaoNome).map((f) => [String(f.funcionario), f.funcaoNome]),
  );
  const key = env.SUPABASE_SECRET_KEY!;
  const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/set_decision_roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ _roles: roles }),
  });
  if (!res.ok) throw new Error(`Supabase recusou as funções (${res.status})`);
  return (await res.json()) as number;
}

function monthsToSync() {
  const asked = process.argv.filter((a) => a.startsWith("--mes=")).map((a) => a.slice(6));
  if (asked.some((m) => !/^\d{4}-\d{2}$/.test(m))) throw new Error("Use --mes=AAAA-MM");
  if (asked.length) return asked;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (now.getDate() > 10) return [current];
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`, current];
}

const env = loadConfig();
const token = await decisionToken(env);
const withTechnicians = !process.argv.includes("--sem-tecnicos");
for (const month of monthsToSync()) {
  const { competence, de, ate } = monthRange(month);
  const started = Date.now();
  const api = await decisionGet<ApiCommissions>(
    env,
    token,
    `/comissoes/vendedores?de=${de}&ate=${ate}`,
  );
  const byUnit = await buildApiReports(api);
  const changes: string[] = [];
  for (const [unit, reports] of byUnit)
    changes.push(
      `${unit}: ${await saveMonth(env, competence, unit, reports)} atualizado(s) de ${reports.length}`,
    );
  let techs = "";
  if (withTechnicians) {
    // Technicians are optional: a failure here must not hide the seller sync above.
    try {
      const tapi = await decisionGet<ApiTechnicianCommissions>(
        env,
        token,
        `/comissoes/tecnicos?de=${de}&ate=${ate}`,
      );
      const tUnits = await buildApiReports(technicianAsSeller(tapi));
      let changed = 0;
      let total = 0;
      for (const [unit, reports] of tUnits) {
        changed += await saveMonth(
          env,
          competence,
          unit,
          reports,
          "replace_technician_commissions",
        );
        total += reports.length;
      }
      techs = ` · técnicos: ${changed} atualizado(s) de ${total}`;
    } catch (err) {
      techs = ` · técnicos: ERRO ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  console.log(
    `${new Date().toLocaleString("pt-BR")} · ${month} · ${api.itens.length} itens · ${changes.join(" · ")}${techs} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
if (withTechnicians) {
  try {
    console.log(`funções do Decision atualizadas: ${await syncRoles(env, token)}`);
  } catch (err) {
    console.log(`funções: ERRO ${err instanceof Error ? err.message : String(err)}`);
  }
}
