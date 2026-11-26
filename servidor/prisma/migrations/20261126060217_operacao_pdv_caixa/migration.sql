-- CreateTable
CREATE TABLE "Sequencia" (
    "nome" TEXT NOT NULL PRIMARY KEY,
    "ultimo" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Forma_pagamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "abre_gaveta" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Caixa_sessao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fundo_troco_centavos" INTEGER NOT NULL DEFAULT 0,
    "aberto_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" DATETIME,
    "valor_esperado_centavos" INTEGER,
    "valor_informado_centavos" INTEGER,
    "diferenca_centavos" INTEGER,
    "usuario_abertura_id" INTEGER NOT NULL,
    "usuario_fechamento_id" INTEGER,
    CONSTRAINT "Caixa_sessao_usuario_abertura_id_fkey" FOREIGN KEY ("usuario_abertura_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Caixa_sessao_usuario_fechamento_id_fkey" FOREIGN KEY ("usuario_fechamento_id") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movimentacao_caixa" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caixa_sessao_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    CONSTRAINT "Movimentacao_caixa_caixa_sessao_id_fkey" FOREIGN KEY ("caixa_sessao_id") REFERENCES "Caixa_sessao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Movimentacao_caixa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valor_centavos" INTEGER NOT NULL,
    "valor_recebido_centavos" INTEGER NOT NULL,
    "troco_centavos" INTEGER NOT NULL DEFAULT 0,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendimento_id" INTEGER NOT NULL,
    "forma_pagamento_id" INTEGER NOT NULL,
    "caixa_sessao_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    CONSTRAINT "Pagamento_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "Atendimento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_forma_pagamento_id_fkey" FOREIGN KEY ("forma_pagamento_id") REFERENCES "Forma_pagamento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_caixa_sessao_id_fkey" FOREIGN KEY ("caixa_sessao_id") REFERENCES "Caixa_sessao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pagamento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Log_auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" INTEGER,
    "detalhes" TEXT,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" INTEGER NOT NULL,
    CONSTRAINT "Log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Atendimento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo_atendimento" TEXT NOT NULL,
    "tipo_atendimento" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "cliente_nome" TEXT,
    "cliente_telefone" TEXT,
    "cliente_endereco" TEXT,
    "observacao" TEXT,
    "desconto_centavos" INTEGER NOT NULL DEFAULT 0,
    "desconto_motivo" TEXT,
    "acrescimo_centavos" INTEGER NOT NULL DEFAULT 0,
    "acrescimo_motivo" TEXT,
    "taxa_servico_centavos" INTEGER NOT NULL DEFAULT 0,
    "taxa_servico_aplicada" BOOLEAN NOT NULL DEFAULT false,
    "taxa_entrega_centavos" INTEGER NOT NULL DEFAULT 0,
    "subtotal_centavos" INTEGER,
    "total_desconto_centavos" INTEGER,
    "total_acrescimo_centavos" INTEGER,
    "total_taxa_servico_centavos" INTEGER,
    "total_taxa_entrega_centavos" INTEGER,
    "total_centavos" INTEGER,
    "aberto_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechado_em" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "desconto_usuario_id" INTEGER,
    "acrescimo_usuario_id" INTEGER,
    "mesa_id" INTEGER,
    CONSTRAINT "Atendimento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Atendimento_desconto_usuario_id_fkey" FOREIGN KEY ("desconto_usuario_id") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Atendimento_acrescimo_usuario_id_fkey" FOREIGN KEY ("acrescimo_usuario_id") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Atendimento_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "Mesa" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Atendimento" ("aberto_em", "cliente_nome", "codigo_atendimento", "fechado_em", "id", "mesa_id", "observacao", "status", "tipo_atendimento", "updatedAt", "usuario_id") SELECT "aberto_em", "cliente_nome", "codigo_atendimento", "fechado_em", "id", "mesa_id", "observacao", "status", "tipo_atendimento", "updatedAt", "usuario_id" FROM "Atendimento";
DROP TABLE "Atendimento";
ALTER TABLE "new_Atendimento" RENAME TO "Atendimento";
CREATE UNIQUE INDEX "Atendimento_codigo_atendimento_key" ON "Atendimento"("codigo_atendimento");
CREATE TABLE "new_Configuracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_restaurante" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "cnpj" TEXT,
    "inscricao_estadual" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "caminho_logo" TEXT,
    "mensagem_cupom" TEXT,
    "taxa_entrega_centavos" INTEGER NOT NULL DEFAULT 0,
    "taxa_servico_percentual" INTEGER NOT NULL DEFAULT 10,
    "limite_desconto_sem_pin_centavos" INTEGER NOT NULL DEFAULT 500,
    "impressora_conta_id" INTEGER,
    "impressora_caixa_id" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Configuracao_impressora_conta_id_fkey" FOREIGN KEY ("impressora_conta_id") REFERENCES "Impressora" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Configuracao_impressora_caixa_id_fkey" FOREIGN KEY ("impressora_caixa_id") REFERENCES "Impressora" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Configuracao" ("bairro", "caminho_logo", "cep", "cidade", "cnpj", "complemento", "createdAt", "email", "id", "impressora_caixa_id", "impressora_conta_id", "inscricao_estadual", "logradouro", "mensagem_cupom", "nome_fantasia", "nome_restaurante", "numero", "taxa_entrega_centavos", "telefone", "uf", "updatedAt", "whatsapp") SELECT "bairro", "caminho_logo", "cep", "cidade", "cnpj", "complemento", "createdAt", "email", "id", "impressora_caixa_id", "impressora_conta_id", "inscricao_estadual", "logradouro", "mensagem_cupom", "nome_fantasia", "nome_restaurante", "numero", "taxa_entrega_centavos", "telefone", "uf", "updatedAt", "whatsapp" FROM "Configuracao";
DROP TABLE "Configuracao";
ALTER TABLE "new_Configuracao" RENAME TO "Configuracao";
CREATE TABLE "new_Pedido_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome_produto" TEXT NOT NULL,
    "preco_centavos" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "observacao" TEXT,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "cancelado_em" DATETIME,
    "cancelado_motivo" TEXT,
    "cancelado_usuario_id" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_variante_id" INTEGER NOT NULL,
    CONSTRAINT "Pedido_item_cancelado_usuario_id_fkey" FOREIGN KEY ("cancelado_usuario_id") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_item_produto_variante_id_fkey" FOREIGN KEY ("produto_variante_id") REFERENCES "Produto_variante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pedido_item" ("createdAt", "id", "nome_produto", "observacao", "pedido_id", "preco_centavos", "produto_variante_id", "quantidade", "updatedAt") SELECT "createdAt", "id", "nome_produto", "observacao", "pedido_id", "preco_centavos", "produto_variante_id", "quantidade", "updatedAt" FROM "Pedido_item";
DROP TABLE "Pedido_item";
ALTER TABLE "new_Pedido_item" RENAME TO "Pedido_item";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Forma_pagamento_nome_key" ON "Forma_pagamento"("nome");
