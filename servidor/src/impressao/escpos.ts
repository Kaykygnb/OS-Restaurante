/** Montagem manual de bytes ESC/POS (térmicas Elgin/Bematech/Epson/genéricas). */

const ESC = 0x1b;
const GS = 0x1d;

export type Codificacao = "CP860" | "CP850" | "CP437";

/** Code page ESC/POS (ESC t n) — valores comuns em impressoras BR. */
const CODE_PAGE: Record<Codificacao, number> = {
  CP437: 0,
  CP850: 2,
  CP860: 3,
};

function encoderTexto(texto: string, codificacao: Codificacao): Buffer {
  // Node não traz CP860 nativo; mapeamos caracteres latinos comuns pra bytes CP860/CP850.
  // Fallback: remove acento se não houver mapa.
  const mapa: Record<string, number> = {
    Á: 0xb5,
    À: 0xb7,
    Â: 0xb6,
    Ã: 0xc7,
    É: 0x90,
    Ê: 0xd2,
    Í: 0xd6,
    Ó: 0xe0,
    Ô: 0xe2,
    Õ: 0xe5,
    Ú: 0xe9,
    Ü: 0x9a,
    Ç: 0x80,
    á: 0xa0,
    à: 0x85,
    â: 0x83,
    ã: 0xc6,
    é: 0x82,
    ê: 0x88,
    í: 0xa1,
    ó: 0xa2,
    ô: 0x93,
    õ: 0xe4,
    ú: 0xa3,
    ü: 0x81,
    ç: 0x87,
    º: 0xa7,
    ª: 0xa6,
    "°": 0xf8,
  };

  // Ajuste fino CP850 vs CP860 nos mesmos glyphs quando diverge
  if (codificacao === "CP850") {
    Object.assign(mapa, {
      Ã: 0xc7,
      Õ: 0xe5,
      ã: 0xc6,
      õ: 0xe4,
    });
  }

  const out: number[] = [];
  for (const ch of texto) {
    const code = ch.charCodeAt(0);
    if (code < 128) out.push(code);
    else if (mapa[ch] !== undefined) out.push(mapa[ch]!);
    else {
      // remove diacrítico aproximado
      const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
      if (base.length && base.charCodeAt(0) < 128) out.push(base.charCodeAt(0));
      else out.push(0x3f); // ?
    }
  }
  return Buffer.from(out);
}

export class EscPosBuilder {
  private partes: Buffer[] = [];
  constructor(
    private colunas: number,
    private codificacao: Codificacao = "CP860"
  ) {}

  private push(...bytes: number[]) {
    this.partes.push(Buffer.from(bytes));
    return this;
  }

  private pushBuf(buf: Buffer) {
    this.partes.push(buf);
    return this;
  }

  init() {
    this.push(ESC, 0x40); // ESC @
    const n = CODE_PAGE[this.codificacao] ?? 3;
    this.push(ESC, 0x74, n); // ESC t n
    return this;
  }

  align(modo: "esquerda" | "centro" | "direita" = "esquerda") {
    const n = modo === "centro" ? 1 : modo === "direita" ? 2 : 0;
    return this.push(ESC, 0x61, n);
  }

  negrito(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  tamanho(duploH = false, duploL = false) {
    const n = (duploL ? 0x10 : 0) | (duploH ? 0x01 : 0);
    return this.push(GS, 0x21, n);
  }

  texto(linha: string) {
    this.pushBuf(encoderTexto(linha, this.codificacao));
    return this.push(0x0a);
  }

  linhas(texto: string) {
    for (const l of texto.split("\n")) this.texto(l);
    return this;
  }

  separador(char = "-") {
    return this.texto(char.repeat(Math.max(8, this.colunas)));
  }

  regua() {
    let s = "";
    for (let i = 1; i <= this.colunas; i++) s += String(i % 10);
    return this.texto(s);
  }

  alimentar(n = 3) {
    return this.push(ESC, 0x64, n); // ESC d n
  }

  cortar() {
    // GS V 0 — corte total
    return this.push(GS, 0x56, 0x00);
  }

  abrirGaveta(pino = 0) {
    // ESC p m t1 t2 — pulse pin 0 (caixa)
    return this.push(ESC, 0x70, pino & 0xff, 0x19, 0xfa);
  }

  build(): Buffer {
    return Buffer.concat(this.partes);
  }
}

export function montarCupomTeste(opts: {
  nome: string;
  colunas: number;
  codificacao?: Codificacao;
  tem_guilhotina?: boolean;
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  b.init();
  b.align("centro").negrito(true).tamanho(true, true);
  b.texto("TESTE DE IMPRESSAO");
  b.tamanho(false, false).negrito(false);
  b.separador("=");
  b.align("esquerda");
  b.texto(`Impressora: ${opts.nome}`);
  b.texto(`Data: ${new Date().toLocaleString("pt-BR")}`);
  b.texto(`Colunas: ${opts.colunas}`);
  b.separador("-");
  b.texto("Regua de colunas:");
  b.regua();
  b.separador("-");
  b.texto("Acentos: Acao, coracao, pao");
  b.texto("Ação, coração, pão");
  b.separador("=");
  b.align("centro").texto("Se leu isto, a conexao OK");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}

export function montarPulseGaveta(): Buffer {
  const b = new EscPosBuilder(32);
  b.init().abrirGaveta(0);
  return b.build();
}

export type ItemProducaoLinha = {
  quantidade: number;
  nome: string;
  observacao?: string | null;
  escolhas?: string[];
  adicionais?: string[];
};

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
  const money = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  b.init();
  b.align("centro").negrito(true).texto(opts.nome_restaurante || "PRE-CONTA").negrito(false);
  b.texto("PRE-CONTA (nao fiscal)");
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
  b.texto(`Subtotal${" ".repeat(Math.max(1, opts.colunas - 8 - money(opts.subtotal_centavos).length))}${money(opts.subtotal_centavos)}`);
  if (opts.desconto_centavos) b.texto(`Desconto  -${money(opts.desconto_centavos)}`);
  if (opts.acrescimo_centavos) b.texto(`Acrescimo  ${money(opts.acrescimo_centavos)}`);
  if (opts.taxa_servico_centavos) b.texto(`Servico    ${money(opts.taxa_servico_centavos)}`);
  if (opts.taxa_entrega_centavos) b.texto(`Entrega    ${money(opts.taxa_entrega_centavos)}`);
  b.negrito(true).texto(`TOTAL      ${money(opts.total_centavos)}`).negrito(false);
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
  pagamentos: { forma: string; valor_centavos: number; troco_centavos: number }[];
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  const money = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  b.init();
  b.align("centro").negrito(true).texto(opts.nome_restaurante || "COMPROVANTE").negrito(false);
  b.texto("COMPROVANTE (nao fiscal)");
  b.separador("=");
  b.align("esquerda");
  b.texto(`Conta ${opts.codigo_atendimento}`);
  b.texto(new Date().toLocaleString("pt-BR"));
  b.separador("-");
  b.negrito(true).texto(`TOTAL  ${money(opts.total_centavos)}`).negrito(false);
  for (const p of opts.pagamentos) {
    b.texto(`${p.forma}: ${money(p.valor_centavos)}`);
    if (p.troco_centavos) b.texto(`  Troco: ${money(p.troco_centavos)}`);
  }
  if (opts.mensagem_cupom) {
    b.separador("-");
    b.align("centro").texto(opts.mensagem_cupom);
  }
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
  cancelamento?: boolean;
  itens: ItemProducaoLinha[];
}): Buffer {
  const b = new EscPosBuilder(opts.colunas, opts.codificacao ?? "CP860");
  b.init();
  b.align("centro").negrito(true).tamanho(true, true);
  b.texto(opts.cancelamento ? "*** CANCELADO ***" : "PRODUCAO");
  b.tamanho(false, false).negrito(false);
  b.separador("=");
  b.align("esquerda");
  b.negrito(true).texto(`Pedido ${opts.codigo_pedido}`).negrito(false);
  b.texto(`Conta ${opts.codigo_atendimento}`);
  if (opts.mesa) b.texto(`Mesa ${opts.mesa}`);
  else if (opts.tipo_atendimento) b.texto(opts.tipo_atendimento);
  b.texto(new Date().toLocaleString("pt-BR"));
  b.separador("-");
  for (const item of opts.itens) {
    b.negrito(true).tamanho(true, false);
    b.texto(`${item.quantidade}x ${item.nome}`);
    b.tamanho(false, false).negrito(false);
    for (const e of item.escolhas ?? []) b.texto(`  - ${e}`);
    for (const a of item.adicionais ?? []) b.texto(`  + ${a}`);
    if (item.observacao) b.texto(`  Obs: ${item.observacao}`);
  }
  b.separador("=");
  b.alimentar(4);
  if (opts.tem_guilhotina) b.cortar();
  return b.build();
}
