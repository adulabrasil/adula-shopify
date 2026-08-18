import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const applyChanges = process.env.APPLY_CHANGES === 'true';
const expectedReplacements = Number(process.env.EXPECTED_REPLACEMENTS || 0);
const manifestPath = process.env.REPLACEMENT_MANIFEST || 'product-photo-replacements/approved.json';
const reportDir = process.env.OUTPUT_DIR || 'product-photo-replacement-report';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
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
  if (!response.ok) {
    throw new Error(`Falha ao autenticar na Shopify (${response.status}): ${await response.text()}`);
  }
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
    throw new Error(`Erro GraphQL da Shopify: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

const PRODUCT_QUERY = `
  query ProductPhotoReplacementPreflight($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id
        handle
        title
        media(first: 100) {
          nodes {
            id
            mediaContentType
            alt
            preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
      }
    }
  }
`;

const FILE_UPDATE_MUTATION = `
  mutation ReplaceProductPhotoContent($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        id
        fileStatus
        ... on MediaImage { image { url width height } }
      }
      userErrors { field message code }
    }
  }
`;

const VERIFY_QUERY = `
  query VerifyProductPhotoReplacement($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id
        handle
        media(first: 100) {
          nodes {
            id
            mediaContentType
            preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
      }
    }
  }
`;

function exactHandleQuery(handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) {
    throw new Error(`Handle inválido no manifesto: ${handle}`);
  }
  return `handle:${handle}`;
}

async function validateSource(replacement) {
  const local = await fs.readFile(replacement.repositoryPath);
  const sha256 = crypto.createHash('sha256').update(local).digest('hex');
  if (sha256 !== replacement.sha256) {
    throw new Error(`SHA-256 divergente para ${replacement.repositoryPath}.`);
  }
  const response = await fetch(replacement.sourceUrl);
  if (!response.ok) {
    throw new Error(`Imagem nova indisponível (${response.status}): ${replacement.sourceUrl}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`URL não retornou uma imagem: ${replacement.sourceUrl}`);
  }
  const remote = Buffer.from(await response.arrayBuffer());
  const remoteSha256 = crypto.createHash('sha256').update(remote).digest('hex');
  if (remoteSha256 !== replacement.sha256) {
    throw new Error(`A imagem publicada no GitHub não corresponde ao manifesto: ${replacement.sourceUrl}`);
  }
}

async function findExactProduct(token, handle, query = PRODUCT_QUERY) {
  const data = await graphql(token, query, { query: exactHandleQuery(handle) });
  const exact = data.products.nodes.filter((product) => product.handle === handle);
  if (exact.length !== 1) {
    throw new Error(`Esperado 1 produto com o handle ${handle}; encontrados ${exact.length}.`);
  }
  return exact[0];
}

async function waitUntilReady(token, handle, mediaId) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const product = await findExactProduct(token, handle, VERIFY_QUERY);
    const media = product.media.nodes.find((item) => item.id === mediaId);
    if (!media) throw new Error(`A mídia ${mediaId} deixou de pertencer ao produto ${handle}.`);
    if (media.preview?.status === 'READY') return product;
    if (media.preview?.status === 'FAILED') {
      throw new Error(`O processamento da nova foto falhou para ${handle}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error(`Tempo esgotado aguardando a nova foto ficar pronta para ${handle}.`);
}

await fs.mkdir(reportDir, { recursive: true });
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const replacements = manifest.replacements || [];
const handles = replacements.map((item) => item.handle);

if (!replacements.length || new Set(handles).size !== replacements.length) {
  throw new Error('O manifesto deve conter handles únicos e ao menos uma substituição.');
}
if (applyChanges && expectedReplacements !== replacements.length) {
  throw new Error(`Trava de segurança: esperado ${expectedReplacements}, manifesto contém ${replacements.length}.`);
}

const token = await getAccessToken();
const preflight = [];

// Toda a validação acontece antes da primeira alteração na Shopify.
for (const replacement of replacements) {
  await validateSource(replacement);
  const product = await findExactProduct(token, replacement.handle);
  const primary = product.media.nodes[0];
  if (!primary || primary.mediaContentType !== 'IMAGE' || !primary.image?.url) {
    throw new Error(`A primeira mídia de ${replacement.handle} não é uma imagem válida.`);
  }
  if (primary.preview?.status !== 'READY') {
    throw new Error(`A foto principal de ${replacement.handle} não está pronta para substituição.`);
  }
  preflight.push({
    replacement,
    productId: product.id,
    title: product.title,
    mediaId: primary.id,
    mediaCount: product.media.nodes.length,
    previousUrl: primary.image.url,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: applyChanges ? 'apply' : 'dry-run',
  replacements: preflight,
};

if (!applyChanges) {
  await fs.writeFile(`${reportDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pré-validação concluída para ${preflight.length} foto(s); nenhuma alteração aplicada.`);
  process.exit(0);
}

const updateData = await graphql(token, FILE_UPDATE_MUTATION, {
  files: preflight.map(({ mediaId, replacement }) => ({
    id: mediaId,
    originalSource: replacement.sourceUrl,
  })),
});
const errors = updateData.fileUpdate.userErrors;
if (errors.length) {
  throw new Error(`A Shopify recusou a substituição: ${JSON.stringify(errors)}`);
}

for (const item of preflight) {
  const verified = await waitUntilReady(token, item.replacement.handle, item.mediaId);
  const currentPrimary = verified.media.nodes[0];
  if (verified.media.nodes.length !== item.mediaCount) {
    throw new Error(`Quantidade de mídias mudou em ${item.replacement.handle}: ${item.mediaCount} -> ${verified.media.nodes.length}.`);
  }
  if (currentPrimary?.id !== item.mediaId) {
    throw new Error(`A mídia principal mudou de posição em ${item.replacement.handle}.`);
  }
  item.verifiedUrl = currentPrimary.image.url;
  item.verifiedWidth = currentPrimary.image.width;
  item.verifiedHeight = currentPrimary.image.height;
}

report.completedAt = new Date().toISOString();
report.verified = true;
await fs.writeFile(`${reportDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${preflight.length} foto(s) substituída(s) no mesmo ID, sem duplicar mídias.`);
