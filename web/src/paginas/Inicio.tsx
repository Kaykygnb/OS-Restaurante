import { lerDashboard } from "../servicos/rotas";
import type { Dashboard } from "../servicos/contratos";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { itensDoPerfil } from "../auth/navegacao";
import { lerUsuario, podeOperarCaixa } from "../auth/sessao";
import { ErroCarga } from "../componentes/ui/Estados";
import Icone from "../componentes/ui/Icone";
import { useSistema } from "../estado/sistema-ctx";
import { api, type ApiErro } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";

type AtResumo = {
  id: number;
  status: string;
  tipo_atendimento: string;
  total_centavos?: number | null;
  aberto_em: string;
  fechado_em?: string | null;
  totais?: { subtotal_centavos?: number; total_centavos?: number } | null;
};

const ACOES = [
  { to: "/painel/venda", titulo: "Venda rápida", sub: "Escolhe, cobra e pronto", icone: "venda", atalho: "F2" },
  { to: "/painel/mesas", titulo: "Mesas", sub: "Abrir, lançar e fechar", icone: "mesas", atalho: "F3" },
  { to: "/painel/balcao", titulo: "Balcão", sub: "Pedido para levar", icone: "cardapio", atalho: "" },
  { to: "/painel/delivery/novo", titulo: "Novo delivery", sub: "Pelo telefone do cliente", icone: "delivery", atalho: "F4" },
  { to: "/painel/caixa", titulo: "Caixa", sub: "Sangria, fechar o dia", icone: "caixa", atalho: "F8" },
] as const;


/**
 * Pranchas 03a–03c: Início por perfil. Os números saem de GET /atendimentos enquanto não existe
 * /relatorios/resumo-dia (pendência anotada).
 */
export default function Inicio() {
  const usuario = lerUsuario();
  const { modulos, caixa } = useSistema();
  const gestao = ["ROOT", "ADMIN", "GERENTE"].includes(usuario?.tipo ?? "");
  const permitidos = new Set(itensDoPerfil(usuario?.tipo, modulos, podeOperarCaixa(usuario)).map((i) => i.to));
  const acoes = ACOES.filter((a) => permitidos.has(a.to.replace("/novo", "")));
  const [ats, setAts] = useState<AtResumo[] | null>(null);
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState<Dashboard | null>(null);

  const carregar = useCallback(() => {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    Promise.all([api("/atendimentos?status=ABERTO") as Promise<AtResumo[]>, gestao ? lerDashboard({ de: hoje, ate: hoje }) : Promise.resolve(null)])
      .then(([r, dashboard]) => {
        setResumo(dashboard);
        setAts(Array.isArray(r) ? r : []);
        setErro("");
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, [gestao]);
  useEffect(carregar, [carregar]);

  const vendido = resumo?.faturamento_centavos ?? 0;
  const mesasAbertas = (ats ?? []).filter(
    (a) => a.status === "ABERTO" && a.tipo_atendimento === "MESA" && (a.totais?.subtotal_centavos ?? a.totais?.total_centavos ?? a.total_centavos ?? 0) > 0,
  );
  const deliveries = (ats ?? []).filter((a) => a.status === "ABERTO" && a.tipo_atendimento === "ENTREGA");
  const atencao: { tom: "warn" | "err" | "info"; texto: string; to: string; botao: string }[] = [];
  if (caixa && !caixa.aberto && podeOperarCaixa(usuario)) atencao.push({ tom: "warn", texto: "O caixa está fechado: ninguém consegue receber.", to: "/painel/caixa", botao: "Abrir caixa" });

  if (gestao && modulos.estoque_nivel === 0)
    atencao.push({ tom: "info", texto: "Controle de estoque desligado. Ligue quando quiser marcar esgotados ou contar bebidas.", to: "/painel/configuracoes?aba=operacao", botao: "Configurar estoque" });

  const data = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <div className="pilha-lg">
      <p className="inicio-saudacao">
        Olá, {usuario?.nome}. Resumo de hoje, {data}.
      </p>
      {erro ? <ErroCarga mensagem={erro} onTentar={carregar} /> : null}
      {gestao ? (
        <div className="grade-4">
          <div className="cartao">
            <div className="muted pequeno">Vendido hoje</div>
            <div className="valor-g">{ats ? formatarReais(vendido) : "…"}</div>
            <div className="muted pequeno">{(resumo?.atendimentos ?? 0)} vendas</div>
          </div>
          <div className="cartao">
            <div className="muted pequeno">Mesas abertas</div>
            <div className="valor-g">{ats ? mesasAbertas.length : "…"}</div>
          </div>
          <div className="cartao">
            <div className="muted pequeno">Delivery em andamento</div>
            <div className="valor-g">{ats ? deliveries.length : "…"}</div>
          </div>
          <div className="cartao">
            <div className="muted pequeno">Ticket médio</div>
            <div className="valor-g">{ats ? formatarReais(resumo?.ticket_medio_centavos ?? 0) : "…"}</div>
          </div>
        </div>
      ) : null}

      <section className="pilha">
        <h2 className="inicio-titulo">O que você quer fazer?</h2>
        <div className="grade-acoes">
          {acoes.map((a) => (
            <Link key={a.to} to={a.to} className="cartao cartao-acao">
              <span className="entre">
                <Icone nome={a.icone} tam={24} cor="var(--act)" />
                {a.atalho ? <span className="kbd">{a.atalho}</span> : null}
              </span>
              <strong>{a.titulo}</strong>
              <span className="muted pequeno">{a.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      {atencao.length ? (
        <section className="cartao pilha">
          <h2>Precisa da sua atenção</h2>
          {atencao.map((a) => (
            <div key={a.texto} className={`faixa faixa-${a.tom}`}>
              <Icone nome={a.tom === "info" ? "info" : "alerta"} />
              <span>{a.texto}</span>
              <Link className="btn faixa-acao" to={a.to}>
                {a.botao}
              </Link>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
