# Versão permanente pós-Chic Friday — preparação em 17/11/2026

Branch independente: `fix/post-chic-permanent-2026`, baseada exclusivamente em `Adula-Shopify` (`0472f65395eac2d3e1c47fb0f8844fd082d7f4ef`). Melhorias selecionadas do PR #45 (`2649e7b6df56a054602bb1d7cb008914dae75815`). Nenhum merge, deploy, publicação, alteração de domínio/DNS, catálogo, desconto ou CSV importado. O tema de teste `168887910563` não recebeu nenhuma escrita nesta etapa. A nova versão deve ser revisada para uso a partir de **01/12/2026, horário de São Paulo**, sem ativação agendada.

## Comparação das versões

| Área | Chic Friday do PR #45, já testada remotamente em 17/11 | Nova versão permanente, validada localmente |
|---|---|---|
| Preços | Apresentação de campanha por coleção/data e exclusões aprovadas | Preço cadastrado da variante; nenhuma multiplicação por 0,8, data ou coleção promocional |
| Etiquetas | CHIC FRIDAY nos cards e galeria elegíveis | Etiquetas normais do Prestige; regras e CSS da campanha removidos, inclusive os que já estavam na base oficial |
| SEO | Descrições alternativas, OG numérico e ProductGroup promocional | Descrições alternativas e OG numérico preservados; `product \| structured_data` nativo preservado, sem prazo promocional |
| Anel Adriana, exemplo | R$ 55,20; Giftback estimado R$ 5,52 | R$ 69,00; Giftback estimado R$ 6,90, com os mesmos dados cadastrais simulados |
| Shop the Look | Soma/variante com preço visual da campanha; três peças reais por R$ 133,60 no teste anterior | Soma e atualização de preços por variante preservadas usando preços cadastrados; o mesmo look teria R$ 167,00 se o cadastro permanecer igual |
| Wishlist | Card salva favorito; página do app mostrou R$ 99,00 para Eva vs PDP R$ 79,20; botão PDP ausente | Proteção de carregamento tardio preservada; R$ 99,00 é compatível com preço normal do mesmo cadastro, mas integração real do app permanece pendente |
| Galeria/variantes | Galeria nativa com etiqueta temporária; variante Rosa correta no carrinho, foto cadastrada incorreta | Galeria e seleção nativas preservadas; apenas etiqueta/CSS temporários retirados. Cadastro de mídia não alterado |
| Brindes | Pausa mantida; testes reais anteriores acima de R$ 199 e R$ 399 sem inclusão | Automação normal preparada, com um único motor ativo e testes simulados dos limites, troca de faixa e duplicatas |
| Theme Check | 0 erros / 154 avisos | 0 erros / 152 avisos; base oficial tinha 4 erros / 159 avisos no levantamento anterior |
| Teste remoto da nova branch | Não se aplica | **Não realizado: não houve deploy** |

As evidências remotas da campanha são as da etapa anterior, não uma nova homologação nem evidência da nova branch. Não foram refeitos testes de checkout/pagamento, emissão/resgate de Giftback, LCP/CLS/INP ou indexação Google.

## Código permanente incorporado e adaptado

- `layout/theme.liquid`: mantém fallback de descrição de coleção; remove redirecionamento JavaScript legado para âncora inadequada. O 301 HTTP revisado continua dependendo de etapa administrativa separada; este PR não o cria.
- `snippets/social-meta-tags.liquid`: preço OG numérico, sem vírgula monetária; usa a variante selecionada.
- `snippets/adula-display-price.liquid`: contrato neutro em centavos, que retorna exclusivamente o preço cadastrado. Substitui o helper temporário em Shop the Look, OG e Giftback.
- `snippets/product-giftback.liquid`: mantém a estimativa explícita de 10% e a informação de que descontos no carrinho podem alterar o valor final. Não modifica o sistema de créditos.
- `sections/adula-shop-the-look.liquid`: mantém seleção inicial disponível, IDs por variante e atualização do preço individual e soma; sem regras de campanha. As diferenças de `compare_at_price` normais continuam sendo tratadas pelo restante do tema.
- `sections/footer.liquid`: mantém proteção para app/botão ausente, observação de inserção tardia, tentativa temporizada e execução única do reposicionamento.
- `blocks/_dynamic-grid-item.liquid`, `sections/predictive-search.liquid`, `snippets/select.liquid`, `snippets/variant-picker.liquid`: correções de Theme Check e documentação do PR #45; não alteram dados de variantes.
- `snippets/product-gallery.liquid`, `snippets/product-badges.liquid`, `assets/theme.css`: removem etiquetas e animações temporárias já presentes na branch oficial. Os badges normais exigem desconto real na variante e preço de comparação positivo, evitando divisão por zero. Carrossel, zoom, thumbnails e filtros de mídia por variante foram mantidos.
- `snippets/price-list.liquid`, `snippets/product-card.liquid`, `sections/main-product.liquid`, `snippets/microdata-schema.liquid`: preservados da base oficial. Não são copiados os quatro arquivos promocionais nem o ProductGroup temporário do PR #45.
- `config/`, `templates/`, `locales/` e os workflows existentes: preservados. “Chic sans effort” e “Boho Chic” são identidade/coleções permanentes, não regras da Chic Friday.

## Brindes normais: preservação e correção de concorrência

A base oficial desativa o carregamento de `adula-gift-tier-guard-v2.js` e oculta a barra, mas mantém um motor legado no início de `adula-product-card-variants-v2.js`. Restaurar simplesmente o script carregaria dois responsáveis pela inclusão. Além disso, o legado usa o ID antigo de chaveiro `47876818075811`.

A nova branch carrega o motor v2 que resolve o ID pelo handle e define `window.AdulaAutoGiftsEnabled = true`. Seus dois blocos exigem essa autorização booleana. O motor legado permanece no arquivo, desativado por padrão por uma chave separada `AdulaLegacyAutoGiftsEnabled` nunca habilitada no layout. O restante dos listeners de variantes dos cards permanece intacto. Isso também permite pausar o v2 sem ativar acidentalmente o legado. Não habilitar ambos.

O fallback do chaveiro no v2 foi atualizado para `48066040496291`, confirmado pelo catálogo público nesta etapa; bandeja `47977612837027`. Nenhum ID, SKU ou preço de produto foi alterado na Shopify. `sections/cart-drawer.liquid` retoma o markup normal da barra, anterior à pausa do PR #43.

Os testes simulados cobrem R$ 198,99 / R$ 199,00 / R$ 398,99 / R$ 399,00, subida e descida de faixa, exclusão do valor do próprio brinde da elegibilidade e deduplicação. **Isso não comprova gratuidade administrativa dos brindes**: descontos/condições de benefício devem ser conferidos antes do futuro deploy. O levantamento anterior detectou desconto de 20% quando adicionados manualmente; nada foi modificado nessa elegibilidade.

## Wishlist: causa, limites e proposta compatível com ambos os temas

### Causas confirmadas

1. `templates/page.lista-de-desejos.json` carrega `wishlist-power/blocks/block-wishlist-page-listing`, com seleção de variante em popup. A listagem do app não usa `snippets/price-list.liquid` nem o helper de apresentação da campanha; exibe o preço cadastrado de R$ 99,00 para o Anel Eva. No tema Chic Friday, a PDP exibe R$ 79,20 sem mudar o cadastro. Esse é um desencontro entre duas apresentações, não autorização para alterar o catálogo ou o desconto.
2. `templates/product.json` não contém o bloco de produto do Wishlist Power que o seletor de `sections/footer.liquid` espera (`[id*="_block_wishlist_product_page_button_"] ooo-wl-access-button`). O script do PR #45 evita erro e aguarda carregamento tardio, mas não cria um bloco ausente. O botão dos cards e a página de favoritos existem; isso não comprova o botão na PDP.
3. O teste remoto anterior salvou e recuperou um favorito via card. O clique para remover não teve conclusão confirmada. A causa da remoção permanece não determinada e exige reprodução com o app real; não foi atribuída ao tema sem evidência.

### Correção proposta — ainda não aplicada ao app/temas

- Conferir no editor de cada tema o bloco oficial de botão do Wishlist Power na seção principal do produto, com o identificador real da extensão instalada. Inserir/configurar esse bloco pelo mecanismo suportado pelo app, preservando a proteção de carregamento tardio. Não adivinhar o tipo/UUID de um bloco nem injetar controles falsos.
- Confirmar com a documentação/suporte do app a extensão suportada para preços ou um renderer de cards customizado. Usar preço por variante, compare-at, moeda/mercado e formatação do tema. Na versão normal, a fonte é `adula-display-price`; na versão Chic Friday, a fonte é o helper de campanha já aprovado. Pode-se adotar o mesmo nome de contrato nas duas branches e manter a implementação própria de cada tema. Isso é uma proposta futura: nenhum arquivo foi enviado ao Chic Friday.
- Se o app não oferecer extensão compatível, preparar integração própria usando a API documentada do app para favoritos e renderização Liquid/Section Rendering para preços. Não reescrever valores por substituição global de DOM, não aplicar 20% indiscriminadamente e não depender de estado privado do app.
- Homologar salvar, persistir, remover e limpar favorito de teste, botão PDP, variante disponível/indisponível, preço do favorito/PDP/carrinho, SALE, Santuário, brindes, moeda/mercado e virada da data. Validar novamente após inserção tardia e mudança de variante.

## Conferência completa de publicação nos canais — preparada, não executada no Admin

Esta sessão dispõe de autenticação da CLI de temas, mas **não de token Admin com leitura de produtos/publicações**. Não foram lidos segredos do navegador/CLI para contornar essa separação e não foi solicitado acesso adicional. O catálogo público retornou 850 produtos em páginas de até 250. Ele demonstra visibilidade pública observada, não todos os produtos administrativos, não `status=ACTIVE`, não todos os canais e não descontinuação dos ausentes.

`scripts/audit-sales-channel-publications.mjs` prepara consulta **somente leitura**, sem mutations, a todas as publicações visíveis à integração e a todos os produtos, inclusive DRAFT/ARCHIVED, por paginação. Consulta `publishedOnPublication` de cada produto para cada publicação; não depende de filtro apenas por produtos publicados. Confere integralidade e repetição de produto/canal e detecta mudança de versão/status durante as consultas. Erros de acesso, dados ausentes e ID de canal incorreto interrompem a geração em vez de produzir aprovação incompleta.

Execução futura, com acesso de leitura já autorizado à integração (escopos `read_products` e `read_publications`), sem imprimir o token:

```sh
SHOPIFY_SHOP=adula-brasil.myshopify.com \
ONLINE_STORE_PUBLICATION_ID='gid://shopify/Publication/ID_CONFIRMADO_NO_ADMIN' \
OUTPUT_DIR=sales-channel-audit \
node scripts/audit-sales-channel-publications.mjs
```

`SHOPIFY_ADMIN_ACCESS_TOKEN` deve estar definido no ambiente seguro. O script exige o ID confirmado de Loja virtual, sem inferir pelo nome traduzido. Saída: `sales-channel-publications.json` e `.csv`, com produto, status, canal, publicado/não publicado, URL e atualização; listas de ACTIVE ausentes da Loja virtual e de não ACTIVE publicados. A API 2026-10 e os escopos foram testados com mocks, não homologados com o Admin real nesta etapa.

Checklist de revisão:

1. Confirmar identidade da loja, integração, escopos e ID da publicação Loja virtual; confrontar a lista de canais retornada com os canais instalados no Admin, identificando qualquer canal invisível à integração.
2. Auditar todos os estados e páginas; comparar totais e data de exportação com o Admin. Não usar apenas disponibilidade em estoque como sinal de publicação.
3. Separar ACTIVE publicado, ACTIVE não publicado, DRAFT, ARCHIVED, publicação futura e produtos intencionalmente exclusivos de outros canais. Para agendamentos futuros, confrontar o calendário do Admin; o booleano do script não explica a data programada.
4. Revisar as exceções individualmente com a equipe comercial; não publicar automaticamente todos os ACTIVE. Conferir mercados/catálogos, disponibilidade de variante e URLs públicas em teste separado.
5. Cruzar o resultado administrativo com os arquivos de URLs deste relatório por handle/ID, validando equivalência comercial e destino HTTP 200. Decidir quais peças foram descontinuadas com evidência administrativa/comercial, não apenas ausência no endpoint público.

## URLs antigas e produtos

`scripts/classify-legacy-product-urls.py` cruzou o mapa das 909 URLs da auditoria do PR #45 com um novo snapshot público de 850 produtos, obtido nesta etapa. Não reexecutou as 909 requisições HTTP nem aplicou/importou os 53 redirecionamentos.

| Resultado | Quantidade | Interpretação |
|---|---:|---|
| `PRODUTO_PUBLICADO_OBSERVADO` | 657 URLs | Destino de produto presente no catálogo público ou slug normalizado único; conferir equivalência comercial antes de 301 |
| `CONTEUDO_OU_CATEGORIA` | 72 URLs | Home, coleção ou conteúdo identificado no mapa anterior |
| `SEM_EQUIVALENCIA_CONFIRMADA` | 180 URLs | Revisão administrativa/comercial pendente; não implica descontinuação |
| Descontinuadas com comprovação | 0 | Não há evidência administrativa suficiente nesta sessão |

Arquivos:

- `urls-antigas-classificadas.csv`: todas as 909 URLs, evidência, estado administrativo desconhecido e sugestão separada.
- `produtos-publicados-com-url-antiga.csv`: as 657 correspondências; **URLs**, não necessariamente 657 produtos distintos.
- `urls-para-decisao-comercial.csv`: 180 URLs pendentes, com sugestões aproximadas explicitamente não aprovadas quando existirem.
- `catalogo-publico-observado.csv`: os 850 produtos públicos, contagens de variantes e `published_at` público; canais/status administrativos marcados não conferidos.
- `classificacao-resumo.json`, `validation-summary.json`, `theme-check.json`: resumos, hashes/fontes e validação.

“Mesmo slug” é evidência de identificação, não prova de SKU, material ou coleção equivalentes. Nenhuma sugestão aproximada entra como correspondência confirmada. Um produto sem estoque pode estar ativo e publicado; um produto ausente pode estar em rascunho, arquivado ou fora da Loja virtual. Para descontinuado confirmado, registrar decisão comercial e estado administrativo; só então decidir 301 para substituto equivalente ou 404/410, sem redirecionar indiscriminadamente à home.

Reprodução com o mapa e um snapshot público exportados:

```sh
python scripts/classify-legacy-product-urls.py auditoria-909-urls.csv products.json reports/post-chic-refresh
```

O hash do snapshot usado está em `validation-summary.json`; o JSON público completo não foi duplicado no Git. Não há token ou dado de cliente nesses relatórios.

## Testes e riscos para a futura aprovação

`npm test --prefix tests/post-chic`: **30 cenários aprovados** — 14 de apresentação/DOM, 10 de brindes, 4 de auditoria Admin simulada e 2 de classificação de URLs. `shopify theme check --path . --output json`: **0 erros / 152 avisos**. `git diff --check` sem erros. Os testes usam filtros Shopify, app, carrinho e Admin simulados; não comprovam a integração real do Wishlist Power, renderização remota da branch, checkout ou crédito Giftback.

Antes de autorizar qualquer retorno ao ar:

1. Resolver/homologar a integração da wishlist nos dois temas; permanece parcial.
2. Conferir Admin/canais, decisões das URLs pendentes e elegibilidade/gratuidade dos brindes. Confirmar administrativamente o término da promoção em 30/11; o tema não encerra descontos Shopify.
3. Revisar a associação de mídia da variante `47861271036067` (12 / Quartzo Rosa), cuja imagem de destaque identificada é `#pedra_turquesa`. Isso é cadastro, não corrigido por troca de tema.
4. Homologar esta branch em um **outro tema não publicado**, após autorização específica, preservando `168887910563`. Conferir SEO, dados estruturados, wishlist, Shop the Look, Giftback, variantes, carrinho, brindes e dispositivos móveis reais.
5. Revisar o efeito do merge: `.github/workflows/publish-shopify-theme.yml` faz deploy automático em pushes da branch oficial. Por isso, o PR fica em rascunho; **merge é uma ação de deploy nesta configuração**, a ser aprovada conjuntamente com o plano da virada. Nenhum workflow foi disparado aqui.

Não há agendamento, publicação, merge ou alteração do tema Chic Friday neste PR.
