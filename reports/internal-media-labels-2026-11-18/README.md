# Auditoria e correção — marcadores internos nas imagens

Repositório: `adulabrasil/adula-shopify`. Branch isolada: `fix/hide-internal-media-labels-2026`, baseada na oficial `Adula-Shopify`, commit `0472f65395eac2d3e1c47fb0f8844fd082d7f4ef`. Relatório de 18/11/2026.

## Resultado e causa

O catálogo público consultado contém **868 produtos**. Os 868 feeds `/products/<handle>.js` foram consultados, sem falhas. Encontramos **960 imagens de 376 produtos** cujo texto alternativo contém marcadores técnicos. Não encontramos o padrão `#chave_valor` nos títulos comerciais, descrições, tags, nomes/valores de opções ou títulos das variantes desses produtos. Também não encontramos títulos de produtos iguais aos seus SKUs na comparação realizada.

A causa confirmada é a combinação de dados de agrupamento em `media.alt` com sua impressão como texto alternativo das imagens. O Prestige interpreta esses dados em `snippets/product-gallery.liquid` para selecionar as fotos da opção escolhida; portanto, **não apagar esses marcadores em massa na Shopify**. Sua origem histórica (importação Bagy ou edição posterior) não pode ser determinada pelos endpoints públicos.

No código original, o filtro `image_tag` herda o alt técnico quando o tema não fornece um alt explícito. `assets/theme.js` e `assets/adula-product-card-variants-v2.js` também recolocam `media.alt` bruto ao trocar imagens dos cards. A ampliação da busca identificou imagens de produto reutilizadas no menu e na navegação de categorias.

| Família encontrada | Imagens |
|---|---:|
| `#cor_…` | 656 |
| `#pedra_…` | 166 |
| `#pedras_…` | 13 |
| `#signos_…` | 63 |
| `#pingente de letra_…` | 53 |
| `#cores_…` | 1 |
| `#cor de metal semijoias_…` | 8 |

São dados auxiliares de imagens, não os nomes comerciais das variantes. Exemplos de produtos afetados: Pulseira Greta Boho Chic Perola Natural, Pulseira Eva, Pulseira Débora e Anel Adriana Dourado. A lista completa está em [produtos-afetados-376.csv](produtos-afetados-376.csv); o detalhamento por mídia está em [midias-afetadas-960-NAO-IMPORTAR.csv](midias-afetadas-960-NAO-IMPORTAR.csv).

## Verificações reais, somente leitura, antes da correção

Foram obtidas respostas HTTP 200 nas oito superfícies abaixo. O HTML retornado não apresentou os marcadores como texto comum fora de scripts/styles; eles apareceram em atributos `alt`. Isso os expõe a leitores de tela e pode torná-los visíveis quando a imagem não carrega. Não foi comprovada sua exibição como uma etiqueta comercial desenhada na tela.

| Superfície pública | Caminho | Atributos técnicos |
|---|---|---:|
| Inicial | `/` | 4 |
| Coleção de anéis | `/collections/aneis` | 14 |
| Coleção Prata 925 | `/collections/prata-925` | 10 |
| Busca | `/search?q=anel&type=product` | 18 |
| Busca preditiva | `/search/suggest?q=anel&resources[type]=product&section_id=predictive-search` | 6 |
| Produto | `/products/anel-adriana-dourado` | 59 |
| Produto com acabamento | `/products/pulseira-greta-boho-chic-perola-natural` | 8 |
| Recomendações | `/recommendations/products?product_id=9180337701027&section_id=related-products&limit=8&intent=related` | 3 |

Evidências: [public-surfaces-before.json](public-surfaces-before.json) e [catalog-scan-summary.json](catalog-scan-summary.json). As contagens incluem repetições da mesma imagem em componentes distintos. O catálogo público não representa produtos privados, arquivados ou rascunhos do Admin. `products.json` não fornece os alts das imagens; a confirmação desses campos utilizou os feeds individuais `.js`.

## Correção preparada

O novo snippet `adula-customer-media-alt.liquid` remove somente as sete famílias de marcadores confirmadas **na saída de apresentação**. Mantém a descrição comercial que precede os metadados e hashtags desconhecidas, como `#feito_no_brasil`. Se sobrar texto vazio, utiliza o nome comercial do produto ou o título do componente. O mesmo comportamento foi aplicado às duas rotinas JavaScript carregadas pelo tema, para impedir que a troca de foto reintroduza o marcador.

Exemplos:

- `#cor_prata 925` → nome comercial do produto no alt exibido.
- `Detalhe do anel #pedra_rosa` → `Detalhe do anel`.
- `Foto #feito_no_brasil` → permanece igual.

O alt bruto permanece intacto no cadastro e no JSON utilizado pelo Prestige. O bloco que calcula `filtered_indexes`, a associação de mídia às variantes, IDs, URLs, src/srcset, dimensões e carregamento das fotos foram preservados. Os três nomes completos continuam intactos: **Dourado (Banho Ouro 18k)**, **Prateado (Banhado a Ródio Branco)** e **Prata 925 (Prata 925 Legítima)**. Não houve alteração nos valores/labels dos filtros.

Como proteção adicional, `custom.badges` deixa de imprimir marcadores dessas mesmas famílias quando usados isoladamente como badges. Não encontramos evidência pública de badges técnicos nesse metafield; a alteração é preventiva, preservando rótulos comerciais. Tags de produto são lidas para regras existentes, sem impressão indiscriminada de todas as tags. O script antigo `assets/adula-product-card-variants.js` também contém cópia de alt bruto, mas não é carregado por nenhuma referência Liquid do repositório; o layout utiliza `-v2.js`. O arquivo antigo foi mantido sem ativação.

## Arquivos de código modificados

| Área | Arquivos | Alteração |
|---|---|---|
| Regra comum | `snippets/adula-customer-media-alt.liquid` (novo) | Limpeza seletiva da apresentação |
| Troca de imagens | `assets/theme.js`, `assets/adula-product-card-variants-v2.js` | Alt comercial nas atualizações por JavaScript |
| Vitrines/recomendações | `snippets/product-card.liquid`, `snippets/product-card-horizontal.liquid` | Imagens principal e secundária e fallback comercial |
| Galeria/variantes | `snippets/media.liquid`, `snippets/product-gallery.liquid`, `snippets/option-value.liquid` | Alt das fotos, thumbnails e swatches; agrupamento e valores dos filtros preservados |
| Produto/carrinho | `sections/main-product.liquid`, `snippets/line-item.liquid`, `snippets/pickup-availability.liquid`, `sections/quick-order-list.liquid` | Miniaturas e barra fixa de compra |
| Menus e coleções | `snippets/mega-menu-images.liquid`, `sections/adula-category-navigation.liquid`, `sections/collection-list.liquid`, `sections/main-list-collections.liquid`, `sections/collection-banner.liquid`, `snippets/collection-promo-block.liquid`, `snippets/predictive-search-result-item.liquid` | Imagens reutilizadas e resultados de coleções |
| Shop the Look | `sections/adula-shop-the-look.liquid` | Alt do produto vinculado |
| Badges/social | `snippets/product-badges.liquid`, `snippets/social-meta-tags.liquid` | Proteção de rótulos personalizados e twitter:image:alt |

A relação verificável dos 22 arquivos está em [code-files.json](code-files.json). Não foram alterados templates, configurações, traduções, CSS, seletores de variantes ou regras de preços. Scripts e pausas de brindes, campanha, wishlist e demais funções foram preservados.

## Testes locais após a correção

- **33 cenários aprovados**, sem falhas, em LiquidJS, JSDOM e VM JavaScript.
- **960 alts reais** do catálogo produziram o mesmo resultado em Liquid e nas duas implementações JavaScript; os marcadores identificados não permaneceram na apresentação.
- Renderização de mídia, cards normal/horizontal, galeria, miniaturas e barra fixa; caracteres especiais e fallback comercial conferidos.
- Agrupamento, mídia selecionada/oculta e `filtered-indexes` iguais antes/depois na galeria de teste.
- Dados de mídia congelados nos testes JavaScript; caminhos/dimensões de imagem preservados.
- As três variantes completas, hashtags comerciais, badges comerciais e preços/filtros/guard de brindes tiveram verificações de preservação.
- `node --check` nos dois assets e `git diff --check`: aprovados.
- **Shopify Theme Check: 4 erros e 172 avisos, idênticos aos da base oficial usando a mesma versão da CLI; nenhum apontamento novo.** O comando retorna código 1 pelos erros preexistentes. Evidência: [theme-check-comparison.json](theme-check-comparison.json).

Erros preexistentes, fora do escopo: tipo `array` na documentação de `snippets/select.liquid` e `snippets/variant-picker.liquid`; chave de tradução inexistente em `sections/predictive-search.liquid`; bloco `subheading` inexistente em `blocks/_dynamic-grid-item.liquid`. Nenhum foi corrigido neste PR para evitar incorporar alterações paralelas.

Para reproduzir os testes locais (Node 22 ou superior):

```bash
npm ci --prefix tests/internal-media-labels
npm test --prefix tests/internal-media-labels
node --check assets/theme.js
node --check assets/adula-product-card-variants-v2.js
shopify theme check --path .
git diff --check
```

Os filtros específicos Shopify e a tag `form` são simulados no teste LiquidJS. Esses resultados não substituem a renderização no servidor Shopify, testes visuais mobile ou uma compra real. [test-results.json](test-results.json) registra o escopo.

## Cadastro e eventual ação em massa

**Não é necessário modificar dados de produtos para aplicar esta correção.** Os 376 produtos estão listados para rastreabilidade. O arquivo [proposta-descricao-alt-NAO-APLICAR.csv](proposta-descricao-alt-NAO-APLICAR.csv) é uma proposta de revisão, não um CSV de importação Shopify: acrescenta um prefixo comercial aos alts compostos apenas por metadados e mantém o sufixo técnico original. Nada foi aplicado.

Se houver autorização futura para enriquecer os alts no Admin: exportar e guardar backup dos valores por `product_id`/`media_id`, revisar a proposta, testar poucos produtos em tema não publicado e só então executar uma atualização em massa por ferramenta aprovada, com restauração dos valores originais disponível. Não usar o CSV padrão de produtos para apagar marcadores nem trocar fotos/associações de variantes. A correção do tema independe dessa etapa opcional.

## Limites e próximo teste

Este PR não foi enviado a nenhum tema Shopify. O site público e os temas Chic Friday/dezembro permanecem inalterados. Não houve escrita no Admin, acesso à Bagy, merge, publicação, deploy ou alteração de domínio/DNS, produtos, SKUs, preços, estoques, fotos ou URLs.

Antes de liberar a correção, validar em uma cópia não publicada do tema, após autorização: inicial/menu desktop e mobile, coleções com filtros, busca normal/preditiva, recomendações e Shop the Look; alternar os três acabamentos e conferir foto, zoom, thumbnail e miniatura da barra fixa; conferir carrinho e recarga dinâmica de cards. Verificar também a wishlist: o renderer externo do Wishlist Power pode criar suas próprias imagens fora destes snippets. Não foi alterado o código do aplicativo, nem validada sua tela dinâmica após deploy. Se o aplicativo imprimir o alt bruto, usar o mecanismo de customização suportado por ele e repetir o teste; não apagar os dados de agrupamento como contorno.

A pesquisa abrangeu todos os arquivos de código do repositório e o catálogo público acessível, com as amostras HTTP acima. Conteúdo privado do Admin, metafields não expostos, campos livres dos demais banners e renderizações de aplicativos externos não foram inventariados integralmente. Não há evidência suficiente para garantir ausência absoluta de outros códigos internos em toda configuração/conteúdo da loja.
