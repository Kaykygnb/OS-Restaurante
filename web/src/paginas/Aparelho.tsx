import Formulario from "../componentes/Formulario";
import { useState } from "react";
import { Faixa } from "../componentes/ui/Estados";
import { useSistema } from "../estado/sistema-ctx";
import { lerNomeAparelho, salvarNomeAparelho } from "../util/terminal";

/**
 * "Nome deste aparelho" (decisão do Kayky): fica só neste navegador (localStorage) e vai em toda
 * chamada no cabeçalho X-Terminal, para a auditoria saber de qual PC ou celular veio cada ação.
 */
export default function Aparelho() {
  const [nome, setNome] = useState(lerNomeAparelho);
  const [salvo, setSalvo] = useState(lerNomeAparelho);
  const { avisar } = useSistema();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    salvarNomeAparelho(nome);
    setSalvo(lerNomeAparelho());
    avisar(nome.trim() ? `Aparelho salvo como “${nome.trim()}”.` : "Nome do aparelho apagado.", "ok");
  }

  return (
    <Formulario className="cartao pilha" style={{ maxWidth: 560 }} onSubmit={salvar}>
      <h2>Nome deste aparelho</h2>
      <p className="muted" style={{ margin: 0 }}>
        Aparece na auditoria ao lado de cada ação (ex.: “Caixa”, “Tablet da cozinha”, “Celular do Zé”). Vale só para este aparelho e este navegador.
      </p>
      {!salvo ? <Faixa tom="warn" titulo="Este aparelho ainda não tem nome.">Sem nome, a auditoria mostra só o endereço de rede.</Faixa> : null}
      <label className="fld">
        <span>Nome deste aparelho</span>
        <input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Caixa da frente" />
        <span className="dica">Até 40 letras. Use nomes que a equipe reconhece.</span>
      </label>
      <div>
        <button className="btn btn-pri" disabled={nome.trim() === salvo}>
          Salvar
        </button>
      </div>
    </Formulario>
  );
}
