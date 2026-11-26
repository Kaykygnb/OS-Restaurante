-- CreateTable
CREATE TABLE "Grupo_adicionais_produto_exclusao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "grupo_adicionais_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    CONSTRAINT "Grupo_adicionais_produto_exclusao_grupo_adicionais_id_fkey" FOREIGN KEY ("grupo_adicionais_id") REFERENCES "Grupo_adicionais" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Grupo_adicionais_produto_exclusao_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_adicionais_produto_exclusao_grupo_adicionais_id_produto_id_key" ON "Grupo_adicionais_produto_exclusao"("grupo_adicionais_id", "produto_id");
