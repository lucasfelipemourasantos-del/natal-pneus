import { z } from "zod";

/** Notice sent by the NP-API (Decision) when a customer's type changes. */
export const customerNoticeSchema = z.object({
  id: z.number().int().positive(),
  registroId: z.number().int(),
  valorAntigo: z.string().max(4),
  valorNovo: z.string().max(4),
  dataEvento: z.string().max(30),
  valorAntigoNome: z.string().max(40).nullable().optional(),
  valorNovoNome: z.string().max(40).nullable().optional(),
  clienteNome: z.string().max(200).nullable().optional(),
});

export const CUSTOMER_TYPES: Record<number, string> = {
  0: "Sistema",
  1: "Administradora",
  2: "Varejo",
  3: "Atacado",
  4: "Frota",
};

/** "sha256=<hex>" of the exact body received, with the shared secret (what the NP-API sends in X-NPAPI-Assinatura). */
export async function signBody(secret: string, body: string) {
  const { createHmac } = await import("node:crypto");
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/** Constant-time comparison of the received signature with the expected one. */
export async function validSignature(secret: string, body: string, received: string | null) {
  const { timingSafeEqual } = await import("node:crypto");
  const expected = Buffer.from(await signBody(secret, body));
  const given = Buffer.from(received ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
