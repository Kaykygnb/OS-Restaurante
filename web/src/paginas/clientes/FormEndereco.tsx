import { useState } from "react";
import type { ApiErro } from "../../servicos/api";
import type { EnderecoInput } from "../../servicos/contratos";
import { buscarCep } from "../../servicos/rotas";
import { formatarCep, soDigitos } from "../../util/formatos";


/** Endereço do cliente: o CEP preenche rua, bairro e cidade. Sem internet, a pessoa digita tudo à mão. */
export default function FormEndereco({ valor, onMudar, erros = {} }: { valor: EnderecoInput; onMudar: (e: EnderecoInput) => void; erros?: Record<string, string> }) {
  const [cepMsg, setCepMsg] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const mudar = (p: Partial<EnderecoInput>) => onMudar({ ...valor, ...p });

  async function procurarCep(cep: string) {
    if (soDigitos(cep).length !== 8) return;
    setBuscando(true);
    setCepMsg(null);
    try {
      const r = await buscarCep(cep);
      onMudar({ ...valor, cep: r.cep, logradouro: r.logradouro || valor.logradouro, bairro: r.bairro || valor.bairro, cidade: r.cidade, uf: r.uf });
      setCepMsg({ tom: "ok", texto: "Endereço preenchido pelo CEP. Falta o número." });
    } catch (e) {
      const err = e as ApiErro;
      setCepMsg({ tom: "erro", texto: err.codigo === "cep_nao_encontrado" ? "CEP não encontrado. Confira ou preencha à mão." : "Não deu para buscar o CEP agora. Preencha à mão." });
    } finally {
      setBuscando(false);
    }
  }

  const campo = (k: keyof EnderecoInput) => (erros[k] ? { "aria-invalid": true as const } : {});
  return (
    <div className="pilha" style={{ gap: 12 }}>
      <div className="linha-campos">
        <label className="fld">
          <span>CEP</span>
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={formatarCep(valor.cep ?? "")}
            onChange={(e) => {
              const v = soDigitos(e.target.value).slice(0, 8);
              mudar({ cep: v });
              if (v.length === 8) void procurarCep(v);
            }}
          />
          {buscando ? <span className="dica">Buscando…</span> : cepMsg ? <span className={cepMsg.tom === "ok" ? "msg-ok" : "msg-erro"}>{cepMsg.texto}</span> : <span className="dica">Opcional: preenche rua, bairro e cidade.</span>}
        </label>
        <label className="fld" style={{ gridColumn: "span 2" }}>
          <span>Rua</span>
          <input value={valor.logradouro} onChange={(e) => mudar({ logradouro: e.target.value })} {...campo("logradouro")} />
          {erros.logradouro ? <span className="msg-erro">{erros.logradouro}</span> : null}
        </label>
      </div>
      <div className="linha-campos">
        <label className="fld">
          <span>Número</span>
          <input inputMode="numeric" disabled={valor.sem_numero} value={valor.sem_numero ? "" : valor.numero ?? ""} onChange={(e) => mudar({ numero: e.target.value })} {...campo("numero")} />
          <label className="check">
            <input type="checkbox" checked={!!valor.sem_numero} onChange={(e) => mudar({ sem_numero: e.target.checked, numero: e.target.checked ? "" : valor.numero })} /> Sem número
          </label>
          {erros.numero ? <span className="msg-erro">{erros.numero}</span> : null}
        </label>
        <label className="fld">
          <span>Complemento</span>
          <input placeholder="Apto, bloco, fundos…" value={valor.complemento ?? ""} onChange={(e) => mudar({ complemento: e.target.value })} />
        </label>
        <label className="fld">
          <span>Bairro</span>
          <input value={valor.bairro} onChange={(e) => mudar({ bairro: e.target.value })} {...campo("bairro")} />
          {erros.bairro ? <span className="msg-erro">{erros.bairro}</span> : null}
        </label>
      </div>
      <div className="linha-campos">
        <label className="fld" style={{ gridColumn: "span 2" }}>
          <span>Cidade</span>
          <input value={valor.cidade} onChange={(e) => mudar({ cidade: e.target.value })} {...campo("cidade")} />
          {erros.cidade ? <span className="msg-erro">{erros.cidade}</span> : null}
        </label>
        <label className="fld">
          <span>UF</span>
          <input maxLength={2} value={valor.uf} onChange={(e) => mudar({ uf: e.target.value.toUpperCase() })} {...campo("uf")} />
          {erros.uf ? <span className="msg-erro">{erros.uf}</span> : null}
        </label>
      </div>
      <label className="fld">
        <span>Ponto de referência</span>
        <input placeholder="Ex.: portão azul, perto da padaria" value={valor.referencia ?? ""} onChange={(e) => mudar({ referencia: e.target.value })} />
      </label>
    </div>
  );
}
