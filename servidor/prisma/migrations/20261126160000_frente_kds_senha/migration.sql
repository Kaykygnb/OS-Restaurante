ALTER TABLE "Configuracao" ADD COLUMN "kds_atraso_min" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Atendimento" ADD COLUMN "dia_operacao" TEXT;
ALTER TABLE "Impressora" ADD COLUMN "estacao" TEXT;

-- Senha do balcão: um número por dia de operação, sem repetir.
CREATE UNIQUE INDEX "atendimento_senha_balcao_dia" ON "Atendimento"("dia_operacao", "numero_dia")
  WHERE "tipo_atendimento" = 'BALCAO' AND "numero_dia" IS NOT NULL;
