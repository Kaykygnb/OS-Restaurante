import type { EnderecoInput } from "../../servicos/contratos";
import { soDigitos } from "../../util/formatos";

export const ENDERECO_VAZIO: EnderecoInput = { cep: "", logradouro: "", numero: "", sem_numero: false, complemento: "", bairro: "", cidade: "", uf: "", referencia: "" };

/** Confere o mínimo que o servidor exige (rua, bairro, cidade, UF com 2 letras). Devolve erros por campo. */
export function errosEndereco(e: EnderecoInput): Record<string, string> {
  const r: Record<string, string> = {};
  if (!e.logradouro.trim()) r.logradouro = "Informe a rua";
  if (!e.sem_numero && !e.numero?.trim()) r.numero = "Informe o número ou marque “Sem número”";
  if (!e.bairro.trim()) r.bairro = "Informe o bairro";
  if (!e.cidade.trim()) r.cidade = "Informe a cidade";
  if (e.uf.trim().length !== 2) r.uf = "UF com 2 letras";
  return r;
}

/** Tira campos vazios antes de mandar ao servidor. */
export function limparEndereco(e: EnderecoInput): EnderecoInput {
  const r: EnderecoInput = { logradouro: e.logradouro.trim(), bairro: e.bairro.trim(), cidade: e.cidade.trim(), uf: e.uf.trim().toUpperCase() };
  if (e.cep) r.cep = soDigitos(e.cep);
  if (e.sem_numero) r.sem_numero = true;
  else if (e.numero?.trim()) r.numero = e.numero.trim();
  if (e.complemento?.trim()) r.complemento = e.complemento.trim();
  if (e.referencia?.trim()) r.referencia = e.referencia.trim();
  if (e.apelido?.trim()) r.apelido = e.apelido.trim();
  return r;
}
