import Formulario from "../../componentes/Formulario";
import { useState } from "react";
import Dialogo from "../../componentes/ui/Dialogo";
import Icone from "../../componentes/ui/Icone";
import { formatarReais } from "../../util/dinheiro";
import { alternarEscolha, linhaCentavos, resumoGrupo, type CarrinhoLinha } from "../pdv-regras";
import { nomeVariante, type ProdutoPdv } from "./tipos";

type Props = { produto: ProdutoPdv; inicial?: CarrinhoLinha; onAdicionar: (l: Omit<CarrinhoLinha, "key">) => void; onFechar: () => void };

/** Prancha 05b: tamanho, escolhas obrigatórias, adicionais com + / −, observação e quantidade. */
export default function OpcoesProduto({ produto, inicial, onAdicionar, onFechar }: Props) {
  const variantesOk = produto.variantes.filter((v) => !v.esgotado);
  const [varId, setVarId] = useState(inicial?.produto_variante_id ?? variantesOk[0]?.id ?? produto.variantes[0].id);
  const [selecao, setSelecao] = useState<Record<number, number>>(() => Object.fromEntries((inicial?.escolhas ?? []).map((e) => [e.opcao_escolha_id, e.quantidade])));
  const [adic, setAdic] = useState<Record<number, number>>(() => Object.fromEntries((inicial?.adicionais ?? []).map((a) => [a.adicional_variante_id, a.quantidade])));
  const [obs, setObs] = useState(inicial?.observacao ?? "");
  const [qtd, setQtd] = useState(inicial?.quantidade ?? 1);
  const [aviso, setAviso] = useState("");
  const v = produto.variantes.find((x) => x.id === varId)!;
  const adicionais = produto.grupos_adicionais.flatMap((g) => g.adicionais);

  const faltando = v.grupos_escolhas.filter((g) => g.opcoes.reduce((s, o) => s + (selecao[o.id] ?? 0), 0) < g.min_escolhas);

  const linha: Omit<CarrinhoLinha, "key"> = {
    produto_variante_id: v.id,
    nome: nomeVariante(produto, v),
    preco_centavos: v.preco_centavos,
    quantidade: qtd,
    observacao: obs,
    escolhas: v.grupos_escolhas.flatMap((g) =>
      g.opcoes.filter((o) => selecao[o.id]).map((o) => ({ opcao_escolha_id: o.id, nome: o.nome, preco_extra_centavos: o.preco_extra_centavos, quantidade: selecao[o.id] })),
    ),
    adicionais: adicionais.flatMap((a) =>
      a.variantes.filter((av) => adic[av.id]).map((av) => ({ adicional_variante_id: av.id, nome: a.nome + (av.nome !== "Padrão" ? ` ${av.nome}` : ""), preco_centavos: av.preco_centavos, quantidade: adic[av.id] })),
    ),
  };

  function confirmar() {
    if (faltando.length) {
      setAviso(`Escolha ${faltando.map((g) => `“${g.nome}”`).join(", ")} antes de adicionar.`);
      return;
    }
    onAdicionar(linha);
  }

  return (
    <Dialogo
      titulo={produto.nome}
      sub={produto.descricao ?? undefined}
      onFechar={onFechar}
      pe={
        <>
          <button type="button" className="btn" onClick={onFechar}>
            Desistir
          </button>
          <button type="button" className="btn btn-pri btn-g" onClick={confirmar}>
            {inicial ? "Salvar" : "Adicionar"} {formatarReais(linhaCentavos({ ...linha, key: "" }))}
          </button>
        </>
      }
    >
      <Formulario
        className="pilha"
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        {produto.variantes.length > 1 ? (
          <div className="fld">
            <span>Tamanho</span>
            <div className="segmento" role="group" aria-label="Tamanho">
              {produto.variantes.map((x) => (
                <button key={x.id} type="button" aria-pressed={x.id === varId} disabled={x.esgotado} onClick={() => (setVarId(x.id), setSelecao({}))}>
                  {x.nome} · {formatarReais(x.preco_centavos)}
                  {x.esgotado ? " (esgotado)" : ""}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {v.grupos_escolhas.map((g) => (
          <fieldset key={g.id} className="fld" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>
              {g.nome} <span className="muted pequeno">({resumoGrupo(g)})</span>
            </legend>
            <div className="pilulas" style={{ flexWrap: "wrap" }}>
              {g.opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={!!selecao[o.id]}
                  onClick={() => {
                    const r = alternarEscolha(selecao, g, o.id);
                    setSelecao(r.selecao);
                    setAviso(r.aviso ?? "");
                  }}
                >
                  {selecao[o.id] && selecao[o.id] > 1 ? `${selecao[o.id]}× ` : ""}
                  {o.nome}
                  {o.preco_extra_centavos ? ` + ${formatarReais(o.preco_extra_centavos)}` : ""}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        {adicionais.length ? (
          <div className="fld">
            <span>Adicionais</span>
            <div className="lista">
              {adicionais.flatMap((a) =>
                a.variantes.map((av) => {
                  const q = adic[av.id] ?? 0;
                  return (
                    <div key={av.id} className="entre" style={{ minHeight: 48 }}>
                      <span>
                        {a.nome}
                        {av.nome !== "Padrão" ? ` ${av.nome}` : ""} <span className="muted">+ {formatarReais(av.preco_centavos)}</span>
                        {av.esgotado ? <span className="tag tag-warn" style={{ marginLeft: 6 }}>Esgotado</span> : null}
                      </span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="button" className="btn btn-ic" aria-label={`Menos ${a.nome}`} disabled={!q} onClick={() => setAdic({ ...adic, [av.id]: q - 1 })}>
                          <Icone nome="menos" />
                        </button>
                        <strong style={{ minWidth: 20, textAlign: "center" }}>{q}</strong>
                        <button type="button" className="btn btn-ic" aria-label={`Mais ${a.nome}`} disabled={q >= a.qtd_max || av.esgotado} onClick={() => setAdic({ ...adic, [av.id]: q + 1 })}>
                          <Icone nome="mais" />
                        </button>
                      </span>
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        ) : null}

        <label className="fld">
          <span>Observação (vai para a cozinha)</span>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: sem cebola" maxLength={120} />
        </label>
        <div className="entre">
          <span>Quantidade</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn btn-ic" aria-label="Diminuir quantidade" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}>
              <Icone nome="menos" />
            </button>
            <strong style={{ minWidth: 24, textAlign: "center" }}>{qtd}</strong>
            <button type="button" className="btn btn-ic" aria-label="Aumentar quantidade" onClick={() => setQtd(qtd + 1)}>
              <Icone nome="mais" />
            </button>
          </span>
        </div>
        {aviso ? (
          <p className="msg-erro" role="alert" style={{ color: "var(--err)", margin: 0 }}>
            {aviso}
          </p>
        ) : null}
        <button type="submit" hidden />
      </Formulario>
    </Dialogo>
  );
}
