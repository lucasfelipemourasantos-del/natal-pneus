/**
 * Names in the Decision carry reference tags to tell users apart ("FRANCIELIO ALINHADOR - NP4", "ITALO JUSTINO - VENDEDOR").
 * The portal shows the plain name; the code next to it is what identifies the person.
 */
const TAGS =
  "MECANICO|MECÂNICO|MEC|ALINHADOR|BORRACHEIRO|BALANCEADOR|VENDEDOR|VENDAS|CAIXA|ESTOQUE";

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
