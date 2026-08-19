import fs from 'node:fs/promises';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const apiVersion = '2026-07';
const filenames = [
  'assets/adula-product-card-variants-v2.js',
  'assets/adula-quick-buy.css',
  'snippets/option-value.liquid',
  'snippets/product-card.liquid',
  'layout/theme.liquid',
  'sections/main-product.liquid',
];

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

async function getAccessToken() {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) throw new Error(`Falha ao autenticar na Shopify (${response.status}).`);
  return (await response.json()).access_token;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(`Erro GraphQL: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

const token = await getAccessToken();
const themeData = await graphql(token, `
  query MainTheme {
    themes(first: 2, roles: [MAIN]) { nodes { id name role } }
  }
`);
const mainTheme = themeData.themes.nodes.find((theme) => theme.role === 'MAIN');
if (!mainTheme) throw new Error('Tema principal não encontrado.');

const files = await Promise.all(filenames.map(async (filename) => ({
  filename,
  body: { type: 'TEXT', value: await fs.readFile(filename, 'utf8') },
})));

const result = await graphql(token, `
  mutation PublishQuickBuy($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }
`, { themeId: mainTheme.id, files });

const payload = result.themeFilesUpsert;
if (payload.userErrors.length) throw new Error(`Falha ao publicar: ${JSON.stringify(payload.userErrors)}`);
const published = payload.upsertedThemeFiles.map((file) => file.filename).sort();
const expected = [...filenames].sort();
if (JSON.stringify(published) !== JSON.stringify(expected)) {
  throw new Error(`Publicação incompleta. Esperado ${expected.length}; publicado ${published.length}.`);
}

console.log(JSON.stringify({ theme: mainTheme.name, themeId: mainTheme.id, published }));
