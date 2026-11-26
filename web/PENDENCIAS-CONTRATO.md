# Pendências de contrato (front ↔ servidor)

Front do redesenho (branch `pricila/front-redesenho`) contra o servidor do Fernando (`fernando/servidor-contratos`, lido e testado localmente em `f942f8b`, sem merge). Fonte da verdade: `servidor/FORMATOS-FRONT.md` desse commit.
Regra: o front não inventa contrato. Onde falta algo, a tela usa o que existe e a dúvida fica aqui.
O mock (`npm run dev:mock`) segue o formato do servidor do Fernando; o que ele ainda não entregou o mock responde no formato combinado (marcado como "prometido").

Atualizado em 26/11/2026 (depois da F9).

## Resolvidas

| # | Assunto | Como ficou |
|---|---------|------------|
| 1 | Login | `POST /auth/login {usuario, senha}`. 401 `credenciais_invalidas` vira "Usuário ou senha inválidos."; 429 `muitas_tentativas` com `tentar_em_s` (5 falhas, 60 s) vira contagem regressiva. **O fallback para `POST /login` foi removido do front.** |
| 2 | PIN no celular | Fora da v1 (decisão do Kayky). O celular usa usuário e senha. |
| 5 | `GET /caixa/atual` | Vem `gaveta: {disponivel, motivo}` + `sessao_anterior`; o front ainda traduz `tem_gaveta_disponivel` se `gaveta` faltar. |
| 7 | Venda rápida × balcão | `POST /vendas/rapida` cria `VENDA_RAPIDA` já pago e fechado. **A tela não manda `tipo`** (removido do corpo e do tipo `VendaRapidaEntrada`). `BALCAO` é o pedido para levar, com nome ou senha. O servidor gera `numero_dia` (reinicia todo dia), devolve na resposta e imprime no cupom; o front mostra como "senha". |
| 8 | `pode_operar_caixa` | Vem no login e no `/auth/me`, é editável no `PATCH /usuarios/:id`. Sem a permissão: 403 `sem_permissao_caixa` em pagamento, venda rápida e caixa. O front mostra "Só quem opera o caixa pode fazer isso." para esse código em qualquer tela e esconde Venda rápida, Caixa e Receber. Se o campo não vier, assume `true` para ROOT/ADMIN/GERENTE. |
| 9 | Conectar celulares | `GET /rede/conexao` (gerente+) → `{porta, enderecos, url_web, url_app}` e `GET /api/saude` → `{app, versao, nome_restaurante}`. Dois QRs. Com mais de um endereço, o front troca o host. **Sem IPv4 local (`url_web`/`url_app` null), a tela explica que o PC não está numa rede local e oferece "Tentar de novo".** Web e API na mesma porta (3333); `url_web` já usa essa porta. |
| 10 | Aviso "O IP deste PC mudou" | **Removido** a pedido do Kayky (sem faixa global, sem guardar IP impresso). Ficaram o aviso "Fixe o IP deste PC no roteador" e a dica da rede só da equipe. |
| 11 | PWA na rede local | Servidor serve `web/dist` com fallback para `index.html`, sem depender de HTTPS. Manifest + ícones funcionam para "adicionar à tela inicial"; o service worker só registra em HTTPS/localhost. |
| 12 | Dashboard | Tudo em `GET /relatorios/dashboard` (GESTAO). Tipado em `Dashboard` (`servicos/contratos.ts`); `por_tipo` usa `DELIVERY` no lugar de `ENTREGA` e pode trazer `RETIRADA`. A tela fica para a F9, depois do caixa e das telas essenciais. Lucro e margem não entram. |
| 4 | Status das impressoras | `GET /impressoras/status` → `[{id, nome, status:'ok'\|'erro'\|'sem_resposta', ultimo_erro, desde}]` + SSE `impressora.status` (o front relê a lista ao receber) + `GET /impressao/fila?status=ERRO`. O topo mostra "Impressoras ok" ou "Impressora Bar sem resposta" e uma faixa com o nome, desde quando e o último erro. |

| 3 | Início | Gestão usa `/relatorios/dashboard`; os outros perfis somam no front com `GET /atendimentos`. Fica assim. |
| 6 | Módulos | `GET /configuracoes/modulos` existe (qualquer logado) → `{estoque_nivel, usa_gaveta, delivery, promocoes}`. `GET /configuracoes` continua só ROOT/ADMIN (o mock agora responde 403 igual). A Conta passou a ler taxa e limite de desconto em `GET /configuracoes/operacao`. |
| 12a | Dashboard dia/semana/mês e por funcionário | `faturamento_agregado.por_dia/por_semana/por_mes` com `anterior` e `por_funcionario[{usuario_id, nome, cancelamentos_qtd, cancelamentos_centavos, descontos_qtd, descontos_centavos}]`. Tela de Relatórios pronta (F9). 400 `periodo_invalido` vira "A data inicial é depois da final." |
| 13 | `/auth/me` e `/impressoras/status` | Respondem em `f942f8b`. O mock trocou `/eu` por `/auth/me`. |
| 14 | Mais vendidos | `GET /produtos/mais-vendidos?limite&dias` existe; `variante_nome` vem `"Padrão"` (não `null`); tipo e mock ajustados. |
| 15 | Fechamento cego | Tela nova do caixa feita (F5, `5cb54c9`). |

## Ainda em aberto

Testado no servidor do Fernando em `f942f8b` (porta 3344, banco de teste): todas as rotas que as telas novas chamam respondem 200. O que falta é contrato que ainda não existe; o mock responde no formato combinado.

| # | Onde | O que falta no servidor | O que o front faz enquanto isso |
|---|------|-------------------------|--------------------------------|
| 16 | Estoque › Esgotados agora | `PATCH /produtos/:id {esgotado}` e `PATCH /opcoes/:id {esgotado}` (prancha 18c) não existem. | Mock responde no formato combinado; no servidor real o botão dá erro e a tela avisa. |
| 17 | Configurações › Operação | `PUT /configuracoes` ignora `estoque_nivel`, `modulo_delivery` e `modulo_promocoes`. | A tela manda os campos; no servidor real o nível do estoque não muda (fica 0). |
| 18 | Estoque níveis 3 e 4 | Não existem no servidor (só 0, 1 e 2). | A tela oferece 0–2. |
| 19 | Delivery "saiu para entrega" | Não há status nem `entregador_id` no contrato. | "Saiu para entrega" marca os pedidos prontos como `ENTREGUE` e a conta fica `ABERTO` até receber. Coluna "Saiu · falta receber" = conta aberta com todos os pedidos entregues. |
| 20 | `GET /atendimentos?tipo=` | O servidor só filtra por `status`. | Delivery filtra `ENTREGA`/`RETIRADA` no front. |
| 21 | `GET /auditoria?tipo=` | Aceita um tipo só. | Os grupos ("Dinheiro", "Descontos"…) filtram no front. |
| 22 | Estoque desligado | `GET /estoque/itens` responde 409 `estoque_desligado` com nível 0. | A tela nem chama a rota com nível 0; mostra "O controle do estoque está desligado". |

## Divergências entre o mock e `servidor/FORMATOS-FRONT.md` (`f942f8b`)

Já corrigidas no mock nesta rodada: `POST /atendimentos/:id/pedidos` devolve `{pedido, impressao}` como o servidor (o mock devolvia o pedido solto e o PDV quebrava ao enviar); `/eu` → `/auth/me` (401 sem `codigo`); login aceita `login` no lugar de `usuario` e `POST /login`; prefixo `/api` aceito em todas as rotas; `variante_nome: "Padrão"`; `dia_operacao` no atendimento; `GET /rede/conexao` 403 `{erro: "Sem permissão"}` sem `codigo`; `GET /configuracoes` 403 para quem não é ROOT/ADMIN; 401 sem token `{erro: "Faça login"}`.

O que ainda difere (o front não depende de nenhum destes pontos):

| Rota | Campo / comportamento | Servidor (`FORMATOS-FRONT.md`) | Mock |
|------|----------------------|--------------------------------|------|
| `GET /auth/me` | 401 de usuário desativado | Existe | Não simula usuário desativado. |
| `PATCH /usuarios/:id` | Corpo | Aceita o cadastro (nome, login, senha…) além de `pode_operar_caixa` | Só `pode_operar_caixa`; outro corpo → 400 `dados_invalidos` (só no mock). |
| `PATCH /usuarios/:id` | ROOT como alvo | Não documentado | 403 `sem_permissao` "Não é possível editar o ROOT por esta rota". |
| `GET /relatorios/dashboard` | Valores | Calculados do banco | Histórico simulado fixo por data + contas fechadas no mock hoje. Mesmos campos. |
| `GET /relatorios/dashboard` | `produtos_*`, `por_garcom` | Até `limite` itens, do banco | Lista fixa de 4 produtos e 2 garçons. |
| `GET /relatorios/dashboard` | `por_funcionario` em dia sem movimento | `[]` | Sempre traz os 3 funcionários de exemplo. |
| `POST /atendimentos` (BALCAO) | Cupom `SENHA n` | Sai na produção | Mock não imprime. `numero_dia` conta todas as contas do dia, como no servidor. |
| `GET /pedidos/cozinha` | Estação de cada item | Pela impressora (`estacao`, ou o nome dela) | Pelo nome do produto (caipirinha, drink, chopp, cerveja, suco → bar). |
| `GET /pedidos/cozinha` | `atraso_min` | Da configuração | `kds_atraso_min` do mock (padrão 15). Igual. |
| `GET /impressoras/status` | Lista | Impressoras cadastradas | Cozinha, Bar e Caixa fixas; `localStorage.mock_impressora` força falha. |
| SSE `GET /eventos` (`impressora.status` e demais) | Transporte | `text/event-stream` | O mock não tem SSE; as telas também releem por tempo. |
| `GET /impressao/fila` | Itens | Do banco | Dois itens fixos (um ERRO, um IMPRESSO). |
| `GET /produtos/mais-vendidos` | `dias` | Janela de dias | Ignorado (conta tudo do mock). |
| `GET /rede/conexao` | `enderecos` | IPv4 reais do PC | Dois fixos (Wi-Fi 192.168.0.15 e Ethernet 10.0.0.8); `os.mock.sem_rede=1` simula sem rede. |
| `GET /saude` | `versao`, `nome_restaurante` | `1.0.0`, nome cadastrado | `0.9.0-mock`, "Pastelaria do Zé". |

Sem divergência de campo em: `POST /auth/login` (200/401/429), 403 `sem_permissao_caixa`, `faturamento_agregado`, `por_funcionario`, 400 `periodo_invalido`, KDS (formato e 400 `estacao_invalida`), 409 `mesa_ocupada` (`atendimento_id`, `codigo_atendimento`), `GET /impressoras/status`, `GET /impressao/fila`, `GET /configuracoes/modulos`, `GET /rede/conexao`, `GET /api/saude`.
