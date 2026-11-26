type Props = { erro?: string; ok?: string; avisos?: string[] };

/** Faixa de erro/sucesso com papel acessível (leitor de tela anuncia). */
export default function Avisos({ erro, ok, avisos }: Props) {
  return (
    <>
      {erro ? (
        <p className="feedback-card feedback-erro" role="alert">
          {erro}
        </p>
      ) : null}
      {ok ? (
        <p className="feedback-card feedback-ok" role="status">
          {ok}
        </p>
      ) : null}
      {avisos?.map((a) => (
        <p key={a} className="feedback-card config-aviso-ip" role="status">
          {a}
        </p>
      ))}
    </>
  );
}
