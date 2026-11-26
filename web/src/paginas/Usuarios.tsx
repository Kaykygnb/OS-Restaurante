import { lerRascunhoSeguro, podeTrocarEdicao, useEdicaoPendente, useProtecaoSensivel } from "../hooks/useRascunho";
import Formulario from "../componentes/Formulario";
import { confirmar } from "../servicos/dialogos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import { lerUsuario } from "../auth/sessao";
import { api } from "../servicos/api";

type TipoUsuario =
  | "ROOT"
  | "ADMIN"
  | "GERENTE"
  | "ATENDENTE"
  | "COZINHEIRO"
  | "ENTREGADOR";

type Usuario = {
  id: number;
  nome: string;
  login: string;
  tipo_usuario: TipoUsuario;
  email: string | null;
  telefone: string | null;
  matricula: string | null;
  ativo: boolean;
  pode_operar_caixa?: boolean;
};

type FiltroAtivos = "1" | "0";

const TIPOS_GESTAO = new Set(["ROOT", "ADMIN", "GERENTE"]);

const ROTULO_TIPO: Record<TipoUsuario, string> = {
  ROOT: "Suporte",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  ATENDENTE: "Atendente",
  COZINHEIRO: "Cozinheiro",
  ENTREGADOR: "Entregador",
};

function podeVerUsuarios(tipo?: string) {
  return Boolean(tipo && TIPOS_GESTAO.has(tipo));
}

const APROVAM = new Set<string>(["ROOT", "ADMIN", "GERENTE"]);

/** PIN de aprovação (desconto, sangria, gaveta). Sem ele, nenhuma aprovação por PIN funciona. */
function BlocoPin({
  usuarioId,
  nome,
  proprio,
  onOk,
  onErro,
}: {
  usuarioId: number;
  nome: string;
  proprio: boolean;
  onOk: (m: string) => void;
  onErro: (m: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  useProtecaoSensivel(`usuario:${usuarioId}:segredo`, !!(pin || confirmar));
  const valido = /^\d{4,8}$/.test(pin) && pin === confirmar;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return onErro("O PIN precisa ter de 4 a 8 números");
    if (pin !== confirmar) return onErro("O PIN e a confirmação não são iguais");
    setSalvando(true);
    try {
      await api(`/usuarios/${usuarioId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pin, confirmar_pin: confirmar }),
      });
      onOk(proprio ? "Seu PIN de aprovação foi definido" : `PIN de aprovação de ${nome} definido`);
      setPin("");
      setConfirmar("");
    } catch (err) {
      onErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const soNumeros = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  return (
    <Formulario className="bloco-escolhas" onSubmit={salvar} autoComplete="off">
      <p className="bloco-variante-titulo titulo-com-ajuda">
        PIN de aprovação
        <Ajuda texto="O gerente digita este PIN no aparelho do garçom para aprovar desconto, sangria e abrir a gaveta. Não é a senha de login." />
      </p>
      <p className="ajuda" style={{ marginTop: 0 }}>
        Nº do gerente para aprovar: <strong>{usuarioId}</strong>
      </p>
      <label className="campo">
        <span>Novo PIN (4 a 8 números)</span>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(soNumeros(e.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
        />
      </label>
      <label className="campo">
        <span>Repita o PIN</span>
        <input
          type="password"
          value={confirmar}
          onChange={(e) => setConfirmar(soNumeros(e.target.value))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
        />
      </label>
      <button type="submit" className="btn-sec" disabled={salvando || !valido}>
        {salvando ? "Salvando…" : "Definir PIN"}
      </button>
    </Formulario>
  );
}

export default function Usuarios() {
  const sessao = lerUsuario();
  if (!podeVerUsuarios(sessao?.tipo)) {
    return <Navigate to="/painel" replace />;
  }

  return <UsuariosPainel meuId={sessao!.id} />;
}

function UsuariosPainel({ meuId }: { meuId: number }) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [tiposCriaveis, setTiposCriaveis] = useState<TipoUsuario[]>([]);
  const [filtro, setFiltro] = useState<FiltroAtivos>("1");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const [modo, setModo] = useState<"criar" | "editar" | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [login, setLogin] = useState("");
  const [tipo, setTipo] = useState<TipoUsuario | "">("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [matricula, setMatricula] = useState("");
  const [operaCaixa, setOperaCaixa] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  const marcarSalvo = useEdicaoPendente(`usuario:${editId ?? "novo"}`, { nome, login, tipo, email, telefone, matricula, operaCaixa }, modo !== null && !carregando);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState("");

  const limparProtecao = useProtecaoSensivel("usuario:segredos", !!(senha || confirmarSenha || novaSenha || confirmarNovaSenha));
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [users, opcoes] = await Promise.all([
        api(`/usuarios?ativos=${filtro}`) as Promise<Usuario[]>,
        api("/usuarios/opcoes") as Promise<{ tipos_criaveis: TipoUsuario[] }>,
      ]);
      setLista(users);
      setTiposCriaveis(opcoes.tipos_criaveis);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de dados da tela (fetch)
    void carregar();
  }, [carregar]);

  const editando = useMemo(
    () => (editId ? lista.find((u) => u.id === editId) ?? null : null),
    [lista, editId]
  );

  async function limparForm() {
    if (!await podeTrocarEdicao()) return;
    setModo(null);
    setEditId(null);
    setNome("");
    setLogin("");
    setTipo(tiposCriaveis.includes("ATENDENTE") ? "ATENDENTE" : "");
    setEmail("");
    setTelefone("");
    setMatricula("");
    setSenha("");
    setConfirmarSenha("");
    setNovaSenha("");
    setConfirmarNovaSenha("");
  }

  async function abrirCriar() {
    if (!await podeTrocarEdicao()) return;
    const r = lerRascunhoSeguro<{ nome: string; login: string; tipo: TipoUsuario; email: string; telefone: string; matricula: string; operaCaixa?: boolean }>("usuario:novo");
    if (r) { setModo("criar"); setEditId(null); setNome(r.nome); setLogin(r.login); setTipo(tiposCriaveis.includes(r.tipo) ? r.tipo : tiposCriaveis.includes("ATENDENTE") ? "ATENDENTE" : ""); setOperaCaixa(r.operaCaixa ?? false); setEmail(r.email); setTelefone(r.telefone); setMatricula(r.matricula); setSenha(""); setConfirmarSenha(""); return; }
    setModo("criar");
    setOperaCaixa(false);
    setEditId(null);
    setNome("");
    setLogin("");
    setTipo(tiposCriaveis.includes("ATENDENTE") ? "ATENDENTE" : "");
    setEmail("");
    setTelefone("");
    setMatricula("");
    setSenha("");
    setConfirmarSenha("");
    setNovaSenha("");
    setConfirmarNovaSenha("");
    setOk("");
    setErro("");
  }

  async function abrirEditar(u: Usuario) {
    if (!await podeTrocarEdicao()) return;
    setModo("editar");
    setEditId(u.id);
    const r = lerRascunhoSeguro<{ nome: string; email: string; telefone: string; matricula: string; tipo: TipoUsuario }>(`usuario:${u.id}`);
    setNome(r?.nome ?? u.nome);
    setLogin(u.login);
    setTipo(r?.tipo ?? u.tipo_usuario);
    setEmail(r?.email ?? u.email ?? "");
    setTelefone(r?.telefone ?? u.telefone ?? "");
    setMatricula(r?.matricula ?? u.matricula ?? "");
    setSenha("");
    setConfirmarSenha("");
    setNovaSenha("");
    setConfirmarNovaSenha("");
    setOk("");
    setErro("");
  }

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) return setErro("Informe o nome");
    if (!tipo) return setErro("Escolha o tipo");

    if (modo === "criar") {
      if (!login.trim()) return setErro("Informe o login");
      if (senha.length < 8) return setErro("Senha deve ter pelo menos 8 caracteres");
      if (senha !== confirmarSenha) return setErro("Senha e confirmação não conferem");
    }

    setSalvando(true);
    setErro("");
    try {
      if (modo === "criar") {
        await api("/usuarios", {
          method: "POST",
          body: JSON.stringify({
            nome: nome.trim(),
            login: login.trim(),
            senha,
            confirmar_senha: confirmarSenha,
            pode_operar_caixa: operaCaixa,
            tipo_usuario: tipo,
            email: email.trim() || undefined,
            telefone: telefone.trim() || undefined,
            matricula: matricula.trim() || undefined,
          }),
        });
        marcarSalvo(); limparProtecao();
        setOk("Usuário criado");
        limparForm();
      } else if (modo === "editar" && editId) {
        await api(`/usuarios/${editId}`, {
          method: "PUT",
          body: JSON.stringify({
            nome: nome.trim(),
            tipo_usuario: tipo,
            email: email.trim() || null,
            telefone: telefone.trim() || null,
            matricula: matricula.trim() || null,
          }),
        });
        marcarSalvo();
        setOk("Dados atualizados");
      }
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function redefinirSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    if (novaSenha.length < 8) return setErro("Senha deve ter pelo menos 8 caracteres");
    if (novaSenha !== confirmarNovaSenha) return setErro("Senha e confirmação não conferem");

    setSalvando(true);
    setErro("");
    try {
      const res = (await api(`/usuarios/${editId}/senha`, {
        method: "PUT",
        body: JSON.stringify({ senha: novaSenha, confirmar_senha: confirmarNovaSenha }),
      })) as { mensagem?: string };
      setNovaSenha("");
      setConfirmarNovaSenha("");
      setOk(res.mensagem ?? "Nova senha definida — peça ao usuário para entrar com ela.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function desativar(u: Usuario) {
    if (u.id === meuId) return setErro("Você não pode desativar a si mesmo");
    if (!(await confirmar(`Desativar ${u.nome}? O login deixa de funcionar.`))) return;
    setErro("");
    try {
      await api(`/usuarios/${u.id}`, { method: "DELETE" });
      setOk("Usuário desativado");
      if (editId === u.id) limparForm();
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function reativar(u: Usuario) {
    setErro("");
    try {
      await api(`/usuarios/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: true }),
      });
      setOk("Usuário reativado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function trocarCaixa(u: Usuario, valor: boolean) {
    setErro("");
    try {
      await api(`/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ pode_operar_caixa: valor }) });
      setOk(valor ? `${u.nome} agora pode operar o caixa` : `${u.nome} não opera mais o caixa`);
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const painelAberto = modo !== null;

  return (
    <div className="cardapio usuarios-pagina">
      <section className="cardapio-hero" aria-labelledby="usuarios-titulo">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">EQUIPE</span>
          <h2 id="usuarios-titulo" className="titulo-com-ajuda">
            Usuários do sistema
            <Ajuda texto="Só ROOT, ADMIN e GERENTE gerenciam a equipe. Cada um só cria/edita tipos abaixo na hierarquia." />
          </h2>
          <p>
            Cadastre a equipe, ajuste dados e redefina senha quando alguém esquecer.
          </p>
        </div>
        <button type="button" className="btn-sec" onClick={async () => void carregar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </section>

      {erro ? <p className="feedback-card feedback-erro" role="alert">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok" role="status">{ok}</p> : null}

      <div className={`cardapio-grid-3${painelAberto ? " com-painel" : ""}`}>
        <section className="painel-bloco painel-lista" style={{ gridColumn: painelAberto ? undefined : "1 / -1" }}>
          <header className="painel-bloco-cab">
            <div>
              <h2>Equipe</h2>
              <p className="ajuda" style={{ margin: 0 }}>
                {filtro === "1" ? "Ativos" : "Inativos"} · {lista.length}
              </p>
            </div>
            <button type="button" className="btn-prim" onClick={abrirCriar} disabled={!tiposCriaveis.length}>
              Novo usuário
            </button>
          </header>

          <div className="abas" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`aba${filtro === "1" ? " on" : ""}`}
              onClick={async () => setFiltro("1")}
            >
              Ativos
            </button>
            <button
              type="button"
              className={`aba${filtro === "0" ? " on" : ""}`}
              onClick={async () => setFiltro("0")}
            >
              Inativos
            </button>
          </div>

          <ul className="lista-prod">
            {lista.length === 0 && !carregando ? (
              <li className="lista-vazia">
                <strong>{filtro === "1" ? "Nenhum usuário ativo" : "Nenhum inativo"}</strong>
                <span>
                  {filtro === "1"
                    ? "Crie o primeiro membro da equipe."
                    : "Usuários desativados aparecem aqui para reativar."}
                </span>
              </li>
            ) : null}
            {lista.map((u) => (
              <li key={u.id} className={`prod-item${editId === u.id ? " editando" : ""}`}>
                <button type="button" className="prod-info prod-info-btn" onClick={async () => abrirEditar(u)}>
                  <strong>{u.nome}</strong>
                  <span className="prod-meta">
                    @{u.login}
                    {APROVAM.has(u.tipo_usuario) ? ` · nº ${u.id}` : ""}
                    {u.email ? ` · ${u.email}` : ""}
                    {u.telefone ? ` · ${u.telefone}` : ""}
                  </span>
                  <span className="prod-badges">
                    <span className={`prod-badge tipo-${u.tipo_usuario.toLowerCase()}`}>
                      {ROTULO_TIPO[u.tipo_usuario]}
                    </span>
                    {u.pode_operar_caixa ? <span className="prod-badge">Opera o caixa</span> : null}
                    {!u.ativo ? <span className="prod-badge neutro">Inativo</span> : null}
                    {u.id === meuId ? <span className="prod-badge neutro">Você</span> : null}
                  </span>
                </button>
                <div className="prod-acoes">
                  {u.ativo && u.tipo_usuario !== "ROOT" && u.tipo_usuario !== "COZINHEIRO" && u.tipo_usuario !== "ENTREGADOR" ? (
                    <label className="check" title="Abrir e fechar o caixa, venda rápida e receber pagamentos">
                      <input type="checkbox" checked={!!u.pode_operar_caixa} onChange={(e) => void trocarCaixa(u, e.target.checked)} /> Pode operar caixa
                    </label>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={async () => abrirEditar(u)}>
                    Editar
                  </button>
                  {u.ativo ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={u.id === meuId || u.tipo_usuario === "ROOT"}
                      onClick={async () => void desativar(u)}
                    >
                      Desativar
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={async () => void reativar(u)}>
                      Reativar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {painelAberto ? (
          <aside className="painel-bloco painel-drawer">
            <Formulario className="form-drawer" onSubmit={salvarDados}>
              {erro ? <p className="feedback-card feedback-erro" role="alert">{erro}</p> : null}
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">
                    {modo === "criar" ? "NOVO USUÁRIO" : "EDITAR USUÁRIO"}
                  </span>
                  <strong>{modo === "criar" ? "Cadastrar" : editando?.nome ?? "Editar"}</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={limparForm} aria-label="Fechar">
                  ×
                </button>
              </div>

              <div className="drawer-bloco">
                <h3>Identificação e acesso</h3>
                <label className="campo">
                  <span>Nome *</span>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome completo" />
                </label>
                <label className="campo">
                  <span className="campo-com-ajuda">
                    Login *
                    <Ajuda texto="Usado para entrar no sistema. Não muda depois de criar." />
                  </span>
                  <input
                    aria-label="Login"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    required={modo === "criar"}
                    disabled={modo === "editar"}
                    placeholder="ex: joao"
                    autoComplete="off"
                  />
                </label>
                <label className="campo">
                  <span className="campo-com-ajuda">
                    Perfil de acesso *
                    <Ajuda texto="Define o que a pessoa pode fazer. Você só vê tipos que sua hierarquia permite criar." />
                  </span>
                  <select aria-label="Perfil de acesso"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoUsuario)}
                    required
                  >
                    <option value="">Escolha o perfil…</option>
                    {tiposCriaveis.map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_TIPO[t]}
                      </option>
                    ))}
                    {modo === "editar" && tipo && !tiposCriaveis.includes(tipo) ? (
                      <option value={tipo}>{ROTULO_TIPO[tipo]}</option>
                    ) : null}
                  </select>
                </label>
                <p className="feedback-card">{tipo === "ADMIN" ? "Administrador: gerencia cadastros, configurações e equipe abaixo de sua hierarquia." : tipo === "GERENTE" ? "Gerente: acompanha vendas, equipe e operação; aprova ações por PIN." : tipo === "ATENDENTE" ? "Atendente: abre contas e lança pedidos. A permissão de caixa é concedida separadamente." : tipo === "COZINHEIRO" ? "Cozinheiro: acompanha e atualiza o preparo dos pedidos." : tipo === "ENTREGADOR" ? "Entregador: acompanha a operação de entregas." : "Suporte: administração técnica do sistema."}</p>
                <details><summary>Contatos e matrícula (opcional)</summary>
                <label className="campo">
                  <span>E-mail (opcional)</span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </label>
                <label className="campo">
                  <span>Telefone (opcional)</span>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </label>
                <label className="campo">
                  <span>Matrícula (opcional)</span>
                  <input value={matricula} onChange={(e) => setMatricula(e.target.value)} />
                </label></details>
              </div>

              {modo === "criar" && ["ROOT", "ADMIN"].includes(lerUsuario()?.tipo ?? "") ? <label className="check"><input type="checkbox" checked={operaCaixa} onChange={e => setOperaCaixa(e.target.checked)} /> Pode operar caixa (abrir, receber e fechar)</label> : null}
              {modo === "criar" ? (
                <div className="drawer-bloco">
                  <p className="bloco-variante-titulo titulo-com-ajuda">
                    Senha inicial — mínimo 8 caracteres
                    <Ajuda texto="Mínimo 8 caracteres. Passe essa senha para a pessoa no primeiro acesso." />
                  </p>
                  <label className="campo">
                    <span>Senha</span>
                    <input
                      type="password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="campo">
                    <span>Confirmar senha</span>
                    <input
                      type="password"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              ) : null}

              <div className="form-acoes">
                <button type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : modo === "criar" ? "Criar usuário" : "Salvar dados"}
                </button>
              </div>
            </Formulario>

            {modo === "editar" && editando && APROVAM.has(editando.tipo_usuario) && editando.ativo ? (
              <BlocoPin
                usuarioId={editando.id}
                nome={editando.nome}
                proprio={editando.id === meuId}
                onOk={setOk}
                onErro={setErro}
              />
            ) : null}

            {modo === "editar" && editId && editId !== meuId ? (
              <Formulario className="bloco-escolhas" onSubmit={redefinirSenha}>
                <p className="bloco-variante-titulo titulo-com-ajuda">
                  Redefinir senha
                  <Ajuda texto="Você define a senha nova. O funcionário não precisa da senha antiga. Avise a pessoa depois." />
                </p>
                <label className="campo">
                  <span>Nova senha</span>
                  <input
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                  />
                </label>
                <label className="campo">
                  <span>Confirmar nova senha</span>
                  <input
                    type="password"
                    value={confirmarNovaSenha}
                    onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" className="btn-sec" disabled={salvando || novaSenha.length < 8}>
                  Definir nova senha
                </button>
              </Formulario>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
