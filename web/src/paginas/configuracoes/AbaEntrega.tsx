import { lerRascunhoSeguro, useEdicaoPendente } from "../../hooks/useRascunho";
import FormEndereco from "../clientes/FormEndereco";
import type { EnderecoInput } from "../../servicos/contratos";
import { geocodificar } from "../../servicos/rotas";
import { useCallback, useEffect, useState } from "react";
import { Carregando, ErroCarga, Faixa } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { useSistema } from "../../estado/sistema-ctx";
import type { ApiErro } from "../../servicos/api";
import type { BairroEntrega, ConfigEntrega } from "../../servicos/contratos";
import { criarBairro, editarBairro, lerConfigEntrega, listarBairros, salvarConfigEntrega } from "../../servicos/rotas";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const km = (m: number | null) => (m == null ? "" : String(m / 1000).replace(".", ","));
const paraM = (t: string) => (t.trim() ? Math.round(Number(t.replace(",", ".")) * 1000) : null);

/** Pranchas 13b–13c: de onde sai a entrega, faixas de distância e bairros com taxa própria. */
export default function AbaEntrega() {
  const { avisar } = useSistema();
  const [cfg, setCfg] = useState<ConfigEntrega | null>(null);
  const [bairros, setBairros] = useState<BairroEntrega[]>([]);
  const [erro, setErro] = useState("");
  const [faixas, setFaixas] = useState<{ ate: string; taxa: string }[]>([]);
  const [raio, setRaio] = useState("");
  const [fator, setFator] = useState("1,30");
  const [padrao, setPadrao] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [novoB, setNovoB] = useState({ nome: "", cidade: "", taxa: "" });
  const [salvando, setSalvando] = useState(false);

  const [endereco, setEndereco] = useState<EnderecoInput>({ logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "", sem_numero: false });
  const [localizando, setLocalizando] = useState(false);
  const marcarSalvo = useEdicaoPendente("config:entrega", { faixas, raio, fator, padrao, lat, lng, endereco }, !!cfg);
  async function localizar() {
    if (!endereco.logradouro || !endereco.bairro || !endereco.cidade || !endereco.uf) return avisar("Preencha rua, bairro, cidade e UF para localizar o restaurante.", "err");
    setLocalizando(true);
    try { const r = await geocodificar({ ...endereco, numero: endereco.numero ?? undefined }); setLat(String(r.lat)); setLng(String(r.lng)); avisar(`Localização encontrada por ${r.precisao}. Confira o endereço e salve as regras.`, "ok"); }
    catch (e) { avisar((e as Error).message, "err"); } finally { setLocalizando(false); }
  }
  const carregar = useCallback(() => {
    Promise.all([lerConfigEntrega(), listarBairros()])
      .then(([c, b]) => {
        setErro("");
        setCfg(c);
        setBairros(b);
        setFaixas(c.faixas.filter((f) => f.ativo).map((f) => ({ ate: km(f.ate_m), taxa: reais(f.taxa_centavos) })));
        setRaio(km(c.entrega_raio_max_m));
        setFator((c.entrega_fator_rota / 100).toFixed(2).replace(".", ","));
        setPadrao(reais(c.taxa_entrega_centavos));
        setLat(c.lat != null ? String(c.lat) : "");
        setLng(c.lng != null ? String(c.lng) : "");
        if (c.endereco_origem) { try { setEndereco(JSON.parse(c.endereco_origem)); } catch { /* endereço antigo em texto */ } }
        const r = lerRascunhoSeguro<{ faixas: { ate: string; taxa: string }[]; raio: string; fator: string; padrao: string; lat: string; lng: string; endereco: EnderecoInput }>("config:entrega");
        if (r) { setFaixas(r.faixas); setRaio(r.raio); setFator(r.fator); setPadrao(r.padrao); setLat(r.lat); setLng(r.lng); setEndereco(r.endereco); }
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  async function salvar() {
    if (!cfg) return;
    const f = Math.round(Number(fator.replace(",", ".")) * 100);
    if (!(f >= 100 && f <= 300)) return avisar("O fator da rota fica entre 1,00 e 3,00.", "err");
    const lista = faixas
      .filter((x) => x.ate.trim())
      .map((x, i) => ({ ate_m: paraM(x.ate) ?? 0, taxa_centavos: reaisParaCentavos(x.taxa || "0"), ordem: i + 1, ativo: true }))
      .sort((a, z) => a.ate_m - z.ate_m)
      .map((x, i) => ({ ...x, ordem: i + 1 }));
    setSalvando(true);
    try {
      await salvarConfigEntrega({
        lat: lat.trim() ? Number(lat.replace(",", ".")) : null,
        lng: lng.trim() ? Number(lng.replace(",", ".")) : null,
        endereco_origem: endereco.logradouro ? JSON.stringify(endereco) : cfg.endereco_origem ?? null,
        entrega_raio_max_m: paraM(raio),
        entrega_modo_distancia: "linha_reta",
        entrega_fator_rota: f,
        taxa_entrega_centavos: reaisParaCentavos(padrao || "0"),
        faixas: lista,
      });
      marcarSalvo();
      avisar("Regras de entrega salvas.", "ok");
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    } finally {
      setSalvando(false);
    }
  }

  async function addBairro() {
    if (!novoB.nome.trim()) return avisar("Informe o nome do bairro.", "err");
    try {
      await criarBairro({ nome: novoB.nome.trim(), cidade: novoB.cidade.trim(), taxa_centavos: reaisParaCentavos(novoB.taxa || "0"), atende: true });
      setNovoB({ nome: "", cidade: novoB.cidade, taxa: "" });
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    }
  }
  async function mudarBairro(b: BairroEntrega, p: Partial<BairroEntrega>) {
    try {
      await editarBairro(b.id, p);
      carregar();
    } catch (e) {
      avisar((e as ApiErro).message, "err");
    }
  }

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!cfg) return <Carregando linhas={3} />;
  return (
    <div className="pilha" style={{ gap: 16, maxWidth: 860 }}>
      <Faixa tom="info" titulo="Como a taxa é escolhida">
        Taxa digitada à mão → bairro cadastrado → faixa de distância → taxa padrão. A distância é em linha reta × fator da rota.
      </Faixa>
      <section className="cartao pilha">
        <h3>Ponto de saída e limites</h3>
        <p>Busque o CEP, complete o endereço e localize o ponto de saída das entregas.</p>
        <FormEndereco valor={endereco} onMudar={setEndereco} />
        <button type="button" className="btn" disabled={localizando} onClick={localizar}>{localizando ? "Localizando…" : "Localizar restaurante"}</button>
        {lat && lng ? <p role="status">Ponto de saída localizado. Salve as regras para aplicar.</p> : null}
        <label className="fld"><span>Entrega até (km)</span><input inputMode="decimal" placeholder="Sem limite" value={raio} onChange={e => setRaio(e.target.value)} /></label>
        <details><summary>Opções avançadas de distância</summary><div className="linha-campos">
          <label className="fld"><span>Latitude</span><input inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)} /></label>
          <label className="fld"><span>Longitude</span><input inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)} /></label>
          <label className="fld"><span>Fator da rota</span><input inputMode="decimal" value={fator} onChange={e => setFator(e.target.value)} /><span className="dica">1,30 estima um trajeto 30% maior que a distância em linha reta.</span></label>
        </div></details>
      </section>
      <section className="cartao pilha">
        <h3>Faixas de distância</h3>
        {faixas.map((f, i) => (
          <div key={i} className="linha" style={{ alignItems: "end" }}>
            <label className="fld" style={{ width: 140 }}>
              <span>Até (km)</span>
              <input inputMode="decimal" value={f.ate} onChange={(e) => setFaixas(faixas.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))} />
            </label>
            <label className="fld" style={{ width: 140 }}>
              <span>Taxa (R$)</span>
              <input inputMode="decimal" value={f.taxa} onChange={(e) => setFaixas(faixas.map((x, j) => (j === i ? { ...x, taxa: e.target.value } : x)))} />
            </label>
            <button type="button" className="btn-link" onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}>
              Remover
            </button>
          </div>
        ))}
        <div className="linha" style={{ alignItems: "end" }}>
          <button type="button" className="btn" onClick={() => setFaixas([...faixas, { ate: "", taxa: "" }])}>
            <Icone nome="mais" /> Nova faixa
          </button>
          <label className="fld" style={{ width: 200, marginLeft: "auto" }}>
            <span>Taxa padrão (R$)</span>
            <input inputMode="decimal" value={padrao} onChange={(e) => setPadrao(e.target.value)} />
            <span className="dica">Quando não dá para medir a distância.</span>
          </label>
        </div>
        <div className="linha">
          <button type="button" className="btn btn-pri" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar regras"}
          </button>
        </div>
      </section>
      <section className="cartao pilha">
        <h3>Bairros com taxa própria</h3>
        <p className="muted pequeno" style={{ margin: 0 }}>
          Vale mais que a faixa. Desmarque “Atende” para recusar entregas no bairro.
        </p>
        {bairros.length ? (
          <table className="tabela">
            <thead>
              <tr>
                <th>Bairro</th>
                <th className="so-pc">Cidade</th>
                <th className="num">Taxa</th>
                <th>Atende</th>
              </tr>
            </thead>
            <tbody>
              {bairros.map((b) => (
                <tr key={b.id}>
                  <td>{b.nome}</td>
                  <td className="so-pc">{b.cidade}</td>
                  <td className="num">{formatarReais(b.taxa_centavos)}</td>
                  <td>
                    <input type="checkbox" aria-label={`Atende ${b.nome}`} checked={b.atende} onChange={(e) => mudarBairro(b, { atende: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="linha-campos" style={{ alignItems: "end" }}>
          <label className="fld">
            <span>Bairro</span>
            <input value={novoB.nome} onChange={(e) => setNovoB({ ...novoB, nome: e.target.value })} />
          </label>
          <label className="fld">
            <span>Cidade</span>
            <input value={novoB.cidade} onChange={(e) => setNovoB({ ...novoB, cidade: e.target.value })} />
          </label>
          <label className="fld">
            <span>Taxa (R$)</span>
            <input inputMode="decimal" value={novoB.taxa} onChange={(e) => setNovoB({ ...novoB, taxa: e.target.value })} />
          </label>
          <button type="button" className="btn" onClick={addBairro}>
            Adicionar bairro
          </button>
        </div>
      </section>
    </div>
  );
}
