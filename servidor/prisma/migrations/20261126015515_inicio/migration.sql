-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "matricula" TEXT,
    "tipo_usuario" TEXT NOT NULL DEFAULT 'ATENDENTE',
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "senha_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "caminho_imagem" TEXT,
    "exige_preparo" BOOLEAN NOT NULL DEFAULT true,
    "controla_estoque" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    CONSTRAINT "Produto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Produto_variante" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "caminho_imagem" TEXT,
    "codigo_barras" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "produto_id" INTEGER NOT NULL,
    CONSTRAINT "Produto_variante_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "Produto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Grupo_escolhas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "min_escolhas" INTEGER NOT NULL DEFAULT 0,
    "max_escolhas" INTEGER NOT NULL DEFAULT 1,
    "permite_repetir" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "produto_variante_id" INTEGER NOT NULL,
    CONSTRAINT "Grupo_escolhas_produto_variante_id_fkey" FOREIGN KEY ("produto_variante_id") REFERENCES "Produto_variante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Opcao_escolha" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "preco_extra_centavos" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "grupo_escolhas_id" INTEGER NOT NULL,
    CONSTRAINT "Opcao_escolha_grupo_escolhas_id_fkey" FOREIGN KEY ("grupo_escolhas_id") REFERENCES "Grupo_escolhas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Grupo_adicionais" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Grupo_adicionais_categoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "grupo_adicionais_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    CONSTRAINT "Grupo_adicionais_categoria_grupo_adicionais_id_fkey" FOREIGN KEY ("grupo_adicionais_id") REFERENCES "Grupo_adicionais" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Grupo_adicionais_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adicional" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "caminho_imagem" TEXT,
    "qtd_max" INTEGER NOT NULL DEFAULT 5,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "grupo_adicionais_id" INTEGER NOT NULL,
    CONSTRAINT "Adicional_grupo_adicionais_id_fkey" FOREIGN KEY ("grupo_adicionais_id") REFERENCES "Grupo_adicionais" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adicional_variante" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "caminho_imagem" TEXT,
    "preco_centavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "adicional_id" INTEGER NOT NULL,
    CONSTRAINT "Adicional_variante_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "Adicional" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Atendimento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo_atendimento" TEXT NOT NULL,
    "tipo_atendimento" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "cliente_nome" TEXT,
    "observacao" TEXT,
    "aberto_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "mesa_id" INTEGER,
    CONSTRAINT "Atendimento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Atendimento_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "Mesa" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo_pedido" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "atendimento_id" INTEGER NOT NULL,
    CONSTRAINT "Pedido_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "Atendimento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_produto" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_variante_id" INTEGER NOT NULL,
    CONSTRAINT "Pedido_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_item_produto_variante_id_fkey" FOREIGN KEY ("produto_variante_id") REFERENCES "Produto_variante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido_item_adicional" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_adicional" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "pedido_item_id" INTEGER NOT NULL,
    "adicional_variante_id" INTEGER NOT NULL,
    CONSTRAINT "Pedido_item_adicional_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "Pedido_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_item_adicional_adicional_variante_id_fkey" FOREIGN KEY ("adicional_variante_id") REFERENCES "Adicional_variante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido_item_escolha" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_opcao" TEXT NOT NULL,
    "preco_extra_centavos" INTEGER NOT NULL DEFAULT 0,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "pedido_item_id" INTEGER NOT NULL,
    "opcao_escolha_id" INTEGER NOT NULL,
    CONSTRAINT "Pedido_item_escolha_pedido_item_id_fkey" FOREIGN KEY ("pedido_item_id") REFERENCES "Pedido_item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_item_escolha_opcao_escolha_id_fkey" FOREIGN KEY ("opcao_escolha_id") REFERENCES "Opcao_escolha" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_matricula_key" ON "Usuario"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_adicionais_categoria_grupo_adicionais_id_categoria_id_key" ON "Grupo_adicionais_categoria"("grupo_adicionais_id", "categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_numero_key" ON "Mesa"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Atendimento_codigo_atendimento_key" ON "Atendimento"("codigo_atendimento");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_codigo_pedido_key" ON "Pedido"("codigo_pedido");
