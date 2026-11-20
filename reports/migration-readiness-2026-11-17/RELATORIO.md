# Pendências da migração Bagy → Shopify — 17/11/2026

Nenhum merge, deploy, publicação, importação de CSV, alteração de domínio/DNS, tema, desconto ou catálogo foi executado. PR #46 preservado em rascunho e no mesmo commit. Os novos arquivos tratam somente de auditoria, testes e documentação, em branch independente `audit/migration-readiness-2026` baseada na branch oficial.

Atualização de autenticação: a instalação foi confirmada pelo usuário, mas a execução local retornou HTTP 400. A causa exata ainda depende do novo **[diagnóstico seguro](DIAGNOSTICO-HTTP400.md)**; instalação não comprova elegibilidade de organização para client_credentials. A correção preserva a requisição documentada e passa a distinguir códigos OAuth sem expor segredos.

Atualização de escopo: o usuário informou ter disponibilizado os produtos em todos os canais pelo Admin e pausou a auditoria local. A entrega atual de redirecionamentos e rascunhos está em `../redirect-final-2026-11-17/LEIA-ME.md`; as pendências anteriores abaixo são históricas e não retomam a auditoria de publicações.

## Prioridade 1 — canais de vendas

**Situação: auditor pronto para execução local; resultado administrativo pendente da sua execução.** Você escolheu executar no próprio computador e informou que os produtos devem estar em todos os canais. Isso foi aplicado como expectativa para produtos ACTIVE. Não se propõe publicar DRAFT/ARCHIVED.

O guia **[EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md)** detalha a configuração, permissões e comandos. Permissões exatas: `read_products` e `read_publications`. Sem `read_inventory`: SKUs são coletados em `ProductVariant.sku`. Nenhum escopo de escrita, clientes, pedidos, descontos ou temas é necessário. Credenciais digitadas em prompt oculto no computador do usuário, mantidas em memória/ambiente temporário; nenhum token deve ser enviado no chat ou gravado no GitHub.

### Melhorias do auditor nesta etapa

`scripts/audit-sales-channel-publications.mjs` agora inclui:

- Preflight de identidade da loja e dos escopos realmente concedidos; recusa qualquer escopo além dos dois necessários.
- Enumeração de todas as publicações visíveis, incluindo as legadas sem catálogo; separação das publicações de mercado/B2B dos canais de venda.
- Todos os produtos do Admin, sem filtro por estado: ACTIVE, DRAFT, ARCHIVED. Paginação de variantes e SKUs além da primeira página, incluindo produtos com mais de 50/100 variantes.
- Nome, SKU(s), status, canais, publicação esperada e pendências, com CSV adicional por variante. Identificação de SKUs vazios/duplicados sem alterar dados.
- Lista de ACTIVE não publicados na Loja virtual e em qualquer outro canal de vendas, segundo sua orientação de disponibilidade em todos os canais.
- Contagem administrativa EXACT, reconciliação início/fim, cobertura produto/canal, IDs únicos e detecção de mudança de versão durante a leitura. Interrompe a geração se a conferência for incompleta.
- Comparação com os 850 IDs públicos da etapa anterior e com uma nova coleta pública realizada na execução local. Diferenças por ID, sem equiparar ausência pública a produto descontinuado.
- Saídas fora do Git, sem registrar credenciais. Há proteção contra fórmulas em CSV; o JSON preserva os valores originais dos SKUs.

`scripts/run-local-publication-audit.sh` permite listar os canais e confirmar o ID de Loja virtual antes da auditoria. Usa client credentials grant para app elegível da mesma organização; aceita alternativamente token de app dedicado já existente. Não executa mutation. O guia explica o que fazer se a organização não for elegível, sem contornar autenticação.

### O que já existe e o que não existe como resultado

`catalogo-publico-850-preliminar.csv` contém nomes e SKUs observados em **850 produtos / 3.218 variantes**, provenientes do snapshot público usado no PR #46. Status e canais Admin estão marcados **NÃO CONFERIDOS**. Esse arquivo não é uma auditoria administrativa nem contém os rascunhos/arquivados ausentes do endpoint público.

Não há credencial Admin autorizada disponível nesta sessão. Portanto, ainda não foram identificados nominalmente todos os ACTIVE não publicados, nem o total real de produtos do Admin. Os testes de 15 cenários são simulados e não substituem sua execução local. Depois de receber os arquivos de saída sem tokens, o Codex pode elaborar o relatório final de nome/SKU/status/canais/pendência.

Publicação em um canal é uma associação administrativa: não comprova aprovação/sincronização de Meta/Google, estoque, elegibilidade por mercado, data de publicação agendada ou possibilidade de checkout. Confrontar a lista de canais da API com os canais instalados no Admin; um canal invisível à integração permanece pendente.

### Comparação Bagy

Foram consultadas 52 páginas antigas relacionadas às propostas (a URL `/pages/trocas-e-devolucoes` é adicional da Shopify). Todas retornaram **HTTP 403, “Azion - Default error page”** nesta coleta. Nenhuma extração de catálogo administrativo/CSV da Bagy foi encontrada no workspace. Não houve tentativa de contornar o bloqueio nem alteração na Bagy.

Assim, a comparação completa Bagy × Shopify por SKU/estado ainda depende de uma exportação autorizada da Bagy. Exporte os produtos e variantes, incluindo ID, nome, SKU, URL e situação/visibilidade, inclusive peças indisponíveis se a exportação permitir. Não incluir clientes, pedidos ou credenciais. Com o CSV Bagy e o JSON Admin, o Codex pode separar: SKU presente em ambos; presente na Bagy e ausente no Admin Shopify; presente no Admin mas DRAFT/ARCHIVED; ACTIVE fora da Loja virtual; SKU vazio/duplicado que exige validação manual. Peças descontinuadas precisam de decisão comercial; não se conclui isso pelo 403/404.

## Prioridade 2 — revisão das 53 propostas de 301 do PR #45

**Revalidação HTTP real:** 104 URLs únicas de origem/destino Shopify consultadas; os 53 destinos propostos responderam 200, sem salto adicional, erro Liquid ou meta noindex. As origens continuam terminando em 404: 43 diretamente e 10 depois de um 301 existente para destino quebrado. O teste não importou nenhuma regra.

| Grupo | Quantidade | Tratamento preparado |
|---|---:|---|
| Novas regras aptas tecnicamente | 40 | CSV separado, aguardando autorização de importação e backup administrativo |
| Correções de regras já existentes | 10 | Substituir destino da regra existente de maneira controlada, sem presumir que uma importação de duplicados sobrescreva a regra |
| Decisões editoriais/SEO | 3 | Não incluídas nos dois CSVs candidatos |

Arquivos:

- `revisao-53-redirecionamentos.csv`: análise de todas as propostas, operação, prioridade, HTTP, título e regra existente.
- `301-40-novos-candidatos.csv`: apenas as novas regras tecnicamente aptas, no formato Shopify.
- `301-10-substituicoes-candidatas.csv`: destinos corrigidos das dez regras existentes; **lista para atualização controlada, não importar como novas regras indiscriminadamente**.
- `decisoes-redirecionamentos.csv`: as três propostas retidas.
- `53-propostas-originais-pr45.csv`: referência histórica; não usar como lote aprovado.
- `http-evidence.json` e `redirect-summary.json`: evidência e contagens. `bagy-access.json`: limitação de consulta da origem.

“Apto tecnicamente” significa destino real HTTP 200, sem salto/loop, rota compatível com slug/denominação e ausência dos erros técnicos verificados. Não equivale a autorização de importação nem a aprovação comercial de todo conteúdo: o corpo original da Bagy está inacessível. O título Shopify “Boho Chic” foi confirmado no destino `/collections/boho-minimalista`, apesar da diferença de handle.

### Três decisões objetivas

| Origem | Proposta atual | Decisão necessária |
|---|---|---|
| `/blog` | `/blogs/revista-adula` | A Revista diz “Em breve” e não tem links de artigos. Migrar conteúdo editorial/relevante ou definir destino de blog equivalente antes de aprovar. Não redirecionar artigos antigos em massa para um blog vazio. |
| `/garantia` | `/#guia-garantia` | Confirmar preservação do conteúdo e aceitar destino em âncora da home, ou criar página dedicada e atualizar a proposta. A âncora existe no HTML, mas a home tem canonical próprio e não substitui uma página indexável dedicada. |
| `/sobre-a-adula` | `/#sobre-a-adula` | Mesma decisão sobre conteúdo, âncora e página dedicada. Validar acesso direto após o 301 antes de aprovar. |

### Dez regras existentes que terminam em 404

`/anel-com-pedra`, `/anel-sem-pedra`, `/bracelete`, `/brinco-de-prata-925`, `/brincos-pequenos`, `/colar-masculino`, `/ear-hook`, `/escapulario`, `/pingente-prata-925` e `/pulseira-prata-925`.

O CSV de revisão informa os destinos atuais quebrados e os propostos. Corrigir essas regras elimina cadeias que já terminam em erro. Não apagar regras sem backup nem contar com comportamento de sobrescrita não verificado.

### Ordem de revisão/importação futura

1. Primeiro as dez regras já existentes que terminam em 404 e as URLs de produtos equivalentes.
2. Depois categorias principais (`/aneis-1`, `/pulseiras-1`, `/aliancas`, `/produtos`) e demais categorias/políticas.
3. Resolver as três decisões retidas e tratar artigos antigos por equivalência individual.

A prioridade é **técnica/estrutural**, não baseada em tráfego medido. Search Console, Analytics e backlinks não foram disponibilizados. Se houver exportação, o Codex pode reordenar por cliques, impressões e links externos.

Antes de qualquer aplicação, você deve autorizar a etapa e exportar o mapa completo atual em **Conteúdo → Menus → Redirecionamentos de URL → Exportar** (os nomes podem variar com o idioma). As 40 novas e 10 alterações devem ser revisadas separadamente. Depois da aplicação autorizada, o Codex pode conferir 301 único até destino 200, sem loops, parâmetros/URLs representativas e eventuais colisões com páginas que voltarem a existir. Shopify só aplica redirecionamentos a URLs quebradas; não arquivar/despublicar produtos para forçar elegibilidade de um redirect.

Fonte oficial: https://help.shopify.com/en/manual/online-store/menus-and-links/url-redirect

## Prioridade 3 — acompanhamento funcional

| Pendência | Situação conhecida | Ação sua / responsável pelo painel | O que o Codex pode fazer |
|---|---|---|---|
| Wishlist | App renderiza preço cadastrado; na campanha Eva mostrou R$ 99,00 vs PDP R$ 79,20. Falta bloco do app na PDP; remoção de favorito não foi confirmada. | Conferir bloco/integração suportada no Wishlist Power e disponibilizar configuração/documentação. Aprovar teste em tema não publicado. | Implementar fonte de preço por tema via mecanismo suportado, preservar variantes/mercados e testar salvar, persistir, remover e preço no carrinho. Não criar botão falso nem alterar catálogo. |
| Quartzo Rosa | Variante `47861271036067`, 12 / Quartzo Rosa, está associada à foto `#pedra_turquesa`. | Confirmar foto correta e autorizar separadamente correção do vínculo de mídia. | Preparar alteração pontual e verificar PDP/carrinho após autorização. Nenhuma imagem ou vínculo alterado agora. |
| Bandeja/chaveiro | Inclusão automática pausada no Chic Friday e confirmada nos testes anteriores; adição manual ainda recebeu 20% no levantamento anterior. | Conferir elegibilidade na coleção/condição do desconto e gratuidade para a operação normal; decidir eventual ajuste. | Conferir código e testar após autorização; não alterar coleção, preço, desconto ou reativar brindes agora. |
| Giftback | Valor exibido é estimativa; emissão, resgate, validade e reversão não foram homologados operacionalmente. | Responsável pela Zoppy/Giftback confirma regra efetiva, base após descontos, crédito, prazo/validade e tratamento de cancelamento. Autorizar transação de teste separadamente se necessária. | Comparar a comunicação visual com a regra, preparar roteiro e verificar evidências. Nenhum pedido, crédito ou benefício foi criado. |

## Prioridade 4 — tema normal de dezembro

PR #46 mantido em rascunho no commit `6f5fae433066e6d29b225483b35636197a85f8ab`. Não modificado nesta etapa. Nova branch de auditoria não contém alterações em assets, layout, snippets, sections, config, templates, domínio ou workflows.

A futura homologação da versão normal deve ocorrer em **outro tema não publicado**, com autorização específica, preservando `168887910563`. Não agendada. A branch `Adula-Shopify` possui deploy automático para alterações de tema; merge do PR #46 continua dependendo de autorização conjunta com o plano de deploy.

## Divisão objetiva de responsabilidades

**Depende de você no painel:** criar/instalar app com os dois escopos de leitura; confirmar canais e ID de Loja virtual; executar o roteiro local e compartilhar apenas relatórios; exportar catálogo Bagy se disponível; decidir as três URLs retidas; autorizar futura aplicação de redirects/correções funcionais e teste em outro tema.

**Codex pode concluir com esses dados:** relatório nominal completo do Admin com SKUs/status/canais; reconciliação com os 850 públicos e Bagy; classificação de peças ausentes/arquivadas/não publicadas sem inferir descontinuação; revisão SEO por evidência de tráfego; propostas de correção e testes autorizados. Nenhuma alteração administrativa automática.

## Validação desta entrega

- 15 cenários automatizados do auditor aprovados, com Admin/rede simulados: três estados, mais de dez canais, SKU além da página inicial, cobertura/contagem, escopos mínimos, loja errada, mudança durante leitura e remoção de dados secretos de erros.
- Verificação dos arquivos de 301 aprovada: 40+10 candidatos únicos, sem ciclos no grafo proposto, conferidos contra a evidência HTTP salva. Isso não é importação.
- Sintaxe Node.js e Bash aprovada; nenhum pacote npm necessário para o auditor.
- 104 consultas HTTP Shopify e 52 páginas Bagy realizadas nesta etapa, somente leitura. **Nenhuma consulta Admin com credencial real**, nenhum teste remoto de tema e nenhuma transação de compra.
