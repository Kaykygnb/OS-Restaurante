import { describe, expect, it } from "vitest";
import { alternarEscolha, linhaCentavos, resumoGrupo, type GrupoEsc } from "./pdv-regras";

const molho: GrupoEsc = {
  id: 1,
  nome: "Molho",
  min_escolhas: 1,
  max_escolhas: 2,
  permite_repetir: false,
  opcoes: [
    { id: 10, nome: "Vinagrete", preco_extra_centavos: 0 },
    { id: 11, nome: "Catupiry", preco_extra_centavos: 250 },
    { id: 12, nome: "Pimenta", preco_extra_centavos: 0 },
  ],
};

describe("escolhas do PDV", () => {
  it("marca e desmarca", () => {
    let s = alternarEscolha({}, molho, 10).selecao;
    expect(s).toEqual({ 10: 1 });
    s = alternarEscolha(s, molho, 10).selecao;
    expect(s).toEqual({});
  });

  it("recusa passar do máximo e avisa", () => {
    let s = alternarEscolha({}, molho, 10).selecao;
    s = alternarEscolha(s, molho, 11).selecao;
    const r = alternarEscolha(s, molho, 12);
    expect(r.selecao).toEqual({ 10: 1, 11: 1 });
    expect(r.aviso).toMatch(/no máximo 2/);
  });

  it("grupo de 1 troca a escolha", () => {
    const um = { ...molho, max_escolhas: 1 };
    let s = alternarEscolha({}, um, 10).selecao;
    s = alternarEscolha(s, um, 11).selecao;
    expect(s).toEqual({ 11: 1 });
  });

  it("repetir soma até o máximo", () => {
    const rep = { ...molho, permite_repetir: true, max_escolhas: 3 };
    let s = {};
    for (let i = 0; i < 3; i++) s = alternarEscolha(s, rep, 11).selecao;
    expect(s).toEqual({ 11: 3 });
    expect(alternarEscolha(s, rep, 11).aviso).toBeTruthy();
  });

  it("descreve mínimo e máximo", () => {
    expect(resumoGrupo({ min_escolhas: 1, max_escolhas: 2 })).toBe("obrigatório · escolha de 1 a 2");
    expect(resumoGrupo({ min_escolhas: 1, max_escolhas: 1 })).toBe("obrigatório · escolha 1");
    expect(resumoGrupo({ min_escolhas: 0, max_escolhas: 3 })).toBe("opcional · até 3");
  });
});

describe("valor da linha", () => {
  it("soma extras e adicionais vezes a quantidade", () => {
    const total = linhaCentavos({
      key: "a",
      produto_variante_id: 1,
      nome: "Pastel Especial - G",
      preco_centavos: 1890,
      quantidade: 2,
      observacao: "",
      escolhas: [{ opcao_escolha_id: 11, nome: "Catupiry", preco_extra_centavos: 250, quantidade: 1 }],
      adicionais: [{ adicional_variante_id: 1, nome: "Bacon", preco_centavos: 300, quantidade: 2 }],
    });
    expect(total).toBe(2 * (1890 + 250 + 600));
  });
});
