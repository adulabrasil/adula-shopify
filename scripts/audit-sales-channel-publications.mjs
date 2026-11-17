// Read-only Admin GraphQL audit. This file contains no Shopify mutations.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function auditPublications({ shop, token, onlineStorePublicationId, outputDir, request = fetch }) {
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop || '') || !token || !onlineStorePublicationId) {
    throw new Error('Provide SHOPIFY_SHOP, SHOPIFY_ADMIN_ACCESS_TOKEN and ONLINE_STORE_PUBLICATION_ID (verified in Admin).');
  }
  const graphql = async (query, variables = {}) => {
    if (!query.trimStart().startsWith('query ')) throw new Error('Only named queries are allowed.');
    const response = await request(`https://${shop}/admin/api/2026-10/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    if (!response.ok || body.errors) throw new Error(`Admin read failed: HTTP ${response.status}; ${JSON.stringify(body.errors || [])}`);
    const throttle = body.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < 200 && throttle.restoreRate > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.ceil((200 - throttle.currentlyAvailable) / throttle.restoreRate) * 1000));
    }
    return body.data;
  };
  const publications = [];
  let after = null;
  do {
    const data = await graphql(`query PublicationInventory($after: String) {
      publications(first: 100, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } }
    }`, { after });
    publications.push(...data.publications.nodes);
    after = data.publications.pageInfo.hasNextPage ? data.publications.pageInfo.endCursor : null;
  } while (after);
  if (!publications.some(p => p.id === onlineStorePublicationId)) throw new Error('Confirmed Online Store publication ID was not returned; audit stopped.');
  const products = [];
  // Batch channels to keep query cost bounded, while checking EVERY product in EVERY publication.
  for (let start = 0; start < publications.length; start += 10) {
    const channels = publications.slice(start, start + 10);
    after = null;
    do {
      const fields = channels.map((p, i) => `channel${i}: publishedOnPublication(publicationId: ${JSON.stringify(p.id)})`).join('\n');
      const data = await graphql(`query ProductPublications($after: String) {
        products(first: 25, after: $after, sortKey: ID) {
          nodes { id handle title status onlineStoreUrl updatedAt ${fields} }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after });
      for (const product of data.products.nodes) {
        for (const [i, publication] of channels.entries()) {
          if (typeof product[`channel${i}`] !== 'boolean') throw new Error('Missing publication state; refusing an incomplete audit.');
          products.push({ product_id: product.id, handle: product.handle, title: product.title,
            status: product.status, online_store_url: product.onlineStoreUrl,
            updated_at: product.updatedAt, publication_id: publication.id, publication: publication.name,
            published: product[`channel${i}`], online_store: publication.id === onlineStorePublicationId });
        }
      }
      after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    } while (after);
  }
  const coverage = new Map();
  for (const row of products) {
    const state = coverage.get(row.product_id) || { channels: new Set(), versions: new Set() };
    if (state.channels.has(row.publication_id)) throw new Error('Duplicate product/channel row; audit stopped.');
    state.channels.add(row.publication_id);
    state.versions.add(`${row.status}:${row.updated_at}`);
    coverage.set(row.product_id, state);
  }
  if ([...coverage.values()].some(s => s.channels.size !== publications.length || s.versions.size !== 1)) {
    throw new Error('Catalog changed or publication coverage is incomplete; rerun the read-only audit.');
  }
  const result = { checked_at: new Date().toISOString(), shop, onlineStorePublicationId, publications,
    product_count: new Set(products.map(p => p.product_id)).size, rows: products,
    active_missing_online_store: products.filter(p => p.online_store && p.status === 'ACTIVE' && !p.published),
    inactive_published: products.filter(p => p.status !== 'ACTIVE' && p.published),
    limitation: 'Publication does not prove stock, market eligibility, search indexing or checkout availability. No catalog changes.' };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'sales-channel-publications.json'), JSON.stringify(result, null, 2));
  const columns = ['product_id', 'handle', 'title', 'status', 'publication_id', 'publication', 'published', 'online_store', 'online_store_url', 'updated_at'];
  const cell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  await fs.writeFile(path.join(outputDir, 'sales-channel-publications.csv'), '\uFEFF' + [columns, ...products.map(p => columns.map(k => p[k]))].map(row => row.map(cell).join(',')).join('\n') + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await auditPublications({ shop: process.env.SHOPIFY_SHOP, token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    onlineStorePublicationId: process.env.ONLINE_STORE_PUBLICATION_ID,
    outputDir: process.env.OUTPUT_DIR || 'sales-channel-audit' });
}
