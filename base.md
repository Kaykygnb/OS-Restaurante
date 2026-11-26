# Projeto OS-Restaurante — base / status

## Como está agora

Backend em `servidor/`, Node + Fastify + Prisma + SQLite (offline de teste).

### Configurações padrão (já aplicadas)

| Item | Valor |
|---|---|
| Módulos | ESM (`"type": "module"` no `package.json`) |
| TypeScript | `module: nodenext`, `types: ["node"]` |
| Prisma client | generator `prisma-client` → `src/generated/prisma` |
| Banco | SQLite (`DATABASE_URL=file:./dev.db`) |
| Entrypoint | `src/servidor.ts` |
| Prisma singleton | `src/db.ts` |
| Dev | `npm run dev` → `tsx watch --env-file=.env src/servidor.ts` |
| Seed | `npm run seed` ou `npx prisma db seed` |
| Healthcheck | `GET /saude` na porta `3333` (`0.0.0.0`) |
| Seed | só cria **ROOT** (`login: root`, senha em `SENHA_ROOT_INICIAL`, ≥ 8 chars) |
| Hierarquia | ROOT cria ADMIN (+ configs); ADMIN/GERENTE criam níveis abaixo — ver `src/permissoes.ts` |
| Rotas | `auth`, `usuarios`, `configuracoes`, `impressoras`, `mesas`, `atendimentos`, `pedidos`, `categorias`, `produtos`, `cardapio`, `adicionais`, `escolhas` |
| Front | Vite React em `web/` — login + painel + cardápio + usuários + configs + **mesas** + **PDV** + **KDS pedidos** |

### Cardápio — o que o modelo já cobre

- Categoria → Produto → Produto_variante (preço na variante)
- Grupo_escolhas / Opcao_escolha (sabores etc. por variante)
- Grupo_adicionais ↔ categoria (N:N) + **exclusão por produto** (`Grupo_adicionais_produto_exclusao`)

### Cardápio — API (gestão completa)

| Domínio | Rotas |
|---|---|
| Árvore | `GET /cardapio` |
| Categorias | CRUD + `PUT /categorias/reordenar` |
| Produtos | CRUD; `DELETE` soft-cascade (variantes + grupos/opções de escolha) |
| Variantes | POST/PUT/DELETE sob `/produtos/:id/variantes` (preço só aqui) |
| Escolhas | GET/POST sob variante; PUT/DELETE `/grupos-escolhas`; POST/PUT/DELETE opções; POST aceita `opcoes[]` |
| Adicionais | CRUD grupos + `categoria_ids`; CRUD adicionais + variantes; exclusões por produto |

### Cardápio — front

- Aba **Produtos**: categorias \| lista \| painel (dados + opções de preço + **Opcionais do item**)
- Aba **Adicionais**: grupos/categorias, itens, preços, exclusões
- Ícones **i** de dúvida nos pontos que geram confusão (opcionais vs adicionais, preço na variante, etc.)

### Usuários — API

| Rota | Função |
|---|---|
| `GET /usuarios?ativos=1\|0\|todos` | Lista (ROOT oculto se quem pede não é ROOT) |
| `GET /usuarios/opcoes` | `tipos_criaveis` do logado |
| `POST /usuarios` | Criar (hierarquia + senha ≥ 8 + 409 unique) |
| `PUT /usuarios/:id` | Editar dados / reativar (`ativo`) |
| `PUT /usuarios/:id/senha` | **Reset admin** (senha + confirmar; sem senha antiga) |
| `DELETE /usuarios/:id` | Soft-desativar (bloqueia self + ROOT) |

### Usuários — front

- Página `/painel/usuarios` (só ROOT/ADMIN/GERENTE no menu)
- Lista ativos/inativos, criar/editar, desativar/reativar, bloco **Redefinir senha**

### Configurações — API / front

- `GET/PUT /configuracoes` — singleton do restaurante (ROOT/ADMIN)
- GET sem registro → `{ configurado: false }`; PUT cria ou atualiza
- Campos de roteamento: `impressora_conta_id` (pré-conta), `impressora_caixa_id` (comprovante/gaveta)
- Página `/painel/configuracoes`: abas **Estabelecimento** | **Impressoras**
- Menu só ROOT/ADMIN

### Impressoras ESC/POS (fase A — MVP)

**Princípio:** quem imprime é sempre o **servidor** (bytes RAW). Rede = TCP porta **9100**. O navegador nunca manda ESC/POS.

**Modelo**

| Entidade | Uso |
|---|---|
| `Impressora` | Cadastro (REDE/SISTEMA), papel, codepage, status (`ultimo_status` / `ultimo_erro` / `testado_em`) |
| `Impressora_categoria` | Roteamento de produção por categoria |
| `Trabalho_impressao` | Fila assíncrona (`PENDENTE` → `IMPRIMINDO` → `IMPRESSO` / `ERRO`) |

**API** (ROOT/ADMIN): `GET/POST /impressoras`, `PUT/DELETE /impressoras/:id`, `PUT .../categorias`, `POST .../teste`, `POST .../teste-gaveta`, `GET /impressoras/sistema` (Windows `Get-Printer` / CUPS `lpstat`)

**Módulos:** `servidor/src/impressao/` — `escpos`, `rede`, `sistema` (listagem + RAW Windows/CUPS), `documentos`, `fila` (worker a cada 2s no boot)

**Front:** lista com ícone de status, form por tipo de conexão, categorias, teste/gaveta, bloco **Roteamento global**

**Avisos operacionais**

- Fixe o IP da impressora no roteador (DHCP muda).
- PC do servidor (caixa) precisa estar ligado e na mesma rede — se o servidor estiver off, nada imprime.

**Próximas fases**

- **B — produção real:** documento `PRODUCAO` ao lançar pedido; `CONTA` (pré-conta)
- **C — sistema:** `tipo_conexao = SISTEMA` (Windows spooler RAW / CUPS `lp -o raw`) + popular `GET /impressoras/sistema`
- **D — caixa:** `COMPROVANTE` + abrir gaveta no pagamento

### Operação / PDV (em andamento)

**Pronto (fases 1–2)**
- Schema: `Sequencia`, `Forma_pagamento`, `Pagamento`, `Caixa_sessao`, `Movimentacao_caixa`, `Log_auditoria`; campos financeiros/delivery/cancelamento em `Atendimento` / `Pedido_item`
- Mesas: CRUD + mapa livre/ocupada; abrir conta MESA/BALCAO/RETIRADA/ENTREGA; transferir; juntar; cancelar
- Códigos `AT####` / `PD####` via `Sequencia` na mesma transação
- PDV: `GET /cardapio/pdv`, `POST /atendimentos/:id/pedidos` (snapshot server-side), cancelar item
- PRODUCAO ESC/POS + cupom CANCELADO; sem impressora de categoria → impressora da conta + aviso na UI
- KDS `/painel/pedidos` (ENVIADO → PREPARO → PRONTO → ENTREGUE)

**Pronto (fase 3)**
- Sessão de caixa (abrir/fechar, sangria/suprimento, gaveta sem venda)
- Pagamentos parciais + formas cadastráveis (`abre_gaveta`) + PIN gerente no desconto/sangria
- Taxa de serviço (aplicar/recusar) + desconto na UI `/painel/conta/:id`
- Pré-conta `CONTA` + `COMPROVANTE` + gaveta no dinheiro + totais congelados no fechar

**Fora do escopo offline de teste:** NFC-e / fiscal (necessário pra vender “de verdade”).

### Ainda falta (próximos)

- Upload de imagens
- Reordenar produtos/adicionais/escolhas por drag
- Opcionais já na criação (hoje só após salvar, com `variante_id`)

### Fluxo ROOT (instalação offline)

1. `npm run seed` → cria usuário `root`
2. Login ROOT → `POST /usuarios` com `tipo_usuario: "ADMIN"` (dono do restaurante)
3. Opcional: `PUT /configuracoes` (ROOT ou ADMIN preenche dados do estabelecimento)
4. Cliente usa o ADMIN e se vira no dia a dia

### Comandos úteis

```bash
cd servidor
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

---

## Pendências recomendadas (ainda não feitas)

### Domínio / schema

- [x] **Exclusão produto ↔ grupo de adicionais** — model + API + UI
- [x] **Produto sempre com ≥ 1 variante** — `POST /produtos` obriga preço/variante
- [x] Rotas/UI de adicionais, escolhas e exclusões por produto
- [x] **Validar `min_escolhas` ≤ `max_escolhas`** no create/update de `Grupo_escolhas`
- [ ] **`mesa_id` obrigatório** quando `tipo_atendimento = MESA`

### Pedidos / operação

- [x] Estratégia segura pra códigos `AT0001` / `PD0001` (`Sequencia` na mesma tx)
- [x] Snapshot nome/preço na criação de `Pedido_item` (API)
- [x] Módulo de pagamento / total / caixa (fechamento de atendimento)
- [x] Impressoras ESC/POS rede + fila + tela Config (fase A)
- [x] Impressão PRODUCAO ao lançar pedido (+ CANCELADO)
- [x] Impressão CONTA (pré-conta)
- [x] Impressão SISTEMA + listagem OS (fase C — Windows/CUPS)
- [x] COMPROVANTE + gaveta no pagamento
- [x] `mesa_id` obrigatório quando `tipo_atendimento = MESA`

### Infra (quando sair do “1 PC de teste”)

- [ ] Postgres se tiver vários terminais batendo no mesmo banco
- [ ] `prisma generate` no `postinstall` (client gerado está no `.gitignore`)
- [ ] CORS, auth e firewall quando o `0.0.0.0` for uso real
- [ ] Subir cost do bcrypt pra 12 se quiser mais margem

---

## Observações

- `.env` não vai pro git (já no `.gitignore`)
- Client em `src/generated/prisma` também está no `.gitignore` — rodar `npx prisma generate` após clone
- SQLite serve bem pra desenvolvimento offline; produção multi-caixa pede outro banco
