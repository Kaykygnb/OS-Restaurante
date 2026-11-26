import { test } from "node:test";
import assert from "node:assert/strict";
import { montarCupomProducao, formatarDinheiroEscpos } from "../src/impressao/escpos.js";

/** Espelha destino.deveImprimirAgora — puro, sem Prisma. */
function deveImprimirAgora(
  modo: string | undefined | null,
  disparo: "automatico" | "manual"
): boolean {
  if (!modo || modo === "NUNCA") return false;
  if (modo === "MANUAL") return disparo === "manual";
  return true;
}

test("modo NUNCA nunca imprime; MANUAL só no disparo manual", () => {
  assert.equal(deveImprimirAgora("NUNCA", "automatico"), false);
  assert.equal(deveImprimirAgora("NUNCA", "manual"), false);
  assert.equal(deveImprimirAgora("MANUAL", "automatico"), false);
  assert.equal(deveImprimirAgora("MANUAL", "manual"), true);
  assert.equal(deveImprimirAgora("AUTOMATICO", "automatico"), true);
});

test("cupom cancelamento e reimpressao têm marcas no payload", () => {
  const cancel = montarCupomProducao({
    colunas: 32,
    codigo_pedido: "PD1",
    codigo_atendimento: "AT1",
    cancelamento: true,
    motivo_cancelamento: "cliente desistiu",
    cancelado_por: "Ana",
    itens: [{ nome: "Pastel", quantidade: 1 }],
  });
  assert.match(cancel.toString("latin1"), /CANCELADO/);

  const reimp = montarCupomProducao({
    colunas: 32,
    codigo_pedido: "PD1",
    codigo_atendimento: "AT1",
    reimpressao: true,
    hora_original: new Date("2026-01-01T12:00:00"),
    itens: [{ nome: "Pastel", quantidade: 1 }],
  });
  assert.match(reimp.toString("latin1"), /REIMPRESSAO/);
});

test("dinheiro no cupom sem NBSP", () => {
  assert.equal(formatarDinheiroEscpos(1050), "R$ 10,50");
});
