-- AlterTable
ALTER TABLE "Trabalho_impressao" ADD COLUMN "proxima_tentativa_em" DATETIME;

-- AlterTable
ALTER TABLE "Pagamento" ADD COLUMN "estornado_em" DATETIME;
ALTER TABLE "Pagamento" ADD COLUMN "estorno_motivo" TEXT;
ALTER TABLE "Pagamento" ADD COLUMN "estorno_usuario_id" INTEGER;
ALTER TABLE "Pagamento" ADD COLUMN "estorno_aprovador_id" INTEGER;

-- CreateTable
CREATE TABLE "Requisicao_idempotente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chave" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "resposta_json" TEXT NOT NULL,
    "status_http" INTEGER NOT NULL,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Requisicao_idempotente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Requisicao_idempotente_chave_usuario_id_rota_key" ON "Requisicao_idempotente"("chave", "usuario_id", "rota");

-- Uma mesa só pode ter um atendimento ABERTO
CREATE UNIQUE INDEX "atendimento_mesa_aberta_unica" ON "Atendimento"("mesa_id") WHERE "status" = 'ABERTO' AND "mesa_id" IS NOT NULL;
