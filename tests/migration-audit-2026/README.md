Run with Node.js 22+ (no npm packages required):

```sh
node tests/migration-audit-2026/publications.test.mjs
node tests/migration-audit-2026/redirects.test.mjs
bash -n scripts/run-local-publication-audit.sh
```

The 15 Admin scenarios use mocked requests, including all three statuses, SKU pagination beyond 50 variants, more than 10 channels, legacy publications without a catalog, market-catalog exclusion, exact count reconciliation, insufficient/excessive scopes, wrong store, version drift, missing booleans, error redaction and public pagination.

The redirect check validates the saved artifacts against HTTP observations from 17/11/2026. It is not a new live network check and performs no import. For a new HTTP check, use `scripts/recheck-migration-redirects.py INPUT.csv OUTPUT_DIR` (Python/lxml required).
