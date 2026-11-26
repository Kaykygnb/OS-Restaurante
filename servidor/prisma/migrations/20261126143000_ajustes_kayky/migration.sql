-- Ajustes do dono: permissão de caixa e contagem do fechamento cego.
ALTER TABLE "Usuario" ADD COLUMN "pode_operar_caixa" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Usuario" SET "pode_operar_caixa" = 1 WHERE "tipo_usuario" IN ('ROOT', 'ADMIN', 'GERENTE');

ALTER TABLE "Caixa_sessao" ADD COLUMN "contagem_json" TEXT;
