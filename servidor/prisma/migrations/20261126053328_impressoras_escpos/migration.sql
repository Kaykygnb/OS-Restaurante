-- CreateTable
CREATE TABLE "Impressora" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "tipo_conexao" TEXT NOT NULL DEFAULT 'REDE',
    "ip" TEXT,
    "porta" INTEGER NOT NULL DEFAULT 9100,
    "nome_sistema" TEXT,
    "largura_papel" INTEGER NOT NULL DEFAULT 80,
    "colunas" INTEGER NOT NULL DEFAULT 48,
    "codificacao" TEXT NOT NULL DEFAULT 'CP860',
    "vias" INTEGER NOT NULL DEFAULT 1,
    "tem_guilhotina" BOOLEAN NOT NULL DEFAULT true,
    "tem_gaveta" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_status" TEXT NOT NULL DEFAULT 'DESCONHECIDO',
    "ultimo_erro" TEXT,
    "testado_em" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Impressora_categoria" (
    "impressora_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,

    PRIMARY KEY ("impressora_id", "categoria_id"),
    CONSTRAINT "Impressora_categoria_impressora_id_fkey" FOREIGN KEY ("impressora_id") REFERENCES "Impressora" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Impressora_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trabalho_impressao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo_documento" TEXT NOT NULL,
    "conteudo" BLOB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_erro" TEXT,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impresso_em" DATETIME,
    "impressora_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "atendimento_id" INTEGER,
    CONSTRAINT "Trabalho_impressao_impressora_id_fkey" FOREIGN KEY ("impressora_id") REFERENCES "Impressora" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trabalho_impressao_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "Pedido" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trabalho_impressao_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "Atendimento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "impressora_conta_id" INTEGER,
    "impressora_caixa_id" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Configuracao_impressora_conta_id_fkey" FOREIGN KEY ("impressora_conta_id") REFERENCES "Impressora" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Configuracao_impressora_caixa_id_fkey" FOREIGN KEY ("impressora_caixa_id") REFERENCES "Impressora" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Configuracao" ("bairro", "caminho_logo", "cep", "cidade", "cnpj", "complemento", "createdAt", "email", "id", "inscricao_estadual", "logradouro", "mensagem_cupom", "nome_fantasia", "nome_restaurante", "numero", "taxa_entrega_centavos", "telefone", "uf", "updatedAt", "whatsapp") SELECT "bairro", "caminho_logo", "cep", "cidade", "cnpj", "complemento", "createdAt", "email", "id", "inscricao_estadual", "logradouro", "mensagem_cupom", "nome_fantasia", "nome_restaurante", "numero", "taxa_entrega_centavos", "telefone", "uf", "updatedAt", "whatsapp" FROM "Configuracao";
DROP TABLE "Configuracao";
ALTER TABLE "new_Configuracao" RENAME TO "Configuracao";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
