import { describe, expect, it } from "vitest";
import { rotuloEvento, textoValor } from "./auditoria";
describe("auditoria", () => {
  it("rótulo em português e texto de valor", () => {
    expect(rotuloEvento("item.cancelado")).toBe("Cancelou item");
    expect(rotuloEvento("novo.tipo")).toBe("novo.tipo");
    expect(textoValor('{"telefone":"11999"}')).toBe("telefone: 11999");
    expect(textoValor(null)).toBe("—");
  });
});
