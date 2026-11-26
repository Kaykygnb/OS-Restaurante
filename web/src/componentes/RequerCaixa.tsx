import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { podeOperarCaixa } from "../auth/sessao";
import { Vazio } from "./ui/Estados";

/** Telas de dinheiro (venda rápida, receber conta, caixa): só quem tem "Pode operar caixa". */
export default function RequerCaixa({ children }: { children: ReactNode }) {
  if (podeOperarCaixa()) return <>{children}</>;
  return (
    <div className="cartao">
      <Vazio icone="caixa" titulo="Só quem opera o caixa usa esta tela" acao={<Link className="btn btn-pri" to="/painel/mesas">Ir para as mesas</Link>}>
        Você lança pedidos em Mesas, Balcão e Delivery. Para receber, chame quem está no caixa. O gerente libera a permissão em Usuários › “Pode operar caixa”.
      </Vazio>
    </div>
  );
}
