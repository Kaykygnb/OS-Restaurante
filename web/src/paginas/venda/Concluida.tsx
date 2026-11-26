import { useEffect } from "react";
import Dialogo from "../../componentes/ui/Dialogo";
import Icone from "../../componentes/ui/Icone";
import type { VendaRapidaResposta } from "../../servicos/contratos";
import { formatarReais } from "../../util/dinheiro";

const IMP: Record<string, string> = { na_fila: "enviado para a impressora", nao_pedida: "não pedido" };
const GAV: Record<string, string> = { aberta: "Gaveta aberta", nao_usada: "", falhou: "A gaveta não abriu: abra com a chave. A venda está salva." };

/** Prancha 05d: venda concluída, troco em destaque e "Nova venda" com Enter. */
export default function Concluida({ r, onNova }: { r: VendaRapidaResposta; onNova: () => void }) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        onNova();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onNova]);

  return (
    <Dialogo
      titulo={`Venda #${r.atendimento.numero_dia} concluída`}
      sub={`${r.atendimento.codigo_atendimento} · total ${formatarReais(r.atendimento.total_centavos)}`}
      onFechar={onNova}
      pe={
        <button type="button" className="btn btn-pri btn-g btn-bloco" onClick={onNova} data-foco>
          Nova venda <span className="kbd">Enter</span>
        </button>
      }
    >
      <div className="faixa faixa-ok" style={{ alignItems: "center" }}>
        <Icone nome="check" tam={28} />
        <div>
          <strong>{r.troco_total_centavos ? "Troco" : "Pago"}</strong>
          <span className="pequeno">{r.troco_total_centavos ? "Devolva ao cliente" : "Nada a devolver"}</span>
        </div>
        <span className="faixa-acao valor-g" data-testid="troco-final">
          {formatarReais(r.troco_total_centavos)}
        </span>
      </div>
      <ul className="pequeno" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li>Pedido da cozinha: {IMP[r.impressao.producao] ?? r.impressao.producao}</li>
        <li>Comprovante (cupom não fiscal): {IMP[r.impressao.comprovante] ?? r.impressao.comprovante}</li>
        {GAV[r.gaveta] ? <li style={{ color: r.gaveta === "falhou" ? "var(--err)" : undefined }}>{GAV[r.gaveta]}</li> : null}
      </ul>
      <p className="muted pequeno" style={{ margin: 0 }}>
        Se a impressora falhar, a venda continua salva. O comprovante é cupom NÃO FISCAL: “NÃO É DOCUMENTO FISCAL”.
      </p>
    </Dialogo>
  );
}
