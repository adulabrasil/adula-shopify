import fs from 'node:fs/promises';
import path from 'node:path';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const auditPath = process.env.AUDIT_REPORT || 'reports/variant-finish-media-audit.json';
const outputDir = process.env.OUTPUT_DIR || 'variant-finish-media-correction';
const expectedProducts = Number(process.env.EXPECTED_PRODUCTS || '140');
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

const PRODUCT_QUERY = `
  query SafeVariantMediaProduct($id: ID!) {
    product(id: $id) {
      id handle title status
      media(first: 100) { nodes { id } }
      variants(first: 250) {
        nodes {
          id selectedOptions { name value }
          media(first: 10) { nodes { id } }
        }
      }
    }
  }
`;

const UPDATE_MUTATION = `
  mutation SafeVariantMediaUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
      productVariants { id media(first: 10) { nodes { id } } }
      userErrors { field message }
    }
  }
`;

function strictCandidate(product, finish) {
  const choice = product.groups?.[finish]?.choice;
  const media = choice?.candidate?.media;
  if (!product.safeToApply || !product.changesNeeded || product.mediaTruncated) return false;
  if (!choice?.safe || choice.candidate.score < 60) return false;
  if (!media?.analysis?.isWhiteBackground || media.analysis.visualFinish !== finish) return false;
  if (media.image.width !== media.image.height || media.position > 10) return false;
  if (media.keywordFinish && media.keywordFinish !== finish) return false;
  const name = decodeURIComponent(media.image.url || '').toLowerCase();
  if (/(guia|medida|sacola|certific|banner|logo|embalag|caixa|manual)/.test(name)) return false;
  return true;
}

function finishForVariant(variant) {
  return variant.selectedOptions.map((option) => finishFromText(option.value)).find(Boolean) || null;
}

await fs.mkdir(outputDir, { recursive: true });
const audit = JSON.parse(await fs.readFile(auditPath, 'utf8'));
const ageMs = Date.now() - new Date(audit.generatedAt).getTime();
if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
  throw new Error('O relatório de auditoria está ausente, inválido ou tem mais de 24 horas.');
}

const selected = audit.products.filter((product) => {
  const goldId = product.groups?.gold?.choice?.candidate?.media?.id;
  const silverId = product.groups?.silver?.choice?.candidate?.media?.id;
  return strictCandidate(product, 'gold') && strictCandidate(product, 'silver') && goldId && silverId && goldId !== silverId;
});

if (selected.length !== expectedProducts) {
  throw new Error(`Proteção de contagem acionada: esperados ${expectedProducts}, encontrados ${selected.length}.`);
}

const token = await getAccessToken();
const results = [];

for (const audited of selected) {
  const live = (await graphql(token, PRODUCT_QUERY, { id: audited.productId })).product;
  if (!live || live.status !== 'ACTIVE' || live.handle !== audited.handle) {
    throw new Error(`Produto alterado ou indisponível desde a auditoria: ${audited.handle}`);
  }

  const productMediaIds = new Set(live.media.nodes.map((media) => media.id));
  const goldMediaId = audited.groups.gold.choice.candidate.media.id;
  const silverMediaId = audited.groups.silver.choice.candidate.media.id;
  if (!productMediaIds.has(goldMediaId) || !productMediaIds.has(silverMediaId)) {
    throw new Error(`Uma foto candidata não pertence mais ao produto: ${audited.handle}`);
  }

  const expectedVariantIds = new Set([
    ...audited.groups.gold.variantIds,
    ...audited.groups.silver.variantIds,
  ]);
  const liveVariants = live.variants.nodes.filter((variant) => expectedVariantIds.has(variant.id));
  if (liveVariants.length !== expectedVariantIds.size) {
    throw new Error(`As variantes mudaram desde a auditoria: ${audited.handle}`);
  }

  const updates = liveVariants.map((variant) => {
    const finish = finishForVariant(variant);
    if (!finish) throw new Error(`Acabamento não reconhecido na variante ${variant.id} de ${audited.handle}`);
    const expectedGroup = audited.groups[finish];
    if (!expectedGroup.variantIds.includes(variant.id)) {
      throw new Error(`Acabamento mudou desde a auditoria na variante ${variant.id} de ${audited.handle}`);
    }
    return { id: variant.id, mediaId: finish === 'gold' ? goldMediaId : silverMediaId };
  });

  const payload = (await graphql(token, UPDATE_MUTATION, {
    productId: live.id,
    variants: updates,
  })).productVariantsBulkUpdate;

  if (payload.userErrors.length) {
    throw new Error(`Falha ao corrigir ${audited.handle}: ${JSON.stringify(payload.userErrors)}`);
  }

  const returned = new Map(payload.productVariants.map((variant) => [
    variant.id,
    new Set(variant.media.nodes.map((media) => media.id)),
  ]));
  for (const update of updates) {
    if (!returned.get(update.id)?.has(update.mediaId)) {
      throw new Error(`A Shopify não confirmou o vínculo da variante ${update.id} de ${audited.handle}`);
    }
  }

  results.push({
    productId: live.id,
    handle: live.handle,
    title: live.title,
    variantsUpdated: updates.length,
    goldMediaId,
    silverMediaId,
  });
  console.log(`${live.handle}: corrigido (${updates.length} variantes)`);
}

const correctionReport = {
  generatedAt: new Date().toISOString(),
  sourceAuditGeneratedAt: audit.generatedAt,
  mode: 'safe-apply',
  constraints: {
    minimumScore: 60,
    squareImagesOnly: true,
    maximumPosition: 10,
    whiteBackgroundRequired: true,
    matchingVisualFinishRequired: true,
    deletesMedia: false,
    uploadsMedia: false,
    reordersMedia: false,
  },
  summary: {
    auditedProducts: audit.summary.productsWithGoldAndSilver,
    updatedProducts: results.length,
    updatedVariants: results.reduce((sum, item) => sum + item.variantsUpdated, 0),
    deferredProducts: audit.summary.productsWithGoldAndSilver - audit.summary.alreadyCorrect - results.length,
    alreadyCorrect: audit.summary.alreadyCorrect,
  },
  products: results,
};

await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(correctionReport, null, 2)}\n`);
console.log(JSON.stringify(correctionReport.summary));
