import { useCallback, useEffect, useMemo, useState } from "react";
import { Carregando, ErroCarga, Faixa, Vazio } from "../../componentes/ui/Estados";
import { useSistema } from "../../estado/sistema-ctx";
import type { ApiErro } from "../../servicos/api";
import type { Dashboard } from "../../servicos/contratos";
import { lerDashboard } from "../../servicos/rotas";
import { formatarReais } from "../../util/dinheiro";
import { datasDoPeriodo, paraCsv, rotuloDia, rotuloMes, textoVariacao, variacao, type AtalhoPeriodo } from "../../util/relatorios";

const ROTULO_TIPO: Record<string, string> = { MESA: "Mesa", BALCAO: "Balcão", DELIVERY: "Delivery", RETIRADA: "Retirada", VENDA_RAPIDA: "Venda rápida" };
type Escala = "dia" | "semana" | "mes";
type Medida = "qtd" | "valor";

/**
 * Pranchas 15a–15b: tudo vem de GET /relatorios/dashboard.
 * Faturamento por dia/semana/mês comparado com o período anterior; cancelamentos e descontos por funcionário.
 * Sem lucro nem margem (decisão da Aline).
 */
export default function Relatorios() {
  const { avisar } = useSistema();
  const [atalho, setAtalho] = useState<AtalhoPeriodo | "escolher">("7");
  const [de, setDe] = useState(() => datasDoPeriodo("7").de);
  const [ate, setAte] = useState(() => datasDoPeriodo("7").ate);
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [escala, setEscala] = useState<Escala>("dia");
  const [medida, setMedida] = useState<Medida>("valor");

  const carregar = useCallback(() => {
    setCarregando(true);
    lerDashboard({ de, ate })
      .then((d) => {
        setErro("");
        setDados(d);
      })
      .catch((e: ApiErro) => setErro(e.codigo === "periodo_invalido" ? "A data inicial é depois da final." : e.message))
      .finally(() => setCarregando(false));
  }, [de, ate]);
  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  function escolher(a: AtalhoPeriodo) {
    const p = datasDoPeriodo(a);
    setAtalho(a);
    setDe(p.de);
    setAte(p.ate);
    setEscala(a === "mes" || a === "30" ? "semana" : "dia");
  }

  const totais = useMemo(() => {
    if (!dados) return null;
    const desc = dados.por_funcionario.reduce((t, f) => t + f.descontos_centavos, 0);
    const descQ = dados.por_funcionario.reduce((t, f) => t + f.descontos_qtd, 0);
    const canc = dados.por_funcionario.reduce((t, f) => t + f.cancelamentos_centavos, 0);
    const cancQ = dados.por_funcionario.reduce((t, f) => t + f.cancelamentos_qtd, 0);
    return { desc, descQ, canc, cancQ };
  }, [dados]);

  function exportar() {
    if (!dados) return;
    const L: (string | number)[][] = [["Relatório OS Restaurante", `${rotuloDia(dados.de)} a ${rotuloDia(dados.ate)}`], []];
    L.push(["Vendido (R$)", dados.faturamento_centavos / 100, "Anterior (R$)", dados.faturamento_anterior_centavos / 100]);
    L.push(["Atendimentos", dados.atendimentos, "Anterior", dados.atendimentos_anterior]);
    L.push(["Ticket médio (R$)", dados.ticket_medio_centavos / 100]);
    L.push([], ["Dia", "Vendido (R$)", "Atendimentos", "Dia anterior", "Vendido anterior (R$)"]);
    for (const d of dados.faturamento_agregado.por_dia) L.push([d.dia, d.faturamento_centavos / 100, d.atendimentos, d.anterior.dia, d.anterior.faturamento_centavos / 100]);
    L.push([], ["Forma de pagamento", "Valor (R$)", "Qtd"]);
    for (const f of dados.por_forma_pagamento) L.push([f.nome, f.valor_centavos / 100, f.qtd]);
    L.push([], ["Produto", "Qtd", "Valor (R$)"]);
    for (const p of dados.produtos_mais_vendidos_quantidade) L.push([p.nome, p.qtd, p.valor_centavos / 100]);
    L.push([], ["Funcionário", "Cancelamentos", "Cancelado (R$)", "Descontos", "Desconto (R$)"]);
    for (const f of dados.por_funcionario) L.push([f.nome, f.cancelamentos_qtd, f.cancelamentos_centavos / 100, f.descontos_qtd, f.descontos_centavos / 100]);
    const url = URL.createObjectURL(new Blob([paraCsv(L)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${dados.de}-a-${dados.ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    avisar("Planilha baixada (abre no Excel).", "ok");
  }

  const barras = useMemo(() => {
    if (!dados) return [];
    const ag = dados.faturamento_agregado;
    if (escala === "dia") return ag.por_dia.map((d) => ({ rot: rotuloDia(d.dia), atual: d.faturamento_centavos, ant: d.anterior.faturamento_centavos, dica: `${rotuloDia(d.dia)} vs ${rotuloDia(d.anterior.dia)}` }));
    if (escala === "semana") return ag.por_semana.map((s) => ({ rot: rotuloDia(s.inicio), atual: s.faturamento_centavos, ant: s.anterior.faturamento_centavos, dica: `Semana de ${rotuloDia(s.inicio)} a ${rotuloDia(s.fim)} vs ${rotuloDia(s.anterior.inicio)} a ${rotuloDia(s.anterior.fim)}` }));
    return ag.por_mes.map((m) => ({ rot: rotuloMes(m.inicio), atual: m.faturamento_centavos, ant: m.anterior.faturamento_centavos, dica: `${rotuloMes(m.inicio)} vs ${rotuloMes(m.anterior.inicio)}` }));
  }, [dados, escala]);
  const maxBarra = Math.max(1, ...barras.flatMap((b) => [b.atual, b.ant]));

  const func = useMemo(() => (dados ? [...dados.por_funcionario].sort((a, z) => (medida === "qtd" ? z.cancelamentos_qtd + z.descontos_qtd - (a.cancelamentos_qtd + a.descontos_qtd) : z.cancelamentos_centavos + z.descontos_centavos - (a.cancelamentos_centavos + a.descontos_centavos))) : []), [dados, medida]);
  const maxFunc = Math.max(1, ...func.flatMap((f) => (medida === "qtd" ? [f.cancelamentos_qtd, f.descontos_qtd] : [f.cancelamentos_centavos, f.descontos_centavos])));
  const totalFormas = dados ? Math.max(1, dados.por_forma_pagamento.reduce((t, f) => t + f.valor_centavos, 0)) : 1;
  const totalTipos = dados ? Math.max(1, dados.por_tipo.reduce((t, f) => t + f.faturamento_centavos, 0)) : 1;

  return (
    <div className="pilha rel" style={{ gap: 14 }}>
      <div className="cab-pagina" style={{ flexWrap: "wrap" }}>
        <div className="pilulas" role="group" aria-label="Período">
          {(
            [
              ["hoje", "Hoje"],
              ["ontem", "Ontem"],
              ["7", "7 dias"],
              ["mes", "Este mês"],
              ["30", "30 dias"],
            ] as const
          ).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={atalho === k} onClick={() => escolher(k)}>
              {r}
            </button>
          ))}
          <button type="button" aria-pressed={atalho === "escolher"} onClick={() => setAtalho("escolher")}>
            Escolher…
          </button>
        </div>
        <button type="button" className="btn" style={{ marginLeft: "auto" }} disabled={!dados} onClick={exportar}>
          Exportar planilha
        </button>
      </div>
      {atalho === "escolher" ? (
        <div className="linha-campos" style={{ maxWidth: 420 }}>
          <label className="fld">
            <span>De</span>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="fld">
            <span>Até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
        </div>
      ) : null}

      {erro ? (
        <ErroCarga mensagem={erro} onTentar={carregar} />
      ) : !dados || !totais ? (
        <Carregando />
      ) : (
        <>
          {carregando ? <div className="muted pequeno">Atualizando…</div> : null}
          <div className="grade-4 rel-kpis">
            <Kpi titulo="Vendido" valor={formatarReais(dados.faturamento_centavos)} sub={textoVariacao(variacao(dados.faturamento_centavos, dados.faturamento_anterior_centavos))} tom={dados.faturamento_centavos >= dados.faturamento_anterior_centavos ? "ok" : "err"} />
            <Kpi titulo="Atendimentos" valor={String(dados.atendimentos)} sub={textoVariacao(variacao(dados.atendimentos, dados.atendimentos_anterior))} />
            <Kpi titulo="Ticket médio" valor={formatarReais(dados.ticket_medio_centavos)} sub={textoVariacao(variacao(dados.ticket_medio_centavos, dados.ticket_medio_anterior_centavos))} />
            <Kpi titulo="Descontos e cancelamentos" valor={formatarReais(totais.desc + totais.canc)} sub={`${totais.descQ} descontos · ${totais.cancQ} cancelamentos`} />
          </div>
          <p className="muted pequeno" style={{ margin: 0 }}>
            Período anterior: {rotuloDia(dados.periodo_anterior.de)} a {rotuloDia(dados.periodo_anterior.ate)}. Valores sem lucro nem margem.
          </p>

          <section className="cartao pilha">
            <div className="linha" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Faturamento</h3>
              <div className="segmento" role="group" aria-label="Agrupar por">
                {(["dia", "semana", "mes"] as const).map((e) => (
                  <button key={e} type="button" aria-pressed={escala === e} onClick={() => setEscala(e)}>
                    {e === "dia" ? "Dia" : e === "semana" ? "Semana" : "Mês"}
                  </button>
                ))}
              </div>
            </div>
            <div className="legenda pequeno">
              <span className="leg-atual" /> Período escolhido <span className="leg-ant" /> Período anterior
            </div>
            {barras.length === 0 ? (
              <Vazio titulo="Sem vendas no período" />
            ) : (
              <div className="grafico-colunas" role="img" aria-label="Faturamento por período comparado com o anterior">
                {barras.map((b) => (
                  <div key={b.rot} className="gc-grupo" title={`${b.dica}: ${formatarReais(b.atual)} vs ${formatarReais(b.ant)}`}>
                    <div className="gc-barras">
                      <span className="gc-ant" style={{ height: `${(b.ant / maxBarra) * 100}%` }} />
                      <span className="gc-atual" style={{ height: `${(b.atual / maxBarra) * 100}%` }} />
                    </div>
                    <span className="gc-rot">{b.rot}</span>
                  </div>
                ))}
              </div>
            )}
            <details>
              <summary className="pequeno">Ver em tabela</summary>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th className="num">Vendido</th>
                    <th className="num">Anterior</th>
                    <th className="num">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {barras.map((b) => (
                    <tr key={b.rot}>
                      <td>{b.dica}</td>
                      <td className="num">{formatarReais(b.atual)}</td>
                      <td className="num">{formatarReais(b.ant)}</td>
                      <td className="num">{textoVariacao(variacao(b.atual, b.ant)).replace(" vs anterior", "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <section className="cartao pilha">
            <div className="linha" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Cancelamentos e descontos por funcionário</h3>
              <div className="segmento" role="group" aria-label="Medida">
                <button type="button" aria-pressed={medida === "qtd"} onClick={() => setMedida("qtd")}>
                  Quantidade
                </button>
                <button type="button" aria-pressed={medida === "valor"} onClick={() => setMedida("valor")}>
                  Valor
                </button>
              </div>
            </div>
            <div className="legenda pequeno">
              <span className="leg-canc" /> Cancelamentos <span className="leg-desc" /> Descontos
            </div>
            {func.length === 0 ? (
              <p className="muted">Nenhum cancelamento ou desconto no período.</p>
            ) : (
              <div className="grafico-func">
                {func.map((f) => {
                  const c = medida === "qtd" ? f.cancelamentos_qtd : f.cancelamentos_centavos;
                  const d = medida === "qtd" ? f.descontos_qtd : f.descontos_centavos;
                  const fmt = (v: number) => (medida === "qtd" ? String(v) : formatarReais(v));
                  return (
                    <div key={f.usuario_id} className="gf-linha">
                      <span className="gf-nome">{f.nome}</span>
                      <div className="gf-barras">
                        <div className="gf-barra">
                          <span className="gf-canc" style={{ width: `${(c / maxFunc) * 100}%` }} />
                          <span className="gf-val">{fmt(c)}</span>
                        </div>
                        <div className="gf-barra">
                          <span className="gf-desc" style={{ width: `${(d / maxFunc) * 100}%` }} />
                          <span className="gf-val">{fmt(d)}</span>
                        </div>
                      </div>
                      <span className="muted pequeno gf-resumo">
                        {f.cancelamentos_qtd} canc. ({formatarReais(f.cancelamentos_centavos)}) · {f.descontos_qtd} desc. ({formatarReais(f.descontos_centavos)})
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="muted pequeno" style={{ margin: 0 }}>
              Cada caso aparece com motivo e quem aprovou na Auditoria.
            </p>
          </section>

          <div className="grade-2">
            <section className="cartao pilha">
              <h3>Por forma de pagamento</h3>
              {dados.por_forma_pagamento.length === 0 ? <p className="muted">Nenhum pagamento.</p> : null}
              {dados.por_forma_pagamento.map((f) => (
                <div key={f.forma_pagamento_id} className="barra-h">
                  <div className="linha" style={{ justifyContent: "space-between" }}>
                    <span>{f.nome}</span>
                    <strong>
                      {formatarReais(f.valor_centavos)} · {Math.round((f.valor_centavos / totalFormas) * 100)}%
                    </strong>
                  </div>
                  <div className="bh-trilho">
                    <span style={{ width: `${(f.valor_centavos / totalFormas) * 100}%` }} />
                  </div>
                </div>
              ))}
              <h3 style={{ marginTop: 8 }}>Por tipo de venda</h3>
              {dados.por_tipo
                .filter((t) => t.faturamento_centavos > 0)
                .map((t) => (
                  <div key={t.tipo} className="linha pequeno" style={{ justifyContent: "space-between" }}>
                    <span>{ROTULO_TIPO[t.tipo] ?? t.tipo}</span>
                    <span>
                      {formatarReais(t.faturamento_centavos)} · {Math.round((t.faturamento_centavos / totalTipos) * 100)}% · {t.atendimentos} atend.
                    </span>
                  </div>
                ))}
            </section>
            <section className="cartao pilha">
              <h3>Mais vendidos</h3>
              {dados.produtos_mais_vendidos_quantidade.length === 0 ? (
                <p className="muted">Nada vendido no período.</p>
              ) : (
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="num">Qtd</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.produtos_mais_vendidos_quantidade.slice(0, 8).map((p) => (
                      <tr key={p.produto_variante_id}>
                        <td>{p.nome}</td>
                        <td className="num">{p.qtd}</td>
                        <td className="num">{formatarReais(p.valor_centavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dados.produtos_sem_venda.length ? (
                <Faixa tom="warn" titulo={`${dados.produtos_sem_venda.length} produto(s) sem venda no período`}>
                  {dados.produtos_sem_venda
                    .slice(0, 5)
                    .map((p) => p.nome)
                    .join(", ")}
                  {dados.produtos_sem_venda.length > 5 ? "…" : ""}
                </Faixa>
              ) : null}
            </section>
          </div>

          <section className="cartao pilha">
            <h3>Movimento por hora</h3>
            <div className="grafico-horas" role="img" aria-label="Faturamento por hora do dia">
              {dados.por_hora.map((h) => {
                const max = Math.max(1, ...dados.por_hora.map((x) => x.faturamento_centavos));
                return (
                  <div key={h.hora} className="gh-col" title={`${h.hora}h: ${formatarReais(h.faturamento_centavos)} · ${h.atendimentos} atend.`}>
                    <span style={{ height: `${(h.faturamento_centavos / max) * 100}%` }} />
                    <small>{h.hora % 3 === 0 ? `${h.hora}h` : ""}</small>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, sub, tom }: { titulo: string; valor: string; sub: string; tom?: "ok" | "err" }) {
  return (
    <div className="cartao">
      <span className="muted pequeno">{titulo}</span>
      <div className="valor-g">{valor}</div>
      <span className="pequeno" style={{ color: tom === "ok" ? "var(--ok)" : tom === "err" ? "var(--err)" : "var(--ink3)" }}>
        {sub}
      </span>
    </div>
  );
}
