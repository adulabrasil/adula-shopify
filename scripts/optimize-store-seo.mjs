import fs from 'node:fs/promises';

const shop = process.env.SHOPIFY_SHOP?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const applyChanges = process.env.APPLY_CHANGES === 'true';
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
  if (!response.ok || body.errors) throw new Error(JSON.stringify(body.errors || body));
  return body.data;
}

const PRODUCTS_QUERY = `
  query SeoProducts($after: String) {
    products(first: 100, after: $after, query: "status:active", sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title productType seo { title description } }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query SeoCollections($after: String) {
    collections(first: 100, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title seo { title description } }
    }
  }
`;

const PRODUCT_UPDATE = `
  mutation SeoProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id handle seo { title description } }
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE = `
  mutation SeoCollectionUpdate($collection: CollectionUpdateInput!) {
    collectionUpdate(collection: $collection) {
      collection { id handle seo { title description } }
      userErrors { field message }
    }
  }
`;

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function truncateAtWord(text, max) {
  const clean = normalize(text);
  if (clean.length <= max) return clean;
  const shortened = clean.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[\s,;:–-]+$/, '');
  return shortened || clean.slice(0, max);
}

function truncateKeepingEnding(text, max) {
  const clean = normalize(text);
  if (clean.length <= max) return clean;
  const words = clean.split(' ');
  const ending = words.slice(-3).join(' ');
  const beginning = truncateAtWord(words.slice(0, -3).join(' '), max - ending.length - 3);
  return `${beginning} – ${ending}`;
}

function productSeoTitle(product) {
  const text = product.title.toLocaleLowerCase('pt-BR');
  const qualifier = [
    [/prata\s*925/, 'Prata 925'], [/dourad|ouro\s*18/, 'Dourado'], [/ródio|rodio|pratead/, 'Ródio'],
    [/verde/, 'Verde'], [/rox[ao]/, 'Roxo'], [/azul/, 'Azul'], [/rosa/, 'Rosa'],
    [/lavanda|lil[aá]s/, 'Lilás'], [/bege/, 'Bege'], [/marrom/, 'Marrom'], [/preto/, 'Preto'],
  ].find(([pattern]) => pattern.test(text))?.[1];
  const suffix = qualifier ? ` | ${qualifier} | Adüla` : ' | Adüla';
  return `${truncateKeepingEnding(product.title, 60 - suffix.length)}${suffix}`;
}

function productMaterial(product) {
  const text = `${product.title} ${product.productType}`.toLocaleLowerCase('pt-BR');
  if (/prata\s*925/.test(text)) return 'Joia em Prata 925 legítima';
  if (/ródio|rodio|pratead/.test(text)) return 'Semijoia com banho de ródio branco';
  if (/dourad|ouro\s*18/.test(text)) return 'Semijoia com banho de ouro 18K';
  if (/vale.?presente/.test(text)) return 'Presenteie com liberdade de escolha';
  if (/bandeja|porta.?joia|estojo/.test(text)) return 'Acessório para organizar e cuidar das suas joias';
  return 'Peça Adüla com design francês';
}

function productSeoDescription(product) {
  const description = `Compre ${product.title} na Adüla Brasil. ${productMaterial(product)}. Primeira troca grátis e 10% de Giftback.`;
  return truncateAtWord(description, 155);
}

const coreCollectionCopy = {
  aneis: ['Anéis femininos: ouro 18K, ródio e Prata 925 | Adüla', 'Encontre anéis femininos com design francês, em Prata 925 legítima e semijoias banhadas a ouro 18K ou ródio branco. Primeira troca grátis.'],
  brincos: ['Brincos femininos: ouro 18K, ródio e Prata 925 | Adüla', 'Descubra brincos femininos Adüla com design francês, em Prata 925 legítima e semijoias banhadas a ouro 18K ou ródio branco.'],
  colares: ['Colares femininos: ouro 18K, ródio e Prata 925 | Adüla', 'Explore colares femininos Adüla com design francês, em Prata 925 legítima e semijoias banhadas a ouro 18K ou ródio branco.'],
  pulseiras: ['Pulseiras femininas em ouro 18K, ródio e Prata 925 | Adüla', 'Conheça pulseiras femininas Adüla com design francês, em Prata 925 legítima e semijoias banhadas a ouro 18K ou ródio branco.'],
  piercings: ['Piercings femininos delicados | Adüla Brasil', 'Encontre piercings femininos delicados e modernos, com design francês e acabamentos selecionados. Compre online na Adüla Brasil.'],
  'prata-925': ['Joias em Prata 925 legítima | Adüla Brasil', 'Descubra joias em Prata 925 legítima: anéis, brincos, colares e pulseiras com design francês, criados para acompanhar todos os momentos.'],
};

async function paginate(token, query, field) {
  const nodes = [];
  let after = null;
  do {
    const data = await graphql(token, query, { after });
    nodes.push(...data[field].nodes);
    after = data[field].pageInfo.hasNextPage ? data[field].pageInfo.endCursor : null;
  } while (after);
  return nodes;
}

async function updateProduct(token, product, seo) {
  const data = await graphql(token, PRODUCT_UPDATE, { product: { id: product.id, seo } });
  const errors = data.productUpdate.userErrors;
  if (errors.length) throw new Error(`${product.handle}: ${JSON.stringify(errors)}`);
}

async function updateCollection(token, collection, seo) {
  const data = await graphql(token, COLLECTION_UPDATE, { collection: { id: collection.id, seo } });
  const errors = data.collectionUpdate.userErrors;
  if (errors.length) throw new Error(`${collection.handle}: ${JSON.stringify(errors)}`);
}

const token = await getAccessToken();
const products = await paginate(token, PRODUCTS_QUERY, 'products');
const collections = await paginate(token, COLLECTIONS_QUERY, 'collections');
const report = { mode: applyChanges ? 'apply' : 'audit', products: [], collections: [], errors: [] };

for (const product of products) {
  const seo = { title: productSeoTitle(product), description: productSeoDescription(product) };
  report.products.push({ handle: product.handle, before: product.seo, after: seo });
  if (!applyChanges) continue;
  try {
    await updateProduct(token, product, seo);
  } catch (error) {
    report.errors.push({ type: 'product', handle: product.handle, message: error.message });
  }
}

for (const collection of collections) {
  const copy = coreCollectionCopy[collection.handle];
  if (!copy) continue;
  const seo = { title: copy[0], description: copy[1] };
  report.collections.push({ handle: collection.handle, before: collection.seo, after: seo });
  if (!applyChanges) continue;
  try {
    await updateCollection(token, collection, seo);
  } catch (error) {
    report.errors.push({ type: 'collection', handle: collection.handle, message: error.message });
  }
}

await fs.mkdir('seo-report', { recursive: true });
await fs.writeFile('seo-report/seo-update.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Produtos processados: ${report.products.length}`);
console.log(`Coleções principais processadas: ${report.collections.length}`);
console.log(`Erros: ${report.errors.length}`);
if (report.errors.length) process.exitCode = 1;
