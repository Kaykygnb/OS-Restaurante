import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { lerUsuario, sair } from "../../auth/sessao";

const ITENS = [
  { to: "/painel", rotulo: "Início", ico: "IN", sempre: true },
  { to: "/painel/cardapio", rotulo: "Cardápio", ico: "CA", sempre: true },
  { to: "/painel/pedidos", rotulo: "Pedidos", ico: "PE", sempre: true },
  { to: "/painel/mesas", rotulo: "Mesas", ico: "ME", sempre: true },
  { to: "/painel/caixa", rotulo: "Caixa", ico: "CX", sempre: true },
  { to: "/painel/usuarios", rotulo: "Usuários", ico: "US", gestao: true },
  { to: "/painel/configuracoes", rotulo: "Configurações", ico: "CF", config: true },
] as const;

const TIPOS_GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);
const TIPOS_CONFIG = new Set(["ROOT", "ADMIN"]);

const TITULOS: Record<string, { titulo: string; sub: string }> = {
  "/painel": { titulo: "Início", sub: "Resumo do dia e atalhos rápidos" },
  "/painel/cardapio": { titulo: "Cardápio", sub: "Categorias, produtos e adicionais" },
  "/painel/pedidos": { titulo: "Pedidos", sub: "Lançar, cozinha e histórico" },
  "/painel/mesas": { titulo: "Mesas", sub: "Mapa do salão e transferência" },
  "/painel/caixa": { titulo: "Caixa", sub: "Sessão, sangria e fechamento" },
  "/painel/usuarios": { titulo: "Usuários", sub: "Equipe e permissões" },
  "/painel/configuracoes": { titulo: "Configurações", sub: "Estabelecimento e impressoras" },
};

export default function Shell() {
  const [colapsado, setColapsado] = useState(() => localStorage.getItem("menu_colapsado") === "1");
  const [menuAberto, setMenuAberto] = useState(false);
  const usuario = lerUsuario();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const meta = TITULOS[pathname] ?? { titulo: "Painel", sub: "" };

  useEffect(() => {
    localStorage.setItem("menu_colapsado", colapsado ? "1" : "0");
  }, [colapsado]);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  function deslogar() {
    sair();
    navegar("/login", { replace: true });
  }

  const classes = ["shell"];
  if (colapsado) classes.push("collapsed");
  if (menuAberto) classes.push("menu-aberto");

  return (
    <div className={classes.join(" ")}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">OS</div>
          <div className="brand-text">
            <strong>OS Restaurante</strong>
            <small>operação do dia</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {ITENS.filter((item) => {
            if ("gestao" in item && item.gestao) return TIPOS_GESTAO.has(usuario?.tipo ?? "");
            if ("config" in item && item.config) return TIPOS_CONFIG.has(usuario?.tipo ?? "");
            return true;
          }).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/painel"}
              className={({ isActive }) => `nav-item${isActive ? " ativo" : ""}`}
              title={item.rotulo}
            >
              <span className="nav-ico" aria-hidden>
                {item.ico}
              </span>
              <span className="nav-label">{item.rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user" title={usuario?.nome}>
            <span className="user-dot" aria-hidden />
            <span>
              {usuario?.nome ?? "—"}
              {usuario?.tipo ? ` · ${usuario.tipo}` : ""}
            </span>
          </div>

          <button
            type="button"
            className="btn-icone btn-desktop"
            onClick={() => setColapsado((v) => !v)}
            title={colapsado ? "Expandir menu" : "Recolher menu"}
          >
            <span className="nav-ico" aria-hidden>
              {colapsado ? ">>" : "<<"}
            </span>
            <span className="nav-label">{colapsado ? "Expandir" : "Recolher"}</span>
          </button>

          <button type="button" className="btn-sair" onClick={deslogar} title="Sair">
            <span className="nav-ico" aria-hidden>
              SA
            </span>
            <span className="sair-label">Sair</span>
          </button>
        </div>
      </aside>

      {menuAberto ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
        />
      ) : null}

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-esquerda">
            <button
              type="button"
              className="btn-menu-mobile"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Abrir menu"
            >
              Menu
            </button>
            <div>
              <h1>{meta.titulo}</h1>
              {meta.sub ? <p>{meta.sub}</p> : null}
            </div>
          </div>
          {usuario?.tipo ? <span className="badge-tipo">{usuario.tipo}</span> : null}
        </header>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
