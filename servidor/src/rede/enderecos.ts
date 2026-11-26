import os from "node:os";

const VIRTUAL =
  /^(lo|docker\d*|br-|veth|virbr|vmnet|vboxnet|cni|flannel|tunl|tun|tap|zt|tailscale|nerdctl|podman|cni-|kube)/i;

export function ehIpv4Local(ip: string) {
  if (ip.startsWith("127.") || ip.startsWith("0.") || ip.startsWith("169.254.")) return false;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const bloco = /^172\.(\d+)\./.exec(ip);
  if (!bloco) return false;
  const segundo = Number(bloco[1]);
  return segundo >= 16 && segundo <= 31;
}

export function listarEnderecosLocais() {
  const redes = os.networkInterfaces();
  const enderecos: { ip: string; interface: string }[] = [];
  for (const [nome, lista] of Object.entries(redes)) {
    if (!lista || VIRTUAL.test(nome)) continue;
    for (const endereco of lista) {
      const familia = String(endereco.family);
      if (familia !== "IPv4" && familia !== "4") continue;
      if (endereco.internal || !ehIpv4Local(endereco.address)) continue;
      enderecos.push({ ip: endereco.address, interface: nome });
    }
  }
  return enderecos;
}

export function portaConfigurada() {
  const porta = Number(process.env.PORT ?? 3333);
  return Number.isInteger(porta) && porta > 0 && porta < 65536 ? porta : 3333;
}

export function urlsDeConexao(ip: string, porta: number, nome: string) {
  const nomeUrl = encodeURIComponent(nome);
  return {
    url_web: `http://${ip}:${porta}/`,
    url_app: `osrestaurante://conectar?host=${ip}&porta=${porta}&nome=${nomeUrl}`,
  };
}
