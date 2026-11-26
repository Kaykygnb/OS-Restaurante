import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { lerUsuario, PERFIS_GESTAO, PERFIS_OPERACAO, sair } from "../../auth/sessao";
import { rotuloPerfil } from "../../util/rotulos";

/** Quem vê cada item do menu (igual às permissões do servidor, para ninguém cair em "Sem permissão"). */
const ITENS: { to: string; rotulo: string; ico: string; perfis?: string[] }[] = [
  { to: "/painel", rotulo: "Início", ico: "IN" },
  { to: "/painel/mesas", rotulo: "Mesas", ico: "ME", perfis: PERFIS_OPERACAO },
  { to: "/painel/pedidos", rotulo: "Pedidos", ico: "PE", perfis: [...PERFIS_OPERACAO, "COZINHEIRO"] },
  { to: "/painel/caixa", rotulo: "Caixa", ico: "CX", perfis: PERFIS_OPERACAO },
  { to: "/painel/cardapio", rotulo: "Cardápio", ico: "CA" },
  { to: "/painel/usuarios", rotulo: "Usuários", ico: "US", perfis: PERFIS_GESTAO },
  { to: "/painel/configuracoes", rotulo: "Configurações", ico: "CF", perfis: ["ROOT", "ADMIN"] },
];

const TITULOS: Record<string, { titulo: string; sub: string }> = {
  "/painel": { titulo: "Início", sub: "Resumo do dia e atalhos rápidos" },
  "/painel/cardapio": { titulo: "Cardápio", sub: "Categorias, produtos e adicionais" },
  "/painel/pedidos": { titulo: "Pedidos", sub: "Lançar, cozinha e histórico" },
  "/painel/mesas": { titulo: "Mesas", sub: "Mapa do salão e transferência" },
  "/painel/caixa": { titulo: "Caixa", sub: "Sessão, sangria e fechamento" },
  "/painel/usuarios": { titulo: "Usuários", sub: "Equipe e permissões" },
  "/painel/configuracoes": { titulo: "Configurações", sub: "Estabelecimento e impressoras" },
  "/painel/pdv": { titulo: "Lançar itens", sub: "Monte o pedido e envie" },
  "/painel/conta": { titulo: "Conta", sub: "Receber e fechar" },
};

function metaDaRota(pathname: string) {
  if (TITULOS[pathname]) return TITULOS[pathname];
  const base = Object.keys(TITULOS)
    .filter((k) => k !== "/painel" && pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return base ? TITULOS[base] : { titulo: "Painel", sub: "" };
}

export default function Shell() {
  const [colapsado, setColapsado] = useState(() => localStorage.getItem("menu_colapsado") === "1");
  // O menu do celular fecha sozinho ao trocar de tela: ele fica "aberto" só na rota em que foi aberto.
  const [menuAbertoEm, setMenuAbertoEm] = useState<string | null>(null);
  const usuario = lerUsuario();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const meta = metaDaRota(pathname);

  useEffect(() => {
    localStorage.setItem("menu_colapsado", colapsado ? "1" : "0");
  }, [colapsado]);


  function deslogar() {
    sair();
    navegar("/login", { replace: true });
  }

  const classes = ["shell"];
  if (colapsado) classes.push("collapsed");
  const menuAberto = menuAbertoEm === pathname;
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
          {ITENS.filter((item) => !item.perfis || item.perfis.includes(usuario?.tipo ?? "")).map((item) => (
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
              {usuario?.tipo ? ` · ${rotuloPerfil(usuario.tipo)}` : ""}
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

          <button type="button" className="btn-sair" onClick={deslogar} title="Sair" aria-label="Sair">
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
          onClick={() => setMenuAbertoEm(null)}
        />
      ) : null}

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-esquerda">
            <button
              type="button"
              className="btn-menu-mobile"
              onClick={() => setMenuAbertoEm(menuAberto ? null : pathname)}
              aria-label="Abrir menu"
            >
              Menu
            </button>
            <div>
              <h1>{meta.titulo}</h1>
              {meta.sub ? <p>{meta.sub}</p> : null}
            </div>
          </div>
          {usuario?.tipo ? <span className="badge-tipo">{rotuloPerfil(usuario.tipo)}</span> : null}
        </header>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
