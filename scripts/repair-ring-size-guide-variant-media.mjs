import fs from 'node:fs/promises';
import path from 'node:path';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const outputDir = process.env.OUTPUT_DIR || 'ring-size-guide-variant-media-repair';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

const targets = [
  {
    handle: 'anel-cigano',
    title: 'Anel Cigano',
    principalFile: 'anel-cigano-principal.jpg',
    goldMediaId: 'gid://shopify/MediaImage/41330985631907',
  },
  {
    handle: 'anel-belle',
    title: 'Anel Belle',
    principalFile: 'anel-belle-principal.jpg',
  },
  {
    handle: 'anel-anna',
    title: 'Anel Anna',
    principalFile: 'anel-anna-principal.jpg',
  },
  {
    handle: 'anel-akemi',
    title: 'Anel Akemi',
    principalFile: 'anel-akemi-principal.jpg',
    goldMediaId: 'gid://shopify/MediaImage/41330989301923',
  },
  {
    handle: 'alianca-lacos-prata-925-3mm',
    title: 'Aliança Laços Prata 925 – 3mm',
    principalFile: 'alianca-lacos-prata-925-3mm-principal.jpg',
  },
];

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function finishForVariant(variant) {
  const text = normalize(variant.selectedOptions.map((option) => option.value).join(' '));
  if (/\b(dourad[oa]?|ouro|gold|18k)\b/.test(text)) return 'gold';
  if (/\b(prata|pratead[oa]?|silver|rodio|rhodium)\b/.test(text)) return 'silver';
  return 'silver';
}

function filenameFromUrl(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').at(-1) || '').toLowerCase();
}

function isGuide(media) {
  return /(guia|medida|tamanho|size-guide)/.test(normalize(`${media.alt || ''} ${filenameFromUrl(media.image?.url || '')}`));
}

async function getAccessToken() {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) throw new Error(`Falha ao autenticar na Shopify (${response.status}): ${await response.text()}`);
  return (await response.json()).access_token;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(`Erro GraphQL da Shopify: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

const PRODUCT_QUERY = `
  query RingSizeGuideVariantMedia($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id handle title status
        media(first: 100) {
          pageInfo { hasNextPage }
          nodes {
            id alt mediaContentType
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) {
          pageInfo { hasNextPage }
          nodes {
            id title selectedOptions { name value }
            media(first: 10) { nodes { id } }
          }
        }
      }
    }
  }
`;

const UPDATE_MUTATION = `
  mutation RepairRingSizeGuideVariantMedia($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
      productVariants { id media(first: 10) { nodes { id } } }
      userErrors { field message }
    }
  }
`;

function exactHandleQuery(handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) throw new Error(`Handle inválido: ${handle}`);
  return `handle:${handle}`;
}

async function findExactProduct(token, target) {
  const data = await graphql(token, PRODUCT_QUERY, { query: exactHandleQuery(target.handle) });
  const exact = data.products.nodes.filter((product) => product.handle === target.handle);
  if (exact.length !== 1) throw new Error(`Esperado 1 produto com handle ${target.handle}; encontrados ${exact.length}.`);
  const product = exact[0];
  if (product.title !== target.title || product.status !== 'ACTIVE') {
    throw new Error(`Produto inesperado ou inativo: ${target.handle}.`);
  }
  if (product.media.pageInfo.hasNextPage || product.variants.pageInfo.hasNextPage) {
    throw new Error(`Mídias ou variantes truncadas em ${target.handle}; correção interrompida.`);
  }
  return product;
}

function choosePrincipal(product, target) {
  const matches = product.media.nodes.filter((media) => media.mediaContentType === 'IMAGE'
    && media.image?.url && filenameFromUrl(media.image.url) === target.principalFile);
  if (matches.length !== 1) {
    throw new Error(`Foto principal esperada não encontrada de forma única em ${target.handle}.`);
  }
  const principal = matches[0];
  if (principal.image.width !== 1254 || principal.image.height !== 1254 || isGuide(principal)) {
    throw new Error(`Foto principal de ${target.handle} não atende às proteções de tamanho e conteúdo.`);
  }
  return principal;
}

function chooseGold(product, target) {
  if (!target.goldMediaId) return null;
  const matches = product.media.nodes.filter((media) => media.id === target.goldMediaId);
  if (matches.length !== 1) throw new Error(`Foto dourada aprovada não pertence mais a ${target.handle}.`);
  const gold = matches[0];
  if (gold.mediaContentType !== 'IMAGE' || !gold.image?.url || isGuide(gold)
    || gold.image.width !== gold.image.height) {
    throw new Error(`Foto dourada aprovada de ${target.handle} não atende mais às proteções.`);
  }
  return gold;
}

await fs.mkdir(outputDir, { recursive: true });
const token = await getAccessToken();
const report = {
  generatedAt: new Date().toISOString(),
  mode: 'targeted-variant-featured-media-repair',
  constraints: {
    deletesMedia: false,
    uploadsMedia: false,
    reordersMedia: false,
    keepsSizeGuideInGallery: true,
    expectedProducts: targets.length,
  },
  products: [],
};

for (const target of targets) {
  const product = await findExactProduct(token, target);
  const principal = choosePrincipal(product, target);
  const gold = chooseGold(product, target);
  const updates = product.variants.nodes.map((variant) => {
    const finish = finishForVariant(variant);
    if (finish === 'gold' && !gold) {
      throw new Error(`Variante dourada encontrada sem foto dourada aprovada em ${target.handle}.`);
    }
    return { id: variant.id, mediaId: finish === 'gold' ? gold.id : principal.id };
  });

  const payload = (await graphql(token, UPDATE_MUTATION, { productId: product.id, variants: updates }))
    .productVariantsBulkUpdate;
  if (payload.userErrors.length) {
    throw new Error(`Falha ao corrigir ${target.handle}: ${JSON.stringify(payload.userErrors)}`);
  }

  const returned = new Map(payload.productVariants.map((variant) => [
    variant.id,
    new Set(variant.media.nodes.map((media) => media.id)),
  ]));
  for (const update of updates) {
    if (!returned.get(update.id)?.has(update.mediaId)) {
      throw new Error(`A Shopify não confirmou o novo vínculo da variante ${update.id} de ${target.handle}.`);
    }
  }

  report.products.push({
    productId: product.id,
    handle: product.handle,
    title: product.title,
    variantsUpdated: updates.length,
    silverMediaId: principal.id,
    goldMediaId: gold?.id || null,
  });
  console.log(`${target.handle}: corrigido (${updates.length} variantes)`);
}

report.summary = {
  updatedProducts: report.products.length,
  updatedVariants: report.products.reduce((sum, product) => sum + product.variantsUpdated, 0),
};

if (report.products.length !== targets.length) {
  throw new Error(`Proteção de contagem acionada: esperados ${targets.length}, corrigidos ${report.products.length}.`);
}

await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
