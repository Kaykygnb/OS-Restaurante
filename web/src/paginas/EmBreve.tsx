type Props = { nome: string };

export default function EmBreve({ nome }: Props) {
  return (
    <section className="atalho" style={{ maxWidth: 480 }}>
      <strong>{nome}</strong>
      <span>Em breve — tela ainda não implementada.</span>
    </section>
  );
}
