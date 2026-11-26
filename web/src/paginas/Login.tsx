import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../servicos/api";

export default function Login() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const navegar = useNavigate();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const dados = await api("/login", { method: "POST", body: JSON.stringify({ login, senha }) });
      localStorage.setItem("token", dados.token);
      localStorage.setItem("usuario", JSON.stringify(dados.usuario));
      navegar("/painel");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={entrar}>
        <div>
          <h1>OS Restaurante</h1>
          <p>Entre com seu login para abrir o painel.</p>
        </div>
        <input
          placeholder="Login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
        />
        <input
          placeholder="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
        />
        {erro ? <p className="login-erro">{erro}</p> : null}
        <button disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  );
}
