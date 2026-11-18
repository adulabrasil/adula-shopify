# PR #48 nas duas versões — Adüla Brasil

Data: 18/11/2026. Regra permanente registrada em `AGENTS.md` nas três branches de revisão. Um único repositório: **adulabrasil/adula-shopify**. Nenhum merge, publicação ou envio de código à Shopify foi realizado nesta etapa.

## Mapeamento confirmado e limites

| Versão | Base Git confirmada | Integração do PR #48 | Situação Shopify |
|---|---|---|---|
| Oficial / permanente | `Adula-Shopify` é a branch oficial; o PR #46 prepara a versão normal em `fix/post-chic-permanent-2026`, commit `6f5fae433066e6d29b225483b35636197a85f8ab` | `fix/official-internal-labels-2026`, derivada do PR #46 | **ID/nome/role do destino Oficial ainda não confirmados no Admin nesta etapa** |
| Chic Friday | PR #45 em `fix/migration-final-review-2026`, commit `2649e7b6df56a054602bb1d7cb008914dae75815`; origem histórica `feature/chic-friday-auto-prices-2026` | `fix/chic-internal-labels-2026`, derivada do PR #45 | O HTML público confirma **TESTE – CHIC FRIDAY 2026**, ID **168887910563**, role **main** |
| Correção compartilhada | PR #48 em `fix/hide-internal-media-labels-2026`, originalmente baseada em `Adula-Shopify` / `0472f65395eac2d3e1c47fb0f8844fd082d7f4ef` | Fonte comum das duas integrações | Não é, por si, uma versão normal completa para dezembro |

O nome “TESTE” não significa que o tema continue não publicado. O ID `168887910563` está publicado e **não pode ser destino de homologação** nesta tarefa. O ID histórico `156429844643` não foi confirmado como destino Oficial: a tentativa pública de prévia redirecionou para a página do tema ativo. Isso não comprova existência, nome, role nem conteúdo do tema antigo.

A equivalência acima é entre fontes Git de preparação. Não foi possível comparar integralmente os arquivos atuais do Admin com os commits; portanto, não afirmamos que o tema publicado coincide exatamente com o PR #45. Os PRs #45 e #46 continuam abertos/em rascunho, sem merge ou alteração das respectivas branches. Evidência pública: [public-theme-map.json](public-theme-map.json).

## O que foi implementado

A mesma limpeza seletiva de apresentação de `media.alt` foi aplicada às duas bases por patch de código, sem copiar configurações entre elas. A adaptação do Shop the Look foi feita sobre o arquivo próprio de cada base, preservando suas regras distintas de preço. Inclui galeria, thumbnails, swatches, cards, imagens secundárias, busca, recomendações, menus, categorias, coleções, carrinho, barra fixa, pedidos rápidos, badges personalizados e twitter:image:alt.

As duas integrações mantêm exatamente o mesmo snippet `adula-customer-media-alt.liquid`, os mesmos helpers JavaScript e os mesmos testes compartilhados. Os 960 valores reais coletados na auditoria pública original continuam como vetores de regressão. A auditoria original listou 376 produtos afetados entre 868 produtos públicos; não houve nova auditoria Admin nem alteração de produto.

| Preservação | Oficial / permanente | Chic Friday |
|---|---|---|
| Nomes dos acabamentos | Dourado (Banho Ouro 18k), Prateado (Banhado a Ródio Branco), Prata 925 (Prata 925 Legítima) | Mesmos nomes integrais |
| Agrupamento por variante | Mantido, inclusive metadados brutos no cadastro/JSON | Mantido |
| Preços/etiquetas | Regras normais do PR #46; sem selo CHIC FRIDAY | Regras e preços visuais da campanha do PR #45 mantidos |
| Brindes | Automação normal preparada no PR #46, sem ativação remota | Pausa de chaveiro/bandeja preservada; sem reativação remota |
| Configurações/banners/templates | Arquivos próprios da base mantidos | Arquivos próprios da base mantidos |
| Loja/catálogo/domínio/Bagy | Sem escrita | Sem escrita |

O bloco de agrupamento do Prestige permanece igual à respectiva base. O alt técnico é removido apenas do texto enviado à apresentação; o título comercial é usado quando necessário. Não apagar os marcadores originais na Shopify.

## Testes e comparação

| Verificação local | Oficial | Chic Friday |
|---|---:|---:|
| Cenários da correção de marcadores | **36 aprovados** | **36 aprovados** |
| Regressão existente da própria versão | **30 aprovados** | **23 aprovados** |
| Total de cenários | **66 aprovados** | **59 aprovados** |
| Alts reais comparados em Liquid + JS nativo + JS customizado | 960 | 960 |
| Acabamentos completos: seleção e visibilidade do grupo de fotos | 3/3 aprovados | 3/3 aprovados |
| Theme Check antes → depois, mesma CLI | 0 erros / 165 avisos → igual | 0 erros / 167 avisos → igual |
| Novos apontamentos de Theme Check | 0 | 0 |
| Arquivos protegidos idênticos à própria base | 65 | 65 |

Os 36 cenários por versão cobrem limpeza, texto comercial, hashtags desconhecidas, escaping, renderização de imagens/cards/galeria/barra fixa, troca de imagem via JavaScript e preservação de metadados/IDs. Cada um dos três acabamentos completos foi selecionado em fixtures e comparado com a galeria da respectiva base: o grupo visível permanece correto, sem marcador no alt apresentado.

As regressões normais validam apresentação, schema, Shop the Look, wishlist tardia, brindes normais, auditoria de publicações simulada e classificação de URLs. As regressões Chic Friday validam participantes/exclusões, datas, preços, schema, Giftback estimado, Shop the Look, wishlist e pausa de brindes. Todos são testes locais com mocks: não equivalem a compra real, crédito Giftback nem renderização remota. Os quatro testes simulados do auditor de canais não fizeram consulta ao Admin nem retomaram a auditoria local de publicações suspensa pelo usuário.

O verificador compartilhado confirma igualdade dos helpers e preservação byte a byte de config/templates/locales/layout, CSS, motor de brindes, preços e filtros de cada base. Confere ainda que Shop the Look mudou somente no alt, que a versão normal continua preparada com brindes habilitados em código e que a campanha continua pausada. Isso não afirma que o mesmo estado está implantado em algum tema remoto.

Evidências: [paired-source-check.json](paired-source-check.json), [paired-theme-check-comparison.json](paired-theme-check-comparison.json), [official-labels-test-results.json](official-labels-test-results.json), [chic-labels-test-results.json](chic-labels-test-results.json), [regression-results.json](regression-results.json).

Para reproduzir, em cada checkout, usando Node 22 ou superior:

```bash
npm ci --prefix tests/internal-media-labels
# Na integração Oficial:
ADULA_BASE_REF=6f5fae433066e6d29b225483b35636197a85f8ab npm test --prefix tests/internal-media-labels
npm ci --prefix tests/post-chic
npm test --prefix tests/post-chic
# Na integração Chic Friday:
ADULA_BASE_REF=2649e7b6df56a054602bb1d7cb008914dae75815 npm test --prefix tests/internal-media-labels
npm ci --prefix tests/migration-2026
npm test --prefix tests/migration-2026
# Com os dois checkouts locais disponíveis:
node scripts/check-paired-media-labels.mjs <caminho-oficial> <caminho-chic>
shopify theme check --path .
```

## Status e etapa remota pendente

| Estado | Oficial | Chic Friday |
|---|---|---|
| Correção preparada em branch própria | Concluído | Concluído |
| Testes locais e preservação da base | Aprovados | Aprovados |
| Confirmação do tema atual no Admin | Pendente | Role main confirmado publicamente; listagem Admin pendente |
| Backup atual e cópia não publicada | Não executados | Não executados |
| Aplicação seletiva em cópia Shopify | Pendente | Pendente |
| Variantes/imagens na prévia Shopify da correção | Não testadas | Não testadas |
| Publicação/merge | Não realizados; sem autorização | Não realizados; sem autorização |

**Bloqueio concreto:** a Shopify CLI não conseguiu renovar a sessão: conexão recusada em `accounts.shopify.com`. O navegador abriu a tela de login e não possui uma sessão Admin autenticada. A CLI incluiu parâmetros de sessão na saída de erro; esses parâmetros não foram copiados para o Git, PRs ou relatórios. Renovar a sessão antes da próxima operação da CLI. Não solicitar segredos pelo chat.

Com acesso autenticado, a sequência é: confirmar loja/temas por listagem atual, identificar o Oficial por ID/nome/role, ler e guardar backup com hashes, conferir diferenças entre o tema e a fonte Git, criar duas cópias não publicadas com nomes distintos, aplicar seletivamente a correção, ler de volta os arquivos e testar variantes/fotos/zoom/cards/coleções/busca/recomendações/carrinho em ambas. Preservar integralmente o tema ativo e o tema Oficial de origem. A criação de cópias de teste foi autorizada nesta solicitação; nenhuma nova autorização é necessária para esse escopo, mas a autenticação continua necessária. A publicação de qualquer tema e o merge continuam sem autorização.

## Continuidade após a campanha

A integração Oficial depende do PR #46 e inclui a correção do PR #48. Ao preparar o retorno à versão normal, usar essa integração (ou incorporar sua correção seletivamente após a revisão), em vez de publicar somente o PR #46 antigo. O helper compartilhado e seus testes devem acompanhar futuras alterações de ambas as versões, conforme `AGENTS.md`. Não agendar reativação/publicação automática para dezembro.

O PR #48 original permanece como fonte da correção, com os quatro erros antigos da branch oficial nele documentados; as integrações usam as bases #45/#46 que já corrigem esses erros. Não há contradição entre os resultados de Theme Check dessas bases diferentes.
