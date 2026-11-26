import { useEffect, useState } from "react";
import Dialogo from "../../componentes/ui/Dialogo";
import CampoImagem from "./CampoImagem";
import { api } from "../../servicos/api";
import { confirmar } from "../../servicos/dialogos";
import { useRascunho, useProtecaoEdicao } from "../../hooks/useRascunho";
import { enviarImagemCardapio } from "./imagem";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import type { CategoriaCardapio, Variante } from "./tipos";

type Opcao = { id?: number; nome: string; preco: string };
type Grupo = { id?: number; nome: string; min: number; max: number; repetir: boolean; opcoes: Opcao[] };
type Apresentacao = { id?: number; nome: string; preco: string; grupos: Grupo[] };
type ProdutoForm = {
  nome: string;
  descricao: string;
  categoria_id: number;
  exige_preparo: boolean;
  controla_estoque: boolean;
  caminho_imagem: string | null;
  variantes: Apresentacao[];
  comuns: boolean;
};
type Props = {
  id: number | null;
  categoriaId: number;
  categorias: CategoriaCardapio[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
};

const ETAPAS = ["Dados", "Preços", "Escolhas", "Revisão"] as const;
const copiar = (grupos: Grupo[]): Grupo[] =>
  grupos.map((g) => ({ ...g, id: undefined, opcoes: g.opcoes.map((o) => ({ ...o, id: undefined })) }));
const dinheiro = (n: number) => (n / 100).toFixed(2).replace(".", ",");

export default function EditorProduto(props: Props) {
  const [inicial, setInicial] = useState<ProdutoForm | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    if (!props.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- inicialização do formulário
      setInicial({
        nome: "",
        descricao: "",
        categoria_id: props.categoriaId,
        exige_preparo: true,
        controla_estoque: false,
        caminho_imagem: null,
        variantes: [{ nome: "Padrão", preco: "", grupos: [] }],
        comuns: true,
      });
    } else
      void api(`/produtos/${props.id}`)
        .then(
          (p: {
            nome: string;
            descricao: string | null;
            categoria_id: number;
            exige_preparo: boolean;
            controla_estoque: boolean;
            caminho_imagem: string | null;
            produto_variantes: Variante[];
          }) => {
            if (vivo)
              setInicial({
                ...p,
                descricao: p.descricao ?? "",
                comuns: false,
                variantes: p.produto_variantes.map((v) => ({
                  id: v.id,
                  nome: v.nome,
                  preco: dinheiro(v.preco_centavos),
                  grupos: (v.grupos_escolhas ?? []).map((g) => ({
                    id: g.id,
                    nome: g.nome,
                    min: g.min_escolhas,
                    max: g.max_escolhas,
                    repetir: g.permite_repetir,
                    opcoes: g.opcoes_escolha.map((o) => ({
                      id: o.id,
                      nome: o.nome,
                      preco: dinheiro(o.preco_extra_centavos),
                    })),
                  })),
                })),
              });
          },
        )
        .catch((e) => {
          if (vivo) setErro((e as Error).message);
        });
    return () => {
      vivo = false;
    };
  }, [props.id, props.categoriaId]);
  return inicial ? (
    <EditorForm {...props} inicial={inicial} />
  ) : (
    <Dialogo titulo="Carregando produto" onFechar={props.onFechar}>
      <p role={erro ? "alert" : "status"}>{erro || "Carregando cadastro…"}</p>
      {erro ? (
        <button type="button" className="btn" onClick={props.onFechar}>
          Voltar ao cardápio
        </button>
      ) : null}
    </Dialogo>
  );
}

function EditorForm({ inicial, id, categorias, onFechar, onSalvo }: Props & { inicial: ProdutoForm }) {
  const [form, setForm, rascunho] = useRascunho(`produto:${id ?? "novo"}`, inicial);
  const [etapa, setEtapa] = useState(0);
  const [selecionada, setSelecionada] = useState(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const liberarArquivo = useProtecaoEdicao(`produto:${id ?? "novo"}:arquivo`, !!arquivo);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [camposInvalidos, setCamposInvalidos] = useState<string[]>([]);
  const indice = form.comuns ? 0 : Math.min(selecionada, form.variantes.length - 1);
  const apresentacao = form.variantes[indice];

  function campo<K extends keyof ProdutoForm>(chave: K, valor: ProdutoForm[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
    setErro("");
  }
  function variante(i: number, patch: Partial<Apresentacao>) {
    setForm((f) => ({ ...f, variantes: f.variantes.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  }
  function grupo(i: number, patch: Partial<Grupo>) {
    variante(indice, { grupos: apresentacao.grupos.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  }
  function validar(ate = 3) {
    const msgs: string[] = [];
    if (form.nome.trim().length < 2) msgs.push("Informe o nome do produto com pelo menos 2 caracteres.");
    if (!form.categoria_id) msgs.push("Escolha uma categoria.");
    if (ate >= 1) {
      if (!form.variantes.length) msgs.push("Adicione pelo menos uma apresentação.");
      const nomes = new Set<string>();
      form.variantes.forEach((v, i) => {
        if (v.nome.trim().length < 1 || nomes.has(v.nome.trim().toLowerCase()))
          msgs.push(`Apresentação ${i + 1}: use um nome único, como P, M, G ou Individual.`);
        nomes.add(v.nome.trim().toLowerCase());
        if (!v.preco.trim() || !Number.isFinite(reaisParaCentavos(v.preco)) || reaisParaCentavos(v.preco) < 0)
          msgs.push(`Informe o preço de ${v.nome || `apresentação ${i + 1}`}.`);
      });
    }
    if (ate >= 2)
      for (const v of form.comuns ? [form.variantes[0]] : form.variantes)
        for (const g of v.grupos) {
          if (
            g.nome.trim().length < 2 ||
            !Number.isInteger(g.min) ||
            !Number.isInteger(g.max) ||
            g.min < 0 ||
            g.max < 1 ||
            g.min > g.max ||
            (!g.repetir && g.min > g.opcoes.length)
          )
            msgs.push(`Revise o nome e os limites do grupo ${g.nome || "sem nome"}.`);
          if (
            !g.opcoes.length ||
            g.opcoes.some(
              (o) =>
                o.nome.trim().length < 1 ||
                !o.preco.trim() ||
                !Number.isFinite(reaisParaCentavos(o.preco)) ||
                reaisParaCentavos(o.preco) < 0,
            )
          )
            msgs.push(`Revise as opções e os preços adicionais de ${g.nome || "grupo sem nome"}.`);
        }
    setCamposInvalidos(msgs);
    return msgs.length === 0;
  }
  async function fechar() {
    if (
      !busy &&
      ((!rascunho.sujo && !arquivo) ||
        (await confirmar(
          arquivo
            ? "Fechar o editor? Os campos serão mantidos, mas a imagem selecionada precisará ser escolhida novamente."
            : "Fechar o editor? O rascunho será mantido neste navegador.",
        )))
    )
      onFechar();
  }
  async function salvar() {
    if (busy || !validar()) return;
    setBusy(true);
    setErro("");
    try {
      const caminho = arquivo ? await enviarImagemCardapio(arquivo) : form.caminho_imagem;
      await api(id ? `/produtos/${id}/cadastro` : "/produtos/cadastro", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          caminho_imagem: caminho,
          variantes: form.variantes.map((v, i) => ({
            id: v.id,
            nome: v.nome.trim(),
            preco_centavos: reaisParaCentavos(v.preco),
            grupos: (form.comuns && i > 0 ? copiar(form.variantes[0].grupos) : v.grupos).map((g) => ({
              id: g.id,
              nome: g.nome.trim(),
              min_escolhas: g.min,
              max_escolhas: g.max,
              permite_repetir: g.repetir,
              opcoes: g.opcoes.map((o) => ({
                id: o.id,
                nome: o.nome.trim(),
                preco_extra_centavos: reaisParaCentavos(o.preco),
              })),
            })),
          })),
        }),
      });
      liberarArquivo();
      rascunho.salvo();
      await onSalvo();
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialogo
      titulo={id ? "Editar produto" : "Novo produto"}
      sub={rascunho.sujo ? "Rascunho neste navegador · ainda não salvo" : "Dados, preços e escolhas salvos juntos"}
      xl
      onFechar={() => void fechar()}
      fecharComEsc={!busy}
      pe={
        <div className="editor-pe">
          <div className="editor-pe-sec">
            <button type="button" className="btn" disabled={busy} onClick={() => void fechar()}>
              Fechar
            </button>
            {rascunho.sujo ? (
              <button
                type="button"
                className="btn-link texto-perigo"
                disabled={busy}
                onClick={async () => {
                  if (await confirmar("Descartar o rascunho deste produto?", true)) {
                    liberarArquivo();
                    rascunho.descartar();
                    onFechar();
                  }
                }}
              >
                Descartar
              </button>
            ) : null}
          </div>
          <div className="editor-pe-pri">
            {etapa > 0 ? (
              <button type="button" className="btn" disabled={busy} onClick={() => setEtapa((e) => e - 1)}>
                Voltar
              </button>
            ) : null}
            {etapa < 3 ? (
              <button
                type="button"
                className="btn btn-pri"
                onClick={() => {
                  if (validar(etapa)) setEtapa((e) => e + 1);
                }}
              >
                Continuar
              </button>
            ) : (
              <button type="button" className="btn btn-pri" disabled={busy} onClick={() => void salvar()}>
                {busy ? "Salvando…" : "Salvar produto"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <nav className="etapas-editor etapas-faixa" aria-label="Etapas do produto">
        {ETAPAS.map((n, i) => (
          <button
            type="button"
            key={n}
            aria-current={etapa === i ? "step" : undefined}
            data-feita={i < etapa ? "1" : undefined}
            onClick={() => {
              if (i < etapa || validar(i - 1)) setEtapa(i);
            }}
          >
            <span className="etapa-num">{i + 1}</span>
            <span className="etapa-rotulo">{n}</span>
          </button>
        ))}
      </nav>

      {erro ? (
        <p role="alert" className="feedback-card feedback-erro">
          {erro} O rascunho foi mantido. Tente salvar novamente.
        </p>
      ) : null}
      {camposInvalidos.length ? (
        <div role="alert" className="feedback-card feedback-erro">
          <ul>
            {camposInvalidos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {etapa === 0 ? (
        <section className="pilha editor-etapa">
          <div className="linha-campos">
            <label className="fld">
              <span>Nome do produto *</span>
              <input autoFocus value={form.nome} onChange={(e) => campo("nome", e.target.value)} />
            </label>
            <label className="fld">
              <span>Categoria *</span>
              <select value={form.categoria_id} onChange={(e) => campo("categoria_id", Number(e.target.value))}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="fld">
            <span>Descrição (opcional)</span>
            <textarea value={form.descricao} onChange={(e) => campo("descricao", e.target.value)} rows={3} />
          </label>
          <CampoImagem
            caminho={form.caminho_imagem}
            onArquivo={setArquivo}
            onRemover={() => {
              campo("caminho_imagem", null);
              setArquivo(null);
            }}
          />
          <div className="editor-checks">
            <label className="check">
              <input type="checkbox" checked={form.exige_preparo} onChange={(e) => campo("exige_preparo", e.target.checked)} />
              Exige preparo na cozinha
            </label>
            <label className="check">
              <input type="checkbox" checked={form.controla_estoque} onChange={(e) => campo("controla_estoque", e.target.checked)} />
              Controlar quantidade em estoque
            </label>
          </div>
        </section>
      ) : null}

      {etapa === 1 ? (
        <section className="pilha editor-etapa">
          <p className="dica mb-0">Uma linha por tamanho/preço. Ex.: Padrão, Pequeno, Grande.</p>
          {form.variantes.map((v, i) => (
            <div className="linha-preco" key={v.id ?? `nova-${i}`}>
              <label className="fld">
                <span>Nome *</span>
                <input value={v.nome} onChange={(e) => variante(i, { nome: e.target.value })} />
              </label>
              <label className="fld fld-preco">
                <span>Preço (R$) *</span>
                <input inputMode="decimal" value={v.preco} placeholder="15,50" onChange={(e) => variante(i, { preco: e.target.value })} />
              </label>
              <button
                type="button"
                className="btn btn-ic"
                title="Remover apresentação"
                aria-label="Remover apresentação"
                disabled={form.variantes.length === 1}
                onClick={async () => {
                  if (
                    !v.id ||
                    (await confirmar(`Remover ${v.nome} deste cadastro? A alteração só será aplicada ao salvar.`, true))
                  )
                    campo(
                      "variantes",
                      form.variantes.filter((_, j) => j !== i),
                    );
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => campo("variantes", [...form.variantes, { nome: "", preco: "", grupos: [] }])}
          >
            Adicionar apresentação
          </button>
        </section>
      ) : null}

      {etapa === 2 ? (
        <section className="pilha editor-etapa">
          <p className="dica mb-0">
            Escolhas dentro do produto (ex.: molho). Extras da categoria ficam em Adicionais.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={form.comuns}
              onChange={async (e) => {
                const marcado = e.target.checked;
                if (
                  !marcado ||
                  (await confirmar(
                    `Aplicar as escolhas de ${form.variantes[0].nome} a todos os tamanhos? Ao salvar, substituirá as escolhas dos demais.`,
                  ))
                )
                  campo("comuns", marcado);
              }}
            />
            Mesmas escolhas em todos os tamanhos
          </label>
          {!form.comuns ? (
            <label className="fld">
              <span>Configurar escolhas de</span>
              <select value={indice} onChange={(e) => setSelecionada(Number(e.target.value))}>
                {form.variantes.map((v, i) => (
                  <option key={i} value={i}>
                    {v.nome} — {formatarReais(reaisParaCentavos(v.preco))}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="feedback-card mb-0">Aplicado a: {form.variantes.map((v) => v.nome).join(", ")}.</p>
          )}
          {!form.comuns && form.variantes.length > 1 ? (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const destinos = form.variantes
                  .filter((_, i) => i !== indice)
                  .map((v) => v.nome)
                  .join(", ");
                if (
                  await confirmar(
                    `Copiar as escolhas de ${apresentacao.nome} para ${destinos}? Substituirá as escolhas desses destinos ao salvar.`,
                  )
                )
                  campo(
                    "variantes",
                    form.variantes.map((v, i) => (i === indice ? v : { ...v, grupos: copiar(apresentacao.grupos) })),
                  );
              }}
            >
              Copiar escolhas para outros tamanhos
            </button>
          ) : null}

          {!apresentacao.grupos.length ? (
            <p className="muted">Nenhuma escolha ainda. Pode continuar sem grupos.</p>
          ) : null}

          {apresentacao.grupos.map((g, i) => (
            <fieldset key={g.id ?? i} className="editor-grupo">
              <legend>Grupo {i + 1}</legend>
              <label className="fld">
                <span>Nome do grupo *</span>
                <input value={g.nome} placeholder="Ex.: Molho" onChange={(e) => grupo(i, { nome: e.target.value })} />
              </label>
              <div className="linha-limites">
                <label className="fld">
                  <span>Mín.</span>
                  <input type="number" min={0} value={g.min} onChange={(e) => grupo(i, { min: Number(e.target.value) })} />
                </label>
                <label className="fld">
                  <span>Máx.</span>
                  <input type="number" min={1} value={g.max} onChange={(e) => grupo(i, { max: Number(e.target.value) })} />
                </label>
                <label className="check check-inline">
                  <input type="checkbox" checked={g.repetir} onChange={(e) => grupo(i, { repetir: e.target.checked })} />
                  Repetir opção
                </label>
              </div>
              <p className="dica">Mínimo 0 = opcional. 1 ou mais = obrigatório.</p>
              {g.opcoes.map((o, j) => (
                <div className="linha-preco" key={o.id ?? j}>
                  <label className="fld">
                    <span>Opção *</span>
                    <input
                      value={o.nome}
                      onChange={(e) =>
                        grupo(i, { opcoes: g.opcoes.map((x, k) => (k === j ? { ...x, nome: e.target.value } : x)) })
                      }
                    />
                  </label>
                  <label className="fld fld-preco">
                    <span>Extra (R$)</span>
                    <input
                      inputMode="decimal"
                      value={o.preco}
                      onChange={(e) =>
                        grupo(i, { opcoes: g.opcoes.map((x, k) => (k === j ? { ...x, preco: e.target.value } : x)) })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ic"
                    title="Remover opção"
                    aria-label="Remover opção"
                    onClick={() => grupo(i, { opcoes: g.opcoes.filter((_, k) => k !== j) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="form-acoes">
                <button
                  type="button"
                  className="btn"
                  onClick={() => grupo(i, { opcoes: [...g.opcoes, { nome: "", preco: "0,00" }] })}
                >
                  Adicionar opção
                </button>
                <button
                  type="button"
                  className="btn-link texto-perigo"
                  onClick={async () => {
                    if (await confirmar(`Remover o grupo ${g.nome || i + 1} ao salvar?`, true))
                      variante(indice, { grupos: apresentacao.grupos.filter((_, j) => j !== i) });
                  }}
                >
                  Remover grupo
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              variante(indice, {
                grupos: [...apresentacao.grupos, { nome: "", min: 0, max: 1, repetir: false, opcoes: [{ nome: "", preco: "0,00" }] }],
              })
            }
          >
            Adicionar grupo de escolhas
          </button>
        </section>
      ) : null}

      {etapa === 3 ? (
        <section className="pilha editor-etapa">
          <div>
            <h3 className="mb-0">{form.nome || "Sem nome"}</h3>
            <p className="muted pequeno">
              {categorias.find((c) => c.id === form.categoria_id)?.nome} ·{" "}
              {form.exige_preparo ? "Preparo na cozinha" : "Produto de revenda"}
            </p>
            {form.descricao ? <p>{form.descricao}</p> : null}
          </div>
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Apresentação</th>
                  <th>Preço</th>
                  <th>Escolhas</th>
                </tr>
              </thead>
              <tbody>
                {form.variantes.map((v, i) => (
                  <tr key={i}>
                    <td>{v.nome}</td>
                    <td className="num">{formatarReais(reaisParaCentavos(v.preco))}</td>
                    <td>
                      {(form.comuns ? form.variantes[0].grupos : v.grupos)
                        .map((g) => `${g.nome}: ${g.opcoes.map((o) => o.nome).join(", ")}`)
                        .join("; ") || "Sem escolhas"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dica">Ao salvar, dados, preços e escolhas são gravados juntos.</p>
        </section>
      ) : null}
    </Dialogo>
  );
}
