/** Validity rules of the company documents. Pure: used by the screen and by the e-mail alert script. */

export const DOC_TYPE_LABEL: Record<string, string> = {
  alvara: "Alvará de funcionamento",
  bombeiros: "Bombeiros (AVCB)",
  licenca_ambiental: "Licença ambiental",
  vigilancia: "Vigilância sanitária",
  certidao: "Certidão",
  seguro: "Seguro",
  contrato_locacao: "Contrato de locação",
  outro: "Outro",
};

/** First warning, and the stronger one in the last days. */
export const WARN_DAYS = 45;
export const URGENT_DAYS = 15;

export type DocStatus = "vencido" | "urgente" | "atencao" | "em_dia" | "permanente";

export const STATUS_LABEL: Record<DocStatus, string> = {
  vencido: "Vencido",
  urgente: "Vence em até 15 dias",
  atencao: "Vence em até 45 dias",
  em_dia: "Em dia",
  permanente: "Sem validade",
};

/** Days from `today` to the expiry date (negative when it has passed); null for documents with no expiry. */
export function daysUntil(expires: string | null, today: string) {
  if (!expires) return null;
  const a = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(expires.slice(0, 4)),
    Number(expires.slice(5, 7)) - 1,
    Number(expires.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function docStatus(expires: string | null, today: string): DocStatus {
  const days = daysUntil(expires, today);
  if (days === null) return "permanente";
  if (days < 0) return "vencido";
  if (days <= URGENT_DAYS) return "urgente";
  if (days <= WARN_DAYS) return "atencao";
  return "em_dia";
}

/** Stage of the e-mail alert a document is in today (null when no alert is due). */
export function alertStage(
  expires: string | null,
  today: string,
): "d45" | "d15" | "vencido" | null {
  const s = docStatus(expires, today);
  if (s === "vencido") return "vencido";
  if (s === "urgente") return "d15";
  if (s === "atencao") return "d45";
  return null;
}

export const needsAttention = (status: DocStatus) =>
  status === "vencido" || status === "urgente" || status === "atencao";

/** "vence em 12 dias", "venceu há 3 dias", "vence hoje". */
export function dueText(expires: string | null, today: string) {
  const days = daysUntil(expires, today);
  if (days === null) return "Sem validade";
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days > 1) return `Vence em ${days} dias`;
  return days === -1 ? "Venceu ontem" : `Venceu há ${-days} dias`;
}
