import { useCallback, useEffect, useState } from "react";
import { Carregando, ErroCarga, Faixa } from "../../componentes/ui/Estados";
import { useSistema } from "../../estado/sistema-ctx";
import { api, type ApiErro } from "../../servicos/api";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";

type Cfg = { taxa_servico_percentual?: number; limite_desconto_sem_pin_centavos?: number; kds_atraso_min?: number; usa_gaveta?: boolean; estoque_nivel?: number };

const NIVEIS = [
  { n: 0, t: "Desligado", d: "Não controla estoque." },
  { n: 1, t: "Só esgotados", d: "Marca o que acabou; o PDV não deixa vender." },
  { n: 2, t: "Quantidade dos itens de revenda", d: "Bebidas e itens prontos baixam 1 por venda." },
];

/** Prancha 13d/13f: taxas, limite de desconto sem PIN, atraso do KDS, gaveta e nível de estoque. */
export default function AbaOperacao() {
  const { avisar } = useSistema();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [erro, setErro] = useState("");
  const [serv, setServ] = useState("10");
  const [limite, setLimite] = useState("5,00");
  const [atraso, setAtraso] = useState("15");
  const [gaveta, setGaveta] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    (api("/configuracoes") as Promise<Cfg>)
      .then((c) => {
        setErro("");
        setCfg(c);
        setServ(String(c.taxa_servico_percentual ?? 10));
        setLimite(((c.limite_desconto_sem_pin_centavos ?? 500) / 100).toFixed(2).replace(".", ","));
        setAtraso(String(c.kds_atraso_min ?? 15));
        setGaveta(!!c.usa_gaveta);
        setNivel(c.estoque_nivel ?? 0);
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  async function salvar() {
    const s = Number(serv);
    const a = Number(atraso);
    if (!Number.isInteger(s) || s < 0 || s > 30) return avisar("Taxa de serviço entre 0 e 30%.", "err");
    if (!Number.isInteger(a) || a < 1 || a > 120) return avisar("Atraso da cozinha entre 1 e 120 minutos.", "err");
    setSalvando(true);
    try {
      await api("/configuracoes", {
        method: "PUT",
        body: JSON.stringify({ taxa_servico_percentual: s, limite_desconto_sem_pin_centavos: reaisParaCentavos(limite), kds_atraso_min: a, usa_gaveta: gaveta, estoque_nivel: nivel }),
      });
      avisar("Configurações salvas.", "ok");
      window.dispatchEvent(new Event("osr:caixa-mudou"));
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!cfg) return <Carregando linhas={3} />;
  return (
    <div className="pilha" style={{ gap: 16, maxWidth: 760 }}>
      <section className="cartao pilha">
        <h3>Taxas e descontos</h3>
        <div className="linha-campos">
          <label className="fld">
            <span>Taxa de serviço (%)</span>
            <input inputMode="numeric" value={serv} onChange={(e) => setServ(e.target.value.replace(/\D/g, ""))} />
            <span className="dica">Sugerida nas mesas; o cliente pode recusar.</span>
          </label>
          <label className="fld">
            <span>Desconto sem PIN até (R$)</span>
            <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} />
            <span className="dica">Acima disso, o atendente pede o PIN do gerente. Hoje: {formatarReais(reaisParaCentavos(limite))}.</span>
          </label>
        </div>
      </section>
      <section className="cartao pilha">
        <h3>Cozinha e caixa</h3>
        <div className="linha-campos">
          <label className="fld">
            <span>Pedido atrasado depois de (min)</span>
            <input inputMode="numeric" value={atraso} onChange={(e) => setAtraso(e.target.value.replace(/\D/g, ""))} />
            <span className="dica">O cartão fica vermelho na tela da cozinha.</span>
          </label>
          <div className="fld">
            <span>Gaveta de dinheiro</span>
            <label className="check">
              <input type="checkbox" checked={gaveta} onChange={(e) => setGaveta(e.target.checked)} /> Tem gaveta ligada na impressora do caixa
            </label>
          </div>
        </div>
      </section>
      <section className="cartao pilha">
        <h3>Estoque</h3>
        {NIVEIS.map((n) => (
          <label key={n.n} className={`cartao radio-cartao ${nivel === n.n ? "cartao-sel" : ""}`}>
            <input type="radio" name="nivel" checked={nivel === n.n} onChange={() => setNivel(n.n)} />
            <span>
              <strong>
                Nível {n.n} · {n.t}
              </strong>
              <br />
              <span className="muted pequeno">{n.d}</span>
            </span>
          </label>
        ))}
        <Faixa tom="info">Insumos, ficha técnica, nota fiscal e lotes (níveis 3 e 4) ainda não estão disponíveis.</Faixa>
      </section>
      <div className="linha">
        <button type="button" className="btn btn-pri btn-g" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
