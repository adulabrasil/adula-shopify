#!/usr/bin/env bash
# Run locally. No secrets in arguments, files, shell history or GitHub.
set -euo pipefail
set +x
trap 'unset SHOPIFY_CLIENT_SECRET SHOPIFY_ADMIN_ACCESS_TOKEN SHOPIFY_CLIENT_ID' EXIT
AUDIT_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AUDIT_DIAGNOSE=0
AUDIT_EXISTING_TOKEN=0
for AUDIT_OPTION in "$@"; do
  case "$AUDIT_OPTION" in
    --diagnose-auth) AUDIT_DIAGNOSE=1 ;;
    --existing-token) AUDIT_EXISTING_TOKEN=1 ;;
    --help) printf 'Uso: bash scripts/run-local-publication-audit.sh [--diagnose-auth] [--existing-token]\n'; exit 0 ;;
    *) printf 'Opção não reconhecida. Use --help. Não informe credenciais como argumentos.\n' >&2; exit 2 ;;
  esac
done
export SHOPIFY_SHOP=adula-brasil.myshopify.com
if [[ "$AUDIT_EXISTING_TOKEN" == 1 ]]; then
  unset SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET
  read -r -s -p 'Token do app SOMENTE LEITURA (entrada oculta): ' SHOPIFY_ADMIN_ACCESS_TOKEN
  printf '\n'
  export SHOPIFY_ADMIN_ACCESS_TOKEN
else
  unset SHOPIFY_ADMIN_ACCESS_TOKEN
  read -r -s -p 'Client ID do app de auditoria (entrada oculta): ' SHOPIFY_CLIENT_ID
  printf '\n'
  read -r -s -p 'Client secret (entrada oculta): ' SHOPIFY_CLIENT_SECRET
  printf '\n'
  export SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET
fi
if [[ "$AUDIT_DIAGNOSE" == 1 ]]; then
  node "$AUDIT_SCRIPT_DIR/audit-sales-channel-publications.mjs" --diagnose-auth
  exit 0
fi
# Git Bash/MSYS uses /c/... paths; Windows Node must receive a native C:/... path.
AUDIT_OUTPUT_BASH_DIR="${OUTPUT_DIR:-$HOME/adula-audit-results}"
mkdir -p -- "$AUDIT_OUTPUT_BASH_DIR"
chmod 700 "$AUDIT_OUTPUT_BASH_DIR"
if command -v cygpath >/dev/null 2>&1; then
  export OUTPUT_DIR="$(cygpath -m "$AUDIT_OUTPUT_BASH_DIR")"
else
  export OUTPUT_DIR="$AUDIT_OUTPUT_BASH_DIR"
fi
node "$AUDIT_SCRIPT_DIR/audit-sales-channel-publications.mjs" --list-publications > "$AUDIT_OUTPUT_BASH_DIR/publications.json"
printf '\nPublicações disponíveis (sem credenciais):\n'
cat -- "$AUDIT_OUTPUT_BASH_DIR/publications.json"
printf '\nConfira a lista com os canais instalados no Admin. O ID abaixo deve ser o de Loja virtual.\n'
read -r -p 'ID completo de Loja virtual (gid://shopify/Publication/...): ' ONLINE_STORE_PUBLICATION_ID
export ONLINE_STORE_PUBLICATION_ID
# User instruction: all active products should be available in all sales channels.
export ALL_SALES_CHANNELS=1
node "$AUDIT_SCRIPT_DIR/audit-sales-channel-publications.mjs"
printf '\nConcluído. Compartilhe SOMENTE os relatórios em %s; nunca as credenciais.\n' "$AUDIT_OUTPUT_BASH_DIR"
