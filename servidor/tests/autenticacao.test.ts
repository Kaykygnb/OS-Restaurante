import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { criarAutenticador } from "../src/autenticacao.js";
import { soTipos } from "../src/permissoes.js";

for (const caso of [
  { nome: "bloqueia usuário desativado", ativo: false, tipo: "ADMIN", status: 401 },
  { nome: "aplica rebaixamento de perfil ao token antigo", ativo: true, tipo: "ATENDENTE", status: 403 },
  { nome: "permite administrador ativo", ativo: true, tipo: "ADMIN", status: 200 },
  { nome: "bloqueia usuário excluído", ativo: true, tipo: "ADMIN", ausente: true, status: 401 },
]) {
  test(caso.nome, async (t) => {
    const app = Fastify();
    t.after(() => app.close());
    await app.register(jwt, { secret: "segredo-exclusivo-dos-testes" });
    const autenticar = criarAutenticador({ usuario: {
      async findUnique() {
        return caso.ausente ? null : { id: 1, ativo: caso.ativo, tipo_usuario: caso.tipo };
      },
    } });
    app.get("/protegida", { onRequest: [autenticar, soTipos("ADMIN")] }, async () => ({ ok: true }));
    const token = app.jwt.sign({ id: 1, tipo: "ADMIN" });
    const resposta = await app.inject({ url: "/protegida", headers: { authorization: `Bearer ${token}` } });
    assert.equal(resposta.statusCode, caso.status);
    assert.equal((await app.inject({ url: "/protegida" })).statusCode, 401);
    const invalido = app.jwt.sign({ id: "1", tipo: "ADMIN" });
    assert.equal((await app.inject({ url: "/protegida", headers: { authorization: `Bearer ${invalido}` } })).statusCode, 401);
  });
}
