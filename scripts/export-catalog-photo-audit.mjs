import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const outputDir = process.env.OUTPUT_DIR || 'catalog-photo-audit';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
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

const PRODUCTS_QUERY = `
  query CatalogPhotoAudit($after: String) {
    products(first: 50, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status
        options { id name optionValues { id name } }
        media(first: 100) {
          nodes {
            id alt mediaContentType preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) {
          nodes {
            id title selectedOptions { name value }
            media(first: 20) { nodes { id } }
          }
        }
      }
    }
  }
`;

function safeName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
}

function hasTargetColor(product) {
  return product.variants.nodes.some((variant) => variant.selectedOptions.some(({ value }) => /dourad|prata|rodio/i.test(value)));
}

async function analyzeWhiteBackground(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().resize(96, 96, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const border = 9;
  let sampled = 0;
  let nearWhite = 0;
  let totalBrightness = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (x >= border && x < info.width - border && y >= border && y < info.height - border) continue;
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      sampled += 1;
      totalBrightness += brightness;
      if (brightness >= 238 && max - min <= 18) nearWhite += 1;
    }
  }
  const whiteRatio = nearWhite / sampled;
  const meanBorderBrightness = totalBrightness / sampled;
  return {
    whiteRatio: Number(whiteRatio.toFixed(4)),
    meanBorderBrightness: Number(meanBorderBrightness.toFixed(2)),
    isWhiteBackground: whiteRatio >= 0.82 && meanBorderBrightness >= 238,
  };
}

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar imagem (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

await fs.mkdir(path.join(outputDir, 'images'), { recursive: true });
const token = await getAccessToken();
const products = [];
let after = null;
do {
  const data = await graphql(token, PRODUCTS_QUERY, { after });
  products.push(...data.products.nodes);
  after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (after);

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const reportProducts = await mapLimit(products, 8, async (product) => {
  const targetColor = hasTargetColor(product);
  const images = product.media.nodes.filter((media) => media.mediaContentType === 'IMAGE' && media.image?.url);
  const downloaded = [];
  for (let index = 0; index < images.length; index += 1) {
    if (index !== 0 && !targetColor) continue;
    const media = images[index];
    const buffer = await downloadImage(media.image.url);
    const extension = media.image.url.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const file = `${safeName(product.handle)}__${String(index + 1).padStart(2, '0')}__${media.id.split('/').pop()}.${extension}`;
    await fs.writeFile(path.join(outputDir, 'images', file), buffer);
    downloaded.push({
      id: media.id,
      position: index + 1,
      alt: media.alt,
      url: media.image.url,
      width: media.image.width,
      height: media.image.height,
      file: `images/${file}`,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      ...(index === 0 ? await analyzeWhiteBackground(buffer) : {}),
    });
  }
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status,
    hasTargetColor: targetColor,
    mediaCount: product.media.nodes.length,
    options: product.options,
    variants: product.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      selectedOptions: variant.selectedOptions,
      mediaIds: variant.media.nodes.map((media) => media.id),
    })),
    downloadedImages: downloaded,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  productCount: reportProducts.length,
  activeProductCount: reportProducts.filter((product) => product.status === 'ACTIVE').length,
  whiteBackgroundPrimaryCount: reportProducts.filter((product) => product.downloadedImages[0]?.isWhiteBackground).length,
  targetColorProductCount: reportProducts.filter((product) => product.hasTargetColor).length,
};

await fs.writeFile(path.join(outputDir, 'catalog.json'), `${JSON.stringify({ summary, products: reportProducts }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
