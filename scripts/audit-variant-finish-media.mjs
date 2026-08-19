import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const outputDir = process.env.OUTPUT_DIR || 'variant-finish-media-audit';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function finishFromText(value) {
  const text = normalize(value);
  if (/\b(dourad[oa]?|ouro|gold|18k)\b/.test(text)) return 'gold';
  if (/\b(prata|pratead[oa]?|silver|rodio|rhodium)\b/.test(text)) return 'silver';
  return null;
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
  query VariantFinishMediaAudit($after: String) {
    products(first: 50, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
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
          nodes {
            id title selectedOptions { name value }
            media(first: 10) { nodes { id } }
          }
        }
      }
    }
  }
`;

async function downloadImage(url) {
  const resizedUrl = `${url}${url.includes('?') ? '&' : '?'}width=256`;
  const response = await fetch(resizedUrl);
  if (!response.ok) throw new Error(`Falha ao baixar imagem (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function analyzeImage(media) {
  try {
    const buffer = await downloadImage(media.image.url);
    const { data, info } = await sharp(buffer)
      .removeAlpha()
      .resize(128, 128, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const border = 12;
    let borderPixels = 0;
    let borderWhite = 0;
    let borderBrightness = 0;
    let objectPixels = 0;
    let warmPixels = 0;
    let neutralPixels = 0;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const isBorder = x < border || x >= info.width - border || y < border || y >= info.height - border;

        if (isBorder) {
          borderPixels += 1;
          borderBrightness += brightness;
          if (brightness >= 238 && max - min <= 18) borderWhite += 1;
        }

        if (brightness < 247 || max - min > 12) {
          objectPixels += 1;
          if (r - b >= 24 && r >= g * 1.025 && g >= b * 1.04 && brightness >= 45 && brightness <= 242) warmPixels += 1;
          if (max - min <= 18 && brightness >= 45 && brightness <= 235) neutralPixels += 1;
        }
      }
    }

    const whiteRatio = borderWhite / Math.max(1, borderPixels);
    const meanBorderBrightness = borderBrightness / Math.max(1, borderPixels);
    const warmRatio = warmPixels / Math.max(1, objectPixels);
    const neutralRatio = neutralPixels / Math.max(1, objectPixels);
    const isWhiteBackground = whiteRatio >= 0.8 && meanBorderBrightness >= 236;
    let visualFinish = null;
    if (isWhiteBackground && warmRatio >= 0.1 && warmPixels >= 45) visualFinish = 'gold';
    else if (isWhiteBackground && neutralRatio >= 0.42 && warmRatio < 0.08 && neutralPixels >= 80) visualFinish = 'silver';

    return {
      isWhiteBackground,
      whiteRatio: Number(whiteRatio.toFixed(4)),
      meanBorderBrightness: Number(meanBorderBrightness.toFixed(2)),
      warmRatio: Number(warmRatio.toFixed(4)),
      neutralRatio: Number(neutralRatio.toFixed(4)),
      visualFinish,
    };
  } catch (error) {
    return { error: error.message, isWhiteBackground: false, visualFinish: null };
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function scoreCandidate(media, finish, existingIds) {
  const keywordFinish = media.keywordFinish;
  const visualFinish = media.analysis.visualFinish;
  let score = 0;
  const reasons = [];

  if (!media.analysis.isWhiteBackground) return { score: -1000, reasons: ['not-white-background'] };
  if (keywordFinish === finish) { score += 100; reasons.push('matching-filename-or-alt'); }
  if (keywordFinish && keywordFinish !== finish) { score -= 160; reasons.push('conflicting-filename-or-alt'); }
  if (visualFinish === finish) { score += 55; reasons.push('matching-visual-metal'); }
  if (visualFinish && visualFinish !== finish) { score -= 65; reasons.push('conflicting-visual-metal'); }
  if (media.image.width === 1254 && media.image.height === 1254) { score += 18; reasons.push('standardized-1254'); }
  if (existingIds.has(media.id) && !keywordFinish) { score += 8; reasons.push('existing-link'); }
  score += Math.max(0, 12 - media.position);
  return { score, reasons };
}

function pickCandidate(mediaList, finish, existingIds) {
  const ranked = mediaList
    .map((media) => ({ media, ...scoreCandidate(media, finish, existingIds) }))
    .sort((a, b) => b.score - a.score || a.media.position - b.media.position);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || first.score < 45 || (second && first.score - second.score < 12)) {
    return { safe: false, candidate: first || null, runnerUp: second || null };
  }
  return { safe: true, candidate: first, runnerUp: second || null };
}

await fs.mkdir(outputDir, { recursive: true });
const token = await getAccessToken();
const products = [];
let after = null;
do {
  const data = await graphql(token, PRODUCTS_QUERY, { after });
  products.push(...data.products.nodes);
  after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (after);

const auditedProducts = [];
for (const product of products) {
  if (product.status !== 'ACTIVE') continue;
  const variants = product.variants.nodes.map((variant) => {
    const finishOption = variant.selectedOptions
      .map((option) => ({ ...option, finish: finishFromText(option.value) }))
      .find((option) => option.finish);
    return { ...variant, finish: finishOption?.finish || null, finishValue: finishOption?.value || null };
  });
  const finishSet = new Set(variants.map((variant) => variant.finish).filter(Boolean));
  if (!finishSet.has('gold') || !finishSet.has('silver')) continue;

  const imageNodes = product.media.nodes
    .filter((media) => media.mediaContentType === 'IMAGE' && media.image?.url)
    .slice(0, 40);
  const analyses = await mapConcurrent(imageNodes, 6, analyzeImage);
  const mediaList = imageNodes.map((media, index) => ({
    ...media,
    position: index + 1,
    keywordFinish: finishFromText(`${media.alt || ''} ${decodeURIComponent(media.image.url)}`),
    analysis: analyses[index],
  }));

  const groups = {};
  for (const finish of ['gold', 'silver']) {
    const finishVariants = variants.filter((variant) => variant.finish === finish);
    const existingIds = new Set(finishVariants.flatMap((variant) => variant.media.nodes.map((media) => media.id)));
    const choice = pickCandidate(mediaList, finish, existingIds);
    groups[finish] = {
      variantIds: finishVariants.map((variant) => variant.id),
      values: [...new Set(finishVariants.map((variant) => variant.finishValue))],
      existingMediaIds: [...existingIds],
      choice,
    };
  }

  const goldId = groups.gold.choice.candidate?.media.id || null;
  const silverId = groups.silver.choice.candidate?.media.id || null;
  const safeToApply = groups.gold.choice.safe && groups.silver.choice.safe && goldId !== silverId;
  const changesNeeded = safeToApply && (
    groups.gold.existingMediaIds.length !== 1 || groups.gold.existingMediaIds[0] !== goldId
    || groups.silver.existingMediaIds.length !== 1 || groups.silver.existingMediaIds[0] !== silverId
  );

  auditedProducts.push({
    productId: product.id,
    handle: product.handle,
    title: product.title,
    mediaTruncated: product.media.pageInfo.hasNextPage,
    safeToApply,
    changesNeeded,
    groups,
    media: mediaList,
  });
  console.log(`${product.handle}: ${safeToApply ? (changesNeeded ? 'safe-change' : 'already-correct') : 'ambiguous'}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'audit-only',
  summary: {
    activeProducts: products.filter((product) => product.status === 'ACTIVE').length,
    productsWithGoldAndSilver: auditedProducts.length,
    safeToApply: auditedProducts.filter((product) => product.safeToApply).length,
    safeChangesNeeded: auditedProducts.filter((product) => product.safeToApply && product.changesNeeded).length,
    alreadyCorrect: auditedProducts.filter((product) => product.safeToApply && !product.changesNeeded).length,
    ambiguous: auditedProducts.filter((product) => !product.safeToApply).length,
  },
  products: auditedProducts,
};

await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
