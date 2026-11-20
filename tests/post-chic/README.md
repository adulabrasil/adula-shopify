Run with Node.js 22+ and Python 3:

```sh
npm ci --prefix tests/post-chic
npm test --prefix tests/post-chic
shopify theme check --path . --output json
```

The 30 scenarios use LiquidJS with mocked Shopify filters, JSDOM, simulated cart endpoints and a mocked Admin GraphQL service. They make no requests to Shopify and do not prove real app integration, Shopify rendering, checkout or issuance of Giftback credits.

The tests cover catalog prices (including real catalog sales and zero prices), campaign date independence, numeric Open Graph, native JSON-LD, variant IDs/totals in Shop the Look, delayed wishlist button insertion, automatic gift thresholds/transitions/deduplication and pause, full publication pagination and ambiguous/missing URL matches.
