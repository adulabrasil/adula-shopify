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
  query ProductPhotoReplacement($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id handle title
        media(first: 100) {
          nodes {
            id mediaContentType alt preview { status }
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) { nodes { id media(first: 20) { nodes { id } } } }
      }
    }
  }
`;

const CREATE_MEDIA_MUTATION = `
  mutation CreateReplacementMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
    productUpdate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const UPDATE_VARIANTS_MUTATION = `
  mutation MoveVariantImages($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const REORDER_MEDIA_MUTATION = `
  mutation MoveReplacementToPrimary($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message code }
    }
  }
`;

const DELETE_MEDIA_MUTATION = `
  mutation DeleteReplacedMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message code }
    }
  }
`;

function exactHandleQuery(handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) throw new Error(`Handle inválido no manifesto: ${handle}`);
  return `handle:${handle}`;
}

async function validateSource(replacement) {
  const local = await fs.readFile(replacement.repositoryPath);
  const localSha = crypto.createHash('sha256').update(local).digest('hex');
  if (localSha !== replacement.sha256) throw new Error(`SHA-256 divergente para ${replacement.repositoryPath}.`);
  const response = await fetch(replacement.sourceUrl);
  if (!response.ok) throw new Error(`Imagem nova indisponível (${response.status}): ${replacement.sourceUrl}`);
  if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error(`URL não retornou uma imagem: ${replacement.sourceUrl}`);
  const remoteSha = crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if (remoteSha !== replacement.sha256) throw new Error(`A imagem publicada no GitHub não corresponde ao manifesto: ${replacement.sourceUrl}`);
}

async function findExactProduct(token, handle) {
  const data = await graphql(token, PRODUCT_QUERY, { query: exactHandleQuery(handle) });
  const exact = data.products.nodes.filter((product) => product.handle === handle);
  if (exact.length !== 1) throw new Error(`Esperado 1 produto com o handle ${handle}; encontrados ${exact.length}.`);
  return exact[0];
}

function linkedVariantIds(product, mediaId) {
  return product.variants.nodes
    .filter((variant) => variant.media.nodes.some((media) => media.id === mediaId))
    .map((variant) => variant.id);
}

async function updateVariants(token, productId, variantIds, mediaId) {
  if (!variantIds.length) return;
  const data = await graphql(token, UPDATE_VARIANTS_MUTATION, {
    productId,
    variants: variantIds.map((id) => ({ id, mediaId })),
  });
  if (data.productVariantsBulkUpdate.userErrors.length) {
    throw new Error(`Falha ao preservar vínculos de variante: ${JSON.stringify(data.productVariantsBulkUpdate.userErrors)}`);
  }
}

async function deleteMedia(token, productId, mediaId) {
  const data = await graphql(token, DELETE_MEDIA_MUTATION, { productId, mediaIds: [mediaId] });
  const payload = data.productDeleteMedia;
  if (payload.mediaUserErrors.length || !payload.deletedMediaIds.includes(mediaId)) {
    throw new Error(`Falha ao excluir a mídia substituída: ${JSON.stringify(payload)}`);
  }
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

async function rollback(token, item, newMediaId) {
  try { await updateVariants(token, item.productId, item.variantIds, item.oldMediaId); }
  catch (error) { console.error(`Rollback de variantes incompleto em ${item.handle}: ${error.message}`); }
  try { await deleteMedia(token, item.productId, newMediaId); }
  catch (error) { console.error(`Rollback da nova mídia incompleto em ${item.handle}: ${error.message}`); }
}

await fs.mkdir(reportDir, { recursive: true });
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const replacements = manifest.replacements || [];
const handles = replacements.map((item) => item.handle);
if (!replacements.length || new Set(handles).size !== replacements.length) throw new Error('O manifesto deve conter handles únicos e ao menos uma substituição.');
if (applyChanges && expectedReplacements !== replacements.length) {
  throw new Error(`Trava de segurança: esperado ${expectedReplacements}, manifesto contém ${replacements.length}.`);
}

const token = await getAccessToken();
const preflight = [];

// Valida as três substituições antes de criar qualquer mídia.
for (const replacement of replacements) {
  await validateSource(replacement);
  const product = await findExactProduct(token, replacement.handle);
  const primary = product.media.nodes[0];
  if (!primary || primary.mediaContentType !== 'IMAGE' || !primary.image?.url) throw new Error(`A primeira mídia de ${replacement.handle} não é uma imagem válida.`);
  if (primary.preview?.status !== 'READY') throw new Error(`A foto principal de ${replacement.handle} não está pronta para substituição.`);
  preflight.push({
    handle: replacement.handle,
    sourceUrl: replacement.sourceUrl,
    productId: product.id,
    title: product.title,
    oldMediaId: primary.id,
    oldMediaUrl: primary.image.url,
    oldMediaAlt: primary.alt || product.title,
    mediaCount: product.media.nodes.length,
    mediaIds: product.media.nodes.map((media) => media.id),
    variantIds: linkedVariantIds(product, primary.id),
  });
}

const report = { generatedAt: new Date().toISOString(), mode: applyChanges ? 'apply' : 'dry-run', replacements: preflight };
if (!applyChanges) {
  await fs.writeFile(`${reportDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pré-validação concluída para ${preflight.length} foto(s); nenhuma alteração aplicada.`);
  process.exit(0);
}

for (const item of preflight) {
  const current = await findExactProduct(token, item.handle);
  if (current.media.nodes.length !== item.mediaCount || current.media.nodes[0]?.id !== item.oldMediaId) {
    throw new Error(`O catálogo mudou após a pré-validação de ${item.handle}; operação interrompida.`);
  }

  const createData = await graphql(token, CREATE_MEDIA_MUTATION, {
    product: { id: item.productId },
    media: [{ mediaContentType: 'IMAGE', originalSource: item.sourceUrl, alt: item.oldMediaAlt }],
  });
  if (createData.productUpdate.userErrors.length) {
    throw new Error(`Falha ao criar a mídia substituta de ${item.handle}: ${JSON.stringify(createData.productUpdate.userErrors)}`);
  }

  let newMediaId = null;
  try {
    const discovered = await waitFor(token, item.handle, 'a criação da mídia substituta', (product) => {
      const added = product.media.nodes.filter((media) => !item.mediaIds.includes(media.id));
      if (added.length > 1) throw new Error(`Mais de uma mídia nova apareceu em ${item.handle}; operação interrompida.`);
      return added[0] || null;
    });
    newMediaId = discovered.result.id;

    await waitFor(token, item.handle, 'o processamento da nova foto', (product) => {
      const media = product.media.nodes.find((entry) => entry.id === newMediaId);
      if (media?.preview?.status === 'FAILED') throw new Error(`Processamento da nova foto falhou em ${item.handle}.`);
      return media?.preview?.status === 'READY' ? media : null;
    });

    await updateVariants(token, item.productId, item.variantIds, newMediaId);
    const reorderData = await graphql(token, REORDER_MEDIA_MUTATION, {
      id: item.productId,
      moves: [{ id: newMediaId, newPosition: '0' }],
    });
    if (reorderData.productReorderMedia.mediaUserErrors.length) {
      throw new Error(`Falha ao posicionar a nova foto: ${JSON.stringify(reorderData.productReorderMedia.mediaUserErrors)}`);
    }
    await waitFor(token, item.handle, 'a nova foto assumir a posição principal', (product) => product.media.nodes[0]?.id === newMediaId ? true : null);

    await deleteMedia(token, item.productId, item.oldMediaId);
    const verified = await waitFor(token, item.handle, 'a verificação final sem duplicatas', (product) => {
      const oldGone = !product.media.nodes.some((media) => media.id === item.oldMediaId);
      const sameCount = product.media.nodes.length === item.mediaCount;
      const newIsPrimary = product.media.nodes[0]?.id === newMediaId;
      const variantsPreserved = item.variantIds.every((variantId) => {
        const variant = product.variants.nodes.find((entry) => entry.id === variantId);
        return variant?.media.nodes.some((media) => media.id === newMediaId);
      });
      return oldGone && sameCount && newIsPrimary && variantsPreserved ? product : null;
    });
    const primary = verified.result.media.nodes[0];
    item.newMediaId = newMediaId;
    item.verifiedUrl = primary.image.url;
    item.verifiedWidth = primary.image.width;
    item.verifiedHeight = primary.image.height;
    item.verifiedMediaCount = verified.result.media.nodes.length;
    item.status = 'replaced';
  } catch (error) {
    const latest = await findExactProduct(token, item.handle);
    const addedIds = latest.media.nodes
      .filter((media) => !item.mediaIds.includes(media.id))
      .map((media) => media.id);
    if (latest.media.nodes.some((media) => media.id === item.oldMediaId)) {
      for (const addedId of addedIds) await rollback(token, item, addedId);
    }
    throw error;
  }
}

report.completedAt = new Date().toISOString();
report.verified = true;
await fs.writeFile(`${reportDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${preflight.length} foto(s) substituída(s); quantidade preservada e mídias antigas removidas.`);
