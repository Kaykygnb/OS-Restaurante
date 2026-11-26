import { lerRascunhoSeguro, podeTrocarEdicao, useEdicaoPendente } from "../../hooks/useRascunho";
import { confirmar } from "../../servicos/dialogos";
import { useCallback, useEffect, useMemo, useState } from "react";
import Dialogo from "../../componentes/ui/Dialogo";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import { DIAS, minParaHora, horaParaMin, precoComPromo, textoQuando, textoRegra, type PromoRegra, type TipoPromo } from "../../util/promocoes";

type Promo = PromoRegra & {
  id: number;
  nome: string;
  tipos_atendimento: string;
  usos: number;
  ativo: boolean;
  inclui_extras: boolean;
  prioridade: number;
  acumulavel: boolean;
  limite_total: number | null;
  limite_por_atendimento: number | null;
  alvos: { produto_id: number | null; produto_variante_id: number | null; categoria_id: number | null }[];
};
type Cat = { id: number; nome: string; produtos: { id: number; nome: string; variantes: { id: number; nome: string; preco_centavos: number }[] }[] };

const encerrada = (p: Promo) => !p.ativo || (!!p.fim_em && new Date(p.fim_em) < new Date());

/** Pranchas 12a–12b: promoções com validade que começam e terminam sozinhas. */
export default function Promocoes() {
  const { avisar } = useSistema();
  const [lista, setLista] = useState<Promo[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"ativas" | "encerradas">("ativas");
  const [editando, setEditando] = useState<Promo | null>(null);
  const [nova, setNova] = useState(false);

  const carregar = useCallback(() => {
    Promise.all([api("/promocoes") as Promise<Promo[]>, api("/cardapio/pdv") as Promise<Cat[]>])
      .then(([p, c]) => {
        setErro("");
        setLista(p);
        setCats(c);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const alvoTexto = useCallback(
    (p: Promo) => {
      if (!p.alvos.length) return "todo o cardápio";
      return p.alvos
        .map((a) => {
          if (a.categoria_id != null) return cats.find((c) => c.id === a.categoria_id)?.nome ?? "categoria";
          const prod = cats.flatMap((c) => c.produtos).find((x) => x.id === a.produto_id || x.variantes.some((v) => v.id === a.produto_variante_id));
          return prod?.nome ?? "produto";
        })
        .join(", ");
    },
    [cats],
  );

  async function encerrar(p: Promo) {
    if (!(await confirmar(`Encerrar "${p.nome}" agora? Ela para de valer na hora.`))) return;
    try {
      await api(`/promocoes/${p.id}`, { method: "PATCH", body: JSON.stringify({ encerrar: true }) });
      avisar("Promoção encerrada.", "ok");
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    }
  }

  const mostradas = (lista ?? []).filter((p) => (aba === "ativas" ? !encerrada(p) : encerrada(p)));

  return (
    <div className="pilha" style={{ gap: 14 }}>
      <div className="cab-pagina">
        <div className="segmento" role="group" aria-label="Filtrar">
          <button type="button" aria-pressed={aba === "ativas"} onClick={async () => setAba("ativas")}>
            Ativas
          </button>
          <button type="button" aria-pressed={aba === "encerradas"} onClick={async () => setAba("encerradas")}>
            Encerradas
          </button>
        </div>
        <button type="button" className="btn btn-pri" style={{ marginLeft: "auto" }} onClick={async () => setNova(true)}>
          <Icone nome="mais" /> Nova promoção
        </button>
      </div>
      {erro ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !lista ? (
        <Carregando />
      ) : mostradas.length === 0 ? (
        <Vazio icone="promo" titulo={aba === "ativas" ? "Nenhuma promoção valendo" : "Nenhuma promoção encerrada"}>
          {aba === "ativas" ? "Crie uma promoção com dia, horário e validade. Ela entra e sai sozinha." : ""}
        </Vazio>
      ) : (
        <div className="lista">
          {mostradas.map((p) => (
            <div key={p.id} className="cartao linha" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{p.nome}</strong>
                <div className="pequeno">
                  {textoRegra(p)} em {alvoTexto(p)}
                </div>
                <div className="muted pequeno">{textoQuando(p)}</div>
              </div>
              <span className="muted pequeno">{p.usos} usos</span>
              <button type="button" className="btn" onClick={async () => setEditando(p)}>Editar promoção</button>
              {!encerrada(p) ? (
                <button type="button" className="btn" onClick={async () => encerrar(p)}>
                  Encerrar agora
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <section className="cartao pequeno">
        <h3>Como as promoções se somam</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
          <li>Se duas valem para o mesmo item, entra a de maior prioridade (não somam, a não ser que sejam “acumuláveis”).</li>
          <li>O preço da promoção sai no cupom e no relatório como desconto de promoção.</li>
          <li>Depois da data final, a promoção para sozinha.</li>
        </ul>
      </section>
      {nova || editando ? (
        <NovaPromocao
          key={editando?.id ?? "nova"}
          inicial={editando ?? undefined}
          cats={cats}
          onFechar={() => { setNova(false); setEditando(null); }}
          onCriada={() => {
            setNova(false); setEditando(null);
            avisar("Promoção salva.", "ok");
            carregar();
          }}
        />
      ) : null}
    </div>
  );
}

const ROTULO_TIPO: Record<TipoPromo, string> = { PERCENTUAL: "%", VALOR: "R$ a menos", PRECO_FIXO: "Preço fixo", LEVE_PAGUE: "Leve e pague" };
const TIPOS_AT = [
  { chave: "MESA", rotulo: "Mesa" },
  { chave: "BALCAO", rotulo: "Balcão" },
  { chave: "ENTREGA,RETIRADA", rotulo: "Delivery e retirada" },
  { chave: "VENDA_RAPIDA", rotulo: "Venda rápida" },
];

function NovaPromocao({ cats, onFechar, onCriada, inicial }: { cats: Cat[]; inicial?: Promo; onFechar: () => void; onCriada: () => void }) {
  const [rascunho] = useState(() => lerRascunhoSeguro<{ nome:string; tipo:TipoPromo; valor:string; leve:string; pague:string; valeEm:"tudo"|"categoria"|"produto"; alvo:string; dias:number; das:string; ate:string; ini:string; fim:string; extras:boolean; tipos:string[]; prioridade:string; limiteTotal:string; limiteConta:string; acumulavel:boolean; ativo:boolean }>(`promocao:${inicial?.id ?? "nova"}`));
  const [nome, setNome] = useState(rascunho?.nome ?? (inicial?.nome ?? ""));
  const [tipo, setTipo] = useState<TipoPromo>(rascunho?.tipo ?? ((inicial?.tipo as TipoPromo) ?? "PERCENTUAL"));
  const [valor, setValor] = useState(rascunho?.valor ?? (inicial ? inicial.tipo === "PERCENTUAL" ? String(inicial.percentual ?? 0) : ((inicial.valor_centavos ?? inicial.preco_fixo_centavos ?? 0) / 100).toFixed(2) : ""));
  const [leve, setLeve] = useState(rascunho?.leve ?? (String(inicial?.leve ?? 3)));
  const [pague, setPague] = useState(rascunho?.pague ?? (String(inicial?.pague ?? 2)));
  const [valeEm, setValeEm] = useState<"tudo" | "categoria" | "produto">(rascunho?.valeEm ?? (inicial ? inicial.alvos[0]?.categoria_id ? "categoria" : inicial.alvos[0]?.produto_id ? "produto" : "tudo" : "categoria"));
  const [alvo, setAlvo] = useState<string>(rascunho?.alvo ?? (String(inicial?.alvos[0]?.categoria_id ?? inicial?.alvos[0]?.produto_id ?? "")));
  const [dias, setDias] = useState(rascunho?.dias ?? (inicial?.dias_semana ?? 127));
  const [das, setDas] = useState(rascunho?.das ?? (inicial?.hora_inicio_min != null ? minParaHora(inicial.hora_inicio_min) : ""));
  const [ate, setAte] = useState(rascunho?.ate ?? (inicial?.hora_fim_min != null ? minParaHora(inicial.hora_fim_min) : ""));
  const [ini, setIni] = useState(rascunho?.ini ?? (inicial?.inicio_em ? new Date(new Date(inicial.inicio_em).getTime() - 10800000).toISOString().slice(0, 10) : ""));
  const [fim, setFim] = useState(rascunho?.fim ?? (inicial?.fim_em ? new Date(new Date(inicial.fim_em).getTime() - 10800000).toISOString().slice(0, 10) : ""));
  const [extras, setExtras] = useState(rascunho?.extras ?? (inicial?.inclui_extras ?? false));
  const [tipos, setTipos] = useState<string[]>(rascunho?.tipos ?? (inicial ? TIPOS_AT.filter(t => t.chave.split(",").some(x => inicial.tipos_atendimento.split(",").includes(x))).map(t => t.chave) : TIPOS_AT.map(t => t.chave)));
  const [prioridade, setPrioridade] = useState(rascunho?.prioridade ?? (String(inicial?.prioridade ?? 0)));
  const [limiteTotal, setLimiteTotal] = useState(rascunho?.limiteTotal ?? (String(inicial?.limite_total ?? "")));
  const [limiteConta, setLimiteConta] = useState(rascunho?.limiteConta ?? (String(inicial?.limite_por_atendimento ?? "")));
  const [acumulavel, setAcumulavel] = useState(rascunho?.acumulavel ?? (inicial?.acumulavel ?? false));
  const [ativo, setAtivo] = useState(rascunho?.ativo ?? (inicial?.ativo ?? true));
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);

  const marcarSalvo = useEdicaoPendente(`promocao:${inicial?.id ?? "nova"}`, { nome, tipo, valor, leve, pague, valeEm, alvo, dias, das, ate, ini, fim, extras, tipos, prioridade, limiteTotal, limiteConta, acumulavel, ativo });
  const fechar = async () => { if (await podeTrocarEdicao()) onFechar(); };
  const produtos = useMemo(() => cats.flatMap((c) => c.produtos), [cats]);
  const exemplo = useMemo(() => {
    if (valeEm === "categoria") return cats.find((c) => String(c.id) === alvo)?.produtos[0];
    if (valeEm === "produto") return produtos.find((p) => String(p.id) === alvo);
    return produtos[0];
  }, [valeEm, alvo, cats, produtos]);

  const num = (t: string) => Number(t.replace(",", "."));
  const regra = {
    tipo,
    percentual: tipo === "PERCENTUAL" ? Math.round(num(valor)) || null : null,
    valor_centavos: tipo === "VALOR" ? reaisParaCentavos(valor) || null : null,
    preco_fixo_centavos: tipo === "PRECO_FIXO" ? reaisParaCentavos(valor) || null : null,
    leve: tipo === "LEVE_PAGUE" ? Number(leve) || null : null,
    pague: tipo === "LEVE_PAGUE" ? Number(pague) || null : null,
  };
  const horaIni = das ? horaParaMin(das) : null;
  const horaFim = ate ? horaParaMin(ate) : null;
  const quando = textoQuando({ dias_semana: dias, hora_inicio_min: horaIni, hora_fim_min: horaFim, inicio_em: ini ? `${ini}T12:00:00-03:00` : null, fim_em: fim ? `${fim}T12:00:00-03:00` : null });
  const preco = exemplo?.variantes[0]?.preco_centavos;
  const previa = `${quando}. ${exemplo && preco != null ? (tipo === "LEVE_PAGUE" ? `${exemplo.nome}: leve ${leve}, pague ${pague}.` : `${exemplo.nome}: ${formatarReais(preco)} → ${formatarReais(precoComPromo(preco, regra))}.`) : textoRegra(regra) + "."}`;

  async function salvar() {
    if (!nome.trim()) return setMsg("Dê um nome à promoção.");
    if (tipo === "PERCENTUAL" && !(regra.percentual && regra.percentual > 0 && regra.percentual <= 100)) return setMsg("Percentual entre 1 e 100.");
    if ((tipo === "VALOR" || tipo === "PRECO_FIXO") && !(regra.valor_centavos || regra.preco_fixo_centavos)) return setMsg("Informe o valor.");
    if (tipo === "LEVE_PAGUE" && !(Number(leve) > Number(pague) && Number(pague) > 0)) return setMsg("“Leve” precisa ser maior que “pague”.");
    if (valeEm !== "tudo" && !alvo) return setMsg(valeEm === "categoria" ? "Escolha a categoria." : "Escolha o produto.");
    if ((das && horaIni == null) || (ate && horaFim == null) || (!!das !== !!ate)) return setMsg("Preencha as duas horas (ex.: 17:00 e 19:00) ou deixe as duas vazias.");
    if (!dias) return setMsg("Escolha pelo menos um dia.");
    if (!tipos.length) return setMsg("Escolha onde a promoção vale.");
    if (ini && fim && fim < ini) return setMsg("A data final é antes da inicial.");
    if (!Number.isInteger(Number(prioridade)) || [limiteTotal, limiteConta].some(v => v !== "" && (!Number.isSafeInteger(Number(v)) || Number(v) < 1))) return setMsg("Prioridade deve ser inteira e limites devem ser inteiros positivos.");
    setEnviando(true);
    setMsg("");
    try {
      await api(inicial ? `/promocoes/${inicial.id}` : "/promocoes", {
        method: inicial ? "PATCH" : "POST",
        body: JSON.stringify({
          nome: nome.trim(),
          prioridade: Number(prioridade), acumulavel, ativo,
          limite_total: limiteTotal ? Number(limiteTotal) : null,
          limite_por_atendimento: limiteConta ? Number(limiteConta) : null,
          ...regra,
          dias_semana: dias,
          hora_inicio_min: horaIni,
          hora_fim_min: horaFim,
          inicio_em: ini ? new Date(`${ini}T00:00:00-03:00`).toISOString() : null,
          fim_em: fim ? new Date(`${fim}T23:59:59-03:00`).toISOString() : null,
          tipos_atendimento: tipos.join(","),
          inclui_extras: extras,
          alvos: valeEm === "tudo" ? [] : valeEm === "categoria" ? [{ categoria_id: Number(alvo) }] : [{ produto_id: Number(alvo) }],
        }),
      });
      marcarSalvo(); onCriada();
    } catch (e) {
      setMsg((e as ApiErro).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={inicial ? "Editar promoção" : "Nova promoção"}
      sub="Preencha de cima para baixo; a prévia mostra como fica"
      largo
      onFechar={() => void fechar()}
      fecharComEsc={!enviando}
      pe={
        <>
          <button type="button" className="btn" onClick={() => void fechar()}>
            Cancelar
          </button>
          <button type="button" className="btn btn-pri" disabled={enviando} onClick={salvar}>
            {enviando ? "Salvando…" : "Salvar promoção"}
          </button>
        </>
      }
    >
      <div className="pilha" style={{ gap: 12 }}>
        {msg ? <Faixa tom="err" titulo={msg} /> : null}
        <Faixa tom="ok" titulo="Prévia">{previa}</Faixa>
        <div className="linha-campos">
          <label className="fld">
            <span>Nome</span>
            <input data-foco placeholder="Ex.: Happy hour pastéis" value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="fld">
            <span>Tipo</span>
            <div className="segmento" role="group" aria-label="Tipo">
              {(Object.keys(ROTULO_TIPO) as TipoPromo[]).map((t) => (
                <button key={t} type="button" disabled={!!inicial} aria-pressed={tipo === t} onClick={async () => setTipo(t)}>
                  {ROTULO_TIPO[t]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="linha-campos">
          {tipo === "LEVE_PAGUE" ? (
            <>
              <label className="fld">
                <span>Leve</span>
                <input inputMode="numeric" value={leve} onChange={(e) => setLeve(e.target.value.replace(/\D/g, ""))} />
              </label>
              <label className="fld">
                <span>Pague</span>
                <input inputMode="numeric" value={pague} onChange={(e) => setPague(e.target.value.replace(/\D/g, ""))} />
              </label>
            </>
          ) : (
            <label className="fld">
              <span>{tipo === "PERCENTUAL" ? "Desconto (%)" : tipo === "VALOR" ? "Valor a menos (R$)" : "Preço da promoção (R$)"}</span>
              <input inputMode="decimal" placeholder={tipo === "PERCENTUAL" ? "20" : "0,00"} value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
          )}
          <label className="fld">
            <span>Produtos participantes</span>
            <select
              disabled={!!inicial}
              value={valeEm}
              onChange={(e) => {
                setValeEm(e.target.value as typeof valeEm);
                setAlvo("");
              }}
            >
              <option value="categoria">Categoria</option>
              <option value="produto">Produto</option>
              <option value="tudo">Todo o cardápio</option>
            </select>
          </label>
          {valeEm !== "tudo" ? (
            <label className="fld">
              <span>{valeEm === "categoria" ? "Categoria participante" : "Produto participante"}</span>
              <select disabled={!!inicial} value={alvo} onChange={(e) => setAlvo(e.target.value)}>
                <option value="">Escolha…</option>
                {valeEm === "categoria"
                  ? cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.produtos.length} produtos)
                      </option>
                    ))
                  : produtos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="fld">
          <span>Dias</span>
          <div className="pilulas" role="group" aria-label="Dias da semana">
            {DIAS.map((d) => (
              <button key={d.bit} type="button" aria-pressed={!!(dias & d.bit)} onClick={async () => setDias(dias ^ d.bit)}>
                {d.curto}
              </button>
            ))}
          </div>
        </div>
        <div className="linha-campos">
          <label className="fld">
            <span>Das (opcional)</span>
            <input type="time" value={das} onChange={(e) => setDas(e.target.value)} />
          </label>
          <label className="fld">
            <span>Até</span>
            <input type="time" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <label className="fld">
            <span>Começa em</span>
            <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </label>
          <label className="fld">
            <span>Termina em</span>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            <span className="dica">Depois disso ela para sozinha.</span>
          </label>
        </div>
        <div className="fld">
          <span>Canais de atendimento</span>
          <div className="linha" style={{ flexWrap: "wrap" }}>
            {TIPOS_AT.map((t) => (
              <label key={t.chave} className="check">
                <input type="checkbox" checked={tipos.includes(t.chave)} onChange={(e) => setTipos(e.target.checked ? [...tipos, t.chave] : tipos.filter((x) => x !== t.chave))} /> {t.rotulo}
              </label>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} /> O desconto vale também sobre os adicionais
        </label>
        <details><summary>Opções avançadas: prioridade e limites</summary><p className="dica">A maior prioridade é aplicada primeiro. Promoções não acumuláveis concorrem entre si; marque acumulação apenas quando os descontos puderem ser combinados.</p>
        <div className="linha-campos">
          <label className="fld"><span>Prioridade</span><input type="number" value={prioridade} onChange={e => setPrioridade(e.target.value)} /></label>
          <label className="fld"><span>Limite total de usos (opcional)</span><input type="number" min="1" value={limiteTotal} onChange={e => setLimiteTotal(e.target.value)} /></label>
          <label className="fld"><span>Limite por atendimento (opcional)</span><input type="number" min="1" value={limiteConta} onChange={e => setLimiteConta(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={acumulavel} onChange={e => setAcumulavel(e.target.checked)} /> Acumulável com outras promoções</label></details>
        {inicial ? <label className="check"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Promoção ativa (a validade também precisa estar vigente)</label> : null}

      </div>
    </Dialogo>
  );
}
