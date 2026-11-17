# HTTP 400 na autenticação — diagnóstico seguro para Windows/Git Bash

## Resultado da análise

A versão original enviava o endpoint correto `https://adula-brasil.myshopify.com/admin/oauth/access_token`, método POST, formulário `application/x-www-form-urlencoded` e `grant_type=client_credentials`. `URLSearchParams` já codifica caracteres especiais corretamente. Não foi encontrado erro de formato que explique sozinho o HTTP 400 informado.

O problema confirmado no código era a perda de diagnóstico: qualquer falha de autenticação virava a mesma mensagem, sem examinar o código OAuth retornado. Portanto, **não é possível afirmar a causa exata do erro já ocorrido** apenas pelo HTTP 400. Node.js/Git iniciaram o script e receberam uma resposta HTTP; não há evidência de que a versão informada dessas ferramentas tenha causado a rejeição.

A documentação Shopify exige que o app e a loja pertençam à **mesma organização** para `client_credentials`. “1 instalação” comprova uma instalação, mas não essa relação. Instalar um app de outra organização por distribuição personalizada não habilita esse grant; nesse caso, um auditor externo precisa de OAuth authorization code. O script não tenta trocar de grant automaticamente, ampliar permissões ou reinstalar apps.

Fontes:

- https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- https://shopify.dev/docs/apps/launch/distribution/select-distribution-method

## Correções realizadas no código

- Novo `scripts/shopify-readonly-auth.mjs`: reconhece exclusivamente códigos OAuth de uma lista permitida. Processa os formatos JSON e HTML usados pela Shopify; não imprime corpo, descrição livre, cabeçalhos, requisição, variáveis, Client ID, Client secret ou token.
- Respostas desconhecidas permanecem inconclusivas. `invalid_request` **não é tratado como prova** de credencial errada ou erro de configuração.
- Entrada vazia, aspas e caracteres internos invisíveis são identificados localmente, sem enviar esses valores. Espaços/BOM/CR/LF nas bordas são removidos; o conteúdo do segredo não é alterado. Não há suposição sobre tamanho ou prefixo obrigatório do Client secret.
- Redirecionamentos não são seguidos nas requisições autenticadas; falhas de rede/TLS e respostas inválidas recebem mensagens fixas, sem exceção bruta. Nenhuma validação TLS é desativada.
- Novo modo `--diagnose-auth`: troca credenciais por token em memória, confere identidade, os dois escopos e enumeração de publicações; não consulta produtos, variantes ou contagem do catálogo e não grava relatório de autenticação.
- Rejeições na Admin API e divergências de escopos são diferenciadas da etapa OAuth. Somente `read_products` e `read_publications` são aceitos, como antes.
- No Bash, ambas as credenciais usam entrada oculta. O roteiro converte o diretório de saída para formato nativo com `cygpath -m` no Git Bash, evitando passar `/c/...` ao Node do Windows como diretório incorreto.

## Como executar novamente

No Git Bash, dentro do repositório já na branch `audit/migration-readiness-2026`:

```sh
git pull --ff-only origin audit/migration-readiness-2026
bash scripts/run-local-publication-audit.sh --diagnose-auth
```

Esse `pull` apenas atualiza a branch local da auditoria. Não faz merge na branch oficial, deploy ou alteração na loja. Se o Git avisar que há alterações locais/divergência, pare e informe a mensagem, sem `reset --hard` ou remoção de arquivos.

Digite novamente Client ID e Client secret **do mesmo app de auditoria**, apenas nos prompts locais ocultos. Não use credenciais do app de limpeza de fotos, não acrescente aspas e não cole comandos `export`. Não execute com `bash -x`, `curl -v`, `printenv` ou impressão da resposta bruta.

O resultado é um JSON sanitizado. Se houver falha, o processo retorna código de saída 1, sem iniciar o catálogo. Compartilhe somente esse JSON — sobretudo `stage`, `code`, `category`, `http_status` e `oauth_code`. Ele não contém credenciais ou resposta bruta. Não envie Client secret, tokens, `.env` ou capturas dos campos de credenciais.

## Como interpretar

| Código seguro | O que permite concluir | Próxima verificação |
|---|---|---|
| `LOCAL_CREDENTIAL_MISSING` / `LOCAL_CREDENTIAL_FORMAT` | Campo vazio ou entrada com formato local inadequado; não enviado à Shopify | Copiar somente o valor completo do campo do app de auditoria |
| `invalid_client` | Shopify rejeitou o par/identificação; não distingue qual campo | Conferir mesmo app, Client ID correto e segredo vigente, localmente |
| `application_cannot_be_found` | Shopify não encontrou o app identificado | Conferir Client ID; não usar nome da versão ou ID de instalação |
| `app_not_installed` | Shopify não reconheceu instalação para o Client ID e a loja da requisição | Confirmar qual app e qual loja correspondem à instalação contada no Dashboard |
| `shop_not_permitted` | Grant recusado para essa loja; compatível com organização inelegível | Comparar organização proprietária do app e da loja. Uma instalação por link externo não basta |
| `unsupported_grant_type` / `unauthorized_client` | Fluxo solicitado não autorizado/aceito | Conferir tipo do app, distribuição e organização; não trocar grant por tentativa |
| `invalid_request` | Ambíguo: credenciais, formato ou configuração | Não concluir causa pelo código sozinho. A requisição do script usa o formato documentado |
| `READ_SCOPES_MISSING` | Token obtido, mas falta um escopo requerido | Conferir os dois escopos na versão ativa e na instalação, sem adicionar outros |
| `READ_SCOPES_EXCESS` | Token obtido, mas foram concedidas permissões além das duas autorizadas | Usar somente o app dedicado com os dois escopos; não alterar o app de fotos |
| `ADMIN_READ_FAILED` | A troca OAuth passou, mas uma leitura Admin foi recusada | Conferir instalação/acesso na etapa indicada; não é o mesmo erro da troca de token |
| `OAUTH_UNCLASSIFIED` | HTTP sem código reconhecido; causa ainda desconhecida | Enviar somente o diagnóstico sanitizado, sem resposta bruta |
| `AUTH_NETWORK_FAILURE` | Nenhuma resposta HTTP recebida | Conferir rede, DNS, proxy/certificado sem desativar TLS |
| `AUTH_AND_READ_ACCESS_OK` | Autenticação, loja e dois escopos conferidos | Executar a auditoria completa |

`oauth_code` é o código da Shopify quando reconhecido; `code` identifica a etapa/erro seguro do auditor. Códigos OAuth de erro são evidências do motivo informado pela Shopify, não acesso aos dados internos da organização. Verificações de configuração no painel ainda cabem ao proprietário.

Se houver `shop_not_permitted` e o app estiver em organização Partner diferente da loja, este script não pode corrigir a propriedade/organização por código. As opções são app dedicado na organização lojista, ou adaptação explícita para OAuth authorization code no mesmo app. Nenhuma dessas alterações foi aplicada nesta correção.

## Depois do diagnóstico aprovado

Se aparecer `AUTH_AND_READ_ACCESS_OK`, execute:

```sh
bash scripts/run-local-publication-audit.sh
```

O roteiro pedirá as credenciais novamente e permitirá conferir o ID de Loja virtual antes de auditar todos os produtos e canais. Os resultados são salvos em `adula-audit-results` na pasta pessoal do usuário; o caminho completo é mostrado pelo roteiro. O token não é gravado para reutilização entre processos.

A auditoria completa continua incluindo ACTIVE/DRAFT/ARCHIVED, todos os SKUs, canais visíveis e comparação com os 850 produtos públicos. Nenhum produto, tema, desconto ou domínio é alterado.

## Validação e limites

- 25 cenários de OAuth/diagnóstico: respostas JSON/HTML, códigos conhecidos/desconhecidos, credenciais com CR/LF/BOM, caracteres especiais codificados, segredos refletidos, resposta de sucesso inválida, rede, redirecionamento e escopos.
- 6 cenários do lançador Bash: diagnóstico isolado, falha, token existente, conversão de caminho Windows simulada, opções inválidas e ajuda.
- 15 cenários anteriores do auditor continuam aprovados; integridade dos arquivos de redirecionamento preservada.
- Nenhuma credencial real foi usada, nenhuma autenticação real foi realizada pelo Codex e nenhum teste foi executado em Windows real nesta etapa. O lançador foi testado em Bash com Node/cygpath simulados; os testes Node usam requests simulados. A confirmação no seu Windows depende da nova execução local.
