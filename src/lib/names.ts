/**
 * Names in the Decision carry reference tags to tell users apart ("FRANCIELIO ALINHADOR - NP4", "ITALO JUSTINO - VENDEDOR").
 * The portal shows the plain name; the code next to it is what identifies the person.
 */
const TAGS =
  "MECANICO|MECÂNICO|MEC|ALINHADOR|BORRACHEIRO|BALANCEADOR|VENDEDOR|VENDAS|CAIXA|ESTOQUE";

/**
 * Two people with the same first name in the Decision (the two Franciélios) are shown with their functions and store,
 * so they can be told apart everywhere. Keyed by Decision code; it wins over the name typed at signup.
 */
export const DISPLAY_NAME_BY_CODE: Record<number, string> = {
  70: "Franciélio Alinhador/Balanceador (NP4)",
  159: "Franciélio Borracheiro/Alinhador (NP2)",
};

export function cleanName(raw: string) {
  const cleaned = raw
    .replace(/\s*\((?:[^)]*)\)/g, "")
    .replace(new RegExp(`\\s*-\\s*(?:NP\\d|${TAGS})\\b`, "gi"), "")
    .replace(new RegExp(`\\s+(?:${TAGS})\\b`, "gi"), "")
    .replace(/\s+NP\d\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = cleaned || raw.trim();
  return base
    .toLowerCase()
    .split(" ")
    .map((w) =>
      ["de", "da", "do", "dos", "das", "e"].includes(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}
