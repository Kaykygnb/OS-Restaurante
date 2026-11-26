import { describe, expect, it } from "vitest";
import { nomeAdicional, rotuloStatusConta, rotuloTipo, tituloAtendimento } from "./rotulos";

describe("rótulos", () => {
  it("traduz valores internos", () => {
    expect(rotuloTipo("BALCAO")).toBe("Balcão");
    expect(rotuloStatusConta("ABERTO")).toBe("Aberta");
    expect(tituloAtendimento({ mesa: null, tipo_atendimento: "BALCAO" })).toBe("Balcão");
    expect(tituloAtendimento({ mesa: { numero: 5 }, tipo_atendimento: "MESA" })).toBe("Mesa 5");
  });

  it("adicional com variante Padrão mostra o nome do adicional", () => {
    expect(nomeAdicional("Bacon", "Padrão")).toBe("Bacon");
    expect(nomeAdicional("Bacon", "Duplo")).toBe("Bacon · Duplo");
  });
});
