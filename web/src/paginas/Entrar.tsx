import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { telaInicial } from "../auth/sessao";
import Icone from "../componentes/ui/Icone";
import type { ApiErro } from "../servicos/api";
import { entrar, saude } from "../servicos/rotas";

/**
 * Pranchas 02a/02b (decisão do Kayky, 26/11): usuário e senha digitados, sem lista de pessoas e sem dica.
 * Erro sempre genérico; com muitas tentativas, contagem regressiva e botão desligado.
 */
export default function Entrar() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [bloqueadoAte, setBloqueadoAte] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [enviando, setEnviando] = useState(false);
  const [servidor, setServidor] = useState<"?" | "ok" | "off">("?");
  const navegar = useNavigate();
  const expirou = new URLSearchParams(useLocation().search).get("expirou") === "1";
  const restam = Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000));

  useEffect(() => {
    let vivo = true;
    saude()
      .then(() => vivo && setServidor("ok"))
      .catch((e: ApiErro) => vivo && setServidor(e.semConexao ? "off" : "ok"));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!bloqueadoAte) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= bloqueadoAte) {
        setBloqueadoAte(0);
        setErro("");
      }
    }, 500);
    return () => clearInterval(t);
  }, [bloqueadoAte]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (restam > 0 || enviando) return;
    setErro("");
    if (!usuario.trim() || !senha) {
      setErro("Preencha usuário e senha.");
      return;
    }
    setEnviando(true);
    try {
      const r = await entrar({ usuario: usuario.trim(), senha });
      localStorage.setItem("token", r.token);
      localStorage.setItem("usuario", JSON.stringify(r.usuario));
      navegar(telaInicial(r.usuario.tipo), { replace: true });
    } catch (err) {
      const x = err as ApiErro;
      if (x.codigo === "muitas_tentativas") {
        const s = Number((x.dados as { tentar_em_s?: number })?.tentar_em_s ?? 60);
        const n = Date.now();
        setAgora(n);
        setBloqueadoAte(n + s * 1000);
        setErro("Muitas tentativas.");
      } else if (x.semConexao) {
        setServidor("off");
        setErro("Sem conexão com o PC do caixa. Confira se ele está ligado e na mesma rede.");
      } else {
        setErro("Usuário ou senha inválidos.");
      }
      setSenha("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrar">
      <form onSubmit={enviar} noValidate aria-describedby={erro ? "entrar-erro" : undefined}>
        <div>
          <h1>Entrar</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            OS Restaurante
          </p>
        </div>
        {expirou && !erro ? (
          <div className="faixa faixa-info" role="status">
            <Icone nome="info" />
            <span>Sua sessão terminou. Entre de novo.</span>
          </div>
        ) : null}
        {erro ? (
          <div id="entrar-erro" className="faixa faixa-err" role="alert">
            <Icone nome="alerta" />
            <span>
              {erro}
              {restam > 0 ? ` Tente de novo em ${restam} s.` : ""}
            </span>
          </div>
        ) : null}
        <label className="fld">
          <span>Usuário</span>
          <input
            name="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <div className="fld">
          <label htmlFor="entrar-senha">Senha</label>
          <div className="com-acao">
            <input
              id="entrar-senha"
              name="senha"
              type={ver ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              aria-invalid={!!erro && !restam}
            />
            <button type="button" className="btn btn-link" aria-pressed={ver} onClick={() => setVer((v) => !v)}>
              {ver ? "Esconder" : "Mostrar"}
            </button>
          </div>
        </div>
        <button className="btn btn-pri btn-g btn-bloco" disabled={enviando || restam > 0}>
          {restam > 0 ? `Aguarde ${restam} s` : enviando ? "Entrando…" : "Entrar"}
          {!restam && !enviando ? <span className="kbd">Enter</span> : null}
        </button>
        <p className="muted pequeno" style={{ margin: 0, textAlign: "center" }}>
          Esqueceu a senha? Peça ao gerente.
        </p>
      </form>
      <p className="servidor" style={{ color: servidor === "off" ? "var(--err)" : servidor === "ok" ? "var(--ok)" : "var(--ink3)" }}>
        {servidor === "off" ? "Servidor: sem conexão com o PC do caixa" : servidor === "ok" ? "Servidor: PC do caixa · conectado" : "Procurando o servidor…"}
      </p>
    </div>
  );
}
