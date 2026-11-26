-- AlterTable Configuracao
ALTER TABLE "Configuracao" ADD COLUMN "impressora_padrao_id" INTEGER;
ALTER TABLE "Configuracao" ADD COLUMN "impressora_producao_id" INTEGER;
ALTER TABLE "Configuracao" ADD COLUMN "usa_tela_cozinha" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Categoria
ALTER TABLE "Categoria" ADD COLUMN "nao_imprime" BOOLEAN NOT NULL DEFAULT false;

-- Recreate enum Tipo_documento_impressao (SQLite: new table pattern via string columns — Prisma uses TEXT)
-- AlterTable Impressora
ALTER TABLE "Impressora" ADD COLUMN "apita" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Impressora" ADD COLUMN "tamanho_letra_producao" TEXT NOT NULL DEFAULT 'GRANDE';
ALTER TABLE "Impressora" ADD COLUMN "impressora_reserva_id" INTEGER;

-- AlterTable Trabalho_impressao
ALTER TABLE "Trabalho_impressao" ADD COLUMN "via_numero" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Trabalho_impressao" ADD COLUMN "documento_origem_id" INTEGER;

-- CreateTable Config_documento
CREATE TABLE "Config_documento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'AUTOMATICO',
    "vias" INTEGER NOT NULL DEFAULT 1,
    "abre_gaveta" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Config_documento_tipo_key" ON "Config_documento"("tipo");

-- Seed documentos padrão
INSERT INTO "Config_documento" ("tipo", "modo", "vias", "abre_gaveta", "updatedAt") VALUES
  ('PRODUCAO', 'AUTOMATICO', 1, false, CURRENT_TIMESTAMP),
  ('CANCELAMENTO', 'AUTOMATICO', 1, false, CURRENT_TIMESTAMP),
  ('REIMPRESSAO', 'MANUAL', 1, false, CURRENT_TIMESTAMP),
  ('CONTA', 'MANUAL', 1, false, CURRENT_TIMESTAMP),
  ('COMPROVANTE', 'AUTOMATICO', 1, true, CURRENT_TIMESTAMP),
  ('RELATORIO_CAIXA', 'AUTOMATICO', 1, true, CURRENT_TIMESTAMP);
