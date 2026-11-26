import { useEffect, useState } from "react";
import Ajuda from "../../componentes/Ajuda";
import { api } from "../../servicos/api";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import type { GrupoEscolhas, OpcaoEscolha, Variante } from "./tipos";

type Props = {
  produtoId: number;
  variantes: Variante[];
  setErro: (s: string) => void;
  setOk: (s: string) => void;
  onMudou: () => Promise<void>;
};

type Preset = {
  nome: string;
  obrigatorio: boolean;
  max: number;
  permite_repetir?: boolean;
  opcoes: string[];
};

/** Atalhos pra montar produtos tipo “monte seu macarrão / açaí”. */
const PRESETS: Preset[] = [
  {
    nome: "Tipo de massa",
    obrigatorio: true,
    max: 1,
    opcoes: ["Espaguete", "Penne", "Fusilli"],
  },
  {
    nome: "Molho",
    obrigatorio: true,
    max: 1,
    opcoes: ["Bolonhesa", "Branco", "Ao sugo", "Pesto"],
  },
  {
    nome: "Proteínas",
    obrigatorio: false,
    max: 3,
    opcoes: ["Frango", "Carne", "Camarão"],
  },
  {
    nome: "Sabores",
    obrigatorio: true,
    max: 2,
    permite_repetir: true,
    opcoes: ["Morango", "Banana", "Nutella"],
  },
  {
    nome: "Acompanhamentos",
    obrigatorio: false,
    max: 4,
    opcoes: ["Queijo ralado", "Bacon", "Ovo"],
  },
];

type LinhaOpcaoNova = { chave: string; nome: string; preco: string };

function novaLinhaOpcao(nome = ""): LinhaOpcaoNova {
  return { chave: crypto.randomUUID(), nome, preco: "0" };
}

export default function EscolhasBloco({ produtoId, variantes, setErro, setOk, onMudou }: Props) {
  const comId = variantes.filter((v) => v.id);
  const idsKey = comId.map((v) => v.id).join(",");
  const [varianteId, setVarianteId] = useState<number | null>(comId[0]?.id ?? null);
  const [grupos, setGrupos] = useState<GrupoEscolhas[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [nomeGrupo, setNomeGrupo] = useState("");
  const [obrigatorio, setObrigatorio] = useState(true);
  const [maxEsc, setMaxEsc] = useState("1");
  const [permiteRepetir, setPermiteRepetir] = useState(false);
  const [opcoesNovas, setOpcoesNovas] = useState<LinhaOpcaoNova[]>([novaLinhaOpcao()]);

  const [novaOpcaoNome, setNovaOpcaoNome] = useState<Record<number, string>>({});
  const [novaOpcaoPreco, setNovaOpcaoPreco] = useState<Record<number, string>>({});

  const [editandoGrupoId, setEditandoGrupoId] = useState<number | null>(null);
  const [editNomeGrupo, setEditNomeGrupo] = useState("");
  const [editObrigatorio, setEditObrigatorio] = useState(true);
  const [editMax, setEditMax] = useState("1");
  const [editRepetir, setEditRepetir] = useState(false);

  const [editandoOpcaoId, setEditandoOpcaoId] = useState<number | null>(null);
  const [editNomeOpcao, setEditNomeOpcao] = useState("");
  const [editPrecoOpcao, setEditPrecoOpcao] = useState("0");

  useEffect(() => {
    const lista = variantes.filter((v) => v.id);
    if (!lista.some((v) => v.id === varianteId)) {
      setVarianteId(lista[0]?.id ?? null);
    }
  }, [idsKey, varianteId, variantes]);

  useEffect(() => {
    if (!varianteId) {
      setGrupos([]);
      return;
    }
    let cancelado = false;
    (async () => {
      setCarregando(true);
      try {
        const dados = (await api(
          `/produtos/${produtoId}/variantes/${varianteId}/escolhas`
        )) as GrupoEscolhas[];
        if (!cancelado) setGrupos(dados);
      } catch (err) {
        if (!cancelado) setErro((err as Error).message);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [produtoId, varianteId, setErro]);

  async function recarregar() {
    if (!varianteId) return;
    const dados = (await api(
      `/produtos/${produtoId}/variantes/${varianteId}/escolhas`
    )) as GrupoEscolhas[];
    setGrupos(dados);
    await onMudou();
  }

  function aplicarPreset(p: Preset) {
    setNomeGrupo(p.nome);
    setObrigatorio(p.obrigatorio);
    setMaxEsc(String(p.max));
    setPermiteRepetir(!!p.permite_repetir);
    setOpcoesNovas(p.opcoes.map((nome) => novaLinhaOpcao(nome)));
  }

  async function criarGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (!varianteId) return;
    const max = Number(maxEsc);
    const min = obrigatorio ? Math.min(1, max) : 0;
    if (nomeGrupo.trim().length < 2) {
      return setErro("Informe o nome do grupo (ex: Molho)");
    }
    if (!Number.isFinite(max) || max < 1) {
      return setErro("Máximo de escolhas inválido");
    }
    if (min > max) {
      return setErro("Mínimo de escolhas não pode ser maior que o máximo");
    }

    const opcoesPayload: { nome: string; preco_extra_centavos: number }[] = [];
    for (const o of opcoesNovas) {
      const nome = o.nome.trim();
      if (!nome) continue;
      const centavos = reaisParaCentavos(o.preco);
      if (!Number.isFinite(centavos) || centavos < 0) {
        return setErro(`Preço extra inválido em "${nome}"`);
      }
      opcoesPayload.push({ nome, preco_extra_centavos: centavos });
    }

    setSalvando(true);
    setErro("");
    try {
      await api(`/produtos/${produtoId}/variantes/${varianteId}/escolhas`, {
        method: "POST",
        body: JSON.stringify({
          nome: nomeGrupo.trim(),
          min_escolhas: min,
          max_escolhas: max,
          permite_repetir: permiteRepetir,
          opcoes: opcoesPayload,
        }),
      });
      setNomeGrupo("");
      setObrigatorio(true);
      setMaxEsc("1");
      setPermiteRepetir(false);
      setOpcoesNovas([novaLinhaOpcao()]);
      setOk(
        opcoesPayload.length
          ? `Opcional "${nomeGrupo.trim()}" criado com ${opcoesPayload.length} opção(ões)`
          : `Opcional "${nomeGrupo.trim()}" criado`
      );
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirGrupo(id: number) {
    if (!confirm("Remover este grupo e suas opções?")) return;
    setErro("");
    try {
      await api(`/grupos-escolhas/${id}`, { method: "DELETE" });
      setOk("Grupo removido");
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function adicionarOpcao(grupoId: number) {
    const nome = (novaOpcaoNome[grupoId] ?? "").trim();
    const precoTxt = novaOpcaoPreco[grupoId] ?? "0";
    const centavos = reaisParaCentavos(precoTxt);
    if (!nome) return setErro("Informe o nome da opção");
    if (!Number.isFinite(centavos) || centavos < 0) return setErro("Preço extra inválido");
    setErro("");
    try {
      await api(`/grupos-escolhas/${grupoId}/opcoes`, {
        method: "POST",
        body: JSON.stringify({ nome, preco_extra_centavos: centavos }),
      });
      setNovaOpcaoNome((m) => ({ ...m, [grupoId]: "" }));
      setNovaOpcaoPreco((m) => ({ ...m, [grupoId]: "0" }));
      setOk("Opção adicionada");
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluirOpcao(id: number) {
    if (!confirm("Remover esta opção?")) return;
    setErro("");
    try {
      await api(`/opcoes-escolha/${id}`, { method: "DELETE" });
      setOk("Opção removida");
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function abrirEditarGrupo(g: GrupoEscolhas) {
    setEditandoGrupoId(g.id);
    setEditNomeGrupo(g.nome);
    setEditObrigatorio(g.min_escolhas > 0);
    setEditMax(String(g.max_escolhas));
    setEditRepetir(g.permite_repetir);
  }

  async function salvarGrupoEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoGrupoId) return;
    const max = Number(editMax);
    const min = editObrigatorio ? Math.min(1, max) : 0;
    if (editNomeGrupo.trim().length < 2) return setErro("Nome do grupo inválido");
    if (!Number.isFinite(max) || max < 1 || min > max) {
      return setErro("Máximo de escolhas inválido");
    }
    setErro("");
    try {
      await api(`/grupos-escolhas/${editandoGrupoId}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editNomeGrupo.trim(),
          min_escolhas: min,
          max_escolhas: max,
          permite_repetir: editRepetir,
        }),
      });
      setEditandoGrupoId(null);
      setOk("Grupo atualizado");
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  function abrirEditarOpcao(o: OpcaoEscolha) {
    setEditandoOpcaoId(o.id);
    setEditNomeOpcao(o.nome);
    setEditPrecoOpcao((o.preco_extra_centavos / 100).toFixed(2).replace(".", ","));
  }

  async function salvarOpcaoEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoOpcaoId) return;
    const centavos = reaisParaCentavos(editPrecoOpcao);
    if (!editNomeOpcao.trim()) return setErro("Nome da opção inválido");
    if (!Number.isFinite(centavos) || centavos < 0) return setErro("Preço extra inválido");
    setErro("");
    try {
      await api(`/opcoes-escolha/${editandoOpcaoId}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editNomeOpcao.trim(),
          preco_extra_centavos: centavos,
        }),
      });
      setEditandoOpcaoId(null);
      setOk("Opção atualizada");
      await recarregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  /** Copia os grupos da variante atual para as outras opções de preço (P/M/G). */
  async function copiarParaOutrasVariantes() {
    if (!varianteId || grupos.length === 0) return;
    const outras = comId.filter((v) => v.id !== varianteId);
    if (outras.length === 0) return;
    if (
      !confirm(
        `Copiar ${grupos.length} grupo(s) de opcionais para ${outras.length} outra(s) opção(ões) de preço?`
      )
    ) {
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      for (const alvo of outras) {
        for (const g of grupos) {
          await api(`/produtos/${produtoId}/variantes/${alvo.id}/escolhas`, {
            method: "POST",
            body: JSON.stringify({
              nome: g.nome,
              min_escolhas: g.min_escolhas,
              max_escolhas: g.max_escolhas,
              permite_repetir: g.permite_repetir,
              opcoes: g.opcoes_escolha.map((o) => ({
                nome: o.nome,
                preco_extra_centavos: o.preco_extra_centavos,
              })),
            }),
          });
        }
      }
      setOk("Opcionais copiados para as outras opções de preço");
      await onMudou();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (comId.length === 0) {
    return (
      <div className="bloco-escolhas">
        <p className="bloco-variante-titulo">Opcionais do item</p>
        <p className="ajuda">
          Salve o produto com pelo menos uma opção de preço para liberar os opcionais.
        </p>
      </div>
    );
  }

  return (
    <div className="bloco-escolhas" id="opcionais-produto">
      <div className="bloco-variante-cab">
        <div>
          <p className="bloco-variante-titulo titulo-com-ajuda">
            Opcionais do item
            <Ajuda texto="Grupos que o cliente monta no pedido (molho, massa, sabores). Diferente dos Adicionais da outra aba, que são extras da categoria." />
          </p>
          <p className="ajuda">
            Monte o pedido do cliente: massa, molho, sabores… Cada grupo tem suas opções.
          </p>
        </div>
      </div>

      {comId.length > 1 ? (
        <label className="campo">
          <span className="campo-com-ajuda">
            Configurando para a opção de preço
            <Ajuda texto="Se o item tem P/M/G, os opcionais ficam em cada opção. Use o botão de copiar depois de montar em uma delas." />
          </span>
          <select
            value={varianteId ?? ""}
            onChange={(e) => setVarianteId(e.target.value ? Number(e.target.value) : null)}
          >
            {comId.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome} — {formatarReais(v.preco_centavos)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="ajuda" style={{ marginTop: 0 }}>
          Para: <strong>{comId[0]?.nome}</strong>
        </p>
      )}

      <div className="campo">
        <span className="campo-com-ajuda">
          Atalhos rápidos
          <Ajuda texto="Preenche o formulário abaixo com um modelo pronto. Você ainda precisa clicar em Adicionar grupo." />
        </span>
        <div className="chips presets-opcionais">
          {PRESETS.map((p) => (
            <button
              key={p.nome}
              type="button"
              className="chip chip-btn"
              onClick={() => aplicarPreset(p)}
            >
              {p.nome}
            </button>
          ))}
        </div>
      </div>

      <form className="form-escolha-grupo" onSubmit={criarGrupo}>
        <label className="campo">
          <span>Nome do grupo</span>
          <input
            value={nomeGrupo}
            onChange={(e) => setNomeGrupo(e.target.value)}
            placeholder="Ex: Molho"
          />
        </label>

        <div className="linha-min-max">
          <label className="check-linha" style={{ alignSelf: "end", paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={obrigatorio}
              onChange={(e) => setObrigatorio(e.target.checked)}
            />
            <span className="campo-com-ajuda">
              Obrigatório
              <Ajuda texto="Marcado: o cliente precisa escolher pelo menos 1. Desmarcado: pode pular o grupo." />
            </span>
          </label>
          <label className="campo">
            <span className="campo-com-ajuda">
              Pode escolher até
              <Ajuda texto="Quantas opções o cliente pode marcar neste grupo (ex.: até 2 sabores)." />
            </span>
            <input value={maxEsc} onChange={(e) => setMaxEsc(e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <label className="check-linha">
          <input
            type="checkbox"
            checked={permiteRepetir}
            onChange={(e) => setPermiteRepetir(e.target.checked)}
          />
          <span>Permite repetir a mesma opção</span>
        </label>

        <div className="campo">
          <div className="bloco-variante-cab">
            <span>Opções deste grupo</span>
            <button
              type="button"
              className="btn-sec"
              onClick={() => setOpcoesNovas((lista) => [...lista, novaLinhaOpcao()])}
            >
              + opção
            </button>
          </div>
          <div className="lista-variantes-form">
            {opcoesNovas.map((o) => (
              <div key={o.chave} className="linha-variante">
                <input
                  value={o.nome}
                  onChange={(e) =>
                    setOpcoesNovas((lista) =>
                      lista.map((x) => (x.chave === o.chave ? { ...x, nome: e.target.value } : x))
                    )
                  }
                  placeholder="Ex: Bolonhesa"
                />
                <input
                  value={o.preco}
                  onChange={(e) =>
                    setOpcoesNovas((lista) =>
                      lista.map((x) => (x.chave === o.chave ? { ...x, preco: e.target.value } : x))
                    )
                  }
                  placeholder="Extra R$"
                  inputMode="decimal"
                  title="Preço a mais (0 se incluso)"
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={opcoesNovas.length <= 1}
                  onClick={() => setOpcoesNovas((lista) => lista.filter((x) => x.chave !== o.chave))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-prim" disabled={salvando || !varianteId}>
          {salvando ? "Salvando…" : "Adicionar grupo de opcionais"}
        </button>
      </form>

      {carregando ? <p className="ajuda">Carregando opcionais…</p> : null}

      {grupos.length > 0 && comId.length > 1 ? (
        <button
          type="button"
          className="btn-sec"
          disabled={salvando}
          onClick={() => void copiarParaOutrasVariantes()}
        >
          Copiar estes opcionais para P/M/G…
        </button>
      ) : null}

      <ul className="lista-escolhas">
        {grupos.length === 0 && !carregando ? (
          <li className="vazio lista-vazia-opcionais">
            <strong>Nenhum opcional ainda</strong>
            <span>
              Ex.: use o atalho <em>Molho</em> ou <em>Tipo de massa</em> pra montar um “monte seu
              macarrão”.
            </span>
          </li>
        ) : null}
        {grupos.map((g) => (
          <li key={g.id} className="grupo-escolha-item">
            {editandoGrupoId === g.id ? (
              <form className="form-escolha-grupo" onSubmit={salvarGrupoEdit}>
                <label className="campo">
                  <span>Nome</span>
                  <input value={editNomeGrupo} onChange={(e) => setEditNomeGrupo(e.target.value)} />
                </label>
                <div className="linha-min-max">
                  <label className="check-linha" style={{ alignSelf: "end", paddingBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={editObrigatorio}
                      onChange={(e) => setEditObrigatorio(e.target.checked)}
                    />
                    <span>Obrigatório</span>
                  </label>
                  <label className="campo">
                    <span>Até</span>
                    <input value={editMax} onChange={(e) => setEditMax(e.target.value)} inputMode="numeric" />
                  </label>
                </div>
                <label className="check-linha">
                  <input
                    type="checkbox"
                    checked={editRepetir}
                    onChange={(e) => setEditRepetir(e.target.checked)}
                  />
                  <span>Permite repetir</span>
                </label>
                <div className="form-acoes">
                  <button type="submit">Salvar</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditandoGrupoId(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="grupo-escolha-cab">
                <div>
                  <strong>{g.nome}</strong>
                  <span className="prod-meta">
                    {" "}
                    · {g.min_escolhas > 0 ? "obrigatório" : "opcional"}
                    {" · até "}
                    {g.max_escolhas}
                    {g.permite_repetir ? " · pode repetir" : ""}
                  </span>
                </div>
                <div className="cat-acoes">
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Editar ${g.nome}`}
                    title="Editar"
                    onClick={() => abrirEditarGrupo(g)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-icon-danger"
                    aria-label={`Remover ${g.nome}`}
                    title="Remover"
                    onClick={() => void excluirGrupo(g.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            <ul className="lista-opcoes-escolha">
              {g.opcoes_escolha.length === 0 ? (
                <li className="ajuda">Sem opções — adicione abaixo.</li>
              ) : null}
              {g.opcoes_escolha.map((o) => (
                <li key={o.id}>
                  {editandoOpcaoId === o.id ? (
                    <form className="linha-variante" onSubmit={salvarOpcaoEdit} style={{ width: "100%" }}>
                      <input value={editNomeOpcao} onChange={(e) => setEditNomeOpcao(e.target.value)} />
                      <input
                        value={editPrecoOpcao}
                        onChange={(e) => setEditPrecoOpcao(e.target.value)}
                        inputMode="decimal"
                      />
                      <button type="submit" className="btn-sec">
                        OK
                      </button>
                    </form>
                  ) : (
                    <>
                      <span>
                        {o.nome}
                        {o.preco_extra_centavos > 0
                          ? ` (+${formatarReais(o.preco_extra_centavos)})`
                          : ""}
                      </span>
                      <div className="cat-acoes">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label={`Editar ${o.nome}`}
                          onClick={() => abrirEditarOpcao(o)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-danger"
                          aria-label={`Remover ${o.nome}`}
                          onClick={() => void excluirOpcao(o.id)}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="linha-variante">
              <input
                value={novaOpcaoNome[g.id] ?? ""}
                onChange={(e) => setNovaOpcaoNome((m) => ({ ...m, [g.id]: e.target.value }))}
                placeholder="Nova opção"
              />
              <input
                value={novaOpcaoPreco[g.id] ?? "0"}
                onChange={(e) => setNovaOpcaoPreco((m) => ({ ...m, [g.id]: e.target.value }))}
                placeholder="Extra R$"
                inputMode="decimal"
              />
              <button type="button" className="btn-sec" onClick={() => void adicionarOpcao(g.id)}>
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
