# Como testar o OS Restaurante

Guia curto para testar o sistema no PC do caixa e no celular. Não precisa saber programar: é só copiar e colar os comandos, um de cada vez.

## O que você precisa

- Um PC (Windows, Mac ou Linux) com **Node.js 22 ou mais novo**. Para instalar, baixe em https://nodejs.org (botão "LTS") e avance até o fim.
- O projeto baixado no PC, com as duas partes:
  - **servidor**, a parte do Fernando (branch `fernando/servidor-contratos`);
  - **web**, as telas novas (branch `pricila/front-redesenho`).
- Um celular ligado **no mesmo Wi-Fi** do PC.

Enquanto as duas branches não forem juntadas, use duas pastas: uma com o servidor e outra com a web. Nos exemplos abaixo elas se chamam `os-servidor` e `os-web`. Troque pelos caminhos do seu PC.

## 1. Preparar as telas (uma vez só)

Abra o Terminal (no Windows, "Prompt de Comando" ou "PowerShell") e rode:

```
cd os-web/web
npm install
npm run build
```

Isso cria a pasta `os-web/web/dist`, que o servidor vai mostrar.

## 2. Preparar o servidor (uma vez só)

```
cd os-servidor/servidor
npm install
```

Crie um arquivo chamado `.env` dentro de `os-servidor/servidor` com este conteúdo (troque a senha do root por uma sua, com pelo menos 8 letras ou números):

```
DATABASE_URL="file:./teste-local.db"
JWT_SECRET="troque-por-qualquer-frase-comprida"
SENHA_ROOT_INICIAL="minhasenha123"
PORT=3333
```

Depois crie o banco e o usuário principal:

```
npx prisma generate
npx prisma migrate deploy
npm run seed
```

## 3. Ligar tudo na porta 3333

No Windows (PowerShell):

```
cd os-servidor/servidor
$env:WEB_DIST="C:\caminho\para\os-web\web\dist"; npx tsx --env-file=.env src/servidor.ts
```

No Mac ou Linux:

```
cd os-servidor/servidor
WEB_DIST=/caminho/para/os-web/web/dist npx tsx --env-file=.env src/servidor.ts
```

Deixe essa janela aberta. Enquanto ela estiver aberta, o sistema está ligado. Para desligar, clique nela e aperte **Ctrl + C**.

A web e o servidor saem juntos na mesma porta, a **3333**. Não precisa abrir nada separado.

## 4. Abrir no PC

No navegador do PC (Chrome ou Edge), abra:

**http://localhost:3333**

Entre com o usuário **root** e a senha que você colocou em `SENHA_ROOT_INICIAL`.

Na primeira vez o sistema pede os dados do restaurante (Configurações). Preencha o nome e salve. Depois:

1. **Caixa**: abra o caixa com o troco inicial.
2. **Usuários**: crie a equipe (garçom, cozinha, gerente). Marque **"Pode operar caixa"** para quem pode receber pagamento.
3. **Cardápio**: cadastre alguns produtos.

## 5. Abrir no celular pelo QR

1. No PC, vá em **Conectar celulares** (menu da esquerda).
2. Aparecem dois QRs:
   - **Navegador**: para iPhone ou qualquer celular. Abra a câmera, aponte para o QR e toque no link.
   - **App Android**: para quem tem o app OS Restaurante instalado. Abra o app, toque em "Ler QR" e aponte.
3. Entre com o usuário e a senha do funcionário.
4. Para virar um "app" na tela do celular:
   - no iPhone, toque em Compartilhar › Adicionar à Tela de Início;
   - no Android, abra o menu do Chrome › Adicionar à tela inicial.

Se o celular não abrir:

- confira se ele está **no mesmo Wi-Fi** do PC (não pode estar no 4G/5G);
- se o PC tiver mais de uma rede, escolha na tela a rede do Wi-Fi da equipe;
- no Windows, quando aparecer o aviso do Firewall, clique em **Permitir acesso**. Se não apareceu, libere a porta 3333 no Firewall do Windows;
- se aparecer **"Servidor não encontrado. Leia o QR do caixa de novo"**, o IP do PC mudou: leia o QR de novo. Para isso não acontecer, peça para fixar o IP do PC no roteador.

## 6. Usuários de teste

**No servidor de verdade (passos 1 a 5):**

| Usuário | Senha | O que é |
|---------|-------|---------|
| root | a que você pôs em `SENHA_ROOT_INICIAL` | Dono, vê tudo |
| os que você criar em Usuários | a senha que você definir | Garçom, cozinha, gerente… |

**No modo demonstração (sem servidor, dados de mentira):** todos com a senha **1234**.

| Usuário | Perfil | Pode operar caixa |
|---------|--------|-------------------|
| ze | Dono (root) | Sim |
| marta | Gerente | Sim |
| joao | Atendente | Sim |
| ana | Atendente (garçonete) | Não |
| beto | Cozinha | Não |
| rafa | Entregador | Não |

Para ligar o modo demonstração (só no PC, sem banco):

```
cd os-web/web
npm run dev:mock
```

Abra o endereço que aparecer (normalmente http://localhost:5173). Para voltar os dados ao começo, abra `http://localhost:5173/login?mock_reset=1`. Nesse modo o QR do celular é de exemplo e não abre no telefone.

## 7. O que testar (roteiro de 15 minutos)

1. **Venda rápida** (F2): toque em 2 produtos, "Cobrar", digite o valor recebido e veja o troco.
2. **Mesas** (F3): toque numa mesa livre, lance itens e toque em "Enviar pedido".
3. **Cozinha e bar**: o pedido aparece em "Novos". Toque em "Começar" e depois em "Pronto". Na cozinha, o tablet pode ficar só nessa tela (entre com um usuário de cozinha).
4. **Mesas › Conta / pagar**: receba a conta e feche.
5. **Delivery** (F4): "Novo delivery", digite o telefone, cadastre o cliente com o CEP e veja a taxa.
6. **Caixa**: "Fechar o caixa".
   - Entrando como atendente, ele só digita o que contou (fechamento cego).
   - Entrando como gerente, aparecem o esperado e a diferença.
7. **Relatórios**: mude entre Hoje, 7 dias e Este mês. Veja o faturamento contra o período anterior e os cancelamentos e descontos de cada funcionário.
8. **Auditoria**: veja quem fez o quê (descontos, cancelamentos, aberturas de gaveta).
9. **No celular**: entre como garçom, abra uma mesa e mande um pedido.

## O que ainda não funciona no servidor de verdade

Estas telas já estão prontas, mas o servidor ainda não tem a rota:

- **Estoque › Esgotados agora**: marcar um produto como esgotado.
- **Configurações › Operação**: o nível do estoque não é salvo, fica sempre "desligado".
- **Delivery**: não existe ainda um status próprio de "saiu para entrega" nem a escolha do entregador. O pedido aparece como entregue e a conta fica aberta até receber.

A lista completa está em [`PENDENCIAS-CONTRATO.md`](PENDENCIAS-CONTRATO.md).

## Prints e vídeo

Os prints das telas (PC 1366, celular 390 e tablet 800) e o vídeo curto do fluxo foram entregues à parte, fora do repositório.
