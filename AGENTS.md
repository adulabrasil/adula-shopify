# Instruções permanentes — Adüla Brasil / Shopify

## Duas versões obrigatórias

Toda melhoria, correção ou atualização técnica deve ser preparada e validada separadamente para:
1. Oficial / permanente (uso normal, inclusive após a Chic Friday).
2. Chic Friday 2026 (campanha).

Ambas pertencem ao repositório `adulabrasil/adula-shopify`; não presumir repositórios distintos. Antes de trabalhar, confirmar as branches, seus commits e a identificação/role dos temas Shopify. Consultar `reports/paired-themes-2026-11-18/README.md` e a evidência atual, sem tratar mapeamento histórico como listagem atual do Admin.

A base oficial é `Adula-Shopify`; a versão permanente preparada está no PR #46 (`fix/post-chic-permanent-2026`). A preparação Chic Friday com as correções permanentes está no PR #45 (`fix/migration-final-review-2026`); a branch histórica da campanha é `feature/chic-friday-auto-prices-2026`. Um PR não comprova que seus arquivos coincidem integralmente com um tema remoto.

## Preservação e testes

Manter sincronizada a lógica compartilhada. Adaptar alterações às duas bases; não sobrescrever arquivos completos de uma versão com os da outra. Preservar banners, configurações, templates, regras de preços/etiquetas e estado dos brindes próprios de cada versão.

Validar variantes, seleção/fotos, galeria e caminhos afetados em ambas. Trabalhar em cópias não publicadas quando for necessário testar na Shopify. Antes de escrever, confirmar loja, ID, nome e role; guardar backup e manifesto de hashes dos arquivos atuais. Nunca usar um ID anteriormente de teste sem reconfirmar o role.

Ao concluir, apresentar status separado: código preparado, testes locais, testes reais Shopify, pendências e publicação. Não dizer que testes locais comprovam renderização remota. Sem acesso autenticado, concluir o que for possível no código e informar o bloqueio concreto.

## Segurança

Não publicar, substituir o tema ativo ou fazer merge sem aprovação. Não sobrescrever configurações exclusivas. Push/merge em `Adula-Shopify` dispara deploy automático: não usar essa branch para preparação.

Não modificar catálogo, SKUs, preços, estoques, fotos, URLs, descontos, domínio, DNS ou Bagy fora de autorização específica. Não apagar marcadores de `media.alt`: o Prestige usa esses metadados para agrupar fotos de variantes. Limpar apenas sua apresentação.

Não pedir segredos pelo chat nem guardar credenciais no Git. Mensagens de falha de autenticação da CLI podem incluir parâmetros sensíveis; capturar saída de autenticação fora do repositório e apresentar somente a classificação sanitizada do erro.
