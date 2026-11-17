#!/usr/bin/env bash
# Run locally. No secrets in arguments, files, shell history or GitHub.
set -euo pipefail
set +x
trap 'unset SHOPIFY_CLIENT_SECRET SHOPIFY_ADMIN_ACCESS_TOKEN SHOPIFY_CLIENT_ID' EXIT
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export SHOPIFY_SHOP=adula-brasil.myshopify.com
export OUTPUT_DIR="${OUTPUT_DIR:-$HOME/adula-audit-results}"
mkdir -p -- "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
if [[ "${1:-}" == '--existing-token' ]]; then
  unset SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET
  read -r -s -p 'Token do app SOMENTE LEITURA (entrada oculta): ' SHOPIFY_ADMIN_ACCESS_TOKEN
  printf '\n'
  export SHOPIFY_ADMIN_ACCESS_TOKEN
else
  unset SHOPIFY_ADMIN_ACCESS_TOKEN
  read -r -p 'Client ID do app de auditoria: ' SHOPIFY_CLIENT_ID
  read -r -s -p 'Client secret (entrada oculta): ' SHOPIFY_CLIENT_SECRET
  printf '\n'
  export SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET
fi
node "$SCRIPT_DIR/audit-sales-channel-publications.mjs" --list-publications > "$OUTPUT_DIR/publications.json"
printf '\nPublicações disponíveis (sem credenciais):\n'
cat -- "$OUTPUT_DIR/publications.json"
printf '\nConfira a lista com os canais instalados no Admin. O ID abaixo deve ser o de Loja virtual.\n'
read -r -p 'ID completo de Loja virtual (gid://shopify/Publication/...): ' ONLINE_STORE_PUBLICATION_ID
export ONLINE_STORE_PUBLICATION_ID
# User instruction: all active products should be available in all sales channels.
export ALL_SALES_CHANNELS=1
node "$SCRIPT_DIR/audit-sales-channel-publications.mjs"
printf '\nConcluído. Compartilhe SOMENTE os relatórios em %s; nunca as credenciais.\n' "$OUTPUT_DIR"
