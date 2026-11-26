import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Ajuda from "../componentes/Ajuda";
import { lerUsuario } from "../auth/sessao";
import { api } from "../servicos/api";
import { formatarReais, reaisParaCentavos } from "../util/dinheiro";

type AbaConfig = "estabelecimento" | "impressoras";

type Config = {
  configurado: boolean;
  id?: number;
  nome_restaurante?: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  inscricao_estadual?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  caminho_logo?: string | null;
  mensagem_cupom?: string | null;
  taxa_entrega_centavos?: number;
  impressora_conta_id?: number | null;
  impressora_caixa_id?: number | null;
};

type CategoriaOpt = { id: number; nome: string };

type ImpSistema = {
  nome: string;
  status?: string | null;
  porta?: string | null;
  padrao?: boolean;
};

type Impressora = {
  id: number;
  nome: string;
  tipo_conexao: "REDE" | "SISTEMA";
  ip: string | null;
  porta: number;
  nome_sistema: string | null;
  largura_papel: number;
  colunas: number;
  codificacao: string;
  vias: number;
  tem_guilhotina: boolean;
  tem_gaveta: boolean;
  ativo: boolean;
  ultimo_status: "DESCONHECIDO" | "ONLINE" | "ERRO" | "INATIVA";
  ultimo_erro: string | null;
  testado_em: string | null;
  categorias: { categoria_id: number; categoria: { id: number; nome: string } }[];
};

type FormImp = {
  nome: string;
  tipo_conexao: "REDE" | "SISTEMA";
  ip: string;
  porta: string;
  nome_sistema: string;
  largura_papel: "58" | "80";
  colunas: string;
  codificacao: string;
  vias: string;
  tem_guilhotina: boolean;
  tem_gaveta: boolean;
  categoria_ids: number[];
};

const TIPOS_CONFIG = new Set(["ROOT", "ADMIN"]);

function vazio() {
  return {
    nome_restaurante: "",
    nome_fantasia: "",
    cnpj: "",
    inscricao_estadual: "",
    telefone: "",
    whatsapp: "",
    email: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    caminho_logo: "",
    mensagem_cupom: "",
    taxa_entrega: "0",
  };
}

function formImpVazio(): FormImp {
  return {
    nome: "",
    tipo_conexao: "REDE",
    ip: "",
    porta: "9100",
    nome_sistema: "",
    largura_papel: "80",
    colunas: "48",
    codificacao: "CP860",
    vias: "1",
    tem_guilhotina: true,
    tem_gaveta: false,
    categoria_ids: [],
  };
}

function formFromImp(imp: Impressora): FormImp {
  return {
    nome: imp.nome,
    tipo_conexao: imp.tipo_conexao,
    ip: imp.ip ?? "",
    porta: String(imp.porta || 9100),
    nome_sistema: imp.nome_sistema ?? "",
    largura_papel: imp.largura_papel === 58 ? "58" : "80",
    colunas: String(imp.colunas || (imp.largura_papel === 58 ? 32 : 48)),
    codificacao: imp.codificacao || "CP860",
    vias: String(imp.vias || 1),
    tem_guilhotina: imp.tem_guilhotina,
    tem_gaveta: imp.tem_gaveta,
    categoria_ids: imp.categorias.map((c) => c.categoria_id),
  };
}

function statusVisual(status: Impressora["ultimo_status"], ativo: boolean) {
  if (!ativo) return { classe: "imp-status-inativa", rotulo: "Inativa" };
  if (status === "ONLINE") return { classe: "imp-status-online", rotulo: "Online" };
  if (status === "ERRO") return { classe: "imp-status-erro", rotulo: "Erro" };
  return { classe: "imp-status-desconhecido", rotulo: "Desconhecido" };
}

export default function Configuracoes() {
  const sessao = lerUsuario();
  if (!TIPOS_CONFIG.has(sessao?.tipo ?? "")) {
    return <Navigate to="/painel" replace />;
  }
  return <ConfiguracoesPagina />;
}

function ConfiguracoesPagina() {
  const [aba, setAba] = useState<AbaConfig>("estabelecimento");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  return (
    <div className="cardapio config-pagina">
      <section className="cardapio-hero" aria-labelledby="config-titulo">
        <div className="cardapio-hero-copy">
          <span className="cardapio-kicker">ESTABELECIMENTO</span>
          <h2 id="config-titulo" className="titulo-com-ajuda">
            Configurações
            <Ajuda texto="Dados do restaurante e impressoras térmicas ESC/POS. Só ROOT e ADMIN editam. A impressão sai sempre pelo servidor, nunca pelo navegador." />
          </h2>
          <p>Identidade do restaurante e cadastro de impressoras de rede (TCP 9100).</p>
        </div>
      </section>

      <div className="abas config-abas">
        <button
          type="button"
          className={`aba${aba === "estabelecimento" ? " on" : ""}`}
          onClick={() => {
            setAba("estabelecimento");
            setErro("");
            setOk("");
          }}
        >
          Estabelecimento
        </button>
        <button
          type="button"
          className={`aba${aba === "impressoras" ? " on" : ""}`}
          onClick={() => {
            setAba("impressoras");
            setErro("");
            setOk("");
          }}
        >
          Impressoras
        </button>
      </div>

      {erro ? <p className="feedback-card feedback-erro" role="alert">{erro}</p> : null}
      {ok ? <p className="feedback-card feedback-ok" role="status">{ok}</p> : null}

      {aba === "estabelecimento" ? (
        <AbaEstabelecimento setErro={setErro} setOk={setOk} />
      ) : (
        <AbaImpressoras setErro={setErro} setOk={setOk} />
      )}
    </div>
  );
}

function AbaEstabelecimento({
  setErro,
  setOk,
}: {
  setErro: (v: string) => void;
  setOk: (v: string) => void;
}) {
  const [form, setForm] = useState(vazio);
  const [configurado, setConfigurado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const setCampo = (chave: keyof ReturnType<typeof vazio>, valor: string) => {
    setForm((f) => ({ ...f, [chave]: valor }));
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const dados = (await api("/configuracoes")) as Config;
      setConfigurado(Boolean(dados.configurado));
      if (!dados.configurado) {
        setForm(vazio());
        return;
      }
      setForm({
        nome_restaurante: dados.nome_restaurante ?? "",
        nome_fantasia: dados.nome_fantasia ?? "",
        cnpj: dados.cnpj ?? "",
        inscricao_estadual: dados.inscricao_estadual ?? "",
        telefone: dados.telefone ?? "",
        whatsapp: dados.whatsapp ?? "",
        email: dados.email ?? "",
        cep: dados.cep ?? "",
        logradouro: dados.logradouro ?? "",
        numero: dados.numero ?? "",
        complemento: dados.complemento ?? "",
        bairro: dados.bairro ?? "",
        cidade: dados.cidade ?? "",
        uf: dados.uf ?? "",
        caminho_logo: dados.caminho_logo ?? "",
        mensagem_cupom: dados.mensagem_cupom ?? "",
        taxa_entrega:
          dados.taxa_entrega_centavos != null
            ? (dados.taxa_entrega_centavos / 100).toFixed(2).replace(".", ",")
            : "0",
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [setErro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (form.nome_restaurante.trim().length < 2) {
      return setErro("Informe o nome do restaurante");
    }
    const taxa = reaisParaCentavos(form.taxa_entrega || "0");
    if (!Number.isFinite(taxa) || taxa < 0) {
      return setErro("Taxa de entrega inválida");
    }
    if (form.uf.trim() && form.uf.trim().length !== 2) {
      return setErro("UF deve ter 2 letras (ex: MG)");
    }

    setSalvando(true);
    setErro("");
    try {
      const salvo = (await api("/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          nome_restaurante: form.nome_restaurante.trim(),
          nome_fantasia: form.nome_fantasia.trim() || null,
          cnpj: form.cnpj.trim() || null,
          inscricao_estadual: form.inscricao_estadual.trim() || null,
          telefone: form.telefone.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          email: form.email.trim() || null,
          cep: form.cep.trim() || null,
          logradouro: form.logradouro.trim() || null,
          numero: form.numero.trim() || null,
          complemento: form.complemento.trim() || null,
          bairro: form.bairro.trim() || null,
          cidade: form.cidade.trim() || null,
          uf: form.uf.trim() ? form.uf.trim().toUpperCase() : null,
          caminho_logo: form.caminho_logo.trim() || null,
          mensagem_cupom: form.mensagem_cupom.trim() || null,
          taxa_entrega_centavos: taxa,
        }),
      })) as Config;
      setConfigurado(Boolean(salvo.configurado));
      setOk(configurado ? "Configurações salvas" : "Restaurante configurado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="config-toolbar">
        <button type="button" className="btn-sec" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      <form className="painel-bloco config-form" onSubmit={salvar}>
        <div className="drawer-bloco">
          <p className="bloco-variante-titulo titulo-com-ajuda">
            Identidade
            <Ajuda texto="Nome legal e nome de fachada. O nome do restaurante é obrigatório." />
          </p>
          <div className="config-grid-2">
            <label className="campo">
              <span>Nome do restaurante *</span>
              <input
                value={form.nome_restaurante}
                onChange={(e) => setCampo("nome_restaurante", e.target.value)}
                placeholder="Ex: Pastelaria do Kayky LTDA"
                required
              />
            </label>
            <label className="campo">
              <span>Nome fantasia</span>
              <input
                value={form.nome_fantasia}
                onChange={(e) => setCampo("nome_fantasia", e.target.value)}
                placeholder="Ex: Pastéis do Kayky"
              />
            </label>
            <label className="campo">
              <span>CNPJ</span>
              <input value={form.cnpj} onChange={(e) => setCampo("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </label>
            <label className="campo">
              <span>Inscrição estadual</span>
              <input
                value={form.inscricao_estadual}
                onChange={(e) => setCampo("inscricao_estadual", e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="drawer-bloco">
          <p className="bloco-variante-titulo">Contato</p>
          <div className="config-grid-2">
            <label className="campo">
              <span>Telefone</span>
              <input value={form.telefone} onChange={(e) => setCampo("telefone", e.target.value)} />
            </label>
            <label className="campo">
              <span className="campo-com-ajuda">
                WhatsApp
                <Ajuda texto="Número pra pedidos / atendimento. Ainda não envia mensagem automático." />
              </span>
              <input value={form.whatsapp} onChange={(e) => setCampo("whatsapp", e.target.value)} />
            </label>
            <label className="campo">
              <span>E-mail comercial</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setCampo("email", e.target.value)}
                placeholder="contato@restaurante.com"
              />
            </label>
          </div>
        </div>

        <div className="drawer-bloco">
          <p className="bloco-variante-titulo">Endereço</p>
          <div className="config-grid-2">
            <label className="campo">
              <span>CEP</span>
              <input value={form.cep} onChange={(e) => setCampo("cep", e.target.value)} />
            </label>
            <label className="campo">
              <span>UF</span>
              <input
                value={form.uf}
                onChange={(e) => setCampo("uf", e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="MG"
              />
            </label>
            <label className="campo config-span-2">
              <span>Logradouro</span>
              <input
                value={form.logradouro}
                onChange={(e) => setCampo("logradouro", e.target.value)}
                placeholder="Rua / avenida"
              />
            </label>
            <label className="campo">
              <span>Número</span>
              <input value={form.numero} onChange={(e) => setCampo("numero", e.target.value)} />
            </label>
            <label className="campo">
              <span>Complemento</span>
              <input value={form.complemento} onChange={(e) => setCampo("complemento", e.target.value)} />
            </label>
            <label className="campo">
              <span>Bairro</span>
              <input value={form.bairro} onChange={(e) => setCampo("bairro", e.target.value)} />
            </label>
            <label className="campo">
              <span>Cidade</span>
              <input value={form.cidade} onChange={(e) => setCampo("cidade", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="drawer-bloco">
          <p className="bloco-variante-titulo titulo-com-ajuda">
            Operação e cupom
            <Ajuda texto="Taxa padrão de delivery (pode sobrescrever no pedido depois). Mensagem aparece no rodapé do cupom." />
          </p>
          <div className="config-grid-2">
            <label className="campo">
              <span>
                Taxa de entrega{" "}
                <small className="ajuda-inline">
                  (agora:{" "}
                  {formatarReais(
                    Number.isFinite(reaisParaCentavos(form.taxa_entrega || "0"))
                      ? reaisParaCentavos(form.taxa_entrega || "0")
                      : 0
                  )}
                  )
                </small>
              </span>
              <input
                value={form.taxa_entrega}
                onChange={(e) => setCampo("taxa_entrega", e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </label>
            <label className="campo">
              <span className="campo-com-ajuda">
                Caminho do logo
                <Ajuda texto="Por enquanto só o caminho do arquivo (ex: fotos/logo.png). Upload de imagem vem depois." />
              </span>
              <input
                value={form.caminho_logo}
                onChange={(e) => setCampo("caminho_logo", e.target.value)}
                placeholder="fotos/logo.png"
              />
            </label>
            <label className="campo config-span-2">
              <span>Mensagem do cupom</span>
              <input
                value={form.mensagem_cupom}
                onChange={(e) => setCampo("mensagem_cupom", e.target.value)}
                placeholder="Obrigado pela preferência!"
              />
            </label>
          </div>
        </div>

        <div className="form-acoes">
          <button type="submit" disabled={salvando || carregando}>
            {salvando ? "Salvando…" : configurado ? "Salvar configurações" : "Salvar primeiro cadastro"}
          </button>
        </div>
      </form>
    </>
  );
}

function AbaImpressoras({
  setErro,
  setOk,
}: {
  setErro: (v: string) => void;
  setOk: (v: string) => void;
}) {
  const [lista, setLista] = useState<Impressora[]>([]);
  const [ativasOpts, setAtivasOpts] = useState<Impressora[]>([]);
  const [sistemaOpts, setSistemaOpts] = useState<ImpSistema[]>([]);
  const [avisoSistema, setAvisoSistema] = useState<string | null>(null);
  const [carregandoSistema, setCarregandoSistema] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaOpt[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"1" | "0">("1");
  const [modo, setModo] = useState<"criar" | "editar" | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormImp>(formImpVazio);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [contaId, setContaId] = useState<string>("");
  const [caixaId, setCaixaId] = useState<string>("");
  const [configurado, setConfigurado] = useState(false);
  const [salvandoRota, setSalvandoRota] = useState(false);

  const carregarSistema = useCallback(async () => {
    setCarregandoSistema(true);
    try {
      const res = (await api("/impressoras/sistema")) as {
        impressoras: ImpSistema[];
        aviso: string | null;
      };
      setSistemaOpts(res.impressoras ?? []);
      setAvisoSistema(res.aviso);
    } catch (e) {
      setSistemaOpts([]);
      setAvisoSistema((e as Error).message);
    } finally {
      setCarregandoSistema(false);
    }
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [imps, ativas, cats, cfg] = await Promise.all([
        api(`/impressoras?ativos=${filtro}`) as Promise<Impressora[]>,
        api("/impressoras?ativos=1") as Promise<Impressora[]>,
        api("/categorias") as Promise<CategoriaOpt[]>,
        api("/configuracoes") as Promise<Config>,
      ]);
      setLista(imps);
      setAtivasOpts(ativas);
      setCategorias(cats.map((c) => ({ id: c.id, nome: c.nome })));
      setConfigurado(Boolean(cfg.configurado));
      setContaId(cfg.impressora_conta_id != null ? String(cfg.impressora_conta_id) : "");
      setCaixaId(cfg.impressora_caixa_id != null ? String(cfg.impressora_caixa_id) : "");
      void carregarSistema();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, setErro, carregarSistema]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirCriar() {
    setModo("criar");
    setEditId(null);
    setForm(formImpVazio());
    setOk("");
    setErro("");
  }

  function abrirEditar(imp: Impressora) {
    setModo("editar");
    setEditId(imp.id);
    setForm(formFromImp(imp));
    setOk("");
    setErro("");
  }

  function fecharPainel() {
    setModo(null);
    setEditId(null);
    setForm(formImpVazio());
  }

  function setLargura(v: "58" | "80") {
    setForm((f) => ({
      ...f,
      largura_papel: v,
      colunas: v === "58" ? "32" : "48",
    }));
  }

  function toggleCategoria(id: number) {
    setForm((f) => ({
      ...f,
      categoria_ids: f.categoria_ids.includes(id)
        ? f.categoria_ids.filter((x) => x !== id)
        : [...f.categoria_ids, id],
    }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (form.nome.trim().length < 2) return setErro("Informe o nome da impressora");
    if (form.tipo_conexao === "REDE" && !form.ip.trim()) return setErro("Informe o IP da impressora");
    if (form.tipo_conexao === "SISTEMA" && !form.nome_sistema.trim()) {
      return setErro("Informe o nome da impressora no sistema");
    }

    const porta = Number(form.porta || 9100);
    const colunas = Number(form.colunas);
    const vias = Number(form.vias || 1);
    if (!Number.isFinite(porta) || porta < 1) return setErro("Porta inválida");
    if (!Number.isFinite(colunas) || colunas < 8) return setErro("Colunas inválidas");
    if (!Number.isFinite(vias) || vias < 1) return setErro("Vias inválidas");

    setSalvando(true);
    setErro("");
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo_conexao: form.tipo_conexao,
        ip: form.tipo_conexao === "REDE" ? form.ip.trim() : null,
        porta,
        nome_sistema: form.tipo_conexao === "SISTEMA" ? form.nome_sistema.trim() : null,
        largura_papel: Number(form.largura_papel),
        colunas,
        codificacao: form.codificacao || "CP860",
        vias,
        tem_guilhotina: form.tem_guilhotina,
        tem_gaveta: form.tem_gaveta,
      };

      let id = editId;
      if (modo === "criar") {
        const criada = (await api("/impressoras", {
          method: "POST",
          body: JSON.stringify({ ...payload, categoria_ids: form.categoria_ids }),
        })) as Impressora;
        id = criada.id;
        setOk("Impressora cadastrada");
      } else if (id != null) {
        await api(`/impressoras/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        await api(`/impressoras/${id}/categorias`, {
          method: "PUT",
          body: JSON.stringify({ categoria_ids: form.categoria_ids }),
        });
        setOk("Impressora atualizada");
      }

      await carregar();
      if (id != null) {
        const atualizadas = (await api(`/impressoras?ativos=${filtro}`)) as Impressora[];
        const found = atualizadas.find((i) => i.id === id);
        if (found) abrirEditar(found);
        else fecharPainel();
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function desativar(imp: Impressora) {
    if (!confirm(`Desativar impressora "${imp.nome}"?`)) return;
    setErro("");
    try {
      await api(`/impressoras/${imp.id}`, { method: "DELETE" });
      setOk("Impressora desativada");
      if (editId === imp.id) fecharPainel();
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function reativar(imp: Impressora) {
    setErro("");
    try {
      await api(`/impressoras/${imp.id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: true }),
      });
      setOk("Impressora reativada");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function imprimirTeste() {
    if (editId == null) return;
    setTestando(true);
    setErro("");
    try {
      await api(`/impressoras/${editId}/teste`, { method: "POST" });
      setOk("Cupom de teste enviado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
      await carregar();
    } finally {
      setTestando(false);
    }
  }

  async function testarGaveta() {
    if (editId == null) return;
    setTestando(true);
    setErro("");
    try {
      await api(`/impressoras/${editId}/teste-gaveta`, { method: "POST" });
      setOk("Pulso de gaveta enviado");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
      await carregar();
    } finally {
      setTestando(false);
    }
  }

  async function salvarRoteamento(e: React.FormEvent) {
    e.preventDefault();
    if (!configurado) {
      return setErro("Cadastre o estabelecimento antes de definir impressoras padrão.");
    }
    setSalvandoRota(true);
    setErro("");
    try {
      await api("/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          impressora_conta_id: contaId ? Number(contaId) : null,
          impressora_caixa_id: caixaId ? Number(caixaId) : null,
        }),
      });
      setOk("Roteamento global salvo");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvandoRota(false);
    }
  }

  const painelAberto = modo !== null;
  const editando = editId != null ? lista.find((i) => i.id === editId) : null;

  return (
    <>
      <p className="feedback-card config-aviso-ip" role="note">
        Fixe o IP da impressora no roteador (DHCP pode mudar). A impressão sai pelo PC do servidor — ele precisa
        estar ligado e na mesma rede.
      </p>

      <form className="painel-bloco config-roteamento" onSubmit={salvarRoteamento}>
        <div className="config-roteamento-cab">
          <div>
            <p className="bloco-variante-titulo titulo-com-ajuda" style={{ margin: 0 }}>
              Roteamento global
              <Ajuda texto="Pré-conta e comprovante/gaveta usam estas impressoras. Produção (cozinha/bar) usa as categorias marcadas em cada impressora." />
            </p>
            <p className="ajuda" style={{ margin: "4px 0 0" }}>
              Usado quando módulos de pedido e pagamento existirem.
            </p>
          </div>
          <button type="submit" className="btn-sec" disabled={salvandoRota || !configurado}>
            {salvandoRota ? "Salvando…" : "Salvar roteamento"}
          </button>
        </div>
        <div className="config-grid-2">
          <label className="campo">
            <span>Impressora da pré-conta</span>
            <select value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">— nenhuma —</option>
              {ativasOpts.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Impressora do caixa (comprovante / gaveta)</span>
            <select value={caixaId} onChange={(e) => setCaixaId(e.target.value)}>
              <option value="">— nenhuma —</option>
              {ativasOpts.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <div className={`cardapio-grid-3${painelAberto ? " com-painel" : ""}`}>
        <section className="painel-bloco painel-lista" style={{ gridColumn: painelAberto ? undefined : "1 / -1" }}>
          <header className="painel-bloco-cab">
            <div>
              <h2>Impressoras</h2>
              <p className="ajuda" style={{ margin: 0 }}>
                {filtro === "1" ? "Ativas" : "Inativas"} · {lista.length}
              </p>
            </div>
            <div className="config-toolbar-inline">
              <button type="button" className="btn-sec" onClick={() => void carregar()} disabled={carregando}>
                {carregando ? "…" : "Atualizar"}
              </button>
              <button type="button" className="btn-prim" onClick={abrirCriar}>
                Nova impressora
              </button>
            </div>
          </header>

          <div className="abas" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`aba${filtro === "1" ? " on" : ""}`}
              onClick={() => setFiltro("1")}
            >
              Ativas
            </button>
            <button
              type="button"
              className={`aba${filtro === "0" ? " on" : ""}`}
              onClick={() => setFiltro("0")}
            >
              Inativas
            </button>
          </div>

          <ul className="lista-prod">
            {lista.length === 0 && !carregando ? (
              <li className="lista-vazia">
                <strong>{filtro === "1" ? "Nenhuma impressora ativa" : "Nenhuma inativa"}</strong>
                <span>
                  {filtro === "1"
                    ? "Cadastre uma impressora de rede (IP e porta 9100)."
                    : "Impressoras desativadas aparecem aqui."}
                </span>
              </li>
            ) : null}
            {lista.map((imp) => {
              const st = statusVisual(imp.ultimo_status, imp.ativo);
              return (
                <li key={imp.id} className={`prod-item${editId === imp.id ? " editando" : ""}`}>
                  <button type="button" className="prod-info prod-info-btn" onClick={() => abrirEditar(imp)}>
                    <strong className="imp-nome-linha">
                      <span className={`imp-status-dot ${st.classe}`} title={st.rotulo} aria-label={st.rotulo} />
                      {imp.nome}
                    </strong>
                    <span className="prod-meta">
                      {imp.tipo_conexao === "REDE"
                        ? `${imp.ip ?? "—"}:${imp.porta}`
                        : imp.nome_sistema ?? "Sistema"}
                      {imp.ultimo_erro ? ` · ${imp.ultimo_erro}` : ""}
                    </span>
                    <span className="prod-badges">
                      <span className="prod-badge neutro">{imp.tipo_conexao}</span>
                      <span className="prod-badge neutro">{imp.largura_papel} mm</span>
                      {imp.tem_gaveta ? <span className="prod-badge neutro">Gaveta</span> : null}
                      {!imp.ativo ? <span className="prod-badge neutro">Inativa</span> : null}
                    </span>
                  </button>
                  <div className="prod-acoes">
                    <button type="button" className="btn-ghost" onClick={() => abrirEditar(imp)}>
                      Editar
                    </button>
                    {imp.ativo ? (
                      <button type="button" className="btn-ghost" onClick={() => void desativar(imp)}>
                        Desativar
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost" onClick={() => void reativar(imp)}>
                        Reativar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {painelAberto ? (
          <aside className="painel-bloco painel-drawer">
            <form className="form-drawer" onSubmit={salvar}>
              <div className="form-produto-titulo">
                <div>
                  <span className="painel-sobretitulo">
                    {modo === "criar" ? "NOVA IMPRESSORA" : "EDITAR IMPRESSORA"}
                  </span>
                  <strong>{modo === "criar" ? "Cadastrar" : editando?.nome ?? "Editar"}</strong>
                </div>
                <button type="button" className="btn-ghost drawer-fechar" onClick={fecharPainel} aria-label="Fechar">
                  ×
                </button>
              </div>

              <div className="drawer-bloco">
                <label className="campo">
                  <span>Nome *</span>
                  <input
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    required
                    placeholder="Ex: Cozinha, Bar, Caixa"
                  />
                </label>
                <label className="campo">
                  <span>Tipo de conexão</span>
                  <select
                    value={form.tipo_conexao}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        tipo_conexao: e.target.value as "REDE" | "SISTEMA",
                      }))
                    }
                  >
                    <option value="REDE">Rede (TCP 9100)</option>
                    <option value="SISTEMA">Sistema (Windows / CUPS)</option>
                  </select>
                </label>

                {form.tipo_conexao === "REDE" ? (
                  <div className="config-grid-2">
                    <label className="campo">
                      <span>IP *</span>
                      <input
                        value={form.ip}
                        onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                        placeholder="192.168.0.50"
                        required
                      />
                    </label>
                    <label className="campo">
                      <span>Porta</span>
                      <input
                        value={form.porta}
                        onChange={(e) => setForm((f) => ({ ...f, porta: e.target.value }))}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="drawer-bloco" style={{ padding: 0, border: 0 }}>
                    <label className="campo">
                      <span className="campo-com-ajuda">
                        Impressora do sistema *
                        <Ajuda texto="Lista as impressoras instaladas neste PC (servidor). Prefira fila RAW/genérica para ESC/POS." />
                      </span>
                      <select
                        value={form.nome_sistema}
                        onChange={(e) => setForm((f) => ({ ...f, nome_sistema: e.target.value }))}
                        required
                      >
                        <option value="">
                          {carregandoSistema ? "Carregando…" : "— selecione —"}
                        </option>
                        {form.nome_sistema &&
                        !sistemaOpts.some((s) => s.nome === form.nome_sistema) ? (
                          <option value={form.nome_sistema}>{form.nome_sistema} (salva)</option>
                        ) : null}
                        {sistemaOpts.map((s) => (
                          <option key={s.nome} value={s.nome}>
                            {s.padrao ? "★ " : ""}
                            {s.nome}
                            {s.porta ? ` · ${s.porta}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="config-toolbar-inline" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={carregandoSistema}
                        onClick={() => void carregarSistema()}
                      >
                        {carregandoSistema ? "Atualizando…" : "Atualizar lista do SO"}
                      </button>
                    </div>
                    {avisoSistema ? <p className="ajuda">{avisoSistema}</p> : null}
                    {!avisoSistema && sistemaOpts.length > 0 ? (
                      <p className="ajuda">{sistemaOpts.length} impressora(s) no sistema</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="drawer-bloco">
                <p className="bloco-variante-titulo">Papel e texto</p>
                <div className="config-grid-2">
                  <label className="campo">
                    <span>Largura</span>
                    <select
                      value={form.largura_papel}
                      onChange={(e) => setLargura(e.target.value as "58" | "80")}
                    >
                      <option value="80">80 mm</option>
                      <option value="58">58 mm</option>
                    </select>
                  </label>
                  <label className="campo">
                    <span className="campo-com-ajuda">
                      Colunas
                      <Ajuda texto="Quantidade de caracteres por linha. Padrão ~48 (80mm) ou ~32 (58mm)." />
                    </span>
                    <input
                      value={form.colunas}
                      onChange={(e) => setForm((f) => ({ ...f, colunas: e.target.value }))}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="campo">
                    <span>Codificação</span>
                    <select
                      value={form.codificacao}
                      onChange={(e) => setForm((f) => ({ ...f, codificacao: e.target.value }))}
                    >
                      <option value="CP860">CP860 (PT-BR)</option>
                      <option value="CP850">CP850</option>
                      <option value="CP437">CP437</option>
                    </select>
                  </label>
                  <label className="campo">
                    <span>Vias</span>
                    <input
                      value={form.vias}
                      onChange={(e) => setForm((f) => ({ ...f, vias: e.target.value }))}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className="campo-check">
                  <input
                    type="checkbox"
                    checked={form.tem_guilhotina}
                    onChange={(e) => setForm((f) => ({ ...f, tem_guilhotina: e.target.checked }))}
                  />
                  <span>Tem guilhotina (corte)</span>
                </label>
                <label className="campo-check">
                  <input
                    type="checkbox"
                    checked={form.tem_gaveta}
                    onChange={(e) => setForm((f) => ({ ...f, tem_gaveta: e.target.checked }))}
                  />
                  <span>Tem gaveta de dinheiro</span>
                </label>
              </div>

              <div className="drawer-bloco">
                <p className="bloco-variante-titulo titulo-com-ajuda">
                  Categorias de produção
                  <Ajuda texto="Itens com preparo dessas categorias serão enviados a esta impressora (quando o módulo de pedidos existir)." />
                </p>
                {categorias.length === 0 ? (
                  <p className="ajuda">Nenhuma categoria ativa no cardápio.</p>
                ) : (
                  <div className="imp-cats">
                    {categorias.map((c) => (
                      <label key={c.id} className="campo-check">
                        <input
                          type="checkbox"
                          checked={form.categoria_ids.includes(c.id)}
                          onChange={() => toggleCategoria(c.id)}
                        />
                        <span>{c.nome}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {modo === "editar" && editando ? (
                <div className="drawer-bloco">
                  <p className="bloco-variante-titulo">Testes</p>
                  <p className="ajuda" style={{ marginTop: 0 }}>
                    Status: {statusVisual(editando.ultimo_status, editando.ativo).rotulo}
                    {editando.testado_em
                      ? ` · último teste ${new Date(editando.testado_em).toLocaleString("pt-BR")}`
                      : ""}
                  </p>
                  <div className="form-acoes" style={{ borderTop: 0, paddingTop: 0 }}>
                    <button type="button" className="btn-sec" disabled={testando || !editando.ativo} onClick={() => void imprimirTeste()}>
                      {testando ? "Enviando…" : "Imprimir teste"}
                    </button>
                    {form.tem_gaveta ? (
                      <button type="button" className="btn-sec" disabled={testando || !editando.ativo} onClick={() => void testarGaveta()}>
                        Testar gaveta
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="form-acoes">
                <button type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : modo === "criar" ? "Cadastrar" : "Salvar"}
                </button>
                <button type="button" className="btn-ghost" onClick={fecharPainel}>
                  Cancelar
                </button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
    </>
  );
}
