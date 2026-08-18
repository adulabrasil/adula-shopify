import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const applyChanges = process.env.APPLY_CHANGES === 'true';
const expectedTargets = Number(process.env.EXPECTED_TARGETS || 0);
const outputDir = process.env.OUTPUT_DIR || 'white-primary-photo-report';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

const skippedHandles = new Set([
  'pulseira-lets-canutilho-com-bolinha',
  'pingente-patinha-pet-prata-925',
  'brinco-earline-aika-boho-chic-pedra-natural-granada-vermelha-dourado',
]);

const externalSourceOverrides = new Map([
  ['anel-cristal-dourado', 'https://cdn.dooca.store/149411/products/anel-cristal-dourado-cristal.jpg?v=1766157882'],
  ['anel-cristal-prata-925', 'https://cdn.dooca.store/149411/products/anel-cristal-prata-ametista.jpg?v=1766158166'],
  ['anel-folie', 'https://cdn.dooca.store/149411/products/s-8-3.jpg'],
  ['anel-isis', 'https://cdn.dooca.store/149411/products/anel-isis.jpg'],
  ['anel-lucia', 'https://cdn.dooca.store/149411/products/anel-lucia.jpg'],
  ['anel-lux', 'https://cdn.dooca.store/149411/products/anel-lux.jpg'],
  ['anel-zahara', 'https://cdn.dooca.store/149411/products/zahara-d.jpg'],
]);

const mediaPositionOverrides = new Map([
  ['bolinha-avulsa', 3],
  ['bracelete-lea', 8],
  ['brinco-earcuff-cristina', 8],
  ['brinco-longo-perle', 9],
  ['brinco-mini-estrela', 6],
]);

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
  query WhitePrimaryPhotos($after: String) {
    products(first: 50, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status
        media(first: 100) {
          nodes {
            id alt mediaContentType preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) { nodes { id media(first: 20) { nodes { id } } } }
      }
    }
  }
`;

const PRODUCT_QUERY = `
  query WhitePrimaryPhoto($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id handle title
        media(first: 100) {
          nodes {
            id alt mediaContentType preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) { nodes { id media(first: 20) { nodes { id } } } }
      }
    }
  }
`;

const STAGED_UPLOAD_MUTATION = `
  mutation StagePrimaryPhoto($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA_MUTATION = `
  mutation CreatePrimaryPhoto($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_VARIANTS_MUTATION = `
  mutation MovePrimaryVariantImages($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const REORDER_MEDIA_MUTATION = `
  mutation MovePrimaryPhoto($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message code }
    }
  }
`;

const DELETE_MEDIA_MUTATION = `
  mutation DeleteOldPrimaryPhotos($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message code }
    }
  }
`;

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar imagem (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function whiteBackgroundMetrics(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().resize(96, 96, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const border = 9;
  let sampled = 0;
  let nearWhite = 0;
  let brightnessTotal = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (x >= border && x < info.width - border && y >= border && y < info.height - border) continue;
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const brightness = (r + g + b) / 3;
      sampled += 1;
      brightnessTotal += brightness;
      if (brightness >= 238 && Math.max(r, g, b) - Math.min(r, g, b) <= 18) nearWhite += 1;
    }
  }
  const whiteRatio = nearWhite / sampled;
  const meanBorderBrightness = brightnessTotal / sampled;
  return { whiteRatio, meanBorderBrightness, isWhiteBackground: whiteRatio >= 0.82 && meanBorderBrightness >= 238 };
}

async function enhance(buffer) {
  const trimmed = await sharp(buffer)
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 })
    .toBuffer();
  const product = await sharp(trimmed)
    .resize(1050, 1050, { fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .linear(1.045, -4)
    .modulate({ brightness: 1.01, saturation: 1.055 })
    .sharpen({ sigma: 1.05, m1: 0.8, m2: 1.8 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  return sharp({ create: { width: 1254, height: 1254, channels: 3, background: '#ffffff' } })
    .composite([{ input: product, gravity: 'center' }])
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

function exactHandleQuery(handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) throw new Error(`Handle inválido: ${handle}`);
  return `handle:${handle}`;
}

function linkedVariantIds(product, mediaIds) {
  const set = new Set(mediaIds);
  return product.variants.nodes
    .filter((variant) => variant.media.nodes.some((media) => set.has(media.id)))
    .map((variant) => variant.id);
}

function linkedVariantRestores(product, mediaIds) {
  const set = new Set(mediaIds);
  return product.variants.nodes.flatMap((variant) => {
    const original = variant.media.nodes.find((media) => set.has(media.id));
    return original ? [{ id: variant.id, mediaId: original.id }] : [];
  });
}

async function findExactProduct(token, handle) {
  const data = await graphql(token, PRODUCT_QUERY, { query: exactHandleQuery(handle) });
  const exact = data.products.nodes.filter((product) => product.handle === handle);
  if (exact.length !== 1) throw new Error(`Esperado 1 produto com handle ${handle}; encontrados ${exact.length}.`);
  return exact[0];
}

async function waitFor(token, handle, description, predicate) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const product = await findExactProduct(token, handle);
    const result = predicate(product);
    if (result) return { product, result };
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Tempo esgotado aguardando ${description} em ${handle}.`);
}

async function stageImage(token, filename, buffer) {
  const data = await graphql(token, STAGED_UPLOAD_MUTATION, {
    input: [{ filename, mimeType: 'image/jpeg', httpMethod: 'POST', resource: 'PRODUCT_IMAGE' }],
  });
  const payload = data.stagedUploadsCreate;
  if (payload.userErrors.length || payload.stagedTargets.length !== 1) {
    throw new Error(`Falha ao preparar upload: ${JSON.stringify(payload)}`);
  }
  const target = payload.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), filename);
  const response = await fetch(target.url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Falha no upload temporário (${response.status}): ${await response.text()}`);
  return target.resourceUrl;
}

async function updateVariants(token, productId, variantIds, mediaId) {
  if (!variantIds.length) return;
  const data = await graphql(token, UPDATE_VARIANTS_MUTATION, {
    productId,
    variants: variantIds.map((id) => ({ id, mediaId })),
  });
  if (data.productVariantsBulkUpdate.userErrors.length) {
    throw new Error(`Falha ao preservar variantes: ${JSON.stringify(data.productVariantsBulkUpdate.userErrors)}`);
  }
}

async function restoreVariants(token, productId, variants) {
  if (!variants.length) return;
  const data = await graphql(token, UPDATE_VARIANTS_MUTATION, { productId, variants });
  if (data.productVariantsBulkUpdate.userErrors.length) {
    throw new Error(`Falha ao restaurar variantes: ${JSON.stringify(data.productVariantsBulkUpdate.userErrors)}`);
  }
}

async function deleteMedia(token, productId, mediaIds) {
  const data = await graphql(token, DELETE_MEDIA_MUTATION, { productId, mediaIds });
  const payload = data.productDeleteMedia;
  if (payload.mediaUserErrors.length || mediaIds.some((id) => !payload.deletedMediaIds.includes(id))) {
    throw new Error(`Falha ao excluir mídias antigas: ${JSON.stringify(payload)}`);
  }
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

const plan = [];
for (const product of products) {
  if (product.status !== 'ACTIVE' || skippedHandles.has(product.handle)) continue;
  const images = product.media.nodes.filter((media) => media.mediaContentType === 'IMAGE' && media.image?.url);
  const primary = images[0];
  if (!primary) continue;
  const primaryBuffer = await downloadImage(primary.image.url);
  const metrics = await whiteBackgroundMetrics(primaryBuffer);
  if (!metrics.isWhiteBackground) continue;
  const sourcePosition = mediaPositionOverrides.get(product.handle) || 1;
  const sourceMedia = images[sourcePosition - 1];
  const externalSource = externalSourceOverrides.get(product.handle);
  if (!externalSource && !sourceMedia) throw new Error(`Fonte alternativa ausente em ${product.handle}.`);
  const sourceUrl = externalSource || sourceMedia.image.url;
  const sourceBuffer = externalSource || sourcePosition !== 1 ? await downloadImage(sourceUrl) : primaryBuffer;
  const enhanced = await enhance(sourceBuffer);
  const deleteMediaIds = [primary.id];
  if (!externalSource && sourceMedia.id !== primary.id) deleteMediaIds.push(sourceMedia.id);
  plan.push({
    productId: product.id,
    handle: product.handle,
    title: product.title,
    oldPrimaryId: primary.id,
    oldPrimaryUrl: primary.image.url,
    oldMediaCount: product.media.nodes.length,
    sourceUrl,
    sourceMediaId: externalSource ? null : sourceMedia.id,
    externalSource: Boolean(externalSource),
    deleteMediaIds,
    variantIds: linkedVariantIds(product, deleteMediaIds),
    variantRestores: linkedVariantRestores(product, deleteMediaIds),
    enhancedSha256: crypto.createHash('sha256').update(enhanced).digest('hex'),
    enhancedBytes: enhanced.length,
    enhanced,
  });
}

if (plan.length !== expectedTargets) {
  throw new Error(`Trava de segurança: esperado ${expectedTargets} fotos; pré-validação encontrou ${plan.length}.`);
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: applyChanges ? 'apply' : 'dry-run',
  targetCount: plan.length,
  replacements: plan.map(({ enhanced, ...item }) => item),
};

if (!applyChanges) {
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pré-validação concluída para ${plan.length} fotos; nenhuma alteração aplicada.`);
  process.exit(0);
}

for (let index = 0; index < plan.length; index += 1) {
  const item = plan[index];
  let newMediaId = null;
  try {
    const current = await findExactProduct(token, item.handle);
    if (current.media.nodes[0]?.id !== item.oldPrimaryId || current.media.nodes.length !== item.oldMediaCount) {
      throw new Error('Catálogo mudou após a pré-validação; item ignorado.');
    }
    const resourceUrl = await stageImage(token, `${item.handle}-principal.jpg`, item.enhanced);
    const mediaIdsBefore = current.media.nodes.map((media) => media.id);
    const createData = await graphql(token, CREATE_MEDIA_MUTATION, {
      product: { id: item.productId },
      media: [{ mediaContentType: 'IMAGE', originalSource: resourceUrl, alt: item.title }],
    });
    if (createData.productUpdate.userErrors.length) {
      throw new Error(`Falha ao criar mídia: ${JSON.stringify(createData.productUpdate.userErrors)}`);
    }
    const discovered = await waitFor(token, item.handle, 'criação da foto', (product) => {
      const added = product.media.nodes.filter((media) => !mediaIdsBefore.includes(media.id));
      return added.length === 1 ? added[0] : null;
    });
    newMediaId = discovered.result.id;
    await waitFor(token, item.handle, 'processamento da foto', (product) => {
      const media = product.media.nodes.find((entry) => entry.id === newMediaId);
      if (media?.preview?.status === 'FAILED') throw new Error('Shopify marcou a nova mídia como FAILED.');
      return media?.preview?.status === 'READY' ? media : null;
    });
    await updateVariants(token, item.productId, item.variantIds, newMediaId);
    const reorderData = await graphql(token, REORDER_MEDIA_MUTATION, {
      id: item.productId,
      moves: [{ id: newMediaId, newPosition: '0' }],
    });
    if (reorderData.productReorderMedia.mediaUserErrors.length) {
      throw new Error(`Falha ao mover nova foto: ${JSON.stringify(reorderData.productReorderMedia.mediaUserErrors)}`);
    }
    await waitFor(token, item.handle, 'posição principal', (product) => product.media.nodes[0]?.id === newMediaId ? true : null);
    await deleteMedia(token, item.productId, item.deleteMediaIds);
    const expectedMediaCount = item.oldMediaCount + 1 - item.deleteMediaIds.length;
    const verified = await waitFor(token, item.handle, 'verificação final', (product) => {
      const newPrimary = product.media.nodes[0];
      const deletedGone = item.deleteMediaIds.every((id) => !product.media.nodes.some((media) => media.id === id));
      return newPrimary?.id === newMediaId && newPrimary.image?.width === 1254 && newPrimary.image?.height === 1254
        && product.media.nodes.length === expectedMediaCount && deletedGone ? newPrimary : null;
    });
    Object.assign(item, {
      status: 'replaced',
      newMediaId,
      verifiedUrl: verified.result.image.url,
      verifiedWidth: verified.result.image.width,
      verifiedHeight: verified.result.image.height,
      verifiedMediaCount: expectedMediaCount,
    });
  } catch (error) {
    if (newMediaId) {
      try {
        const latest = await findExactProduct(token, item.handle);
        const oldStillExists = latest.media.nodes.some((media) => media.id === item.oldPrimaryId);
        const newStillExists = latest.media.nodes.some((media) => media.id === newMediaId);
        if (oldStillExists && newStillExists) {
          await restoreVariants(token, item.productId, item.variantRestores);
          await deleteMedia(token, item.productId, [newMediaId]);
        }
      } catch (rollbackError) {
        item.rollbackError = rollbackError.message;
      }
    }
    item.status = 'failed';
    item.error = error.message;
  }
  delete item.enhanced;
  console.log(`[${index + 1}/${plan.length}] ${item.handle}: ${item.status}`);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify({
    ...report,
    replacements: plan.map(({ enhanced, ...entry }) => entry),
  }, null, 2)}\n`);
}

const failed = plan.filter((item) => item.status !== 'replaced');
console.log(`Finalizado: ${plan.length - failed.length} substituídas; ${failed.length} falharam.`);
if (failed.length) process.exitCode = 1;
