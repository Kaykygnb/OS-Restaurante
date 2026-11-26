# Cardápio: fluxo, imagens e validação

## Fluxo de cadastro observado

1. Criar/selecionar categoria.
2. Cadastrar nome, descrição, categoria e marcar se o item vai para a cozinha.
3. Criar uma ou mais opções de preço, por exemplo Padrão e Família.
4. Salvar o produto e configurar escolhas/opcionais por opção de preço.
5. Quando necessário, copiar o grupo de escolhas para outras opções. A confirmação nativa do navegador interrompeu a automação nesta etapa; falta repetir manualmente e conferir o resultado na tela.
6. Adicionais são cadastrados em grupos ligados a categorias e podem ter limites e preços próprios.

## Imagens

- Padrão: 640 × 640 px, quadrada, WebP, até 500 KB após compressão.
- Entrada: JPG, PNG, WebP ou AVIF de até 10 MB; o navegador centraliza o corte quadrado, redimensiona e comprime.
- Sem foto ou com falha ao carregar: `web/public/imagem-produto-padrao.svg`.
- A imagem do produto e do adicional é armazenada no servidor; variantes herdam visualmente a imagem do item.

## Cobertura feita

- Criada categoria temporária e produto preparado com duas opções de preço; produto de QA e categoria de QA foram desativados ao final.
- Criado grupo de escolhas “Molho” com quatro opções e preços extras em algumas delas.
- Build de produção do front concluído.
- Rota de imagem exercitada com upload/leitura WebP e rejeição de conteúdo inválido.

## Pendente de repetição visual

- Concluir a cópia das escolhas para a segunda opção de preço.
- Cadastrar um item de revenda, criar/editar um adicional com imagem, validar remoção de imagem e conferir mobile.
- A automação do Chrome foi encerrada pela camada de controle do navegador durante a caixa de confirmação; por isso, estes passos não foram declarados como aprovados.

## Estado dos dados no momento da validação

No banco `servidor/prisma/dev.db`, as categorias já existentes estavam inativas ao encerrar a validação. Os registros temporários desta sessão também ficaram inativos. Nenhuma categoria ou produto preexistente foi reativado ou alterado para evitar modificar dados da loja sem instrução.
