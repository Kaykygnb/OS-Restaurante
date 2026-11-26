/** Ícones de traço simples (24×24), os mesmos das pranchas. Sempre ao lado de um texto. */
const IC = {
  inicio: ["M4 11 L12 4 L20 11", "M6 10 V20 H18 V10"],
  venda: ["M4 7 h16 v12 h-16 Z", "M4 11 h16", "M8 15 h3"],
  mesas: ["M4 9 h16", "M7 9 v10", "M17 9 v10", "M6 5 h12"],
  delivery: ["M3 7 h11 v9 h-11 Z", "M14 10 h4 l3 3 v3 h-7", "M7 18 a1.6 1.6 0 1 0 0.01 0", "M17 18 a1.6 1.6 0 1 0 0.01 0"],
  clientes: ["M9 8 a3 3 0 1 0 0.01 0", "M3.5 19 c1-4 10-4 11 0", "M16 6 a2.5 2.5 0 1 1 0 5", "M17 14 c2.5 .5 3.5 2.5 3.5 5"],
  cozinha: ["M6 4 v6 a3 3 0 0 0 6 0 v-6", "M9 4 v16", "M16 4 c3 2 3 8 0 9 v7"],
  caixa: ["M3 8 h18 v11 h-18 Z", "M7 4 h10 v4", "M12 12 v3", "M3 13 h18"],
  cardapio: ["M5 4 h11 l3 3 v13 h-14 Z", "M8 9 h8", "M8 13 h8", "M8 17 h5"],
  promo: ["M4 12 L12 4 h8 v8 L12 20 Z", "M16 8 a1 1 0 1 0 0.01 0"],
  relatorio: ["M5 20 V4", "M5 20 h15", "M9 16 v-5", "M13 16 v-9", "M17 16 v-3"],
  usuarios: ["M12 8 a3.5 3.5 0 1 0 0.01 0", "M5 20 c1-5 13-5 14 0"],
  config: ["M12 9 a3 3 0 1 0 0.01 0", "M12 3 v3", "M12 18 v3", "M3 12 h3", "M18 12 h3", "M5.6 5.6 l2.1 2.1", "M16.3 16.3 l2.1 2.1", "M5.6 18.4 l2.1 -2.1", "M16.3 7.7 l2.1 -2.1"],
  impressora: ["M7 4 h10 v5 h-10 Z", "M4 9 h16 v7 h-16 Z", "M7 14 h10 v6 h-10 Z"],
  lupa: ["M10.5 4 a6.5 6.5 0 1 0 0.01 0", "M20 20 l-4.8 -4.8"],
  mais: ["M12 5 v14", "M5 12 h14"],
  menos: ["M5 12 h14"],
  x: ["M6 6 L18 18", "M18 6 L6 18"],
  check: ["M5 12.5 L10 17 L19 7"],
  alerta: ["M12 4 L21 19 H3 Z", "M12 10 v4", "M12 16.8 v.2"],
  info: ["M12 3.5 a8.5 8.5 0 1 0 0.01 0", "M12 11 v5", "M12 7.8 v.2"],
  voltar: ["M19 12 H5", "M11 6 l-6 6 l6 6"],
  menu: ["M4 7 h16", "M4 12 h16", "M4 17 h16"],
  telefone: ["M6 3 h4 l1.5 5 l-2.5 1.5 a11 11 0 0 0 5.5 5.5 l1.5 -2.5 l5 1.5 v4 a2 2 0 0 1 -2 2 A16 16 0 0 1 4 5 a2 2 0 0 1 2 -2"],
  pin: ["M12 21 c-5-6-7-9-7-12 a7 7 0 0 1 14 0 c0 3-2 6-7 12", "M12 9 a2 2 0 1 0 0.01 0"],
  semwifi: ["M2 9 a15 15 0 0 1 20 0", "M5 12.5 a10 10 0 0 1 14 0", "M8.5 16 a5 5 0 0 1 7 0", "M3 3 L21 21"],
  gaveta: ["M3 6 h18 v12 h-18 Z", "M3 11 h18", "M10 14.5 h4"],
  dinheiro: ["M3 7 h18 v10 h-18 Z", "M12 9.5 a2.5 2.5 0 1 0 0.01 0"],
  cartao: ["M3 6 h18 v12 h-18 Z", "M3 10 h18", "M6 15 h4"],
  pix: ["M12 3 L21 12 L12 21 L3 12 Z", "M8 12 h8"],
  lapis: ["M4 20 h4 L19 9 a2.1 2.1 0 0 0 -3 -3 L5 17 Z"],
  sair: ["M10 4 H5 v16 h5", "M14 8 l4 4 l-4 4", "M18 12 H9"],
  estoque: ["M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z", "M4 8 L12 12 L20 8", "M12 12 V20"],
  auditoria: ["M12 3 L20 6 V12 c0 5-4 8-8 9 c-4-1-8-4-8-9 V6 Z", "M9 12 l2 2 l4 -4"],
  reimprimir: ["M7 4 h10 v5 h-10 Z", "M4 9 h16 v7 h-3", "M7 16 h-3", "M9 14 h6 v6 h-6 Z"],
  qr: ["M4 4 h6 v6 h-6 Z", "M14 4 h6 v6 h-6 Z", "M4 14 h6 v6 h-6 Z", "M14 14 h2 v2 h-2 Z", "M18 18 h2 v2 h-2 Z", "M14 18 h2", "M18 14 h2"],
  aparelho: ["M7 3 h10 v18 h-10 Z", "M11 18 h2"],
} as const;

export type NomeIcone = keyof typeof IC;

export default function Icone({ nome, tam = 20, cor = "currentColor" }: { nome: NomeIcone; tam?: number; cor?: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {IC[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
