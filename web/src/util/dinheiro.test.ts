import { test } from "node:test";
import assert from "node:assert/strict";
import { reaisParaCentavos, formatarReaisCupom } from "./dinheiro.ts";

test(' "1.250" é milhar → R$ 1.250,00 (125000 centavos)', () => {
  assert.equal(reaisParaCentavos("1.250"), 125000);
});

test(' "1.250,00" → 125000', () => {
  assert.equal(reaisParaCentavos("1.250,00"), 125000);
});

test(' "12,50" → 1250', () => {
  assert.equal(reaisParaCentavos("12,50"), 1250);
});

test(' "12.50" (ponto decimal) → 1250', () => {
  assert.equal(reaisParaCentavos("12.50"), 1250);
});

test("formatarReaisCupom sem NBSP", () => {
  const s = formatarReaisCupom(1050);
  assert.equal(s, "R$ 10,50");
  assert.ok(!s.includes("\u00a0"));
});
