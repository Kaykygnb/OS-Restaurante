# Formatos para o front

Exemplos capturados com o harness dos testes (`tests/frente.test.ts` e o mesmo `app.inject`). Cabeçalho comum das rotas autenticadas: `Authorization: Bearer <token>`.

Em produção a web e a API saem do mesmo processo, na mesma porta. `src/servidor.ts` escuta em `0.0.0.0` com `PORT` (padrão **3333**). As rotas existem sem prefixo e de novo em `/api`. O `index.html` de `web/dist` (ou `WEB_DIST`) responde no que não for rota da API. O `url_web` de `/rede/conexao` usa essa porta.

## Login

`POST /auth/login` e `POST /login` são a mesma rota.

Request:

```json
{ "usuario": "admin_teste", "senha": "SenhaTeste1!" }
```

`login` no lugar de `usuario` também é aceito.

200:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidGlwbyI6IkFETUlOIiwiaWF0IjoxNzk1Njg2NDU2LCJleHAiOjE3OTU3Mjk2NTZ9.SRGcpsmpoQn1qBsazosbsU8_SnATj3ULWo6IDd5glT4",
  "usuario": { "id": 1, "nome": "Admin Teste", "tipo": "ADMIN", "pode_operar_caixa": true }
}
```

401, usuário ou senha errados, ou usuário desativado:

```json
{ "erro": "Usuário ou senha inválidos", "codigo": "credenciais_invalidas" }
```

429, depois de 5 falhas:

```json
{ "erro": "Muitas tentativas. Aguarde para tentar de novo.", "codigo": "muitas_tentativas", "tentar_em_s": 60 }
```

## GET /auth/me

Request: sem corpo. 200:

```json
{ "id": 1, "nome": "Admin Teste", "tipo": "ADMIN", "pode_operar_caixa": true, "ativo": true }
```

Usuário desativado, com o token antigo ainda na mão: **401** `{ "erro": "Usuário indisponível. Faça login novamente" }`.

## PATCH /usuarios/:id

Só GESTAO (GERENTE+). O corpo mínimo é a permissão de caixa.

Request:

```json
{ "pode_operar_caixa": true }
```

200 (cadastro sem senha):

```json
{
  "id": 3,
  "matricula": null,
  "tipo_usuario": "ATENDENTE",
  "nome": "Alvo",
  "login": "alvo_doc_1795686456985",
  "email": null,
  "telefone": null,
  "ativo": true,
  "pode_operar_caixa": true,
  "createdAt": "2026-11-26T09:47:36.986Z",
  "updatedAt": "2026-11-26T09:47:36.995Z"
}
```

403 se quem chama não pode editar esse usuário: `{ "erro": "Sem permissão para editar este usuário", "codigo": "sem_permissao" }`.

## 403 sem_permissao_caixa

Pagamento, venda rápida e qualquer rota `/caixa/*` exigem `pode_operar_caixa`.

`POST /vendas/rapida` e `GET /caixa/atual`, com atendente sem a permissão, responderam:

```json
{ "erro": "Sem permissão para operar o caixa.", "codigo": "sem_permissao_caixa" }
```

## GET /relatorios/dashboard

`GET /relatorios/dashboard?de=2026-11-26&ate=2026-11-26` (GESTAO). Não há `lucro` nem `margem`.

Trecho real com uma conta fechada de R$ 20,00, um desconto de R$ 5,00 e um item cancelado de R$ 15,00:

```json
{
  "faturamento_centavos": 2000,
  "faturamento_agregado": {
    "por_dia": [
      {
        "dia": "2026-11-26",
        "faturamento_centavos": 2000,
        "atendimentos": 1,
        "anterior": { "dia": "2026-11-25", "faturamento_centavos": 0, "atendimentos": 0 }
      }
    ],
    "por_semana": [
      {
        "inicio": "2026-11-23",
        "fim": "2026-11-29",
        "faturamento_centavos": 2000,
        "atendimentos": 1,
        "anterior": { "inicio": "2026-11-16", "fim": "2026-11-22", "faturamento_centavos": 0, "atendimentos": 0 }
      }
    ],
    "por_mes": [
      {
        "inicio": "2026-11-01",
        "fim": "2026-11-30",
        "faturamento_centavos": 2000,
        "atendimentos": 1,
        "anterior": { "inicio": "2026-10-01", "fim": "2026-10-31", "faturamento_centavos": 0, "atendimentos": 0 }
      }
    ]
  },
  "por_funcionario": [
    {
      "usuario_id": 1,
      "nome": "Admin Teste",
      "cancelamentos_qtd": 1,
      "cancelamentos_centavos": 1500,
      "descontos_qtd": 1,
      "descontos_centavos": 500
    }
  ]
}
```

O corpo completo também traz `fuso`, `periodo_anterior`, ticket médio, `por_dia`, `por_hora` (0–23), produtos, `por_tipo`, `por_forma_pagamento`, `por_garcom`, `cancelamentos_por_usuario` e `descontos_por_usuario`. Dia sem movimento devolve `por_funcionario: []`.

400 se `de` for depois de `ate`: `{ "erro": "A data inicial é depois da final.", "codigo": "periodo_invalido" }`.

## Balcão e numero_dia

`POST /atendimentos`

```json
{ "tipo_atendimento": "BALCAO", "cliente_nome": "Ana" }
```

201, trecho que importa (o restante é a conta aberta):

```json
{
  "id": 1,
  "codigo_atendimento": "AT0001",
  "tipo_atendimento": "BALCAO",
  "status": "ABERTO",
  "numero_dia": 1,
  "dia_operacao": "2026-11-26",
  "cliente_nome": "Ana"
}
```

`numero_dia` é a senha do dia em `America/Sao_Paulo`. Reinicia no dia seguinte. Duas aberturas ao mesmo tempo não repetem o número. No cupom de produção sai a linha `SENHA 1`.

## KDS

`GET /pedidos/cozinha?estacao=cozinha` ou `estacao=bar`. Cozinheiro pode chamar. Item sem preparo e categoria que não imprime ficam de fora. `atraso_min` vem da configuração (padrão 15).

200:

```json
{
  "estacao": "cozinha",
  "atraso_min": 15,
  "agora_servidor": "2026-11-26T09:47:48.841Z",
  "pedidos": [
    {
      "id": 1,
      "codigo_pedido": "PD0009",
      "status": "ENVIADO",
      "criado_em": "2026-11-26T09:27:48.827Z",
      "minutos_decorridos": 20,
      "atrasado": true,
      "atendimento": {
        "id": 1,
        "codigo_atendimento": "AT0009",
        "tipo_atendimento": "MESA",
        "numero_dia": 4,
        "mesa": null
      },
      "itens": [
        {
          "id": 1,
          "nome_produto": "Pastel",
          "quantidade": 1,
          "observacao": "sem cebola",
          "escolhas": [],
          "adicionais": []
        }
      ]
    }
  ]
}
```

Estação errada, 400:

```json
{ "erro": "Informe estacao=cozinha ou estacao=bar.", "codigo": "estacao_invalida" }
```

A estação da impressora é o campo `estacao` (`cozinha` ou `bar`). Se estiver vazio, o servidor olha o nome (cozinha ou bar).

## 409, duas contas na mesma mesa

Segunda abertura da mesa 8801:

```json
{
  "erro": "Mesa 8801 já tem atendimento aberto",
  "codigo": "mesa_ocupada",
  "atendimento_id": 2,
  "codigo_atendimento": "AT0002"
}
```

O mesmo 409 vale para duas requisições simultâneas: uma 201 e a outra 409.

## GET /impressoras/status

200, lista. Exemplo com uma impressora em erro:

```json
[
  {
    "id": 1,
    "nome": "Cozinha doc",
    "status": "erro",
    "ultimo_erro": "sem papel",
    "desde": "2026-11-26T09:47:37.051Z"
  }
]
```

`status` é `ok`, `erro` ou `sem_resposta`. `ultimo_erro` é `null` quando não há erro.

## SSE impressora.status

`GET /eventos` (ou `/api/eventos`), `text/event-stream`, token na query `?token=` ou no `Authorization`. Quando o status da impressora muda, a mensagem é:

```
id: 5
data: {"tipo":"impressora.status","id":1,"versao":5,"server_time":"2026-11-26T09:47:37.055Z"}
```

`id` é o id da impressora. A tela busca de novo `GET /impressoras/status`.

## GET /impressao/fila?status=ERRO

200:

```json
[
  {
    "id": 1,
    "tipo_documento": "PRODUCAO",
    "status": "ERRO",
    "tentativas": 0,
    "ultimo_erro": "sem papel",
    "proxima_tentativa_em": null,
    "criado_em": "2026-11-26T09:47:37.052Z",
    "impresso_em": null,
    "pedido_id": null,
    "atendimento_id": null,
    "impressora": { "id": 1, "nome": "Cozinha doc", "ultimo_status": "ERRO", "ultimo_erro": "sem papel" }
  }
]
```

Sem `status`, a lista mistura PENDENTE, ERRO, IMPRESSO e CANCELADO.

## GET /produtos/mais-vendidos

`GET /produtos/mais-vendidos?limite=2&dias=30`. Não passa por `/produtos/:id`.

200:

```json
[
  {
    "posicao": 1,
    "produto_id": 1,
    "produto_variante_id": 1,
    "nome": "Prod_1795686456734",
    "variante_nome": "Padrão",
    "preco_centavos": 6650,
    "qtd_vendida": 0,
    "esgotado": false
  }
]
```

Restaurante sem venda completa com o cardápio e `qtd_vendida: 0`.

## GET /configuracoes/modulos

Qualquer usuário logado. 200:

```json
{ "estoque_nivel": 0, "usa_gaveta": false, "delivery": true, "promocoes": false }
```

Sem token, 401: `{ "erro": "Faça login" }`.

`GET /configuracoes` (cadastro inteiro) continua só para ADMIN. Cozinheiro recebe 403.

## GET /rede/conexao

GESTAO. 200 capturado neste ambiente:

```json
{
  "porta": 3333,
  "enderecos": [{ "ip": "172.30.0.2", "interface": "enp0s3" }],
  "url_web": "http://172.30.0.2:3333/",
  "url_app": "osrestaurante://conectar?host=172.30.0.2&porta=3333&nome=Teste"
}
```

Atendente, 403: `{ "erro": "Sem permissão" }`. Sem IPv4 privado, `enderecos` vem `[]` e `url_web` / `url_app` vêm `null`.

## GET /api/saude

Público. O mesmo corpo em `GET /saude`.

```json
{ "app": "os-restaurante", "versao": "1.0.0", "nome_restaurante": "Teste" }
```
