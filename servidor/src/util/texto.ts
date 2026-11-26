export function normalizarNome(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function transliterarCupom(valor: string) {
  return valor
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, " ");
}

export function quebrarColunas(texto: string, colunas: number) {
  const limpo = transliterarCupom(texto).replace(/\s+/g, " ").trim();
  if (!limpo) return [""];
  const largura = Math.max(8, colunas);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of limpo.split(" ")) {
    if (palavra.length > largura) {
      if (atual) linhas.push(atual);
      for (let i = 0; i < palavra.length; i += largura) linhas.push(palavra.slice(i, i + largura));
      atual = "";
      continue;
    }
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (candidato.length <= largura) atual = candidato;
    else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function rotuloTipoAtendimento(tipo: string) {
  switch (tipo) {
    case "MESA":
      return "Mesa";
    case "BALCAO":
      return "Balcão";
    case "RETIRADA":
      return "Retirada";
    case "ENTREGA":
      return "Entrega";
    default:
      return tipo;
  }
}

export function nomeAdicionalCupom(adicional: string, variante: string) {
  const v = variante.trim();
  const norm = normalizarNome(v);
  if (!v || norm === "padrao") return adicional;
  return `${adicional} ${v}`;
}

const DIGITOS = /\D/g;

export function soDigitos(valor: string) {
  return valor.replace(DIGITOS, "");
}

export function telefoneValido(digitos: string) {
  return digitos.length >= 10 && digitos.length <= 11;
}
