import { useEffect, useId, useState } from "react";
import { api } from "../servicos/api";

type Aprovador = { id: number; nome: string };

type Props = {
  aprovadorId: string;
  onAprovador: (v: string) => void;
  pin: string;
  onPin: (v: string) => void;
  /** Ex.: "Desconto acima de R$ 5,00 precisa de um gerente." */
  explicacao?: string;
};

const PERFIS_APROVAM = new Set(["ROOT", "ADMIN", "GERENTE"]);

/**
 * Aprovação por PIN de um gerente. O servidor exige `aprovador_id` + `pin`.
 * Lista os gerentes por `GET /aprovadores` (pedido ao servidor) e, enquanto essa rota não existe,
 * tenta `GET /usuarios`; se o perfil não puder listar, cai no campo com o número do gerente.
 */
export default function CampoAprovacao({ aprovadorId, onAprovador, pin, onPin, explicacao }: Props) {
  const [aprovadores, setAprovadores] = useState<Aprovador[] | null>(null);
  const idPin = useId();

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = (await api("/aprovadores")) as Aprovador[];
        if (vivo) setAprovadores(lista);
        return;
      } catch {
        /* rota ainda não existe */
      }
      try {
        const us = (await api("/usuarios?ativos=1")) as { id: number; nome: string; tipo_usuario: string }[];
        if (vivo) setAprovadores(us.filter((u) => PERFIS_APROVAM.has(u.tipo_usuario)));
      } catch {
        if (vivo) setAprovadores([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <fieldset className="campo-aprovacao">
      <legend>Aprovação do gerente</legend>
      {explicacao ? <p className="ajuda">{explicacao}</p> : null}
      {aprovadores && aprovadores.length > 0 ? (
        <label className="campo">
          <span>Gerente que aprova</span>
          <select value={aprovadorId} onChange={(e) => onAprovador(e.target.value)}>
            <option value="">Escolha…</option>
            {aprovadores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="campo">
          <span>Nº do gerente (aparece em Usuários)</span>
          <input
            value={aprovadorId}
            onChange={(e) => onAprovador(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ex.: 2"
          />
        </label>
      )}
      <label className="campo" htmlFor={idPin}>
        <span>PIN do gerente</span>
        <input
          id={idPin}
          type="password"
          value={pin}
          onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          // "off" é ignorado em campo de senha; "one-time-code" faz o navegador não oferecer salvar o PIN
          autoComplete="one-time-code"
          name="pin-aprovacao"
          data-lpignore="true"
          data-1p-ignore="true"
          maxLength={8}
        />
      </label>
    </fieldset>
  );
}
