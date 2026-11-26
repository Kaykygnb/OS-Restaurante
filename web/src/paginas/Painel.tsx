import { Link } from "react-router-dom";
import { lerUsuario } from "../auth/sessao";

const ATALHOS = [
  { to: "/painel/cardapio", titulo: "Cardápio", desc: "Categorias e produtos" },
  { to: "/painel/pedidos", titulo: "Pedidos", desc: "Lançar, cozinha e histórico" },
  { to: "/painel/mesas", titulo: "Mesas", desc: "Mapa do salão" },
  { to: "/painel/caixa", titulo: "Caixa", desc: "Abrir sessão e sangria" },
  {
    to: "/painel/usuarios",
    titulo: "Usuários",
    desc: "Equipe e permissões",
    tipos: ["ROOT", "ADMIN", "GERENTE"],
  },
  {
    to: "/painel/configuracoes",
    titulo: "Configurações",
    desc: "Dados do restaurante",
    tipos: ["ROOT", "ADMIN"],
  },
] as const;

export default function Painel() {
  const usuario = lerUsuario();
  const tipo = usuario?.tipo ?? "";

  const atalhos = ATALHOS.filter((a) => !("tipos" in a) || (a.tipos as readonly string[]).includes(tipo));

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
