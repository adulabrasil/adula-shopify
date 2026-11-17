# Auditoria local somente leitura — Shopify Adüla

Decisão do usuário em 17/11/2026: executar no próprio computador e considerar **todos os canais de vendas** para produtos ACTIVE. Não se propõe publicar rascunhos ou arquivados. A execução real ainda não aconteceu; os testes do auditor usam dados simulados.

Para falhas HTTP 400, use primeiro o **[diagnóstico seguro para Windows/Git Bash](DIAGNOSTICO-HTTP400.md)**. O modo `--diagnose-auth` valida o acesso sem consultar produtos e sem registrar credenciais.

## Permissões exatas

| Escopo Admin API | Uso |
|---|---|
| `read_products` | Todos os produtos, estados ACTIVE/DRAFT/ARCHIVED, variantes, SKUs, contagem e situação de publicação por produto |
| `read_publications` | Enumerar publicações/canais e consultar a associação dos produtos |

O SKU é lido em `ProductVariant.sku`; por isso **não é necessário `read_inventory`**. Não conceder `write_products`, `write_publications`, acesso a clientes, pedidos, descontos, temas ou dados protegidos. A autenticação da Shopify CLI para temas não substitui essas permissões Admin.

O script confere os escopos efetivamente concedidos e recusa instalações com qualquer escopo diferente desses dois. No client credentials grant, passar um parâmetro `scope` não restringe um token amplo; a restrição deve estar na instalação do app. Use um app dedicado para evitar permissões herdadas de integrações operacionais.

## Configuração por você no painel

1. Use o proprietário da loja ou uma conta com permissão para desenvolver e instalar apps. No Admin, abra **Configurações → Apps e canais de vendas → Desenvolver apps**, seguindo o acesso ao **Dev Dashboard**; também pode abrir o Dev Dashboard diretamente. Os rótulos podem aparecer em inglês.
2. No Dev Dashboard, selecione a organização correta e **Apps → Create app**, com um nome como `Adula Auditoria Somente Leitura`. O app e a loja devem pertencer à mesma organização para o client credentials grant. Não use as credenciais de uma integração ampla já existente.
3. Em **Versions**, crie uma versão do app com os escopos **somente** `read_products,read_publications`. Se o formulário exigir App URL e não houver interface própria, a documentação permite `https://shopify.dev/apps/default-app-home`. Selecione **Release** para disponibilizar a configuração do app. Isso é uma versão de app, não publicação de tema/site.
4. Instale o app especificamente em `adula-brasil.myshopify.com` e confira a concessão desses dois escopos. Essa instalação é uma ação sua no painel; o Codex não a realizou.
5. Em **Settings** do app, consulte **Client ID** e **Client secret**. Digite-os somente no terminal local quando solicitado. O segredo fica oculto na entrada. **Não envie nenhum segredo/token pelo chat, não cole em comandos, não crie `.env` no repositório e não cadastre credenciais no GitHub/GitHub Secrets.**
6. Se já existir um app legado dedicado com token Admin e exatamente esses dois escopos, pode usá-lo com `--existing-token`, também com entrada oculta. Não é necessário criar outro app nessa situação. O roteiro de app novo usa o Dev Dashboard.

Se aparecer `shop_not_permitted`, confirme a organização/instalação com o responsável pela conta. Não amplie escopos nem tente contornar autenticação. Se o fluxo client credentials não for elegível, será necessário o fluxo OAuth suportado por uma integração autorizada; não extraia tokens do navegador ou da CLI.

## Execução no seu computador

Pré-requisitos: Git, Node.js 22+ e Bash (Terminal de macOS/Linux, WSL ou Git Bash). Não é necessário `npm install` para o auditor.

Em uma cópia existente do repositório, obtenha a branch de auditoria e abra uma pasta separada:

```sh
git fetch origin audit/migration-readiness-2026:refs/remotes/origin/audit/migration-readiness-2026
git worktree add ../adula-auditoria origin/audit/migration-readiness-2026
cd ../adula-auditoria
node --version
bash scripts/run-local-publication-audit.sh
```

O roteiro pede Client ID e Client secret no terminal; não os grava. Troca-os por token em memória para chamar a API. Conforme a documentação Shopify, o token desse grant dura cerca de 24 horas. O segredo não aparece em logs, argumentos ou arquivos do script. Não execute com depuração `bash -x`.

A primeira etapa imprime e salva **somente a identidade da loja, escopos e lista de publicações**, sem credenciais, em `~/adula-audit-results/publications.json`. Confira os nomes com **Configurações → Apps e canais de vendas** no Admin. Confirme qual ID pertence à **Loja virtual / Online Store**; digite o ID completo `gid://shopify/Publication/...` no terminal quando solicitado. Não escolha por posição na lista. Uma divergência de loja ou ID interrompe o auditor.

O roteiro define `ALL_SALES_CHANNELS=1`, conforme sua orientação. Publicações de catálogo de mercado e B2B (`MarketCatalog`/`CompanyLocationCatalog`) são separadas dos canais de vendas. Publicações de app e publicações legadas sem catálogo são incluídas. A lista ainda deve ser confrontada com os canais instalados: a API só consegue auditar o que a instalação pode ler. Canal ausente da API não recebe aprovação automática.

Para usar um token de app dedicado já existente, substitua o último comando por:

```sh
bash scripts/run-local-publication-audit.sh --existing-token
```

Não cole o token como argumento ou em um comando `export`. Digite-o no prompt oculto.

## Arquivos de resultado

Em `~/adula-audit-results/`, fora do Git:

- `sales-channel-publications.json`: resultado completo, todos os produtos e variantes, status/canais, diferenças em relação à amostra pública, SKUs vazios/duplicados e limitações.
- `sales-channel-publications.csv`: nome, SKU(s), status, canal, publicado, publicação esperada e pendência por produto/canal.
- `pending-products.csv`: ativos não publicados em Loja virtual ou demais canais, além de rascunhos/arquivados com associação de publicação para revisão.
- `product-variants-skus.csv`: uma linha por variante/SKU, sem truncar produtos com muitas variantes.
- `publications.json`: lista usada para confirmar o ID de Loja virtual.

Compartilhe **apenas esses relatórios**, sem credenciais. Com eles o Codex pode produzir a lista nominal final de pendências, comparar os canais e a Bagy e priorizar as correções para sua aprovação. Não fazer commit dos resultados administrativos automaticamente.

O script pagina todos os produtos sem filtro por status, todos os SKUs e todos os canais visíveis; cruza o número de produtos com `productsCount(limit:null)` e exige contagem EXACT no início e fim. Duplicatas, estados de publicação ausentes, divergências de versão e cobertura incompleta interrompem a geração. Também coleta novamente o catálogo público e compara por ID com o snapshot de 850 produtos da etapa anterior. Os 850 não são presumidos como catálogo completo.

Os comandos Admin são exclusivamente GraphQL `query`. O único POST de autenticação troca credenciais por token; não publica nem modifica produtos. Não há Shopify mutation, importação, merge ou deploy.

Depois da execução, as variáveis de credenciais são removidas pelo roteiro. Se o app for usado apenas nesta auditoria, você pode desinstalá-lo após concluir/revisar os resultados para encerrar o acesso da integração. Não é necessário deixar o app instalado para manter os relatórios.

## Fontes oficiais consultadas

- https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard
- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- https://shopify.dev/docs/api/admin-graphql/latest/queries/publications
- https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant
- https://shopify.dev/docs/api/admin-graphql/latest/queries/productsCount

Foram conferidas as definições da API 2026-10, marcada como latest na documentação consultada. Os endpoints do auditor ainda não foram homologados com credenciais reais nesta etapa.
