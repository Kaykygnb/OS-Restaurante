import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { montarHarness, abrirContaComItem, type Harness } from "./helpers/harness.js";
let h: Harness; let categoria: number;
before(async () => { h = await montarHarness(); categoria = (await h.prisma.categoria.findFirstOrThrow()).id; });
after(async () => { await h?.limpar(); });
const grupo = () => ({ nome: "Molho", min_escolhas: 0, max_escolhas: 1, permite_repetir: false, opcoes: [{ nome: "Pimenta", preco_extra_centavos: 100 }, { nome: "Alho", preco_extra_centavos: 0 }] });
const cadastro = () => ({ nome: "Pastel integração", categoria_id: categoria, exige_preparo: true, variantes: [{ nome: "Duplo", preco_centavos: 2500, grupos: [grupo()] }, { nome: "Individual", preco_centavos: 1550, grupos: [grupo()] }] });
const chamar = (method: "POST" | "PUT", url: string, payload: unknown) => h.app.inject({ method, url, headers: { authorization: `Bearer ${h.token}` }, payload: payload as object });
test("cadastro agregado preserva IDs, desativa removidos e calcula menor preço", async () => {
  const r = await chamar("POST", "/produtos/cadastro", cadastro()); assert.equal(r.statusCode,201,r.body); const p = r.json();
  const [v, removida] = p.produto_variantes; const g = v.grupos_escolhas[0]; const o = g.opcoes_escolha[0];
  const cardapio = (await h.app.inject({ method:"GET", url:"/cardapio/pdv", headers:{authorization:`Bearer ${h.token}`} })).json();
  assert.equal(cardapio.flatMap((c: any) => c.produtos).find((x: any) => x.id === p.id).preco_desde_centavos,1550);
  const editado = { ...cadastro(), nome:"Pastel editado", variantes:[{ id:v.id,nome:v.nome,preco_centavos:2700,grupos:[{ ...grupo(), id:g.id,opcoes:[{ id:o.id,nome:"Pimenta suave",preco_extra_centavos:200 }] }] }] };
  const u = await chamar("PUT", `/produtos/${p.id}/cadastro`,editado); assert.equal(u.statusCode,200,u.body);
  assert.equal(u.json().produto_variantes[0].id,v.id); assert.equal(u.json().produto_variantes[0].grupos_escolhas[0].id,g.id); assert.equal(u.json().produto_variantes[0].grupos_escolhas[0].opcoes_escolha[0].id,o.id);
  assert.equal((await h.prisma.produto_variante.findUniqueOrThrow({where:{id:removida.id}})).ativo,false);
  assert.equal((await h.prisma.opcao_escolha.findUniqueOrThrow({where:{id:g.opcoes_escolha[1].id}})).ativo,false);
});
test("falha de propriedade reverte toda a transação", async () => {
  const antes = await h.prisma.produto.count(); const corpo = cadastro(); corpo.nome="Não deve existir"; Object.assign(corpo.variantes[1],{id:h.varianteId});
  const r=await chamar("POST","/produtos/cadastro",corpo); assert.equal(r.statusCode,400,r.body); assert.equal(await h.prisma.produto.count(),antes);
});
test("corpos inválidos recebem erro visível e atendente não grava", async () => {
  for (const payload of [{...cadastro(),variantes:[null]},{...cadastro(),descricao:12},{...cadastro(),variantes:[{...cadastro().variantes[0],preco_centavos:-1}]}]) assert.equal((await chamar("POST","/produtos/cadastro",payload)).statusCode,400);
  const usuario=await h.prisma.usuario.create({data:{nome:"Atendente",login:"atendente_cadastro",tipo_usuario:"ATENDENTE",senha_hash:"teste"}}); const token=h.app.jwt.sign({id:usuario.id,tipo:"ATENDENTE"}); const r=await h.app.inject({method:"POST",url:"/produtos/cadastro",headers:{authorization:`Bearer ${token}`},payload:cadastro()}); assert.equal(r.statusCode,403);
});

test("recebimento parcial, troco, estorno e cancelamento da linha inteira em SQLite isolado", async () => {
 const {atendimentoId,pedidoId}=await abrirContaComItem(h,1900); await h.prisma.atendimento.update({where:{id:atendimentoId},data:{taxa_servico_aplicada:false}});
 const item=await h.prisma.pedido_item.findFirstOrThrow({where:{pedido_id:pedidoId}}); await h.prisma.pedido_item.update({where:{id:item.id},data:{quantidade:2}});
 const r=await chamar("POST",`/atendimentos/${atendimentoId}/pagamentos`,{forma_pagamento_id:h.formaDinheiroId,valor_centavos:1000,valor_recebido_centavos:2000}); assert.equal(r.statusCode,201,r.body);
 const pagamento=await h.prisma.pagamento.findFirstOrThrow({where:{atendimento_id:atendimentoId}}); assert.equal(pagamento.troco_centavos,1000);
 const detalhe=()=>h.app.inject({url:`/atendimentos/${atendimentoId}`,headers:{authorization:`Bearer ${h.token}`}}); assert.equal((await detalhe()).json().totais.restante_centavos,2800);
 const estorno=await chamar("POST",`/pagamentos/${pagamento.id}/estornar`,{motivo:"Teste de devolução"}); assert.equal(estorno.statusCode,200,estorno.body); assert.equal((await detalhe()).json().totais.restante_centavos,3800);
 const cancelar=await chamar("POST",`/pedido-itens/${item.id}/cancelar`,{motivo:"Teste de linha inteira"}); assert.equal(cancelar.statusCode,200,cancelar.body);
 const final=await h.prisma.pedido_item.findUniqueOrThrow({where:{id:item.id}}); assert.equal(final.quantidade,2); assert.equal(final.cancelado,true); assert.equal((await detalhe()).json().totais.total_centavos,0);
});

test("fechamento distingue zero de falta e registra divergência aprovada", async () => {
 await h.prisma.atendimento.updateMany({where:{status:"ABERTO"},data:{status:"FECHADO"}});
 const caixa=await h.prisma.caixa_sessao.findFirstOrThrow({where:{aberta:true}}); await h.prisma.caixa_sessao.update({where:{id:caixa.id},data:{fundo_troco_centavos:500}});
 const previa=await h.app.inject({url:"/caixa/previa",headers:{authorization:`Bearer ${h.token}`}}); assert.equal(previa.json().composicao.fundo_centavos,500);
 const contagem=[{forma_pagamento_id:h.formaPixId,valor_centavos:0},{forma_pagamento_id:h.formaDinheiroId,valor_centavos:400}];
 const semMotivo=await chamar("POST",`/caixa/${caixa.id}/fechar`,{contagem}); assert.equal(semMotivo.json().codigo,"motivo_obrigatorio");
 const fechado=await chamar("POST",`/caixa/${caixa.id}/fechar`,{contagem,motivo:"Diferença de teste",aprovacao:{aprovador_id:h.usuarioId,pin:"1234"}}); assert.equal(fechado.statusCode,200,fechado.body);
 assert.equal(fechado.json().formas.find((f:any)=>f.forma_pagamento_id===h.formaDinheiroId).diferenca_centavos,-100); assert.equal((await h.prisma.caixa_sessao.findUniqueOrThrow({where:{id:caixa.id}})).aberta,false);
});
