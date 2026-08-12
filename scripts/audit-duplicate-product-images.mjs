import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

if (!shop || !clientId || !clientSecret) {
  throw new Error('SHOPIFY_SHOP, SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET são obrigatórios.');
}

const apiVersion = '2026-07';
const outputDir = process.env.OUTPUT_DIR || 'duplicate-image-audit';
const applyDeletions = process.env.APPLY_DELETIONS === 'true';
const expectedSafeDuplicates = Number(process.env.EXPECTED_SAFE_DUPLICATES || 0);

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

const PRODUCTS_QUERY = `
  query DuplicateImageAudit($after: String) {
    products(first: 50, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        media(first: 100) {
          nodes {
            id
            mediaContentType
            alt
            ... on MediaImage { image { url width height } }
          }
        }
        variants(first: 250) {
          nodes {
            id
            title
            media(first: 20) { nodes { id } }
          }
        }
      }
    }
  }
`;

const DELETE_MEDIA_MUTATION = `
  mutation DeleteDuplicateProductMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message code }
    }
  }
`;

async function getProducts(token) {
  const products = [];
  let after = null;
  do {
    const data = await graphql(token, PRODUCTS_QUERY, { after });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    console.log(`Produtos lidos: ${products.length}`);
  } while (after);
  return products;
}

function thumbnailUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('width', '256');
  return parsed.toString();
}

async function fingerprint(media) {
  const response = await fetch(thumbnailUrl(media.image.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const normalized = await sharp(source)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(128, 128, { fit: 'contain', background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const gray = await sharp(normalized, { raw: { width: 128, height: 128, channels: 3 } })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  let dHash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (gray[y * 9 + x + 1] > gray[y * 9 + x]) dHash |= 1n << bit;
      bit += 1n;
    }
  }
  return {
    normalized,
    dHash,
    pixelHash: crypto.createHash('sha256').update(normalized).digest('hex'),
  };
}

function hamming(left, right) {
  let value = left ^ right;
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function pixelSimilarity(left, right) {
  let absoluteDifference = 0;
  let closePixels = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = Math.abs(left[index] - right[index]);
    absoluteDifference += difference;
    if (difference <= 5) closePixels += 1;
  }
  return {
    mae: absoluteDifference / left.length,
    closeRatio: closePixels / left.length,
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const token = await getAccessToken();
const products = await getProducts(token);
const report = [];
const failures = [];
let imageCount = 0;

for (const [productIndex, product] of products.entries()) {
  const images = product.media.nodes
    .filter((media) => media.mediaContentType === 'IMAGE' && media.image?.url)
    .map((media, index) => ({ ...media, position: index + 1 }));
  imageCount += images.length;
  if (images.length < 2) continue;

  const linkedMediaIds = new Set(
    product.variants.nodes.flatMap((variant) => variant.media.nodes.map((media) => media.id)),
  );
  const fingerprints = await mapLimit(images, 8, async (image) => {
    try {
      return await fingerprint(image);
    } catch (error) {
      failures.push({ product: product.handle, mediaId: image.id, url: image.image.url, error: error.message });
      return null;
    }
  });

  const parent = images.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const pairMetrics = new Map();

  for (let left = 0; left < images.length; left += 1) {
    if (!fingerprints[left]) continue;
    for (let right = left + 1; right < images.length; right += 1) {
      if (!fingerprints[right]) continue;
      const distance = hamming(fingerprints[left].dHash, fingerprints[right].dHash);
      if (distance > 4) continue;
      const similarity = pixelSimilarity(fingerprints[left].normalized, fingerprints[right].normalized);
      const exactNormalized = fingerprints[left].pixelHash === fingerprints[right].pixelHash;
      if (exactNormalized || (similarity.mae <= 2.25 && similarity.closeRatio >= 0.975)) {
        union(left, right);
        pairMetrics.set(`${left}:${right}`, { distance, ...similarity, exactNormalized });
      }
    }
  }

  const groups = new Map();
  images.forEach((_, index) => {
    if (!fingerprints[index]) return;
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    indexes.sort((left, right) => images[left].position - images[right].position);
    const keepIndex = indexes[0];
    const keep = images[keepIndex];
    for (const duplicateIndex of indexes.slice(1)) {
      const duplicate = images[duplicateIndex];
      const key = keepIndex < duplicateIndex ? `${keepIndex}:${duplicateIndex}` : `${duplicateIndex}:${keepIndex}`;
      const metrics = pairMetrics.get(key) || {};
      report.push({
        productId: product.id,
        productTitle: product.title,
        handle: product.handle,
        productUrl: `https://${shop}/products/${product.handle}`,
        keepMediaId: keep.id,
        keepPosition: keep.position,
        keepUrl: keep.image.url,
        duplicateMediaId: duplicate.id,
        duplicatePosition: duplicate.position,
        duplicateUrl: duplicate.image.url,
        duplicateLinkedToVariant: linkedMediaIds.has(duplicate.id),
        exactNormalizedPixels: Boolean(metrics.exactNormalized),
        dHashDistance: metrics.distance ?? null,
        meanAbsolutePixelDifference: metrics.mae == null ? null : Number(metrics.mae.toFixed(4)),
        closePixelRatio: metrics.closeRatio == null ? null : Number(metrics.closeRatio.toFixed(6)),
      });
    }
  }

  if ((productIndex + 1) % 50 === 0) console.log(`Produtos comparados: ${productIndex + 1}/${products.length}`);
}

await fs.mkdir(outputDir, { recursive: true });

const safeDuplicates = [...new Map(
  report
    .filter((item) => !item.duplicateLinkedToVariant)
    .map((item) => [item.duplicateMediaId, item]),
).values()];
const deletionResults = [];
const deletionErrors = [];

if (applyDeletions) {
  if (!expectedSafeDuplicates || safeDuplicates.length !== expectedSafeDuplicates) {
    throw new Error(
      `Trava de segurança: eram esperadas ${expectedSafeDuplicates} duplicatas seguras, ` +
      `mas a nova auditoria encontrou ${safeDuplicates.length}. Nenhuma imagem foi excluída.`,
    );
  }

  const byProduct = new Map();
  for (const item of safeDuplicates) {
    if (!byProduct.has(item.productId)) byProduct.set(item.productId, []);
    byProduct.get(item.productId).push(item);
  }

  let processedProducts = 0;
  for (const [productId, items] of byProduct) {
    for (let offset = 0; offset < items.length; offset += 50) {
      const batch = items.slice(offset, offset + 50);
      try {
        const data = await graphql(token, DELETE_MEDIA_MUTATION, {
          productId,
          mediaIds: batch.map((item) => item.duplicateMediaId),
        });
        const payload = data.productDeleteMedia;
        if (payload.mediaUserErrors.length) {
          deletionErrors.push({ productId, items: batch, errors: payload.mediaUserErrors });
        }
        const deleted = new Set(payload.deletedMediaIds || []);
        for (const item of batch) {
          if (deleted.has(item.duplicateMediaId)) deletionResults.push(item);
          else if (!payload.mediaUserErrors.length) {
            deletionErrors.push({ productId, item, errors: [{ message: 'A Shopify não confirmou a exclusão.' }] });
          }
        }
      } catch (error) {
        deletionErrors.push({ productId, items: batch, errors: [{ message: error.message }] });
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    processedProducts += 1;
    if (processedProducts % 25 === 0) {
      console.log(`Produtos limpos: ${processedProducts}/${byProduct.size}`);
    }
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  shop,
  productsScanned: products.length,
  imagesScanned: imageCount,
  productsWithDuplicates: new Set(report.map((item) => item.productId)).size,
  confirmedDuplicateImages: report.length,
  variantLinkedDuplicatesFlagged: report.filter((item) => item.duplicateLinkedToVariant).length,
  imageDownloadFailures: failures.length,
  safeDuplicateImagesApproved: safeDuplicates.length,
  deletedDuplicateImages: deletionResults.length,
  deletionErrorGroups: deletionErrors.length,
  destructiveChangesMade: deletionResults.length > 0,
};
await fs.writeFile(`${outputDir}/summary.json`, JSON.stringify(summary, null, 2));
await fs.writeFile(`${outputDir}/duplicates.json`, JSON.stringify(report, null, 2));
await fs.writeFile(`${outputDir}/failures.json`, JSON.stringify(failures, null, 2));
await fs.writeFile(`${outputDir}/deleted.json`, JSON.stringify(deletionResults, null, 2));
await fs.writeFile(`${outputDir}/deletion-errors.json`, JSON.stringify(deletionErrors, null, 2));

const headers = Object.keys(report[0] || {
  productTitle: '', handle: '', keepPosition: '', duplicatePosition: '', duplicateLinkedToVariant: '',
});
const csv = [headers.join(','), ...report.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
await fs.writeFile(`${outputDir}/duplicates.csv`, `${csv}\n`);

const githubSummary = process.env.GITHUB_STEP_SUMMARY;
if (githubSummary) {
  await fs.appendFile(githubSummary, [
    '# Auditoria de fotos duplicadas',
    '',
    `- Produtos analisados: **${summary.productsScanned}**`,
    `- Imagens analisadas: **${summary.imagesScanned}**`,
    `- Produtos com duplicatas confirmadas: **${summary.productsWithDuplicates}**`,
    `- Imagens duplicadas confirmadas: **${summary.confirmedDuplicateImages}**`,
    `- Duplicatas ligadas a variantes (não apagar automaticamente): **${summary.variantLinkedDuplicatesFlagged}**`,
    `- Falhas de download: **${summary.imageDownloadFailures}**`,
    '',
    applyDeletions
      ? `- Imagens duplicadas excluídas: **${summary.deletedDuplicateImages}**`
      : '**Nenhuma imagem foi excluída nesta execução.**',
    `- Grupos com erro de exclusão: **${summary.deletionErrorGroups}**`,
  ].join('\n'));
}

console.log(JSON.stringify(summary, null, 2));
if (deletionErrors.length) process.exitCode = 1;
