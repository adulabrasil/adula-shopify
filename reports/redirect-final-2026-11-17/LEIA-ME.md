# Redirecionamentos finais — pacote para aprovação

Data da verificação: 17/11/2026, horário de São Paulo. Loja consultada: `adula-brasil.myshopify.com`. Nenhum redirect foi importado, nenhuma página foi criada/publicada no Admin, nenhum tema foi alterado e nenhum domínio/DNS foi modificado. Auditoria local de publicações pausada a pedido do usuário; a disponibilização dos produtos nos canais foi informada pelo usuário. A consulta pública de produtos nesta etapa serviu somente para encontrar URLs correspondentes.

## Arquivos prontos

Todos os CSVs de importação usam **UTF-8 com BOM**, quebra de linha LF e cabeçalho exato `Redirect from,Redirect to`. São caminhos relativos, preservando o domínio principal que vier a ser configurado; não fixam myshopify como destino.

| Arquivo | Regras | Uso após aprovação |
|---|---:|---|
| `00-consolidado-50.csv` | 50 | Lote solicitado: 40 novas regras + 10 correções existentes |
| `01-novos-40.csv` | 40 | Etapa separada para novas origens |
| `02-corrigir-existentes-10.csv` | 10 | Corrigir somente estes destinos já cadastrados |
| `03-adicionais-produtos-5.csv` | 5 | Novas correspondências exatas encontradas no catálogo público atual; aprovação separada |
| `00-consolidado-opcional-55.csv` | 55 | Consolidação opcional dos 50 principais + 5 adicionais |

**Não importar os consolidados e depois os lotes separados:** são representações alternativas das mesmas regras. O fluxo mais controlado é aplicar `01`, depois `02` e, se aprovado, `03`. Os consolidados servem à revisão e à importação única quando o tratamento das dez substituições estiver confirmado na interface. Não presumir sobrescrita silenciosa de duplicados.

`revisao-final-55.csv` identifica operação, destino quebrado atual, HTTP e título de cada destino. Não está no formato de importação. Cada uma das 55 origens continua terminando em 404 antes da aplicação; todos os 55 destinos respondem 200, sem salto adicional, sem erro Liquid e sem meta noindex na verificação. Os arquivos não contêm ciclo, origem repetida ou redirecionamento para si mesmo. Não foram homologados tráfego real pós-importação nem domínio principal após a futura virada.

## Os três destinos institucionais

| Destino | Resultado real | Decisão |
|---|---|---|
| `/blogs/revista-adula` | HTTP 200; “Em breve”; zero links de artigos e zero entradas no feed Atom | `/blog` permanece retido por conteúdo vazio |
| `/pages/garantia` | HTTP 404, canonical `/404`, meta noindex | Preferir página dedicada; rascunho preparado |
| `/pages/sobre-a-adula` | HTTP 404, canonical `/404`, meta noindex | Preferir página dedicada; rascunho preparado |

As três regras estão em `pendentes-3-NAO-IMPORTAR.csv`, com destinos planejados e condições de liberação. Os redirecionamentos antigos para âncoras da home **não foram levados aos CSVs prontos**, porque a prioridade solicitada agora são páginas dedicadas. Não é possível liberar destinos 404 enquanto a publicação não estiver autorizada e concluída. Uma página salva como Oculta continua não sendo um destino público HTTP 200.

## Páginas preparadas, sem publicação

`paginas-rascunho/garantia.html` contém estrutura H2 e texto do guia de garantia que já está na home: prazo de seis meses, cobertura, condições, exclusões e cuidados. Não foram inventados novos prazos ou benefícios. O conteúdo é para revisão do responsável pela política antes de publicar.

`paginas-rascunho/sobre-a-adula.html` adapta o texto institucional já existente: Nadia Fontaine, inspiração francesa, produção brasileira, materiais e presença em Belo Horizonte. Não inclui descontos ou regras da Chic Friday.

`paginas-rascunho/metadados.json` traz título, handle, SEO title e meta description de cada página. Os corpos não incluem H1, pois o template padrão da página já exibe o título como H1. Não contêm Liquid, JavaScript, CSS, imagens novas ou dependência de um tema específico. A origem do texto está em `evidencia-institucional.json`; o texto completo da Bagy não pôde ser comparado.

Para preparar no Admin, depois de revisar os textos:

1. **Loja virtual → Páginas → Adicionar página**.
2. Preencher título e, em **Mostrar HTML / Editar código**, colar o corpo do arquivo correspondente.
3. Em listagem dos mecanismos de pesquisa, preencher os metadados e ajustar o identificador para `garantia` ou `sobre-a-adula`.
4. Selecionar **Visibilidade → Oculta** antes de salvar; a Shopify usa Visível como padrão. Não agendar publicação nesta etapa.
5. Revisar e pedir aprovação. Somente após autorização, tornar a página visível e conferir URL, conteúdo, H1, canonical e HTTP 200. Então atualizar a validação e liberar as duas regras retidas.

Isso cria conteúdo administrativo compartilhado pela loja; não exige publicar tema. **Nenhuma dessas ações foi executada pelo Codex**; o pacote contém somente arquivos locais/Git para revisão.

## Revista Adüla e artigo antigo

A página pública da Revista está vazia; o sitemap Shopify inclui os blogs `noticias` e `revista-adula`, mas não inclui URLs de artigos, e o feed da Revista tem zero entradas. Isso não prova que não existam rascunhos privados no Admin.

O sitemap legado salvo de 909 URLs identifica este artigo:

- `/presentes-adulantes-escolha-semijoias-neste-natal`
- Nome descritivo inferido do slug: **Presentes Adulantes: escolha semijoias neste Natal**. O título original exato ainda não foi recuperado.
- Destino sugerido: `/blogs/revista-adula/presentes-adulantes-escolha-semijoias-neste-natal`, atualmente HTTP 404.
- A origem Bagy retornou HTTP 403/Azion. É necessário recuperar o texto e as imagens pela exportação/edição do artigo no painel Bagy ou por cópia de conteúdo que a equipe possua.

O inventário está em `artigos-antigos-a-migrar.csv`. Não foi criado um texto novo fingindo ser o original. Depois de recuperar, revisar título, corpo, imagens/alt, links internos e descrição; salvar como rascunho e publicar somente após aprovação. Validar 200 e então criar o 301 individual do artigo. Não redirecionar artigos antigos indiscriminadamente ao índice do blog.

Foi identificado **um artigo no sitemap disponível**, não um inventário editorial exaustivo da Bagy. Artigos fora desse sitemap exigem exportação do blog ou lista da equipe. Até recuperar conteúdo relevante, não liberar `/blog` apenas por a página de destino responder 200.

## Preservação e URLs ainda sem correspondência

As 909 origens foram rechecadas: 674 redirecionamentos continuam terminando em 200, a home responde 200 diretamente e 234 origens continuam terminando em 404. As 674 origens funcionais estão em `funcionais-674-NAO-IMPORTAR.csv`, **fora de todos os CSVs de alteração**. O arquivo é um inventário HTTP para comparação, não uma exportação administrativa completa nem um lote para importar.

O catálogo público atual retornou 869 produtos, usado apenas para comparar handles e destinos de URL. Isso permitiu localizar cinco produtos adicionais de mesmo slug, todos com destino 200, entregues à parte. Não constitui nova auditoria de canais/Admin.

Após separar os 55 destinos tecnicamente prontos, restam **180 URLs antigas sem destino liberado**, detalhadas em `urls-sem-correspondencia-180.csv`:

| Grupo | Quantidade | Arquivo |
|---|---:|---|
| Produtos prováveis | 166 | `sem-correspondencia-produtos-166.csv` |
| Coleções/categorias prováveis | 10 | `sem-correspondencia-colecoes-10.csv` |
| Conteúdo editorial | 2 | `sem-correspondencia-editorial-2.csv` — índice `/blog` + artigo de Natal |
| Institucional | 2 | `sem-correspondencia-institucional-2.csv` — garantia e sobre |

A separação produto/coleção usa a estrutura do sitemap legado e os slugs; é uma classificação para revisão, não prova de tipo/SKU/descontinuação. A Bagy continua sem acesso público útil para confirmar cada item. Ausência pública/404 não significa peça descontinuada. Não foi sugerido envio genérico à home.

As dez coleções/categorias pendentes são: `/relicarios`, `/new-circle`, `/love-yourself`, `/divina-feminidade`, `/tornozeleira-prata`, `/je-taime-a-la-folie`, `/tornozeleiras-douradas`, `/amor`, `/eternizeseuamor` e `/anel-solitario-1`.

**Seis regras já existentes, fora das dez correções aprováveis, ainda terminam em 404:** `/relicarios`, `/new-circle`, `/love-yourself`, `/divina-feminidade`, `/je-taime-a-la-folie` e `/porta-joias-veludo-rosa-fume`. Estão em `regras-existentes-quebradas-fora-do-lote-6.csv`; dependem de equivalente confirmado ou decisão comercial. Não foram alteradas nem incluídas nos CSVs prontos. Para `/relicarios`, `/collections/pingentes-relicario` é apenas uma possibilidade a revisar, não destino aprovado.

Portanto, **os CSVs prontos não apontam para 404; isso não significa que todas as URLs antigas da migração estejam resolvidas**. A matemática do lote é: 49 das 909 origens no lote principal (a 50ª regra, `/pages/trocas-e-devolucoes`, é adicional Shopify), mais cinco produtos adicionais; 234 − 49 − 5 = 180 pendentes. Sem aprovar os cinco adicionais, seriam 185 origens pendentes.

## Backup e importação segura — somente depois de autorização

1. **Backup administrativo completo:** no Admin, abrir **Conteúdo → Menus → Redirecionamentos de URL / Ver redirecionamentos de URL → Exportar**. Escolher **todos os redirecionamentos**, sem filtro. Salvar o CSV original com data/hora, sem editar. O Codex não possui esse export nesta etapa; o inventário HTTP de 674 não o substitui.
2. Comparar esse export com `revisao-final-55.csv`: as 40 origens novas devem estar ausentes; as dez existentes devem ter exatamente os destinos antigos registrados; as cinco adicionais, se aprovadas, devem estar ausentes. Qualquer divergência/cadastro novo exige revisão antes de prosseguir. Não excluir o mapa antigo nem importar uma reconstrução incompleta do backup.
3. Após autorização, em **Importar → Adicionar arquivo → Fazer upload de arquivo**, usar `01-novos-40.csv`. Revisar a prévia antes de **Importar redirecionamentos**. Não ativar substituição ampla de origens existentes para este lote. Se houver colisão, interromper e revisar; não forçar sobrescrita.
4. Corrigir as dez regras existentes em etapa separada: pesquisar cada origem e usar **Salvar redirecionamento**, ou selecionar as dez e **Editar redirecionamento**, conferindo `02-corrigir-existentes-10.csv`. Se a interface oferecer importação com substituição explícita, usar somente o arquivo de dez após conferir o backup e a prévia. Não presumir o comportamento de sobrescrita, não aplicar uma opção global a todo o mapa.
5. Se aprovadas, importar as cinco adicionais em lote separado. Não reaplicar os consolidados após os lotes individuais.
6. Exportar novamente, comparar o antes/depois e conferir que apenas as 40 novas, dez destinos e cinco opcionais mudaram. As demais regras — incluindo as 674 observadas funcionais — devem permanecer iguais. Verificar se não surgiram redirecionamentos automáticos por alteração de handles feita por outra pessoa.
7. Testar cada origem aplicada até o destino final: 301 e depois 200, sem ciclo, salto extra ou conteúdo ausente. Preservar parâmetros relevantes em amostras quando existirem; testar fora de cache. URLs `/blog`, `/garantia`, `/sobre-a-adula` e o artigo continuam excluídas até liberação específica.
8. Só depois avaliar a migração do domínio, em uma autorização separada. O teste atual usa myshopify; após futura configuração do domínio principal, conferir www/sem-www, HTTPS, canonical e ausência de cadeias adicionais. Nenhuma configuração de domínio/DNS foi feita aqui.

Rollback: preservar o export original e o registro das dez alterações. Se uma aplicação autorizada causar problemas, restaurar somente os destinos modificados a partir do backup e remover somente as novas regras daquele lote, após revisão. Não apagar/reimportar todo o mapa indiscriminadamente; 301 também pode permanecer em cache.

Fontes oficiais consultadas:

- https://help.shopify.com/pt-BR/manual/online-store/menus-and-links/url-redirect
- https://help.shopify.com/pt-BR/manual/online-store/add-edit-pages

## Validação e limites

`http-origens-909.json`, `http-destinos.json`, `resumo.json` e `evidencia-institucional.json` registram a vistoria. Testes automatizados conferem contagens, cabeçalhos, duplicatas, regras existentes preservadas, grafo sem ciclos, caminhos válidos e HTTP/canonical dos 55 destinos. Os rascunhos são conferidos para evitar código executável e H1 duplicado. Não são testes de aplicação real dos redirects.

O ZIP de entrega contém os CSVs, rascunhos, metadados e este guia. Manifesto/SHA256 permitem conferir integridade. Ele não é um arquivo único a importar: deve-se extrair e escolher somente o CSV do lote autorizado.

PR #46 e temas Chic Friday/permanente permanecem intactos. O PR #47 continua em rascunho. Sem merge, deploy, publicação, importação, alteração administrativa, domínio ou DNS.
