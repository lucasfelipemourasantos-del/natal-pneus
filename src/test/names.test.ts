import { describe, expect, it } from "vitest";
import { cleanName } from "@/lib/names";
import { operatorTypes, typesLabel } from "@/lib/technician-commissions";

describe("cleanName", () => {
  it.each([
    ["ALEXANDRE NETO MEC - NP1", "Alexandre Neto"],
    ["CLAUDIO MEC - NP3", "Claudio"],
    ["FRANCIELIO ALINHADOR - NP4", "Francielio"],
    ["FRANCIELIO BORRACHEIRO - NP2", "Francielio"],
    ["MOISES LEMOS BORRACHEIRO - NP2", "Moises Lemos"],
    ["WAGNER AUGUSTO - MECANICO", "Wagner Augusto"],
    ["ITALO JUSTINO - VENDEDOR", "Italo Justino"],
    ["ISRAEL CUNHA (VENDEDOR)", "Israel Cunha"],
    ["LUCAS VENDEDOR", "Lucas"],
    ["FELIPE - VENDAS", "Felipe"],
    ["LUIS HENRIQUE NP4", "Luis Henrique"],
    ["ROGERIO DOS SANTOS SILVA FILHO", "Rogerio dos Santos Silva Filho"],
    ["TECNICO PNEUS", "Tecnico Pneus"],
  ])("%s -> %s", (raw, expected) => {
    expect(cleanName(raw)).toBe(expected);
  });
});

describe("operator types", () => {
  it("uses the types set by the RH, with more than one when needed", () => {
    const types = operatorTypes({ operator_roles: ["alinhador", "balanceador"] });
    expect(types).toEqual(["alinhador", "balanceador"]);
    expect(typesLabel(types)).toBe("Alinhador e Balanceador");
  });

  it("guesses from the Decision function when none was set", () => {
    expect(operatorTypes({ operator_roles: [], decision_role: "BALANCEADOR 2" })).toEqual([
      "balanceador",
    ]);
    expect(operatorTypes(undefined)).toEqual(["outros"]);
  });
});
