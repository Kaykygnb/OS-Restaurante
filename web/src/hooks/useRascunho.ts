import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { lerUsuario } from "../auth/sessao";
import { confirmar } from "../servicos/dialogos";
const edicoes = new Set<string>();
if (typeof window !== "undefined") window.addEventListener("osr:sessao-finalizada", () => edicoes.clear());
export const temEdicaoPendente = () => edicoes.size > 0;
export const podeTrocarEdicao = async () => !temEdicaoPendente() || await confirmar("Sair desta edição? As alterações ainda não foram salvas. O rascunho será mantido quando disponível.");
export function chaveRascunho(entidade: string) { return `osr:rascunho:${lerUsuario()?.id ?? "anonimo"}:${entidade}`; }
export function lerRascunhoSeguro<T>(entidade: string): T | null { try { return JSON.parse(sessionStorage.getItem(chaveRascunho(entidade)) ?? "null") as T | null; } catch { return null; } }
export function useRascunho<T>(entidade: string, inicial: T): [T, Dispatch<SetStateAction<T>>, { salvo: () => void; descartar: () => void; sujo: boolean }] {
  const [valor, setValor] = useState<T>(() => lerRascunhoSeguro<T>(entidade) ?? inicial);
  const [base, setBase] = useState(JSON.stringify(inicial));
  const [revisao, setRevisao] = useState(0);
  const serializado = JSON.stringify(valor, (key, value) => /senha|password|pin|token/i.test(key) ? undefined : value);
  const sujo = serializado !== base;
  useEffect(() => {
    const key = chaveRascunho(entidade);
    if (sujo) { edicoes.add(key); sessionStorage.setItem(key, serializado); }
    else { edicoes.delete(key); sessionStorage.removeItem(key); }
    return () => { edicoes.delete(key); };
  }, [entidade, serializado, sujo, revisao]);
  const salvo = () => { setBase(serializado); edicoes.delete(chaveRascunho(entidade)); sessionStorage.removeItem(chaveRascunho(entidade)); setRevisao(n => n + 1); };
  return [valor, setValor, { salvo, sujo, descartar: () => { salvo(); setValor(inicial); setBase(JSON.stringify(inicial)); } }];
}
export function useEdicaoPendente(entidade: string, dados: unknown, ativo = true) {
  const entidadeAnterior = useRef(entidade);
  const baseline = useRef<string | null>(null); const assinatura = JSON.stringify(dados, (k,v) => /senha|password|pin|token/i.test(k) ? undefined : v);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const chave = chaveRascunho(entidade);
    if (entidadeAnterior.current !== entidade) { baseline.current = null; entidadeAnterior.current = entidade; }
    if (!ativo) { baseline.current = null; edicoes.delete(chave); return; }
    if (baseline.current === null) baseline.current = sessionStorage.getItem(chave) ? "" : assinatura;
    if (assinatura !== baseline.current) { edicoes.add(chave); sessionStorage.setItem(chave, assinatura); } else edicoes.delete(chave);
    return () => { edicoes.delete(chave); };
  }, [ativo, entidade, assinatura, versao]);
  return () => { baseline.current = null; edicoes.delete(chaveRascunho(entidade)); sessionStorage.removeItem(chaveRascunho(entidade)); setVersao(v => v + 1); };
}

/** Protege segredos digitados sem gravá-los no armazenamento do navegador. */
export function useProtecaoSensivel(chave: string, alterado: boolean) {
  useEffect(() => { if (alterado) edicoes.add(chave); else edicoes.delete(chave); return () => { edicoes.delete(chave); }; }, [chave, alterado]);
  return () => edicoes.delete(chave);
}

export const useProtecaoEdicao = useProtecaoSensivel;
