/** Montagem manual de bytes ESC/POS (térmicas Elgin/Bematech/Epson/genéricas). */
import iconv from "iconv-lite";
import { quebrarColunas, rotuloTipoAtendimento, transliterarCupom } from "../util/texto.js";

const ESC = 0x1b;

export type Codificacao = "CP860" | "CP850" | "CP437";

/** Code page ESC/POS (ESC t n) — valores comuns em impressoras BR. */
const CODE_PAGE: Record<Codificacao, number> = {
  CP437: 0,
  CP850: 2,
  CP860: 3,
};

const ICONV: Record<Codificacao, string> = {
  CP437: "cp437",
  CP850: "cp850",
  CP860: "cp860",
};

export function encoderTexto(texto: string, codificacao: Codificacao): Buffer {
  const limpo = transliterarCupom(texto);
  const page = ICONV[codificacao] ?? "cp860";
  if (iconv.encodingExists(page)) return iconv.encode(limpo, page);
  return iconv.encode(limpo, "cp850");
}

/** Dinheiro no cupom sem NBSP do toLocaleString. */
export function formatarDinheiroEscpos(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const reais = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${inteiro},${cents}`;
}

export class EscPosBuilder {
  private partes: Buffer[] = [];
  constructor(
    private colunas: number,
    private codificacao: Codificacao = "CP860"
  ) {}

  private push(...bufs: Buffer[]) {
    this.partes.push(...bufs);
  }

  init() {
    this.push(Buffer.from([ESC, 0x40]));
    this.push(Buffer.from([ESC, 0x74, CODE_PAGE[this.codificacao]]));
    return this;
  }

  align(a: "esquerda" | "centro" | "direita") {
    const n = a === "centro" ? 1 : a === "direita" ? 2 : 0;
    this.push(Buffer.from([ESC, 0x61, n]));
    return this;
  }

  negrito(on: boolean) {
    this.push(Buffer.from([ESC, 0x45, on ? 1 : 0]));
    return this;
  }

  /** ESC ! n - bits 4/5 ligam altura/largura dupla; aceito pelo emulador ESC/POS usado no desenvolvimento. */
  tamanho(letra: "NORMAL" | "GRANDE" | "EXTRA" = "NORMAL") {
    const n = letra === "EXTRA" ? 0x30 : letra === "GRANDE" ? 0x10 : 0x00;
    this.push(Buffer.from([ESC, 0x21, n]));
    return this;
  }

  beep() {
    // ESC B n t — algumas térmicas BR; ignorado se não suportado
    this.push(Buffer.from([ESC, 0x42, 0x02, 0x02]));
    return this;
  }

  texto(t: string) {
    for (const linha of quebrarColunas(t, this.colunas)) {
      this.push(encoderTexto(linha + "\n", this.codificacao));
    }
    return this;
  }

  separador(ch = "-") {
    const linha = ch.repeat(Math.max(8, this.colunas));
    return this.texto(linha.slice(0, this.colunas));
  }

  alimentar(n = 3) {
    this.push(Buffer.from([ESC, 0x64, Math.max(0, Math.min(255, n))]));
    return this;
  }

  cortar() {
    // ESC m é suportado pelo emulador e também é um comando ESC/POS de corte.
    this.push(Buffer.from([ESC, 0x6d]));
    return this;
  }

  gaveta() {
    this.push(Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]));
    return this;
  }

  build() {
    return Buffer.concat(this.partes);
  }
}

export type ItemProducaoLinha = {
  nome: string;
  quantidade: number;
  observacao?: string | null;
  escolhas?: string[];
  adicionais?: string[];
  cancelado?: boolean;
  categoria?: string;
};

/** @deprecated use ItemProducaoLinha */
export type ItemProducaoCupom = ItemProducaoLinha;

export function montarCupomTeste(opts: {
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
  nome?: string;
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  b.init();
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.align("centro").negrito(true).texto(opts.nome || "TESTE").negrito(false);
  b.texto("OS-Restaurante — teste de impressao");
  b.texto("Acentos: pão, coração, açúcar, mamão");
  b.texto(formatarDinheiroEscpos(1050));
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarCupomConta(opts: {
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
  nome_restaurante?: string;
  codigo_atendimento: string;
  mesa?: string | null;
  linhas: { texto: string; valor_centavos?: number }[];
  subtotal_centavos: number;
  desconto_centavos: number;
  acrescimo_centavos: number;
  taxa_servico_centavos: number;
  taxa_entrega_centavos: number;
  total_centavos: number;
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  const money = formatarDinheiroEscpos;
  b.init();
  b.align("centro").negrito(true).texto(opts.nome_restaurante || "PRE-CONTA").negrito(false);
  b.texto("NÃO É DOCUMENTO FISCAL");
  b.separador("=");
  b.align("esquerda");
  b.texto(`Conta ${opts.codigo_atendimento}`);
  if (opts.mesa) b.texto(`Mesa ${opts.mesa}`);
  b.texto(new Date().toLocaleString("pt-BR"));
  b.separador("-");
  for (const l of opts.linhas) {
    if (l.valor_centavos != null) {
      const esq = l.texto.slice(0, Math.max(8, opts.colunas - 12));
      const dir = money(l.valor_centavos);
      const pad = Math.max(1, opts.colunas - esq.length - dir.length);
      b.texto(esq + " ".repeat(pad) + dir);
    } else b.texto(l.texto);
  }
  b.separador("-");
  b.texto(
    `Subtotal${" ".repeat(Math.max(1, opts.colunas - 8 - money(opts.subtotal_centavos).length))}${money(opts.subtotal_centavos)}`
  );
  if (opts.desconto_centavos) b.texto(`Desconto  -${money(opts.desconto_centavos)}`);
  if (opts.acrescimo_centavos) b.texto(`Acrescimo  ${money(opts.acrescimo_centavos)}`);
  if (opts.taxa_servico_centavos) b.texto(`Servico    ${money(opts.taxa_servico_centavos)}`);
  if (opts.taxa_entrega_centavos) b.texto(`Entrega    ${money(opts.taxa_entrega_centavos)}`);
  b.negrito(true).texto(`TOTAL      ${money(opts.total_centavos)}`).negrito(false);
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarCupomComprovante(opts: {
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
  nome_restaurante?: string;
  mensagem_cupom?: string | null;
  codigo_atendimento: string;
  total_centavos: number;
  pagamentos: {
    forma: string;
    valor_centavos: number;
    troco_centavos: number;
    valor_recebido_centavos?: number;
  }[];
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_endereco?: string | null;
  observacao?: string | null;
  linhas?: { texto: string; valor_centavos?: number }[];
  desconto_centavos?: number;
  taxa_servico_centavos?: number;
  conferencia?: string | null;
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  const money = formatarDinheiroEscpos;
  b.init();
  b.align("centro").negrito(true).texto(opts.nome_restaurante || "COMPROVANTE").negrito(false);
  b.texto("NÃO É DOCUMENTO FISCAL");
  b.separador("=");
  b.align("esquerda");
  b.texto(`Conta ${opts.codigo_atendimento}`);
  b.texto(new Date().toLocaleString("pt-BR"));
  if (opts.linhas?.length) {
    for (const l of opts.linhas) {
      if (l.valor_centavos != null) {
        const dir = money(l.valor_centavos);
        const esq = l.texto.slice(0, Math.max(4, opts.colunas - dir.length - 1));
        const pad = Math.max(1, opts.colunas - esq.length - dir.length);
        b.texto(esq + " ".repeat(pad) + dir);
      } else b.texto(l.texto);
    }
  }
  if (opts.desconto_centavos) b.texto(`Desconto ${money(opts.desconto_centavos)}`);
  if (opts.taxa_servico_centavos) b.texto(`Serviço ${money(opts.taxa_servico_centavos)}`);
  if (opts.cliente_nome) b.texto(`Cliente: ${opts.cliente_nome}`);
  if (opts.cliente_telefone) b.texto(`Tel: ${opts.cliente_telefone}`);
  if (opts.cliente_endereco) b.texto(`End: ${opts.cliente_endereco}`);
  if (opts.observacao) b.texto(`Obs: ${opts.observacao}`);
  b.separador("-");
  b.negrito(true).texto(`TOTAL  ${money(opts.total_centavos)}`).negrito(false);
  for (const p of opts.pagamentos) {
    b.texto(`${p.forma}: ${money(p.valor_centavos)}`);
    if (p.valor_recebido_centavos != null && p.valor_recebido_centavos !== p.valor_centavos) {
      b.texto(`  Recebido: ${money(p.valor_recebido_centavos)}`);
    }
    if (p.troco_centavos) b.texto(`  Troco: ${money(p.troco_centavos)}`);
  }
  if (opts.conferencia) b.texto(`Conferência ${opts.conferencia}`);
  if (opts.mensagem_cupom) {
    b.separador("-");
    b.align("centro").texto(opts.mensagem_cupom);
  }
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarCupomProducao(opts: {
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
  codigo_pedido: string;
  codigo_atendimento: string;
  mesa?: string | null;
  tipo_atendimento?: string;
  numero_dia?: number | null;
  setor?: string | null;
  garcom_nome?: string | null;
  observacao_atendimento?: string | null;
  itens: ItemProducaoLinha[];
  cancelamento?: boolean;
  reimpressao?: boolean;
  motivo_cancelamento?: string | null;
  cancelado_por?: string | null;
  hora_original?: Date | string | null;
  tamanho_letra?: string;
  apita?: boolean;
}): Buffer {
  const letra =
    opts.tamanho_letra === "EXTRA" || opts.tamanho_letra === "GRANDE" || opts.tamanho_letra === "NORMAL"
      ? opts.tamanho_letra
      : "GRANDE";
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  b.init();
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  if (opts.numero_dia) {
    b.align("centro").negrito(true).tamanho("EXTRA").texto(`SENHA ${opts.numero_dia}`).tamanho("NORMAL").negrito(false);
  }
  if (opts.apita) b.beep();
  b.align("centro").negrito(true).tamanho("EXTRA");
  if (opts.cancelamento) b.texto("*** CANCELADO ***");
  if (opts.reimpressao) b.texto("*** REIMPRESSAO ***");
  b.tamanho("GRANDE").texto((opts.setor || "PRODUCAO").toUpperCase());
  b.tamanho("NORMAL").negrito(false);
  b.texto(opts.codigo_pedido);
  b.align("esquerda");
  b.texto(`Conta ${opts.codigo_atendimento}`);
  if (opts.mesa) b.texto(`Mesa ${opts.mesa}`);
  if (opts.tipo_atendimento) b.texto(`Tipo: ${rotuloTipoAtendimento(opts.tipo_atendimento)}`);
  if (opts.garcom_nome) b.texto(`Garçom: ${opts.garcom_nome}`);
  if (opts.reimpressao && opts.hora_original) {
    const h =
      opts.hora_original instanceof Date
        ? opts.hora_original.toLocaleString("pt-BR")
        : String(opts.hora_original);
    b.texto(`Original: ${h}`);
  } else {
    b.texto(new Date().toLocaleString("pt-BR"));
  }
  if (opts.cancelamento) {
    if (opts.cancelado_por) b.texto(`Cancelado por: ${opts.cancelado_por}`);
    if (opts.motivo_cancelamento) b.texto(`Motivo: ${opts.motivo_cancelamento}`);
  }
  b.separador("-");
  let categoriaAtual = "";
  for (const item of opts.itens) {
    if (item.categoria && item.categoria !== categoriaAtual) {
      categoriaAtual = item.categoria;
      b.negrito(true).texto(categoriaAtual).negrito(false);
    }
    b.tamanho(letra).negrito(true).texto(`${item.quantidade}x ${item.nome}`).negrito(false).tamanho("NORMAL");
    for (const e of item.escolhas ?? []) b.texto(`  - ${e}`);
    for (const a of item.adicionais ?? []) b.texto(`  + ${a}`);
    if (item.observacao) b.texto(`  obs: ${item.observacao}`);
  }
  if (opts.observacao_atendimento) {
    b.separador("-");
    b.texto(`Obs conta: ${opts.observacao_atendimento}`);
  }
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarCupomRelatorioCaixa(opts: {
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
  titulo: string;
  operador: string;
  linhas: { texto: string; valor_centavos?: number }[];
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  const money = formatarDinheiroEscpos;
  b.init();
  b.align("centro").negrito(true).texto(opts.titulo).negrito(false);
  b.texto("NÃO É DOCUMENTO FISCAL");
  b.separador("=");
  b.align("esquerda");
  b.texto(`Operador: ${opts.operador}`);
  b.texto(new Date().toLocaleString("pt-BR"));
  b.separador("-");
  for (const l of opts.linhas) {
    if (l.valor_centavos != null) {
      const dir = money(l.valor_centavos);
      const pad = Math.max(1, opts.colunas - l.texto.length - dir.length);
      b.texto(l.texto.slice(0, opts.colunas - dir.length - 1) + " ".repeat(pad) + dir);
    } else b.texto(l.texto);
  }
  b.align("centro").texto("NÃO É DOCUMENTO FISCAL");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarPulseGaveta(): Buffer {
  const b = new EscPosBuilder(32, "CP850");
  b.gaveta();
  return b.build();
}
