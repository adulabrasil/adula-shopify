import fs from 'node:fs/promises';
import path from 'node:path';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const outputDir = process.env.OUTPUT_DIR || 'repair-two-white-primary-photos-report';
const apiVersion = '2026-07';

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

const targets = [
  {
    handle: 'brinco-signos-dos-zodiacos',
    title: 'Brinco Signos dos Zodíacos',
    productId: 'gid://shopify/Product/9187164913827',
    oldPrimaryId: 'gid://shopify/MediaImage/41330853314723',
  },
  {
    handle: 'pingente-love-yourself',
    title: 'Pingente Love Yourself',
    productId: 'gid://shopify/Product/9197116096675',
    oldPrimaryId: 'gid://shopify/MediaImage/41330719948963',
  },
];

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
  query RepairWhitePrimaryPhoto($query: String!) {
    products(first: 2, query: $query) {
      nodes {
        id handle title
        media(first: 250) {
          pageInfo { hasNextPage }
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

const UPDATE_VARIANTS_MUTATION = `
  mutation RepairPrimaryVariantImages($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const REORDER_MEDIA_MUTATION = `
  mutation RepairPrimaryPhotoPosition($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message code }
    }
  }
`;

const DELETE_MEDIA_MUTATION = `
  mutation RemoveOldPrimaryPhoto($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message code }
    }
  }
`;

function exactHandleQuery(handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) throw new Error(`Handle inválido: ${handle}`);
  return `handle:${handle}`;
}

async function findExactProduct(token, handle) {
  const data = await graphql(token, PRODUCT_QUERY, { query: exactHandleQuery(handle) });
  const exact = data.products.nodes.filter((product) => product.handle === handle);
  if (exact.length !== 1) throw new Error(`Esperado 1 produto com handle ${handle}; encontrados ${exact.length}.`);
  if (exact[0].media.pageInfo.hasNextPage) throw new Error(`Produto ${handle} possui mais de 250 mídias; reparo interrompido.`);
  return exact[0];
}

function imageMedia(product) {
  return product.media.nodes.filter((media) => media.mediaContentType === 'IMAGE' && media.image?.url);
}

function variantsLinkedTo(product, mediaId) {
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
  const errors = data.productVariantsBulkUpdate.userErrors;
  if (errors.length) throw new Error(`Falha ao preservar variantes: ${JSON.stringify(errors)}`);
}

async function reorderFirst(token, productId, mediaId) {
  const data = await graphql(token, REORDER_MEDIA_MUTATION, {
    id: productId,
    moves: [{ id: mediaId, newPosition: '0' }],
  });
  const errors = data.productReorderMedia.mediaUserErrors;
  if (errors.length) throw new Error(`Falha ao mover foto: ${JSON.stringify(errors)}`);
}

async function deleteMedia(token, productId, mediaId) {
  const data = await graphql(token, DELETE_MEDIA_MUTATION, { productId, mediaIds: [mediaId] });
  const payload = data.productDeleteMedia;
  if (payload.mediaUserErrors.length || !payload.deletedMediaIds.includes(mediaId)) {
    throw new Error(`Falha ao excluir mídia antiga: ${JSON.stringify(payload)}`);
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

await fs.mkdir(outputDir, { recursive: true });
const token = await getAccessToken();
const report = { generatedAt: new Date().toISOString(), mode: 'targeted-repair', targetCount: targets.length, repairs: [] };

for (const target of targets) {
  const item = { ...target };
  let candidateId = null;
  let originalVariantIds = [];
  let moved = false;
  let deleted = false;
  try {
    const product = await findExactProduct(token, target.handle);
    if (product.id !== target.productId) throw new Error('Identificador do produto mudou; reparo interrompido.');
    const images = imageMedia(product);
    const primary = images[0];
    const oldExists = images.some((media) => media.id === target.oldPrimaryId);

    if (primary?.id !== target.oldPrimaryId) {
      if (!oldExists && primary?.image?.width === 1254 && primary?.image?.height === 1254) {
        Object.assign(item, { status: 'already-repaired', newPrimaryId: primary.id, verifiedUrl: primary.image.url });
        report.repairs.push(item);
        continue;
      }
      throw new Error('Foto principal mudou desde o relatório; reparo interrompido.');
    }

    const candidate = images.at(-1);
    if (!candidate || candidate.id === target.oldPrimaryId || candidate.preview?.status !== 'READY'
      || candidate.alt !== target.title || candidate.image.width !== 1254 || candidate.image.height !== 1254) {
      throw new Error('A foto melhorada esperada não foi identificada com segurança no final da galeria.');
    }

    candidateId = candidate.id;
    originalVariantIds = variantsLinkedTo(product, target.oldPrimaryId);
    const originalMediaCount = product.media.nodes.length;
    Object.assign(item, { candidateId, originalMediaCount, originalVariantIds });

    await updateVariants(token, target.productId, originalVariantIds, candidateId);
    await reorderFirst(token, target.productId, candidateId);
    moved = true;
    await waitFor(token, target.handle, 'nova posição principal', (current) => imageMedia(current)[0]?.id === candidateId);
    await deleteMedia(token, target.productId, target.oldPrimaryId);
    deleted = true;

    const verified = await waitFor(token, target.handle, 'verificação final', (current) => {
      const currentImages = imageMedia(current);
      const currentPrimary = currentImages[0];
      const oldGone = !currentImages.some((media) => media.id === target.oldPrimaryId);
      const variantsPreserved = originalVariantIds.every((id) => {
        const variant = current.variants.nodes.find((entry) => entry.id === id);
        return variant?.media.nodes.some((media) => media.id === candidateId);
      });
      return currentPrimary?.id === candidateId && currentPrimary.image.width === 1254
        && currentPrimary.image.height === 1254 && current.media.nodes.length === originalMediaCount - 1
        && oldGone && variantsPreserved ? currentPrimary : null;
    });

    Object.assign(item, {
      status: 'repaired',
      newPrimaryId: candidateId,
      verifiedUrl: verified.result.image.url,
      verifiedWidth: verified.result.image.width,
      verifiedHeight: verified.result.image.height,
      verifiedMediaCount: originalMediaCount - 1,
    });
  } catch (error) {
    item.status = 'failed';
    item.error = error.message;
    if (candidateId && moved && !deleted) {
      try {
        await updateVariants(token, target.productId, originalVariantIds, target.oldPrimaryId);
        await reorderFirst(token, target.productId, target.oldPrimaryId);
        await waitFor(token, target.handle, 'restauração da foto principal', (current) => imageMedia(current)[0]?.id === target.oldPrimaryId);
        item.rollback = 'restored';
      } catch (rollbackError) {
        item.rollback = 'failed';
        item.rollbackError = rollbackError.message;
      }
    }
  }
  report.repairs.push(item);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${target.handle}: ${item.status}`);
}

await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const failed = report.repairs.filter((item) => item.status === 'failed');
console.log(`Finalizado: ${report.repairs.length - failed.length} corrigidos ou já corretos; ${failed.length} falharam.`);
if (failed.length) process.exitCode = 1;
