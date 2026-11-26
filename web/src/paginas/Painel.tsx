import { Link } from "react-router-dom";
import { lerUsuario, PERFIS_GESTAO, PERFIS_OPERACAO } from "../auth/sessao";

const ATALHOS: { to: string; titulo: string; desc: string; perfis?: string[] }[] = [
  { to: "/painel/mesas", titulo: "Mesas", desc: "Mapa do salão, lançar e receber", perfis: PERFIS_OPERACAO },
  { to: "/painel/pedidos", titulo: "Pedidos", desc: "Balcão, entrega, cozinha e histórico", perfis: [...PERFIS_OPERACAO, "COZINHEIRO"] },
  { to: "/painel/caixa", titulo: "Caixa", desc: "Abrir, sangria e fechamento", perfis: PERFIS_OPERACAO },
  { to: "/painel/cardapio", titulo: "Cardápio", desc: "Categorias e produtos" },
  { to: "/painel/usuarios", titulo: "Usuários", desc: "Equipe, perfis e PIN", perfis: PERFIS_GESTAO },
  { to: "/painel/configuracoes", titulo: "Configurações", desc: "Restaurante e impressoras", perfis: ["ROOT", "ADMIN"] },
];

export default function Painel() {
  const usuario = lerUsuario();
  const tipo = usuario?.tipo ?? "";
  const atalhos = ATALHOS.filter((a) => !a.perfis || a.perfis.includes(tipo));

  return (
    <section>
      <p style={{ marginTop: 0, color: "var(--muted)" }}>
        Olá, <strong style={{ color: "var(--text)" }}>{usuario?.nome ?? "usuário"}</strong>. Escolha por onde
        começar.
      </p>

      <div className="grade-atalhos">
        {atalhos.map((a) => (
          <Link key={a.to} to={a.to} className="atalho">
            <strong>{a.titulo}</strong>
            <span>{a.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
