# Como testar o OS Restaurante

Guia curto para testar o sistema no PC do caixa e no celular. Não precisa saber programar: é só copiar e colar os comandos, um de cada vez, na ordem.

Tudo fica numa pasta só (branch `teste/tudo-junto`): o servidor em `servidor/` e as telas em `web/`. O servidor acha as telas sozinho em `web/dist`.

## O que você precisa (uma vez só)

- **Node.js 22 ou mais novo**: baixe em https://nodejs.org (botão "LTS") e avance até o fim.
- **Git**: baixe em https://git-scm.com e avance até o fim.
- Um celular ligado **no mesmo Wi-Fi** do PC.

## Windows (PowerShell)

Abra o menu Iniciar, digite **PowerShell** e abra.

**Uma vez só**, libere o PowerShell para rodar o `npm` (responda **S** se ele perguntar):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 1. Baixar e preparar (uma vez só)

Rode um comando de cada vez:

```powershell
git clone -b teste/tudo-junto https://github.com/Kaykygnb/OS-Restaurante.git os-restaurante
cd os-restaurante\web
npm install
npm run build
cd ..\servidor
npm install
Set-Content -Path .env -Encoding ascii -Value 'DATABASE_URL="file:./teste-local.db"','JWT_SECRET="troque-por-qualquer-frase-comprida"','SENHA_ROOT_INICIAL="minhasenha123"','PORT=3333'
npx prisma generate
npx prisma migrate deploy
npm run seed
```

O `npm run seed` cria o usuário **root** com a senha **minhasenha123**. Para usar outra senha, troque `minhasenha123` no comando do `Set-Content` antes de rodar. A senha precisa ter pelo menos 8 letras ou números.

### 2. Ligar o sistema (toda vez que for testar)

Abra o PowerShell e rode:

```powershell
cd os-restaurante\servidor
npx tsx --env-file=.env src/servidor.ts
```

Deixe essa janela aberta. Enquanto ela estiver aberta, o sistema está ligado. Para desligar, clique nela e aperte **Ctrl + C**.

## Mac ou Linux (Terminal)

```bash
git clone -b teste/tudo-junto https://github.com/Kaykygnb/OS-Restaurante.git os-restaurante
cd os-restaurante/web
npm install
npm run build
cd ../servidor
npm install
printf 'DATABASE_URL="file:./teste-local.db"\nJWT_SECRET="troque-por-qualquer-frase-comprida"\nSENHA_ROOT_INICIAL="minhasenha123"\nPORT=3333\n' > .env
npx prisma generate
npx prisma migrate deploy
npm run seed
npx tsx --env-file=.env src/servidor.ts
```

Nas próximas vezes, basta rodar:

```bash
cd os-restaurante/servidor
npx tsx --env-file=.env src/servidor.ts
```

## 3. Abrir no PC

No navegador do PC (Chrome ou Edge), abra:

**http://localhost:3333**

Entre com o usuário **root** e a senha **minhasenha123** (ou a que você escolheu).

Na primeira vez:

1. **Configurações**: preencha o nome do restaurante e salve.
2. **Caixa**: abra o caixa com o troco inicial.
3. **Usuários**: crie a equipe (garçom, cozinha, gerente). Marque **"Pode operar caixa"** para quem pode receber pagamento.
4. **Cardápio**: cadastre alguns produtos.

## 4. Abrir no celular pelo QR

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
- no Windows, quando aparecer o aviso do Firewall na primeira vez que ligar o sistema, clique em **Permitir acesso** (marque "Redes privadas");
- se aparecer **"Servidor não encontrado. Leia o QR do caixa de novo"**, o IP do PC mudou: leia o QR de novo. Para isso não acontecer, fixe o IP do PC no roteador.

## 5. Usuários de teste

| Usuário | Senha | O que é |
|---------|-------|---------|
| root | minhasenha123 (ou a que você pôs no `.env`) | Dono, vê tudo |
| os que você criar em Usuários | a senha que você definir | Garçom, cozinha, gerente… |

**Modo demonstração** (sem servidor, com dados de mentira, só no PC). Todos os usuários têm a senha **1234**: ze (dono), marta (gerente), joao (atendente que opera caixa), ana (garçonete sem caixa), beto (cozinha) e rafa (entregador).

```powershell
cd os-restaurante\web
npm run dev:mock
```

Abra http://localhost:5173. Para voltar os dados ao começo, abra http://localhost:5173/login?mock_reset=1. Nesse modo o QR é de exemplo e não abre no celular.

## 6. O que testar (roteiro de 15 minutos)

1. **Venda rápida** (F2): toque em 2 produtos, "Cobrar", digite o valor recebido e veja o troco.
2. **Mesas** (F3): toque numa mesa livre, lance itens e toque em "Enviar pedido".
3. **Cozinha e bar**: o pedido aparece em "Novos". Toque em "Começar" e depois em "Pronto".
4. **Mesas › Conta / pagar**: receba a conta e feche.
5. **Delivery** (F4): "Novo delivery", digite o telefone, cadastre o cliente com o CEP e veja a taxa.
6. **Caixa**: "Fechar o caixa".
   - Entrando como atendente, ele só digita o que contou (fechamento cego).
   - Entrando como gerente, aparecem o esperado e a diferença.
7. **Relatórios**: mude entre Hoje, 7 dias e Este mês. Veja o faturamento contra o período anterior e os cancelamentos e descontos de cada funcionário.
8. **Auditoria**: veja quem fez o quê.
9. **No celular**: entre como garçom, abra uma mesa e mande um pedido.

## Começar do zero

Para apagar tudo e recomeçar com o banco vazio, desligue o sistema (Ctrl + C) e rode, dentro de `os-restaurante\servidor`:

```powershell
Remove-Item prisma\teste-local.db*
npx prisma migrate deploy
npm run seed
```

## O que ainda não funciona

Estas telas já estão prontas, mas o servidor ainda não tem a rota:

- **Estoque › Esgotados agora**: marcar um produto como esgotado.
- **Configurações › Operação**: o nível do estoque não é salvo, fica sempre "desligado".
- **Delivery**: não existe ainda um status próprio de "saiu para entrega" nem a escolha do entregador. O pedido aparece como entregue e a conta fica aberta até receber.

A lista completa está em [`PENDENCIAS-CONTRATO.md`](PENDENCIAS-CONTRATO.md).
