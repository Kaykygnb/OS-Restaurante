# Mudanças em relação ao CONTRATOS.md

Decisões do Kayky que valem por cima do contrato, e os ajustes feitos quando o texto dos documentos não fechava.

A branch `pricila/front-redesenho` não está neste repositório, então não havia `web/PENDENCIAS-CONTRATO.md` para copiar o formato do dashboard. O `GET /relatorios/dashboard` segue o pedido do item 8.

## 1. Venda rápida não é balcão

`POST /vendas/rapida` cria um atendimento `VENDA_RAPIDA`. Ele já nasce pago e `FECHADO`, sem mesa, sem nome e sem comanda. A tela não manda `tipo`. Se algum item exige preparo, a produção ainda é impressa.

`BALCAO` continua sendo a conta "pra levar", com nome ou senha, que vai para a cozinha e pode ser paga na hora ou na retirada. Abrir `VENDA_RAPIDA` por `POST /atendimentos` não é aceito.

## 2. Permissão `pode_operar_caixa`

Campo em `Usuario`, editável pelo ADMIN do restaurante (e pelo ROOT).

- GERENTE, ADMIN e ROOT nascem com `true`.
- ATENDENTE, COZINHEIRO e ENTREGADOR nascem com `false`.

Sem a permissão, a pessoa abre mesa, balcão e entrega, mas não recebe, não fecha conta, não faz venda rápida e não abre nem opera o caixa. A resposta é `403 { codigo: "sem_permissao_caixa" }`.

## 3. O caixa não segue o login

A sessão fica no banco. Trocar de usuário, sair ou reiniciar o processo não fecha o caixa. Se a sessão aberta começou em um dia anterior (fuso `America/Sao_Paulo`), `GET /caixa/atual` traz `sessao_anterior: true`. `POST /caixa/abrir` responde `409 { codigo: "caixa_ja_aberto", sessao_anterior }` até alguém fechar a sessão antiga.

## 4. Fechamento cego

O operador manda `contagem: [{ forma_pagamento_id, valor_centavos }]`.

- Quem não é GERENTE+ não recebe `esperado_centavos` nem `diferenca_centavos` em `GET /caixa/atual`, `GET /caixa/previa` e na resposta do fechamento. Esses campos são omitidos.
- GERENTE+ recebe esperado, contado e diferença por forma.
- Falta em qualquer forma exige `motivo` e `aprovacao: { aprovador_id, pin }` de GERENTE+. Sem isso, `403 { codigo: "aprovacao_necessaria" }`.
- Sobra só é registrada.
- O relatório imprime sempre, com o código de conferência `id:8 caracteres do hash`. Se a impressão falhar, o fechamento continua valendo. `POST /caixa/:id/reimprimir` imprime de novo.
- A auditoria grava quem fechou, quem aprovou, os valores e o motivo.

O corpo antigo com um único `valor_informado_centavos` ainda vale: esse número é a contagem do dinheiro, e as outras formas entram pelo valor esperado, para não inventar falta.

## 5. Cupom não fiscal

Cabeçalho e rodapé de conta, comprovante, produção, teste e fechamento trazem `NÃO É DOCUMENTO FISCAL`.

## 6. Celular pelo navegador

O Fastify serve `web/dist` (ou `WEB_DIST`) com fallback para `index.html`. As rotas existem sem prefixo, para o proxy do Vite que tira `/api`, e de novo em `/api`. Nada disso depende de HTTPS nem de service worker.

## 7. Conexão pelo QR

`GET /rede/conexao` (GESTAO) responde `{ porta, enderecos: [{ ip, interface }], url_web, url_app }`.

- Só IPv4 privado (`10/8`, `172.16/12`, `192.168/16`).
- Ficam de fora loopback, link-local e interfaces cujo nome indica Docker ou VM (`docker`, `br-`, `veth`, `virbr`, `vmnet`, `vboxnet`, `cni`, `flannel`, `tun`, `tap`, `zt`).
- `url_web` é `http://IP:PORTA/` e `url_app` é `osrestaurante://conectar?host=IP&porta=PORTA&nome=...`, usando o primeiro endereço da lista. Sem endereço local, as duas URLs vêm `null`.
- A porta é `PORT` (padrão 3333). O processo escuta em `0.0.0.0` e escreve as URLs no log de início.

`GET /api/saude` e `GET /saude` são públicos e respondem só `{ app: "os-restaurante", versao, nome_restaurante }`.

## 8. Dashboard

`GET /relatorios/dashboard?de=AAAA-MM-DD&ate=AAAA-MM-DD&sem_venda_dias=30&limite=10` (GESTAO). Sem `de`/`ate`, o intervalo é o dia de hoje. Não há tabela nova.

O faturamento soma `total_centavos` dos atendimentos `FECHADO` no intervalo. Conta cancelada, item cancelado e pagamento estornado não entram. O ticket médio é o faturamento dividido pelo número desses atendimentos. O período anterior tem o mesmo tamanho e termina quando o atual começa.

A resposta traz, em centavos e no fuso `America/Sao_Paulo`:

- faturamento, ticket médio e quantidade, com o período anterior;
- `por_dia` e `por_hora` (0–23);
- mais e menos vendidos por quantidade e por valor;
- `produtos_sem_venda` (`dias_sem_venda` é `null` quando o produto nunca vendeu);
- `por_tipo`, com `ENTREGA` exposto como `DELIVERY` (também pode aparecer `RETIRADA`);
- `por_forma_pagamento`, `por_garcom`, `cancelamentos_por_usuario` e `descontos_por_usuario`.

## Outros ajustes coerentes com o contrato

- A gaveta só abre com `usa_gaveta` e impressora com gaveta. A resposta usa `gaveta: "aberta" | "nao_usada" | "falhou"`. `GET /caixa/atual` também mantém `tem_gaveta_disponivel` para a tela atual.
- `POST /login` continua aceitando `usuario` ou `login`, com o mesmo corpo de `POST /auth/login`. O `429` inclui `erro` além de `codigo` e `tentar_em_s`. São 5 falhas e depois 60 segundos.
- O dinheiro é `Forma_pagamento.eh_dinheiro`. A migração copia `abre_gaveta` para esse campo.
- A taxa de serviço incide sobre o subtotal depois do desconto da conta, e só em `MESA`. A entrega não entra na base do percentual.
- `preco_centavos` do item continua sendo o preço unitário de referência. O desconto da promoção fica em `desconto_promocao_centavos`. O valor da linha é quantidade × (preço original + extras) − promoção − desconto manual. A resposta do pedido inclui `valor_linha_centavos`.
- Combo de promoção não entra nesta versão. Leve-pague vale dentro do mesmo envio.
- Níveis 3 e 4 de estoque, entrada por XML e PDF de auditoria não foram construídos. A exportação da auditoria é CSV, e `GET /auditoria/imprimir` serve a página para o navegador.
- Quem exporta a auditoria inteira é ROOT ou ADMIN. GERENTE vê a de outro gerente, inclusive as ações do ROOT.
