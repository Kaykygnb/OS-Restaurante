import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { ErroCarga, Faixa, Carregando } from "../../componentes/ui/Estados";
import Icone from "../../componentes/ui/Icone";
import { lerConexaoRede, saude } from "../../servicos/rotas";
import type { ApiErro } from "../../servicos/api";
import type { ConexaoRede } from "../../servicos/contratos";
import { temUrls, urlApp, urlWeb } from "../../util/conexao";

/** QR gerado no próprio navegador (lib qrcode), sem internet. */
function Qr({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(texto, { width: 560, margin: 2, errorCorrectionLevel: "M" })
      .then((u) => vivo && setSrc(u))
      .catch(() => vivo && setSrc(""));
    return () => {
      vivo = false;
    };
  }, [texto]);
  return src ? <img className="qr-img" src={src} alt={`QR: ${rotulo}`} /> : <div className="qr-img esqueleto" aria-label="Gerando QR" />;
}

/**
 * Prancha 16 · Conectar celulares (gerente para cima). Dois QRs: navegador (url_web) e app Android (url_app).
 * O QR não leva senha nem token; cada pessoa entra com o próprio usuário.
 */
export default function ConectarCelulares() {
  const [con, setCon] = useState<ConexaoRede | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [ip, setIp] = useState("");

  const carregar = useCallback(() => {
    lerConexaoRede()
      .then((c) => {
        setCon(c);
        setErro("");
        setIp((atual) => (c.enderecos.some((e) => e.ip === atual) ? atual : (c.enderecos[0]?.ip ?? "")));
      })
      .catch((e: ApiErro) => setErro(e.status === 403 ? "Só gerente para cima vê esta tela." : e.message));
    saude()
      .then((s) => setNome(s.nome_restaurante ?? ""))
      .catch(() => undefined);
  }, []);
  useEffect(carregar, [carregar]);

  if (erro) return <ErroCarga mensagem={erro} onTentar={carregar} />;
  if (!con) return <Carregando linhas={3} rotulo="Buscando o endereço deste computador…" />;
  if (!temUrls(con))
    return (
      <div className="pilha" style={{ gap: 16 }}>
        <Faixa
          tom="err"
          titulo="Este computador não está numa rede local"
          acao={
            <button type="button" className="btn" onClick={carregar}>
              Tentar de novo
            </button>
          }
        >
          Não achamos um endereço de rede (Wi-Fi ou cabo) neste PC, então não dá para gerar o QR. Ligue o Wi-Fi ou o cabo de rede do PC do caixa, no mesmo roteador dos celulares, e toque em “Tentar de novo”.
        </Faixa>
        <p className="muted pequeno" style={{ margin: 0 }}>
          Endereços de VPN, Docker e máquina virtual ficam de fora de propósito: o celular não alcança esses endereços.
        </p>
      </div>
    );

  const web = urlWeb(con, ip);
  const app = urlApp(con, ip);
  function imprimir() {
    window.print();
  }

  return (
    <div className="pilha conectar" style={{ gap: 16 }}>
      <Faixa tom="info" titulo="O celular precisa estar no mesmo Wi-Fi deste computador">
        Comece pelo QR do navegador. Depois cada pessoa entra com o próprio usuário e senha: o QR não leva senha.
      </Faixa>

      {con.enderecos.length > 1 ? (
        <div className="fld" style={{ maxWidth: 420 }}>
          <label htmlFor="ip-rede">Este PC tem mais de uma rede. Qual o celular usa?</label>
          <select id="ip-rede" value={ip} onChange={(e) => setIp(e.target.value)}>
            {con.enderecos.map((e) => (
              <option key={e.ip} value={e.ip}>
                {e.interface} · {e.ip}
              </option>
            ))}
          </select>
          <span className="dica">Escolha a rede do Wi-Fi da equipe. Os dois QRs mudam juntos.</span>
        </div>
      ) : null}

      <div className="area-impressao">
        <div className="so-impressao qr-cabecalho">
          <strong>{nome || "OS Restaurante"}</strong>
          <span>Conecte o celular no Wi-Fi da equipe e leia um dos QRs.</span>
        </div>
        <div className="grade-2 qr-grade">
          <section className="cartao qr-cartao">
            <h2>
              <Icone nome="aparelho" /> Pelo navegador
            </h2>
            <p className="muted">iPhone ou qualquer celular. Abre a página do restaurante no navegador.</p>
            <Qr texto={web} rotulo="abrir no navegador" />
            <p className="qr-endereco">{web}</p>
            <p className="pequeno muted">Sem câmera? Digite este endereço no navegador. No iPhone: Compartilhar › Adicionar à Tela de Início.</p>
          </section>
          <details className="cartao qr-cartao"><summary>Alternativa: aplicativo Android já instalado</summary>
            <h2>
              <Icone nome="aparelho" /> App Android
            </h2>
            <p className="muted">Abra o app OS Restaurante e toque em “Ler QR”. Ele configura o servidor sozinho.</p>
            <Qr texto={app} rotulo="configurar o app Android" />
            <p className="qr-endereco">
              IP {ip} · porta {con.porta}
            </p>
            <p className="pequeno muted">Sem câmera? No app, toque em “Digitar endereço” e use o IP e a porta acima.</p>
          </details>
        </div>
      </div>

      <div className="linha" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-pri btn-g" onClick={imprimir}>
          <Icone nome="impressora" /> Imprimir QR
        </button>
        <span className="muted pequeno">Para colar no balcão ou na cozinha. Se o IP do PC mudar, imprima de novo.</span>
      </div>

      <div className="grade-2">
        <Faixa tom="warn" titulo="Fixe o IP deste PC no roteador">
          Se o roteador trocar o IP (depois de reiniciar, por exemplo), o QR impresso para de funcionar. No roteador, procure “DHCP estático” ou “reserva de IP” e reserve {ip} para este PC.
        </Faixa>
        <Faixa tom="info" titulo="Dica: rede só da equipe">
          Use uma rede Wi-Fi só para a equipe, separada da dos clientes.
        </Faixa>
      </div>
    </div>
  );
}
