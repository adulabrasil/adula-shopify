Run with Node.js 22+ (no npm packages required):

```sh
node tests/migration-audit-2026/publications.test.mjs
node tests/migration-audit-2026/auth.test.mjs
node tests/migration-audit-2026/launcher.test.mjs
node tests/migration-audit-2026/redirects.test.mjs
bash -n scripts/run-local-publication-audit.sh
```

The 15 Admin scenarios use mocked requests, including all three statuses, SKU pagination beyond 50 variants, more than 10 channels, legacy publications without a catalog, market-catalog exclusion, exact count reconciliation, insufficient/excessive scopes, wrong store, version drift, missing booleans, error redaction and public pagination.

The redirect check validates the saved artifacts against HTTP observations from 17/11/2026. It is not a new live network check and performs no import. For a new HTTP check, use `scripts/recheck-migration-redirects.py INPUT.csv OUTPUT_DIR` (Python/lxml required).

The added 25 OAuth/diagnostic and 6 Bash launcher scenarios test fixed-message error classification and prevent reflected secrets from appearing in output. Windows path conversion is simulated; no real Windows runtime or real credentials are used. See `DIAGNOSTICO-HTTP400.md` in the report directory.

Final redirect package validation: `node tests/migration-audit-2026/final-redirects.test.mjs`. Validates saved real HTTP evidence, 40+10+5 CSV partition, 674 preserved sources, 180 pending URLs and hidden HTML page drafts. No live import, theme change or Admin operation.
