# Revista Adüla — revalidação pública e próximo lote de 301

A página `/blogs/revista-adula` responde HTTP 200 e agora mostra **17 artigos públicos**, dez na primeira página e sete na segunda. O feed Atom também contém 17 entradas. Foram verificados os 17 links: HTTP 200, sem salto, um H1, canonical próprio, conteúdo de artigo presente, sem erro Liquid e sem meta noindex. A situação anterior de blog vazio está superada. Isso valida a apresentação pública e os links, não a revisão editorial integral dos textos ou a indexação no Google.

O redirecionamento **`/blog → /blogs/revista-adula`** foi incluído nos arquivos do próximo lote, sem importação. A origem `/blog` ainda responde 404 diretamente, sem redirecionamento existente observado; é uma nova regra. O destino responde 200 com conteúdo, sem salto e canonical correspondente. Os 55 destinos do pacote anterior também foram revalidados; todos continuam 200 sem salto ou erro Liquid.

## Escolha um modo de aplicação, somente após aprovação

- **Apenas a regra nova da Revista:** `04-revista-1.csv`. Use se os lotes anteriores já tiverem sido aplicados, ou se a aprovação abranger somente a Revista.
- **Lotes separados atualizados:** `01-novos-atualizado-41.csv` (40 anteriores + Revista), `02-corrigir-existentes-10.csv` e, se aprovado, `03-adicionais-produtos-5.csv`.
- **Consolidado principal atualizado:** `00-consolidado-atualizado-51.csv` (50 anteriores + Revista).
- **Consolidado opcional atualizado:** `00-consolidado-opcional-atualizado-56.csv` (55 anteriores + Revista).

Não importar os consolidados e depois os lotes separados: são representações alternativas das mesmas regras. Todos usam UTF-8 com BOM, LF e `Redirect from,Redirect to`. Nenhum arquivo inclui `/garantia` ou `/sobre-a-adula`, e nenhum destino é uma âncora da home.

Antes de aplicar qualquer lote, exportar **todos** os redirecionamentos atuais no Admin e verificar colisões com o backup. Os dez destinos existentes exigem atualização controlada; não presumir sobrescrita global. O roteiro completo permanece em `../redirect-final-2026-11-17/LEIA-ME.md`. Nenhum export administrativo completo foi obtido nem nenhuma importação foi realizada nesta etapa.

## Garantia e Sobre: páginas dedicadas preservadas

`/pages/garantia` e `/pages/sobre-a-adula` continuam respondendo HTTP 404 nesta revalidação. As regras permanecem retidas em `pendentes-institucionais-2-NAO-IMPORTAR.csv`. Os HTMLs e metadados preparados no pacote anterior em `../redirect-final-2026-11-17/paginas-rascunho/` permanecem inalterados. Não foram criadas nem publicadas páginas no Admin. Publicação autorizada e revalidação HTTP 200 são necessárias antes de liberar esses destinos.

## Artigo legado de Natal

O artigo `/presentes-adulantes-escolha-semijoias-neste-natal`, identificado no sitemap Bagy anterior, não consta entre os 17 links/feed desta Revista; a URL sugerida `/blogs/revista-adula/presentes-adulantes-escolha-semijoias-neste-natal` continua 404. Não foi criado um redirecionamento individual nem direcionado genericamente ao índice. Isso é uma pendência separada e não impede o 301 do índice `/blog`, que agora tem conteúdo público válido. Uma eventual revisão/renomeação desse artigo precisa ter sua equivalência confirmada pela equipe antes de escolher outro destino.

## Evidências, testes e preservação

- `artigos-publicos-17.csv`: títulos, URLs, H1, canonical e presença no índice.
- `evidencia-publica.json`: verificação HTTP real de 76 URLs e confirmação da paginação/links.
- `resumo.json`: contagens e estados das regras.
- Os testes automatizados conferem que os 17 artigos estão presentes no índice e respondem 200, que `/blog` aparece uma única vez e que as duas páginas institucionais não entraram nos CSVs prontos.
- O snapshot/ZIP anterior permanece como registro histórico; este pacote é a versão atualizada para a próxima aprovação. Os demais 674 redirecionamentos antes observados como funcionais não foram alterados. Não foi repetida a auditoria de todas as 909 origens, pois o escopo desta etapa é a Revista e os destinos consolidados.
- O link REVISTA ADÜLA no menu Chic Friday foi informado pelo usuário. Nenhuma configuração de menu ou tema foi alterada pelo Codex nesta etapa.

Não houve merge, publicação de tema/página, importação, alteração de DNS, catálogo, descontos ou auditoria Admin de publicações. PR #46 e temas Chic Friday/permanente preservados; PR #47 continua em rascunho.
