import { test } from "node:test";
import assert from "node:assert/strict";
import { montarHarness } from "./helpers/harness.js";

test("nível de estoque persiste e produto esgotado é exposto no cardápio e bloqueia pedido", async () => {
  const h = await montarHarness();
  try {
    const headers = { authorization: `Bearer ${h.token}` };
    const cfg = await h.app.inject({ method: "PUT", url: "/api/configuracoes", headers, payload: { estoque_nivel: 1 } });
    assert.equal(cfg.statusCode, 200, cfg.body);
    assert.equal((await h.app.inject({ url: "/api/configuracoes", headers })).json().estoque_nivel, 1);
    assert.equal((await h.app.inject({ method: "PUT", url: "/api/configuracoes", headers, payload: { estoque_nivel: 3 } })).statusCode, 400);
    const variante = await h.prisma.produto_variante.findUniqueOrThrow({ where: { id: h.varianteId } });
    assert.equal((await h.app.inject({ method: "PATCH", url: `/api/produtos/${variante.produto_id}`, headers, payload: { esgotado: "sim" } })).statusCode, 400);
    const marcar = await h.app.inject({ method: "PATCH", url: `/api/produtos/${variante.produto_id}`, headers, payload: { esgotado: true } });
    assert.equal(marcar.statusCode, 200, marcar.body);
    const card = (await h.app.inject({ url: "/api/cardapio/pdv", headers })).json();
    assert.equal(card.flatMap((c: any) => c.produtos).find((p: any) => p.id === variante.produto_id).esgotado, true);
    const at = await h.app.inject({ method: "POST", url: "/api/atendimentos", headers, payload: { tipo_atendimento: "BALCAO" } });
    const pedido = await h.app.inject({ method: "POST", url: `/api/atendimentos/${at.json().id}/pedidos`, headers, payload: { itens: [{ produto_variante_id: h.varianteId, quantidade: 1 }] } });
    assert.equal(pedido.statusCode, 409, pedido.body);
    assert.equal(pedido.json().codigo, "esgotado");
    assert.equal((await h.app.inject({ method: "PATCH", url: `/api/produtos/${variante.produto_id}`, headers, payload: { esgotado: false } })).statusCode, 200);
    assert.equal((await h.prisma.produto.findUniqueOrThrow({ where: { id: variante.produto_id } })).esgotado, false);
    await h.app.inject({ method: "PUT", url: "/api/configuracoes", headers, payload: { estoque_nivel: 2 } });
    await h.prisma.produto.update({ where: { id: variante.produto_id }, data: { controla_estoque: true } });
    for (const movimento of [{ tipo: "ENTRADA", qtd_base: 10 }, { tipo: "CORRECAO", qtd_base: -3, motivo: "Contagem física" }]) {
      const r = await h.app.inject({ method: "POST", url: "/api/estoque/movimentos", headers, payload: { ...movimento, item_id: h.varianteId } });
      assert.equal(r.statusCode, 201, r.body);
    }
    const saldo = (await h.app.inject({ url: "/api/estoque/itens", headers })).json();
    assert.equal(saldo.find((i: any) => i.produto_variante_id === h.varianteId).qtd_base, 7);
    assert.equal((await h.app.inject({ url: `/api/estoque/movimentos?item=${h.varianteId}`, headers })).json().length, 2);
    assert.equal((await h.app.inject({ url: "/api/estoque/verificar", headers })).json().ok, true);
    const criar = await h.app.inject({ method: "POST", url: "/api/promocoes", headers, payload: { nome: "Teste promoção", tipo: "PERCENTUAL", percentual: 10 } });
    assert.equal(criar.statusCode, 201, criar.body);
    const editar = await h.app.inject({ method: "PATCH", url: `/api/promocoes/${criar.json().id}`, headers, payload: { nome: "Promoção editada", percentual: 15, prioridade: 2, acumulavel: true, limite_total: 100, limite_por_atendimento: 2 } });
    assert.equal(editar.statusCode, 200, editar.body);
    assert.equal(editar.json().percentual, 15);
    assert.equal(editar.json().limite_total, 100);
    await h.prisma.usuario.update({ where: { id: h.usuarioId }, data: { nome: "<script>alert(1)</script>" } });
    await h.app.inject({ method: "PATCH", url: `/api/promocoes/${criar.json().id}`, headers, payload: { prioridade: 3 } });
    const impressao = await h.app.inject({ url: "/api/auditoria/imprimir", headers });
    assert.equal(impressao.statusCode, 200);
    assert.ok(!impressao.body.includes("<script>alert(1)</script>"));
  } finally { await h.limpar(); }
});
