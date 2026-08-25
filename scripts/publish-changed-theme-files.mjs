import fs from 'node:fs/promises';
import path from 'node:path';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const apiVersion = '2026-07';
const allowedRoots = new Set(['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates']);
const textExtensions = new Set(['.css', '.gif', '.html', '.js', '.json', '.liquid', '.md', '.scss', '.svg', '.txt', '.xml']);

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

let filenames;
try {
  filenames = JSON.parse(process.env.THEME_FILES_JSON || '[]');
} catch {
  throw new Error('THEME_FILES_JSON precisa ser uma lista JSON válida.');
}

filenames = [...new Set(filenames.map((name) => String(name).trim()).filter(Boolean))].sort();

for (const filename of filenames) {
  const normalized = path.posix.normalize(filename);
  const root = normalized.split('/')[0];
  if (normalized !== filename || normalized.startsWith('../') || !allowedRoots.has(root)) {
    throw new Error(`Caminho de tema inválido: ${filename}`);
  }
}

if (filenames.length === 0) {
  console.log('Nenhum arquivo de tema foi alterado; nada a publicar.');
  process.exit(0);
}

async function getAccessToken() {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) throw new Error(`Falha ao autenticar na Shopify (${response.status}).`);
  return (await response.json()).access_token;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`Erro GraphQL: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

async function readThemeFile(filename) {
  const buffer = await fs.readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  return {
    filename,
    body: textExtensions.has(extension)
      ? { type: 'TEXT', value: buffer.toString('utf8') }
      : { type: 'BASE64', value: buffer.toString('base64') },
  };
}

const token = await getAccessToken();
const themeData = await graphql(token, `
  query MainTheme {
    themes(first: 2, roles: [MAIN]) {
      nodes { id name role }
    }
  }
`);
const mainTheme = themeData.themes.nodes.find((theme) => theme.role === 'MAIN');
if (!mainTheme) throw new Error('Tema principal não encontrado.');

const inputs = await Promise.all(filenames.map(readThemeFile));
const batches = [];
for (let index = 0; index < inputs.length; index += 50) {
  batches.push(inputs.slice(index, index + 50));
}

const published = [];
const jobs = [];
for (const files of batches) {
  const result = await graphql(token, `
    mutation PublishThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        job { id }
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }
  `, { themeId: mainTheme.id, files });

  const payload = result.themeFilesUpsert;
  if (payload.userErrors.length) {
    throw new Error(`Falha ao publicar: ${JSON.stringify(payload.userErrors)}`);
  }
  published.push(...payload.upsertedThemeFiles.map((file) => file.filename));
  if (payload.job?.id) jobs.push(payload.job.id);
}

console.log(JSON.stringify({
  theme: mainTheme.name,
  themeId: mainTheme.id,
  requestedFiles: filenames,
  immediatelyPublishedFiles: published.sort(),
  asynchronousJobs: jobs,
}, null, 2));
