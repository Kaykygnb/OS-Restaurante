import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { telaInicial } from "../auth/sessao";
import { api } from "../servicos/api";

export default function Login() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const navegar = useNavigate();
  const local = useLocation();
  const expirou = new URLSearchParams(local.search).get("expirou") === "1";

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const dados = await api("/login", { method: "POST", body: JSON.stringify({ login: login.trim(), senha }) });
      localStorage.setItem("token", dados.token);
      localStorage.setItem("usuario", JSON.stringify(dados.usuario));
      navegar(telaInicial(dados.usuario?.tipo), { replace: true });
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
        {expirou ? (
          <p className="login-aviso" role="status">
            Sua sessão terminou. Entre de novo.
          </p>
        ) : null}
        <label className="login-campo">
          <span>Login</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <div className="login-campo">
          <label htmlFor="login-senha">Senha</label>
          <span className="login-senha">
            <input
              id="login-senha"
              type={verSenha ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="login-ver"
              aria-pressed={verSenha}
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
              onClick={() => setVerSenha((v) => !v)}
            >
              {verSenha ? "Esconder" : "Mostrar"}
            </button>
          </span>
        </div>
        {erro ? (
          <p className="login-erro" role="alert">
            {erro}
          </p>
        ) : null}
        <button disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  );
}
