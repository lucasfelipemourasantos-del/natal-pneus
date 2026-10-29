import { describe, expect, it } from "vitest";
import { alertStage, daysUntil, docStatus, dueText, needsAttention } from "@/lib/doc-status";
import { buildDigest, pendingAlerts } from "../../scripts/document-alerts";

const today = "2026-10-29";

describe("company document validity", () => {
  it("counts days and names the status", () => {
    expect(daysUntil("2026-11-13", today)).toBe(15);
    expect(daysUntil("2026-10-28", today)).toBe(-1);
    expect(daysUntil(null, today)).toBeNull();
    expect(docStatus(null, today)).toBe("permanente");
    expect(docStatus("2026-10-28", today)).toBe("vencido");
    expect(docStatus("2026-11-13", today)).toBe("urgente"); // exactly 15 days
    expect(docStatus("2026-11-14", today)).toBe("atencao");
    expect(docStatus("2026-12-13", today)).toBe("atencao"); // exactly 45 days
    expect(docStatus("2026-12-14", today)).toBe("em_dia");
    expect(needsAttention("em_dia")).toBe(false);
    expect(needsAttention("vencido")).toBe(true);
  });

  it("describes the deadline in words", () => {
    expect(dueText("2026-10-29", today)).toBe("Vence hoje");
    expect(dueText("2026-11-10", today)).toBe("Vence em 12 dias");
    expect(dueText("2026-10-26", today)).toBe("Venceu há 3 dias");
    expect(dueText(null, today)).toBe("Sem validade");
  });

  it("chooses the e-mail stage of each document", () => {
    expect(alertStage("2026-12-13", today)).toBe("d45");
    expect(alertStage("2026-11-01", today)).toBe("d15");
    expect(alertStage("2026-10-01", today)).toBe("vencido");
    expect(alertStage("2027-03-01", today)).toBeNull();
    expect(alertStage(null, today)).toBeNull();
  });
});

describe("e-mail alerts of the documents", () => {
  const doc = (id: string, unit: string | null, expires: string) => ({
    id,
    unit_code: unit,
    doc_type: "alvara",
    name: `Alvará ${id}`,
    number: null,
    expires_at: expires,
  });
  const docs = [
    doc("a", "NP1", "2026-12-01"),
    doc("b", "NP2", "2026-11-05"),
    doc("c", null, "2026-10-01"),
  ];

  it("warns once per stage and only about what is new", () => {
    const first = pendingAlerts(docs, [], today);
    expect(first.map((i) => [i.doc.id, i.stage])).toEqual([
      ["a", "d45"],
      ["b", "d15"],
      ["c", "vencido"],
    ]);
    const next = pendingAlerts(
      docs,
      [
        { document_id: "a", stage: "d45" },
        { document_id: "c", stage: "vencido" },
      ],
      today,
    );
    expect(next.map((i) => i.doc.id)).toEqual(["b"]);
  });

  it("builds a digest grouped by stage with the stores", () => {
    const mail = buildDigest(
      pendingAlerts(docs, [], today),
      today,
      "https://exemplo.test/documentos-empresa",
    );
    expect(mail.subject).toBe("Natal Pneus: 3 documento(s) da empresa vencidos ou vencendo");
    expect(mail.text).toContain("VENCIDOS");
    expect(mail.text).toContain("- Geral: Alvará de funcionamento — Alvará c");
    expect(mail.text).toContain(
      "- NP2: Alvará de funcionamento — Alvará b — vence em 7 dias · 05/11/2026",
    );
    expect(mail.text.indexOf("VENCIDOS")).toBeLessThan(mail.text.indexOf("VENCEM EM ATÉ 45 DIAS"));
    expect(mail.html).toContain("https://exemplo.test/documentos-empresa");
  });
});
