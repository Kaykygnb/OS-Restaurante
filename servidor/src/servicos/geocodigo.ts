import { prisma } from "../db.js";
import { arredondarCoord } from "../dominio/geo.js";
import { normalizarNome, soDigitos } from "../util/texto.js";

const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;
const AGENTE = "OS-Restaurante/1.0 (pdv-offline)";
let ultimoNominatim = 0;

async function buscar(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": AGENTE, Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("rede");
    return await res.json();
  } catch {
    throw Object.assign(new Error("sem internet"), { codigo: "sem_internet" });
  } finally {
    clearTimeout(timer);
  }
}

export async function consultarCep(cepBruto: string) {
  const cep = soDigitos(cepBruto);
  if (cep.length !== 8) return { status: 400 as const, codigo: "cep_invalido" };
  const cache = await prisma.cache_cep.findUnique({ where: { cep } });
  if (cache && Date.now() - cache.atualizado_em.getTime() < NOVENTA_DIAS) {
    const dados = JSON.parse(cache.dados) as { logradouro: string; bairro: string; cidade: string; uf: string };
    return { status: 200 as const, corpo: { fonte: "cache" as const, cep, ...dados } };
  }
  try {
    const json = (await buscar(`https://viacep.com.br/ws/${cep}/json/`, 3000)) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    } | null;
    if (!json || json.erro) return { status: 404 as const, codigo: "cep_nao_encontrado" };
    const dados = {
      logradouro: json.logradouro ?? "",
      bairro: json.bairro ?? "",
      cidade: json.localidade ?? "",
      uf: json.uf ?? "",
    };
    await prisma.cache_cep.upsert({
      where: { cep },
      create: { cep, dados: JSON.stringify(dados) },
      update: { dados: JSON.stringify(dados), atualizado_em: new Date() },
    });
    return { status: 200 as const, corpo: { fonte: "viacep" as const, cep, ...dados } };
  } catch {
    return { status: 503 as const, codigo: "sem_internet" };
  }
}

export async function geocodificarEndereco(endereco: {
  logradouro: string;
  numero?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}) {
  const chave = normalizarNome(
    [endereco.logradouro, endereco.numero ?? "", endereco.bairro, endereco.cidade, endereco.uf].join(" ")
  );
  const cache = await prisma.cache_geo.findUnique({ where: { chave } });
  if (cache && Date.now() - cache.atualizado_em.getTime() < NOVENTA_DIAS) {
    return { lat: cache.lat, lng: cache.lng, fonte: "cache" as const, precisao: cache.precisao };
  }
  const espera = 1000 - (Date.now() - ultimoNominatim);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimoNominatim = Date.now();
  const q = [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.uf, "Brasil"]
    .filter(Boolean)
    .join(", ");
  try {
    const json = (await buscar(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,
      3000
    )) as { lat?: string; lon?: string; addresstype?: string; type?: string }[] | null;
    const primeiro = json?.[0];
    if (!primeiro?.lat || !primeiro.lon) return null;
    const lat = arredondarCoord(Number(primeiro.lat));
    const lng = arredondarCoord(Number(primeiro.lon));
    const tipo = primeiro.addresstype || primeiro.type || "";
    const precisao = /house|building|address/.test(tipo) ? "numero" : /road|street/.test(tipo) ? "rua" : "bairro";
    await prisma.cache_geo.upsert({
      where: { chave },
      create: { chave, lat, lng, precisao },
      update: { lat, lng, precisao, atualizado_em: new Date() },
    });
    return { lat, lng, fonte: "nominatim" as const, precisao };
  } catch (err) {
    if ((err as { codigo?: string }).codigo === "sem_internet") throw err;
    return null;
  }
}

export async function geocodificarOuFalhar(endereco: {
  logradouro: string;
  numero?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}) {
  const chave = normalizarNome(
    [endereco.logradouro, endereco.numero ?? "", endereco.bairro, endereco.cidade, endereco.uf].join(" ")
  );
  const cache = await prisma.cache_geo.findUnique({ where: { chave } });
  if (cache && Date.now() - cache.atualizado_em.getTime() < NOVENTA_DIAS) {
    return {
      status: 200 as const,
      corpo: { lat: cache.lat, lng: cache.lng, fonte: "cache" as const, precisao: cache.precisao },
    };
  }
  try {
    const geo = await geocodificarEndereco(endereco);
    if (!geo) return { status: 404 as const, codigo: "nao_localizado" };
    return { status: 200 as const, corpo: geo };
  } catch {
    return { status: 503 as const, codigo: "sem_internet" };
  }
}
