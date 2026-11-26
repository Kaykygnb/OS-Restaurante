-- Contratos v1: gaveta, clientes, entrega, estoque 0-2, promoção, auditoria imutável.

ALTER TABLE "Configuracao" ADD COLUMN "limite_desconto_atendente_percentual" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Configuracao" ADD COLUMN "limite_desconto_gerente_percentual" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Configuracao" ADD COLUMN "limite_desconto_gerente_centavos" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "Configuracao" ADD COLUMN "usa_gaveta" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Configuracao" ADD COLUMN "lat" REAL;
ALTER TABLE "Configuracao" ADD COLUMN "lng" REAL;
ALTER TABLE "Configuracao" ADD COLUMN "entrega_raio_max_m" INTEGER;
ALTER TABLE "Configuracao" ADD COLUMN "entrega_modo_distancia" TEXT NOT NULL DEFAULT 'linha_reta';
ALTER TABLE "Configuracao" ADD COLUMN "entrega_fator_rota" INTEGER NOT NULL DEFAULT 130;
ALTER TABLE "Configuracao" ADD COLUMN "estoque_nivel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Configuracao" ADD COLUMN "estoque_permite_negativo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Configuracao" ADD COLUMN "estoque_reset_esgotados_dia" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Configuracao" ADD COLUMN "modulo_delivery" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Configuracao" ADD COLUMN "modulo_promocoes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Configuracao" ADD COLUMN "horario_inicio_min" INTEGER NOT NULL DEFAULT 420;
ALTER TABLE "Configuracao" ADD COLUMN "horario_fim_min" INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE "Configuracao" ADD COLUMN "alerta_dif_caixa_centavos" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "Configuracao" ADD COLUMN "alerta_cancelamentos" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Configuracao" ADD COLUMN "alerta_cancelamentos_min" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "Produto" ADD COLUMN "unidade_base" TEXT NOT NULL DEFAULT 'un';
ALTER TABLE "Produto" ADD COLUMN "esgotado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Produto" ADD COLUMN "esgotado_em" DATETIME;
ALTER TABLE "Produto" ADD COLUMN "esgotado_por_id" INTEGER;
ALTER TABLE "Produto" ADD COLUMN "esgotado_origem" TEXT;

ALTER TABLE "Produto_variante" ADD COLUMN "esgotado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Produto_variante" ADD COLUMN "esgotado_em" DATETIME;
ALTER TABLE "Produto_variante" ADD COLUMN "esgotado_por_id" INTEGER;
ALTER TABLE "Produto_variante" ADD COLUMN "esgotado_origem" TEXT;

ALTER TABLE "Opcao_escolha" ADD COLUMN "esgotado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opcao_escolha" ADD COLUMN "esgotado_em" DATETIME;
ALTER TABLE "Opcao_escolha" ADD COLUMN "esgotado_por_id" INTEGER;
ALTER TABLE "Opcao_escolha" ADD COLUMN "esgotado_origem" TEXT;

ALTER TABLE "Adicional_variante" ADD COLUMN "esgotado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Adicional_variante" ADD COLUMN "esgotado_em" DATETIME;
ALTER TABLE "Adicional_variante" ADD COLUMN "esgotado_por_id" INTEGER;
ALTER TABLE "Adicional_variante" ADD COLUMN "esgotado_origem" TEXT;

ALTER TABLE "Atendimento" ADD COLUMN "desconto_tipo" TEXT NOT NULL DEFAULT 'VALOR';
ALTER TABLE "Atendimento" ADD COLUMN "desconto_percentual" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Atendimento" ADD COLUMN "desconto_aprovador_id" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "cortesia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Atendimento" ADD COLUMN "acrescimo_aprovador_id" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "entrega_distancia_m" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "taxa_entrega_origem" TEXT;
ALTER TABLE "Atendimento" ADD COLUMN "taxa_entrega_calculada_centavos" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "numero_dia" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "conta_pedida_em" DATETIME;
ALTER TABLE "Atendimento" ADD COLUMN "cliente_id" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "endereco_entrega_id" INTEGER;
ALTER TABLE "Atendimento" ADD COLUMN "caixa_sessao_id" INTEGER;

ALTER TABLE "Pedido" ADD COLUMN "preparo_em" DATETIME;
ALTER TABLE "Pedido" ADD COLUMN "pronto_em" DATETIME;
ALTER TABLE "Pedido" ADD COLUMN "entregue_em" DATETIME;

ALTER TABLE "Pedido_item" ADD COLUMN "preco_original_centavos" INTEGER;
ALTER TABLE "Pedido_item" ADD COLUMN "desconto_promocao_centavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Pedido_item" ADD COLUMN "promocao_id" INTEGER;
ALTER TABLE "Pedido_item" ADD COLUMN "nome_promocao" TEXT;
ALTER TABLE "Pedido_item" ADD COLUMN "desconto_manual_centavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Pedido_item" ADD COLUMN "desconto_motivo" TEXT;
ALTER TABLE "Pedido_item" ADD COLUMN "desconto_usuario_id" INTEGER;
ALTER TABLE "Pedido_item" ADD COLUMN "desconto_aprovador_id" INTEGER;

ALTER TABLE "Forma_pagamento" ADD COLUMN "eh_dinheiro" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Forma_pagamento" SET "eh_dinheiro" = 1 WHERE "abre_gaveta" = 1;

ALTER TABLE "Caixa_sessao" ADD COLUMN "aberta" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Caixa_sessao" SET "aberta" = 1 WHERE "fechado_em" IS NULL;

ALTER TABLE "Requisicao_idempotente" ADD COLUMN "hash_payload" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Requisicao_idempotente" ADD COLUMN "em_andamento" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "caixa_uma_aberta" ON "Caixa_sessao"("aberta") WHERE "aberta" = 1;
CREATE UNIQUE INDEX "atendimento_numero_dia_sessao" ON "Atendimento"("caixa_sessao_id", "numero_dia") WHERE "numero_dia" IS NOT NULL;

CREATE TABLE "Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefone2" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "cliente_telefone_ativo" ON "Cliente"("telefone") WHERE "ativo" = 1;

CREATE TABLE "Cliente_endereco" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cliente_id" INTEGER NOT NULL,
    "apelido" TEXT,
    "cep" TEXT,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "sem_numero" BOOLEAN NOT NULL DEFAULT false,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "referencia" TEXT,
    "lat" REAL,
    "lng" REAL,
    "geo_origem" TEXT NOT NULL DEFAULT 'nenhuma',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cliente_endereco_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Faixa_entrega" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ate_m" INTEGER NOT NULL,
    "taxa_centavos" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "Bairro_entrega" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "nome_normalizado" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "taxa_centavos" INTEGER NOT NULL,
    "atende" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "Bairro_entrega_nome_normalizado_cidade_key" ON "Bairro_entrega"("nome_normalizado", "cidade");

CREATE TABLE "Cache_cep" (
    "cep" TEXT NOT NULL PRIMARY KEY,
    "dados" TEXT NOT NULL,
    "atualizado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Cache_geo" (
    "chave" TEXT NOT NULL PRIMARY KEY,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "precisao" TEXT NOT NULL,
    "atualizado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Saldo_estoque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_tipo" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qtd_base" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "Saldo_estoque_item_tipo_item_id_key" ON "Saldo_estoque"("item_tipo", "item_id");

CREATE TABLE "Estoque_minimo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_tipo" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "minimo_base" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "Estoque_minimo_item_tipo_item_id_key" ON "Estoque_minimo"("item_tipo", "item_id");

CREATE TABLE "Movimento_estoque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_tipo" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "qtd_base" INTEGER NOT NULL,
    "custo_unit_centavos" INTEGER,
    "pedido_item_id" INTEGER,
    "motivo" TEXT,
    "usuario_id" INTEGER,
    "aprovador_id" INTEGER,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Movimento_estoque_item_tipo_item_id_criado_em_idx" ON "Movimento_estoque"("item_tipo", "item_id", "criado_em");

CREATE TABLE "Promocao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "percentual" INTEGER,
    "valor_centavos" INTEGER,
    "preco_fixo_centavos" INTEGER,
    "leve" INTEGER,
    "pague" INTEGER,
    "inicio_em" DATETIME,
    "fim_em" DATETIME,
    "dias_semana" INTEGER NOT NULL DEFAULT 127,
    "hora_inicio_min" INTEGER,
    "hora_fim_min" INTEGER,
    "tipos_atendimento" TEXT NOT NULL DEFAULT 'MESA,BALCAO,RETIRADA,ENTREGA',
    "limite_por_atendimento" INTEGER,
    "limite_total" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "acumulavel" BOOLEAN NOT NULL DEFAULT false,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "inclui_extras" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Promocao_alvo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "promocao_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_variante_id" INTEGER,
    "categoria_id" INTEGER,
    CONSTRAINT "Promocao_alvo_promocao_id_fkey" FOREIGN KEY ("promocao_id") REFERENCES "Promocao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Evento_auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "criado_em" DATETIME NOT NULL,
    "tipo" TEXT NOT NULL,
    "sensivel" BOOLEAN NOT NULL DEFAULT false,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "usuario_id" INTEGER,
    "usuario_nome" TEXT NOT NULL DEFAULT '',
    "usuario_perfil" TEXT NOT NULL DEFAULT '',
    "aprovador_id" INTEGER,
    "aprovador_nome" TEXT,
    "aprovado_com_pin" BOOLEAN NOT NULL DEFAULT false,
    "terminal_nome" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "alvo_tipo" TEXT,
    "alvo_id" INTEGER,
    "alvo_rotulo" TEXT,
    "mesa_id" INTEGER,
    "atendimento_id" INTEGER,
    "valor_antes" TEXT,
    "valor_depois" TEXT,
    "valor_centavos" INTEGER,
    "motivo" TEXT,
    "resultado" TEXT NOT NULL DEFAULT 'ok',
    "codigo_erro" TEXT,
    "detalhes" TEXT,
    "hash_anterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Evento_auditoria_hash_anterior_key" ON "Evento_auditoria"("hash_anterior");
CREATE INDEX "Evento_auditoria_criado_em_idx" ON "Evento_auditoria"("criado_em");
CREATE INDEX "Evento_auditoria_usuario_id_criado_em_idx" ON "Evento_auditoria"("usuario_id", "criado_em");
CREATE INDEX "Evento_auditoria_atendimento_id_idx" ON "Evento_auditoria"("atendimento_id");
CREATE INDEX "Evento_auditoria_tipo_criado_em_idx" ON "Evento_auditoria"("tipo", "criado_em");

CREATE TABLE "Alerta_visto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "evento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "visto_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Alerta_visto_evento_id_usuario_id_key" ON "Alerta_visto"("evento_id", "usuario_id");

-- Auditoria imutável. prisma db push NÃO recria estes gatilhos.
CREATE TRIGGER "aud_sem_update" BEFORE UPDATE ON "Evento_auditoria"
BEGIN
  SELECT RAISE(ABORT, 'auditoria_imutavel');
END;
CREATE TRIGGER "aud_sem_delete" BEFORE DELETE ON "Evento_auditoria"
BEGIN
  SELECT RAISE(ABORT, 'auditoria_imutavel');
END;
CREATE TRIGGER "log_aud_sem_update" BEFORE UPDATE ON "Log_auditoria"
BEGIN
  SELECT RAISE(ABORT, 'auditoria_imutavel');
END;
CREATE TRIGGER "log_aud_sem_delete" BEFORE DELETE ON "Log_auditoria"
BEGIN
  SELECT RAISE(ABORT, 'auditoria_imutavel');
END;
CREATE TRIGGER "mov_est_sem_update" BEFORE UPDATE ON "Movimento_estoque"
BEGIN
  SELECT RAISE(ABORT, 'movimento_imutavel');
END;
CREATE TRIGGER "mov_est_sem_delete" BEFORE DELETE ON "Movimento_estoque"
BEGIN
  SELECT RAISE(ABORT, 'movimento_imutavel');
END;
