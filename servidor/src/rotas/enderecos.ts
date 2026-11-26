import type { FastifyInstance } from "fastify";
import { soTipos } from "../permissoes.js";
import { consultarCep, geocodificarOuFalhar } from "../servicos/geocodigo.js";

export async function rotasEnderecos(app: FastifyInstance) {
  const authOps = { onRequest: [(app as any).autenticar, soTipos("ROOT", "ADMIN", "GERENTE", "ATENDENTE")] };

  app.get("/enderecos/cep/:cep", authOps, async (req, reply) => {
    const r = await consultarCep(String((req.params as any).cep ?? ""));
    if (r.status === 200) return r.corpo;
    const textos: Record<string, string> = {
      cep_invalido: "CEP inválido.",
      cep_nao_encontrado: "CEP não encontrado.",
      sem_internet: "Sem internet. Siga com o cadastro manual.",
    };
    return reply.code(r.status).send({ erro: textos[r.codigo] ?? "Falha no CEP", codigo: r.codigo });
  });

  app.post("/enderecos/geocodificar", authOps, async (req, reply) => {
    const body = req.body as { logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string };
    if (!body.logradouro || !body.bairro || !body.cidade || !body.uf) {
      return reply.code(400).send({ erro: "Informe rua, bairro, cidade e UF.", codigo: "endereco_invalido" });
    }
    const r = await geocodificarOuFalhar({
      logradouro: body.logradouro,
      numero: body.numero ?? null,
      bairro: body.bairro,
      cidade: body.cidade,
      uf: body.uf,
    });
    if (r.status === 200) return r.corpo;
    const erro = r.codigo === "sem_internet" ? "Sem internet. Siga com o cadastro manual." : "Endereço não localizado.";
    return reply.code(r.status).send({ erro, codigo: r.codigo });
  });
}
