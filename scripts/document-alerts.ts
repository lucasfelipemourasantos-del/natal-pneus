/**
 * Alertas de vencimento dos documentos da empresa por e-mail.
 * Roda no fim da rotina de atualização (a cada 30 minutos) e envia um aviso só quando um documento entra numa faixa nova:
 * 45 dias, 15 dias ou vencido. Cada faixa de cada documento é enviada uma vez (registrada em company_document_alerts).
 *
 * Teste manual: node scripts/document-alerts.ts --teste   (envia um e-mail de teste e mostra o que seria avisado)
 * Configuração em .env.sync.local (fora do Git): SMTP_USER, SMTP_PASS (senha de app do Gmail), ALERT_TO
 * (e-mails separados por vírgula) e, se não for Gmail, SMTP_HOST e SMTP_PORT.
 */
import { existsSync, readFileSync } from "node:fs";
import { DOC_TYPE_LABEL, alertStage, dueText } from "../src/lib/doc-status.ts";

type Doc = {
  id: string;
  unit_code: string | null;
  doc_type: string;
  name: string;
  number: string | null;
  expires_at: string;
};
type Stage = "d45" | "d15" | "vencido";

const STAGE_TITLE: Record<Stage, string> = {
  vencido: "Vencidos",
  d15: "Vencem em até 15 dias",
  d45: "Vencem em até 45 dias",
};
const STAGE_ORDER: Stage[] = ["vencido", "d15", "d45"];

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Documents that entered a new stage and were not warned about yet. */
export function pendingAlerts(
  docs: Doc[],
  sent: { document_id: string; stage: string }[],
  today: string,
) {
  const done = new Set(sent.map((s) => `${s.document_id}|${s.stage}`));
  return docs.flatMap((d) => {
    const stage = alertStage(d.expires_at, today);
    return stage && !done.has(`${d.id}|${stage}`) ? [{ doc: d, stage }] : [];
  });
}

/** Subject and body of the digest, grouped by stage and then by store. */
export function buildDigest(items: { doc: Doc; stage: Stage }[], today: string, portalUrl: string) {
  const lines: string[] = [];
  const html: string[] = [];
  for (const stage of STAGE_ORDER) {
    const list = items
      .filter((i) => i.stage === stage)
      .sort(
        (a, b) =>
          (a.doc.unit_code ?? "").localeCompare(b.doc.unit_code ?? "") ||
          a.doc.expires_at.localeCompare(b.doc.expires_at),
      );
    if (!list.length) continue;
    lines.push(`${STAGE_TITLE[stage].toUpperCase()}`);
    html.push(
      `<h3 style="margin:18px 0 6px">${STAGE_TITLE[stage]}</h3><ul style="padding-left:18px">`,
    );
    for (const { doc } of list) {
      const store = doc.unit_code ?? "Geral";
      const what = `${DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type} — ${doc.name}${doc.number ? ` (nº ${doc.number})` : ""}`;
      const when = `${dueText(doc.expires_at, today).toLowerCase()} · ${brDate(doc.expires_at)}`;
      lines.push(`- ${store}: ${what} — ${when}`);
      html.push(`<li><b>${escapeHtml(store)}</b>: ${escapeHtml(what)} — ${escapeHtml(when)}</li>`);
    }
    html.push("</ul>");
    lines.push("");
  }
  const overdue = items.filter((i) => i.stage === "vencido").length;
  const subject = `Natal Pneus: ${items.length} documento(s) da empresa ${overdue ? "vencidos ou " : ""}vencendo`;
  const text = `${lines.join("\n")}\nAbra o portal para renovar: ${portalUrl}\n`;
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111"><p>Documentos da empresa que precisam de atenção:</p>${html.join("")}<p><a href="${escapeHtml(portalUrl)}">Abrir Documentos da empresa no portal</a></p></div>`,
  };
}

function loadEnv() {
  const file = new URL("../.env.sync.local", import.meta.url);
  if (!existsSync(file)) throw new Error("Arquivo .env.sync.local não encontrado.");
  return Object.fromEntries(
    readFileSync(file, "utf8")
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
  ) as Record<string, string>;
}

async function rest<T>(env: Record<string, string>, path: string, init?: RequestInit) {
  const key = env["SUPABASE_SECRET_KEY"]!;
  const res = await fetch(`${env["SUPABASE_URL"]}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} em ${path.split("?")[0]}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

async function transport(env: Record<string, string>) {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(env["SMTP_PORT"] || 465);
  return nodemailer.createTransport({
    host: env["SMTP_HOST"] || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: env["SMTP_USER"], pass: env["SMTP_PASS"] },
  });
}

/** E-mails of ALERT_TO (comma separated). */
function recipients(env: Record<string, string>) {
  return (env["ALERT_TO"] ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export function emailConfigured(env: Record<string, string>) {
  return Boolean(env["SMTP_USER"] && env["SMTP_PASS"] && env["ALERT_TO"]);
}

const todayBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Sends the digest when there is something new. Returns a short line for the log. */
export async function sendDocumentAlerts(env: Record<string, string>) {
  if (!emailConfigured(env)) return "e-mail dos alertas não configurado";
  const today = todayBR();
  const docs = await rest<Doc[]>(
    env,
    "company_documents?select=id,unit_code,doc_type,name,number,expires_at&superseded_by=is.null&expires_at=not.is.null",
  );
  const sent = await rest<{ document_id: string; stage: string }[]>(
    env,
    "company_document_alerts?select=document_id,stage",
  );
  const items = pendingAlerts(docs, sent, today);
  if (!items.length) return "nenhum aviso novo";
  const portal = env["PORTAL_URL"] || "https://natal-pneus.vercel.app";
  const mail = buildDigest(items, today, `${portal}/documentos-empresa`);
  const smtp = await transport(env);
  await smtp.sendMail({
    from: `"Portal Natal Pneus" <${env["SMTP_USER"]}>`,
    to: recipients(env),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  await rest(env, "company_document_alerts?on_conflict=document_id,stage", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(items.map((i) => ({ document_id: i.doc.id, stage: i.stage }))),
  });
  return `${items.length} aviso(s) enviado(s)`;
}

// Manual use: node scripts/document-alerts.ts --teste
if (process.argv[1]?.endsWith("document-alerts.ts") && process.argv.includes("--teste")) {
  const env = loadEnv();
  if (!emailConfigured(env)) {
    console.log("Faltam SMTP_USER, SMTP_PASS e ALERT_TO em .env.sync.local.");
  } else {
    const smtp = await transport(env);
    await smtp.sendMail({
      from: `"Portal Natal Pneus" <${env["SMTP_USER"]}>`,
      to: recipients(env),
      subject: "Natal Pneus: teste dos alertas de documentos",
      text: "Este é um e-mail de teste. Se você recebeu, os alertas de vencimento dos documentos da empresa vão chegar neste endereço.",
    });
    console.log(`E-mail de teste enviado para ${env["ALERT_TO"]}.`);
    console.log(`Hoje (${brDate(todayBR())}): ${await sendDocumentAlerts(env)}`);
  }
}
