import Dialogo from "../ui/Dialogo";
import { temEdicaoPendente } from "../../hooks/useRascunho";
import { confirmar } from "../../servicos/dialogos";
import { Fragment, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { barraInferior, itensDoPerfil, tituloDaRota } from "../../auth/navegacao";
import { lerUsuario, podeOperarCaixa, sair } from "../../auth/sessao";
import { useSistema } from "../../estado/sistema-ctx";
import { inicial } from "../../util/formatos";
import { rotuloPerfil } from "../../util/rotulos";
import Icone from "../ui/Icone";

/**
 * Estrutura do redesenho (prancha 01): PC com menu lateral escrito e atalhos; tablet com trilho;
 * celular com barra inferior de 5 botões ("Mais" abre o resto). O topo mostra onde a pessoa está
 * e o estado do sistema (servidor e caixa).
 */
const ROTULO_IMP: Record<string, string> = { ok: "ok", erro: "com erro", sem_resposta: "sem resposta" };

export default function AppLayout() {
  const usuario = lerUsuario();
  const { modulos, caixa, conectado, impressoras, recarregar } = useSistema();
  const comProblema = (impressoras ?? []).filter((i) => i.status !== "ok");
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [maisAbertoEm, setMaisAbertoEm] = useState<string | null>(null);
  const itens = itensDoPerfil(usuario?.tipo, modulos, podeOperarCaixa(usuario));
  const { fixos, mais } = barraInferior(itens);
  const meta = tituloDaRota(pathname);
  const maisAberto = maisAbertoEm === pathname;

  // Atalhos globais do PC: F2 venda rápida, F3 mesas, F4 delivery, F8 caixa.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const mapa: Record<string, string> = { F2: "/painel/venda", F3: "/painel/mesas", F4: "/painel/delivery/novo", F8: "/painel/caixa" };
      const destino = mapa[e.key];
      if (!destino || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.querySelector(".dlg-fundo")) return; // com diálogo aberto, a tecla é do diálogo
      const base = destino.replace("/novo", "");
      if (!itens.some((i) => i.to === base)) return;
      e.preventDefault();
      navegar(destino);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [itens, navegar]);

  async function trocarUsuario() {
    if (temEdicaoPendente() && !await confirmar("Sair da sessão e descartar os rascunhos não salvos?", true)) return;
    sair();
    navegar("/login", { replace: true });
  }

  const ativo = (to: string) => (to === "/painel" ? pathname === "/painel" : pathname === to || pathname.startsWith(to + "/"));

  const grupo = (to: string) => ["/painel", "/painel/venda", "/painel/mesas", "/painel/balcao", "/painel/delivery", "/painel/comandas", "/painel/pedidos", "/painel/caixa"].includes(to) ? "Atendimento" : ["/painel/usuarios", "/painel/configuracoes", "/painel/conectar", "/painel/aparelho"].includes(to) ? "Configurações" : "Gestão";
  return (
    <div className="app">
      <aside className="lateral" aria-label="Menu">
        <div className="lateral-marca">
          <strong>OS Restaurante</strong>
          <small>operação do dia</small>
        </div>
        <nav>
          {itens.map((i, indice) => (
            <Fragment key={i.to}>{(indice === 0 || grupo(itens[indice-1].to) !== grupo(i.to)) ? <span className="nav-grupo">{grupo(i.to)}</span> : null}
            <NavLink key={i.to} to={i.to} end={i.to === "/painel"} className={() => `nav-link${ativo(i.to) ? " ativo" : ""}`}>
              <Icone nome={i.icone} />
              <span>{i.rotulo}</span>
              {i.atalho ? <span className="nav-atalho">{i.atalho}</span> : null}
            </NavLink></Fragment>
          ))}
        </nav>
        <div className="lateral-pe">
          <span className="avatar" aria-hidden>
            {inicial(usuario?.nome)}
          </span>
          <div className="quem">
            <strong title={usuario?.nome}>{usuario?.nome ?? "—"}</strong>
            <span className="muted pequeno">{usuario?.tipo ? rotuloPerfil(usuario.tipo) : ""}</span>
          </div>
          <button type="button" className="btn btn-ic" title="Trocar usuário (sair)" aria-label="Trocar usuário (sair)" onClick={trocarUsuario}>
            <Icone nome="sair" />
          </button>
        </div>
      </aside>

      <div className="principal">
        <header className="topo">
          <div className="topo-titulo">
            <h1>{meta.titulo}</h1>
            {meta.caminho ? <p className="caminho">{meta.caminho}</p> : null}
          </div>
          <div className="status" aria-live="polite">
            {conectado ? <span className="tag tag-ok ponto">Servidor conectado</span> : <span className="tag tag-err ponto">Sem conexão</span>}
            {caixa ? (
              caixa.aberto ? (
                <span className="tag tag-ok ponto">Caixa aberto</span>
              ) : (
                <span className="tag tag-warn ponto">Caixa fechado</span>
              )
            ) : null}
            {impressoras && impressoras.length ? (
              comProblema.length === 0 ? (
                <span className="tag tag-ok ponto so-pc" title={impressoras.map((i) => i.nome).join(", ")}>
                  Impressoras ok
                </span>
              ) : (
                <span className="tag tag-err ponto so-pc" title={comProblema.map((i) => `${i.nome}: ${i.ultimo_erro ?? i.status}`).join(" · ")}>
                  {comProblema.length === 1 ? `Impressora ${comProblema[0].nome} ${ROTULO_IMP[comProblema[0].status]}` : `${comProblema.length} impressoras com problema`}
                </span>
              )
            ) : null}
          </div>
        </header>
        {conectado && caixa?.sessao_anterior && podeOperarCaixa(usuario) && pathname !== "/painel/caixa" ? (
          <div className="faixa-global warn" role="alert">
            <Icone nome="alerta" />
            <span>
              <strong>O caixa de um dia anterior ainda está aberto.</strong> Feche esse caixa antes de abrir o de hoje.
            </span>
            <NavLink className="btn" to="/painel/caixa">
              Ir para o caixa
            </NavLink>
          </div>
        ) : null}
        {conectado && comProblema.length ? (
          <div className="faixa-global warn" role="status">
            <Icone nome="impressora" />
            <span>
              {comProblema.map((i) => (
                <span key={i.id} style={{ display: "block" }}>
                  <strong>Impressora {i.nome} {ROTULO_IMP[i.status]}</strong>
                  {i.desde ? ` desde ${new Date(i.desde).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  {i.ultimo_erro ? ` · ${i.ultimo_erro}` : ""}. Confira se está ligada, com papel e no cabo de rede.
                </span>
              ))}
            </span>
          </div>
        ) : null}
        {!conectado ? (
          <div className="faixa-global err" role="alert">
            <Icone nome="semwifi" />
            <span className="so-pc">
              <strong>Sem conexão com o PC do caixa.</strong> Nada do que você tocar agora é salvo. Confira se ele está ligado e na mesma rede.
            </span>
            <span className="so-celular">
              <strong>Servidor não encontrado.</strong> Leia o QR do caixa de novo.
            </span>
            <button type="button" className="btn" onClick={recarregar}>
              <span className="so-pc">Tentar</span>
              <span className="so-celular">Tentar de novo</span>
            </button>
          </div>
        ) : null}
        <main className="area" id="conteudo">
          <Outlet />
        </main>
      </div>

      <nav className="barra-inferior" aria-label="Navegação">
        {fixos.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/painel"} className={() => (ativo(i.to) ? "ativo" : "")}>
            <Icone nome={i.icone} tam={22} />
            <span>{i.rotulo === "Venda rápida" ? "Venda" : i.rotulo === "Cozinha e bar" ? "Cozinha" : i.rotulo}</span>
          </NavLink>
        ))}
        <button type="button" className={maisAberto || mais.some((i) => ativo(i.to)) ? "ativo" : ""} onClick={() => setMaisAbertoEm(maisAberto ? null : pathname)} aria-expanded={maisAberto}>
          <Icone nome="menu" tam={22} />
          <span>Mais</span>
        </button>
      </nav>
      {maisAberto ? <Dialogo titulo="Navegação" sub="Atendimento, gestão e configurações" onFechar={() => setMaisAbertoEm(null)}>
        <nav className="menu-celular" aria-label="Todas as telas">
          {mais.map((i, indice) => <Fragment key={i.to}>
            {(indice === 0 || grupo(mais[indice - 1].to) !== grupo(i.to)) ? <h3>{grupo(i.to)}</h3> : null}
            <NavLink to={i.to} className={() => `nav-link${ativo(i.to) ? " ativo" : ""}`} onClick={() => setMaisAbertoEm(null)}><Icone nome={i.icone}/><span>{i.rotulo}</span></NavLink>
          </Fragment>)}
          <button type="button" className="nav-link" onClick={trocarUsuario}><Icone nome="sair"/><span>Trocar usuário ({usuario?.nome})</span></button>
        </nav>
      </Dialogo> : null}
    </div>
  );
}
