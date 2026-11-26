import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { itensDoPerfil } from "../auth/navegacao";
import { lerUsuario, podeOperarCaixa } from "../auth/sessao";
import { ErroCarga } from "../componentes/ui/Estados";
import Icone from "../componentes/ui/Icone";
import { useSistema } from "../estado/sistema-ctx";
import { api, type ApiErro } from "../servicos/api";
import { formatarReais } from "../util/dinheiro";

type AtResumo = { id: number; status: string; tipo_atendimento: string; total_centavos?: number | null; aberto_em: string; fechado_em?: string | null };

const ACOES = [
  { to: "/painel/venda", titulo: "Venda rápida", sub: "Escolhe, cobra e pronto", icone: "venda", atalho: "F2" },
  { to: "/painel/mesas", titulo: "Mesas", sub: "Abrir, lançar e fechar", icone: "mesas", atalho: "F3" },
  { to: "/painel/balcao", titulo: "Balcão", sub: "Pedido para levar", icone: "cardapio", atalho: "" },
  { to: "/painel/delivery/novo", titulo: "Novo delivery", sub: "Pelo telefone do cliente", icone: "delivery", atalho: "F4" },
  { to: "/painel/caixa", titulo: "Caixa", sub: "Sangria, fechar o dia", icone: "caixa", atalho: "F8" },
] as const;

const hoje = (iso?: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

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

  const carregar = useCallback(() => {
    api("/atendimentos")
      .then((r: AtResumo[]) => {
        setAts(Array.isArray(r) ? r : []);
        setErro("");
      })
      .catch((e: ApiErro) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const fechadosHoje = (ats ?? []).filter((a) => a.status === "FECHADO" && hoje(a.fechado_em ?? a.aberto_em));
  const vendido = fechadosHoje.reduce((s, a) => s + (a.total_centavos ?? 0), 0);
  const mesasAbertas = (ats ?? []).filter((a) => a.status === "ABERTO" && a.tipo_atendimento === "MESA");
  const deliveries = (ats ?? []).filter((a) => a.status === "ABERTO" && a.tipo_atendimento === "ENTREGA");
  const atencao: { tom: "warn" | "err" | "info"; texto: string; to: string; botao: string }[] = [];
  if (caixa && !caixa.aberto && podeOperarCaixa(usuario)) atencao.push({ tom: "warn", texto: "O caixa está fechado: ninguém consegue receber.", to: "/painel/caixa", botao: "Abrir caixa" });
  if (gestao) atencao.push({ tom: "info", texto: "Garçons no celular: mostre o QR deste PC para conectar pelo navegador ou pelo app Android.", to: "/painel/conectar", botao: "Conectar celulares" });
  if (gestao && modulos.estoque_nivel === 0)
    atencao.push({ tom: "info", texto: "Controle de estoque desligado. Ligue quando quiser marcar esgotados ou contar bebidas.", to: "/painel/estoque", botao: "Ver níveis" });

  const data = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

  return (
    <div className="pilha" style={{ gap: 20 }}>
      <p className="muted" style={{ margin: 0 }}>
        Olá, {usuario?.nome}. Resumo de hoje, {data}.
      </p>
      {erro ? <ErroCarga mensagem={erro} onTentar={carregar} /> : null}
      {gestao ? (
        <div className="grade-4">
          <div className="cartao">
            <div className="muted pequeno">Vendido hoje</div>
            <div className="valor-g">{ats ? formatarReais(vendido) : "…"}</div>
            <div className="muted pequeno">{fechadosHoje.length} vendas</div>
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
            <div className="valor-g">{ats ? formatarReais(fechadosHoje.length ? Math.round(vendido / fechadosHoje.length) : 0) : "…"}</div>
          </div>
        </div>
      ) : null}

      <section className="pilha">
        <h2 style={{ margin: 0, fontSize: 17 }}>O que você quer fazer?</h2>
        <div className="grade-acoes">
          {acoes.map((a) => (
            <Link key={a.to} to={a.to} className="cartao" style={{ display: "grid", gap: 6, minHeight: 96, color: "inherit" }}>
              <span className="entre">
                <Icone nome={a.icone} tam={24} cor="var(--act)" />
                {a.atalho ? <span className="kbd">{a.atalho}</span> : null}
              </span>
              <strong style={{ fontSize: 16 }}>{a.titulo}</strong>
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
