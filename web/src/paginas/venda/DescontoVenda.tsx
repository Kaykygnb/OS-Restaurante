import { useState } from "react";
import CampoAprovacao from "../../componentes/CampoAprovacao";
import Dialogo from "../../componentes/ui/Dialogo";
import type { Aprovacao } from "../../servicos/contratos";
import { formatarReais, reaisParaCentavos } from "../../util/dinheiro";
import { descontoCentavos, type Desconto } from "./carrinho";

type Props = {
  subtotal: number;
  limiteSemPin: number;
  gestao: boolean;
  atual: Desconto;
  onAplicar: (d: Desconto, aprovacao?: Aprovacao) => void;
  onFechar: () => void;
};

/** Desconto na venda: em R$ ou %, com motivo; acima do limite pede o PIN de um gerente (regra de hoje). */
export default function DescontoVenda({ subtotal, limiteSemPin, gestao, atual, onAplicar, onFechar }: Props) {
  const [tipo, setTipo] = useState<"valor" | "percentual">(atual?.tipo ?? "valor");
  const [valor, setValor] = useState(atual ? String(atual.tipo === "valor" ? (atual.valor / 100).toFixed(2).replace(".", ",") : atual.valor) : "");
  const [motivo, setMotivo] = useState(atual?.motivo ?? "");
  const [aprovador, setAprovador] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const n = tipo === "valor" ? reaisParaCentavos(valor || "0") : Number(valor.replace(",", "."));
  const d: Desconto = Number.isFinite(n) && n > 0 ? { tipo, valor: n, motivo } : null;
  const centavos = descontoCentavos(subtotal, d);
  const precisaPin = !gestao && centavos > limiteSemPin;

  function aplicar() {
    if (!d) return setErro("Digite o valor do desconto.");
    if (tipo === "percentual" && n > 100) return setErro("Percentual vai de 0 a 100.");
    if (!motivo.trim()) return setErro("Diga o motivo (fica na auditoria).");
    if (precisaPin && (!aprovador || pin.length < 4)) return setErro("Acima do limite: escolha o gerente e digite o PIN.");
    onAplicar(d, precisaPin ? { aprovador_id: Number(aprovador), pin } : undefined);
  }

  return (
    <Dialogo
      titulo="Desconto na venda"
      sub={`Subtotal ${formatarReais(subtotal)} · sem PIN até ${formatarReais(limiteSemPin)}`}
      onFechar={onFechar}
      pe={
        <>
          {atual ? (
            <button type="button" className="btn btn-perigo" onClick={() => onAplicar(null)}>
              Tirar desconto
            </button>
          ) : (
            <button type="button" className="btn" onClick={onFechar}>
              Desistir
            </button>
          )}
          <button type="button" className="btn btn-pri" onClick={aplicar}>
            Aplicar − {formatarReais(centavos)}
          </button>
        </>
      }
    >
      <div className="segmento" role="group" aria-label="Tipo de desconto">
        <button type="button" aria-pressed={tipo === "valor"} onClick={() => setTipo("valor")}>
          Em R$
        </button>
        <button type="button" aria-pressed={tipo === "percentual"} onClick={() => setTipo("percentual")}>
          Em %
        </button>
      </div>
      <label className="fld">
        <span>{tipo === "valor" ? "Valor (R$)" : "Percentual (%)"}</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} data-foco />
      </label>
      <label className="fld">
        <span>Motivo</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente da casa" maxLength={120} />
      </label>
      {precisaPin ? <CampoAprovacao aprovadorId={aprovador} onAprovador={setAprovador} pin={pin} onPin={setPin} explicacao={`Desconto acima de ${formatarReais(limiteSemPin)} precisa de um gerente.`} /> : null}
      {erro ? (
        <p role="alert" style={{ color: "var(--err)", margin: 0 }}>
          {erro}
        </p>
      ) : null}
    </Dialogo>
  );
}
