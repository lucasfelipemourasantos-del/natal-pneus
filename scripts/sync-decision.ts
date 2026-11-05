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
import {
  allocateExits,
  purchaseRows,
  supplierRows,
  type ApiPurchase,
  type ApiSale,
  type ApiSupplier,
  type SaleLine,
} from "../src/lib/purchases.ts";

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

/** Sellers whose sales never count in the manager's extra base (user decision 03/11/2026: 80 and 202). */
const MANAGER_EXTRA_SKIP = new Set([80, 202]);
/** Seller whose services all count for the manager (wholesale: he earns commission on tires only). */
const MANAGER_ALL_SERVICES_SELLER = 111;

/**
 * Sales the Decision does not pay commission on but that count in the manager's base: every service of Maurício (111) and the
 * "RODIZIO TRUCK" of everybody. It compares the finished sales with the commission report items, line by line.
 */
async function syncManagerExtra(
  env: Record<string, string>,
  token: string,
  competence: string,
  de: string,
  ate: string,
  commissioned: Set<string>,
  commissionItems: { venda: number | string; descricao: string | null }[],
) {
  type Sale = {
    venda: number;
    loja: number;
    vendedor: number;
    situacao: string;
    itens: { descricao: string; servico: boolean; liquido: number; cancelado: boolean }[];
  };
  const paid = new Map<string, string[]>();
  for (const i of commissionItems) {
    const k = String(i.venda);
    const list = paid.get(k) ?? [];
    list.push(i.descricao ?? "");
    paid.set(k, list);
  }
  const totals = new Map<string, number>();
  for (const loja of [1, 2, 3, 4]) {
    let after: number | null = null;
    do {
      const page: { vendas: Sale[]; proximo: number | null } = await decisionGet(
        env,
        token,
        `/vendas?de=${de}&ate=${ate}&loja=${loja}${after === null ? "" : `&apos=${after}`}`,
      );
      for (const sale of page.vendas) {
        if (sale.situacao !== "finalizada") continue;
        if (
          MANAGER_EXTRA_SKIP.has(sale.vendedor) ||
          !commissioned.has(`${sale.loja}:${sale.vendedor}`)
        )
          continue;
        const left = [...(paid.get(String(sale.venda)) ?? [])];
        for (const item of sale.itens) {
          if (item.cancelado) continue;
          const at = left.indexOf(item.descricao);
          if (at >= 0) {
            left.splice(at, 1);
            continue;
          }
          const kind = /^RODIZIO TRUCK/i.test(item.descricao)
            ? "rodizio"
            : sale.vendedor === MANAGER_ALL_SERVICES_SELLER && item.servico
              ? "servico"
              : null;
          if (!kind) continue;
          const key = `NP${sale.loja}|${sale.vendedor}|${kind}`;
          totals.set(key, (totals.get(key) ?? 0) + Math.round(item.liquido * 100));
        }
      }
      after = page.proximo ?? null;
    } while (after !== null);
  }
  const rows = [...totals].map(([key, sold_cents]) => {
    const [unit_code, seller, kind] = key.split("|");
    return { unit_code, seller_code: Number(seller), kind, sold_cents };
  });
  const keyAuth = env.SUPABASE_SECRET_KEY!;
  const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/replace_manager_extra_sales`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: keyAuth,
      ...(keyAuth.startsWith("eyJ") ? { Authorization: `Bearer ${keyAuth}` } : {}),
    },
    body: JSON.stringify({ _competence: competence, _rows: rows }),
  });
  if (!res.ok) throw new Error(`Supabase recusou as vendas extras do gerente (${res.status})`);
  return rows.length;
}

/**
 * The Decision commission report only lists items that earn commission, so a seller who earns none (Humberto, NP2)
 * is missing from the store total. The sales summary has every seller: the ones without a commission report are saved
 * apart, as sales only (no commission, no goal).
 */
async function syncSalesWithoutCommission(
  env: Record<string, string>,
  token: string,
  competence: string,
  de: string,
  ate: string,
  commissioned: Set<string>,
) {
  type Total = { loja: number; vendedor: number; vendas: number; liquido: number };
  type Employee = { funcionario: number; nome: string };
  const summary = await decisionGet<{ totais: Total[] }>(
    env,
    token,
    `/vendas/resumo?de=${de}&ate=${ate}&agrupar=vendedor`,
  );
  const staff = await decisionGet<{ funcionarios: Employee[] }>(env, token, "/funcionarios");
  const names = new Map(staff.funcionarios.map((f) => [f.funcionario, f.nome.trim()]));
  const rows = summary.totais
    // Generic "SUPERVISOR" / "SUPERVISOR NP4" users also do the transfers between stores: not store billing.
    .filter(
      (t) =>
        !commissioned.has(`${t.loja}:${t.vendedor}`) &&
        t.liquido !== 0 &&
        !/^SUPERVISOR(\s+NP\d)?$/i.test(names.get(t.vendedor) ?? ""),
    )
    .map((t) => ({
      unit_code: `NP${t.loja}`,
      seller_code: t.vendedor,
      seller_name: names.get(t.vendedor) ?? `VENDEDOR ${t.vendedor}`,
      sales_count: t.vendas,
      sold_cents: Math.round(t.liquido * 100),
    }));
  const key = env.SUPABASE_SECRET_KEY!;
  const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/replace_sales_without_commission`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ _competence: competence, _rows: rows }),
  });
  if (!res.ok) throw new Error(`Supabase recusou as vendas sem comissão (${res.status})`);
  // The same sellers day by day (store by store), for the day filter. Needs the 0028 database update; never stops the sync.
  try {
    const dayRows: {
      unit_code: string;
      day: string;
      seller_code: number;
      seller_name: string;
      sales_count: number;
      sold_cents: number;
    }[] = [];
    for (const r of rows) {
      const store = r.unit_code.slice(2);
      const days = await decisionGet<{
        totais: { dia: string; vendas: number; liquido: number }[];
      }>(
        env,
        token,
        `/vendas/resumo?de=${de}&ate=${ate}&agrupar=dia&vendedor=${r.seller_code}&loja=${store}`,
      );
      for (const d of days.totais)
        dayRows.push({
          unit_code: r.unit_code,
          day: d.dia,
          seller_code: r.seller_code,
          seller_name: r.seller_name,
          sales_count: d.vendas,
          sold_cents: Math.round(d.liquido * 100),
        });
    }
    await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/replace_sales_without_commission_days`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ _competence: competence, _rows: dayRows }),
    });
  } catch {
    // keep going: the monthly totals above are already saved
  }
  return rows.length;
}

/** Purchase notes (entries) of the period, with their items; replaces what was saved for those days. */
async function syncPurchases(env: Record<string, string>, token: string, de: string, ate: string) {
  const notes: ApiPurchase[] = [];
  let after: number | null = null;
  do {
    const page: { compras: ApiPurchase[]; proximo: number | null } = await decisionGet(
      env,
      token,
      `/compras?de=${de}&ate=${ate}${after === null ? "" : `&apos=${after}`}`,
    );
    notes.push(...page.compras);
    after = page.proximo ?? null;
  } while (after !== null);
  return rpcCall(env, "replace_purchase_notes", {
    _from: de,
    _to: ate,
    _notes: purchaseRows(notes),
  });
}

/**
 * Probable destination of the purchased items (see allocateExits): last 62 days of notes against the sales of the same days
 * until today. Needs the 0031 database update; never stops the sync.
 */
async function syncPurchaseExits(env: Record<string, string>, token: string) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Fortaleza" }));
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const to = iso(now);
  const from = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 62));
  const notes: ApiPurchase[] = [];
  let after: number | null = null;
  do {
    const page: { compras: ApiPurchase[]; proximo: number | null } = await decisionGet(
      env,
      token,
      `/compras?de=${from}&ate=${to}${after === null ? "" : `&apos=${after}`}`,
    );
    notes.push(...page.compras);
    after = page.proximo ?? null;
  } while (after !== null);
  const lines: SaleLine[] = [];
  for (const loja of [1, 2, 3, 4]) {
    let cursor: number | null = null;
    do {
      const page: { vendas: ApiSale[]; proximo: number | null } = await decisionGet(
        env,
        token,
        `/vendas?de=${from}&ate=${to}&loja=${loja}${cursor === null ? "" : `&apos=${cursor}`}`,
      );
      for (const sale of page.vendas) {
        if (sale.situacao !== "finalizada") continue;
        for (const item of sale.itens)
          if (!item.cancelado && !item.servico)
            lines.push({
              loja,
              venda: sale.venda,
              placa: sale.placa,
              cliente: sale.clienteNome,
              data: sale.data.slice(0, 10),
              produto: item.produto,
              quantidade: item.quantidade,
            });
      }
      cursor = page.proximo ?? null;
    } while (cursor !== null);
  }
  return rpcCall(env, "replace_purchase_exits", {
    _from: from,
    _to: to,
    _rows: allocateExits(notes, lines),
  });
}

async function syncSuppliers(env: Record<string, string>, token: string) {
  const { fornecedores } = await decisionGet<{ fornecedores: ApiSupplier[] }>(
    env,
    token,
    "/fornecedores",
  );
  return rpcCall(env, "upsert_suppliers", { _rows: supplierRows(fornecedores) });
}

async function rpcCall(env: Record<string, string>, rpc: string, args: Record<string, unknown>) {
  const key = env.SUPABASE_SECRET_KEY!;
  const res = await fetchRetry(`${env.SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Supabase recusou ${rpc} (${res.status}): ${JSON.stringify(body)}`);
  return body as number;
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
// Suppliers change rarely: refreshed on every run (one request). Never stops the sync.
try {
  console.log(`fornecedores: ${await syncSuppliers(env, token)}`);
} catch (err) {
  console.log(`fornecedores: ${"ERRO " + (err instanceof Error ? err.message : String(err))}`);
}
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
  let semComissao = "";
  try {
    const commissioned = new Set(api.totais.map((t) => `${t.loja}:${t.pessoa}`));
    semComissao = ` · sem comissão: ${await syncSalesWithoutCommission(env, token, competence, de, ate, commissioned)}`;
  } catch (err) {
    semComissao = ` · sem comissão: ERRO ${err instanceof Error ? err.message : String(err)}`;
  }
  let compras = "";
  try {
    compras = ` · notas de compra: ${await syncPurchases(env, token, de, ate)}`;
  } catch (err) {
    compras = ` · notas de compra: ERRO ${err instanceof Error ? err.message : String(err)}`;
  }
  let gerente = "";
  try {
    const commissioned = new Set(api.totais.map((t) => `${t.loja}:${t.pessoa}`));
    gerente = ` · gerente extra: ${await syncManagerExtra(env, token, competence, de, ate, commissioned, api.itens)}`;
  } catch (err) {
    gerente = ` · gerente extra: ERRO ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log(
    `${new Date().toLocaleString("pt-BR")} · ${month} · ${api.itens.length} itens · ${changes.join(" · ")}${techs}${semComissao}${gerente}${compras} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
// Destino provável dos itens comprados (precisa das notas já gravadas acima). Nunca atrapalha a atualização.
try {
  console.log(`destino das compras: ${await syncPurchaseExits(env, token)}`);
} catch (err) {
  console.log(`destino das compras: ERRO ${err instanceof Error ? err.message : String(err)}`);
}
// Aviso por e-mail dos documentos da empresa que vencem (45 dias, 15 dias, vencido). Nunca atrapalha a atualização.
try {
  const { sendDocumentAlerts } = await import("./document-alerts.ts");
  console.log(`alertas de documentos: ${await sendDocumentAlerts(env)}`);
} catch (err) {
  console.log(`alertas de documentos: ERRO ${err instanceof Error ? err.message : String(err)}`);
}
if (withTechnicians) {
  try {
    console.log(`funções do Decision atualizadas: ${await syncRoles(env, token)}`);
  } catch (err) {
    console.log(`funções: ERRO ${err instanceof Error ? err.message : String(err)}`);
  }
}
