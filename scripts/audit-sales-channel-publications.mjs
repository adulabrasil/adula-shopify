// Read-only Shopify Admin audit. Credentials stay in memory; no Shopify mutations.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { acquireLocalToken, SafeAuditError, safeDiagnostic } from './shopify-readonly-auth.mjs';
const REQUIRED_SCOPES = ['read_products', 'read_publications'];

async function context({shop, token, request = fetch}) {
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop || '') || !token) throw new Error('Set SHOPIFY_SHOP and a read-only token in the local environment.');
  const graphql = async (query, variables = {}) => {
    if (!query.trimStart().startsWith('query ')) throw new Error('Only named queries are allowed.');
    const queryName=query.match(/^query\s+(\w+)/)?.[1];
    const stage=({AuditIdentity:'admin_identity',PublicationInventory:'admin_publications',ProductPublications:'admin_products',ProductVariantPages:'admin_variants',AdminProductCount:'admin_count'})[queryName] || 'admin';
    let response;
    try {response = await request(`https://${shop}/admin/api/2026-10/graphql.json`, {
      method:'POST', headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token}, body:JSON.stringify({query,variables}),
      redirect:'manual', signal:AbortSignal.timeout(30000),
    });}catch{throw new SafeAuditError('ADMIN_NETWORK_FAILURE',{stage,category:'NETWORK_OR_TLS',message:'Não foi possível receber resposta da Admin API; a exceção bruta não foi exibida.'});}
    let body;try{body=await response.json();}catch{throw new SafeAuditError('ADMIN_RESPONSE_INVALID',{stage,http_status:response.status,message:'A Admin API não retornou JSON válido; o corpo não foi exibido.'});}
    if (!response.ok || body.errors) throw new SafeAuditError('ADMIN_READ_FAILED',{stage,http_status:response.status,category:'ADMIN_ACCESS_OR_CONFIGURATION',
      message:'Admin read failed: a Shopify recusou a leitura. O corpo e os detalhes brutos não foram exibidos.',
      next_action:'Confira instalação e os dois escopos de leitura aprovados. Não acrescente permissões de escrita. Este erro ocorre depois da etapa de autenticação.'});
    const throttle = body.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < 150 && throttle.restoreRate > 0) {
      let remaining = Math.ceil((150-throttle.currentlyAvailable)/throttle.restoreRate)*1000;
      while (remaining > 0) {const delay=Math.min(remaining,30000);await new Promise(r=>setTimeout(r,delay));remaining-=delay;}
    }
    return body.data;
  };
  const identity = await graphql(`query AuditIdentity {
    shop { name myshopifyDomain }
    currentAppInstallation { accessScopes { handle } }
  }`);
  if (identity.shop?.myshopifyDomain !== shop) throw new SafeAuditError('ADMIN_SHOP_MISMATCH',{stage:'admin_identity',category:'STORE_CONFIGURATION',message:'Shop identity mismatch: a loja retornada não corresponde ao destino autorizado.'});
  const scopes = identity.currentAppInstallation?.accessScopes?.map(s=>s.handle) || [];
  if (REQUIRED_SCOPES.some(s=>!scopes.includes(s)))throw new SafeAuditError('READ_SCOPES_MISSING',{stage:'admin_scopes',category:'ACCESS_CONFIGURATION',
    message:'Use a dedicated installation: falta um dos dois escopos obrigatórios de leitura.',next_action:'Confira read_products e read_publications na versão ativa e na instalação; não amplie para escopos de escrita.'});
  if (scopes.some(s=>!REQUIRED_SCOPES.includes(s)))throw new SafeAuditError('READ_SCOPES_EXCESS',{stage:'admin_scopes',category:'ACCESS_CONFIGURATION',
    message:'Use a dedicated installation: a instalação concedeu acesso além dos dois escopos autorizados. A leitura foi interrompida.',next_action:'Use exclusivamente read_products e read_publications no app de auditoria. Não altere o app de fotos.'});
  const publications=[];let after=null;
  do {
    const data=await graphql(`query PublicationInventory($after:String) {
      publications(first:100, after:$after) { nodes { id name catalog { __typename } } pageInfo { hasNextPage endCursor } }
    }`,{after});
    publications.push(...data.publications.nodes);
    after=data.publications.pageInfo.hasNextPage?data.publications.pageInfo.endCursor:null;
  } while(after);
  const excludedCatalogs=publications.filter(p=>["MarketCatalog","CompanyLocationCatalog"].includes(p.catalog?.__typename));
  const salesPublications=publications.filter(p=>!excludedCatalogs.includes(p));
  if (new Set(publications.map(p=>p.id)).size!==publications.length || !salesPublications.length) throw new Error('No sales-channel publications or duplicate IDs returned.');
  return {graphql,publications:salesPublications,excludedCatalogs,identity:identity.shop,scopes};
}

export async function listPublications(options) {
  const c=await context(options);
  return {shop:c.identity,scopes:c.scopes,publications:c.publications,excluded_market_b2b_catalogs:c.excludedCatalogs,checked_at:new Date().toISOString()};
}

export async function readPublicCatalog(shop, request=fetch) {
  const products=[];
  for(let page=1;page<=10000;page++) {
    const response=await request(`https://${shop}/products.json?limit=250&page=${page}`);
    if(!response.ok)throw new Error(`Public catalog HTTP ${response.status}; comparison incomplete.`);
    const data=await response.json();if(!Array.isArray(data.products))throw new Error('Invalid public catalog response.');
    products.push(...data.products);
    if(data.products.length<250) {
      if(new Set(products.map(p=>String(p.id))).size!==products.length)throw new Error('Public catalog changed/duplicated during pagination.');
      return products;
    }
  }
  throw new Error('Public pagination safety limit exceeded.');
}

export async function auditPublications({shop,token,onlineStorePublicationId,outputDir,allChannels=false,baselinePublic=[],currentPublic,request=fetch}) {
  if(!onlineStorePublicationId || allChannels!==true)throw new Error('Confirm ONLINE_STORE_PUBLICATION_ID and ALL_SALES_CHANNELS=1; expectation must be explicit.');
  const {graphql,publications,excludedCatalogs,identity,scopes}=await context({shop,token,request});
  if(!publications.some(p=>p.id===onlineStorePublicationId))throw new Error('Confirmed Online Store publication ID was not returned; audit stopped.');
  const count=async()=>{
    const d=await graphql('query AdminProductCount { productsCount(limit:null) { count precision } }');
    if(d.productsCount?.precision!=='EXACT')throw new Error('Admin product count is not exact; cannot certify complete coverage.');
    return d.productsCount.count;
  };
  const beforeCount=await count(), catalog=new Map(), rows=[];
  for(let start=0;start<publications.length;start+=10) {
    const channels=publications.slice(start,start+10);let after=null;
    do {
      const fields=channels.map((p,i)=>`channel${i}: publishedOnPublication(publicationId:${JSON.stringify(p.id)})`).join('\n');
      const variantFields=start===0?'variants(first:50) { nodes { id title sku } pageInfo { hasNextPage endCursor } }':'';
      const data=await graphql(`query ProductPublications($after:String) {
        products(first:10,after:$after,sortKey:ID) {
          nodes { id handle title status onlineStoreUrl updatedAt ${fields} ${variantFields} }
          pageInfo { hasNextPage endCursor }
        }
      }`,{after});
      for(const p of data.products.nodes) {
        if(start===0) {
          if(catalog.has(p.id))throw new Error('Duplicate product during pagination.');
          const variants=[...p.variants.nodes];let cursor=p.variants.pageInfo.hasNextPage?p.variants.pageInfo.endCursor:null;
          while(cursor) {
            const d=await graphql(`query ProductVariantPages($id:ID!,$after:String) {
              product(id:$id) { id updatedAt variants(first:100,after:$after) { nodes { id title sku } pageInfo { hasNextPage endCursor } } }
            }`,{id:p.id,after:cursor});
            if(d.product?.id!==p.id || d.product.updatedAt!==p.updatedAt)throw new Error('Product changed during SKU pagination; rerun audit.');
            variants.push(...d.product.variants.nodes);cursor=d.product.variants.pageInfo.hasNextPage?d.product.variants.pageInfo.endCursor:null;
          }
          if(new Set(variants.map(v=>v.id)).size!==variants.length)throw new Error('Duplicate variant during SKU pagination.');
          catalog.set(p.id,{id:p.id,handle:p.handle,title:p.title,status:p.status,online_store_url:p.onlineStoreUrl,updated_at:p.updatedAt,variants,channels:[]});
        }
        const known=catalog.get(p.id);
        if(!known || known.updated_at!==p.updatedAt || known.status!==p.status)throw new Error('Catalog changed between channel batches; rerun audit.');
        for(const [i,publication] of channels.entries()) {
          const published=p[`channel${i}`];if(typeof published!=='boolean')throw new Error('Missing publication state.');
          const pending=p.status==='ACTIVE'&&!published?'ATIVO_NAO_PUBLICADO':p.status!=='ACTIVE'&&published?'REVISAR_STATUS_E_PUBLICACAO':'';
          const row={product_id:p.id,handle:p.handle,title:p.title,skus:known.variants.map(v=>v.sku||'[SEM SKU]').join(' | '),status:p.status,
            publication_id:publication.id,publication:publication.name,published,online_store:publication.id===onlineStorePublicationId,
            expected:p.status==='ACTIVE',pending,online_store_url:p.onlineStoreUrl,updated_at:p.updatedAt};
          rows.push(row);known.channels.push(row);
        }
      }
      after=data.products.pageInfo.hasNextPage?data.products.pageInfo.endCursor:null;
    } while(after);
  }
  const afterCount=await count();
  if(beforeCount!==afterCount || catalog.size!==afterCount)throw new Error('Admin count/coverage changed or is incomplete; rerun audit.');
  if([...catalog.values()].some(p=>p.channels.length!==publications.length || new Set(p.channels.map(c=>c.publication_id)).size!==publications.length))throw new Error('Incomplete product/channel coverage.');
  const publicNow=currentPublic??await readPublicCatalog(shop,request);
  const idOf=p=>String(p.id).split('/').pop();const publicIds=new Set(publicNow.map(idOf)),baselineIds=new Set(baselinePublic.map(idOf)),adminIds=new Set([...catalog.values()].map(idOf));
  const products=[...catalog.values()];const variants=products.flatMap(p=>p.variants.map(v=>({product_id:p.id,product:p.title,status:p.status,variant_id:v.id,variant:v.title,sku:v.sku??''})));
  const skuIndex=new Map();for(const v of variants)if(v.sku){const group=skuIndex.get(v.sku)||[];group.push(v);skuIndex.set(v.sku,group);}
  const result={checked_at:new Date().toISOString(),shop:identity,scopes,excluded_market_b2b_catalogs:excludedCatalogs,expectation:'All ACTIVE products expected in ALL sales-channel publications (user instruction); DRAFT/ARCHIVED are not publication targets.',
    product_count:catalog.size,variant_count:variants.length,status_counts:Object.fromEntries([...new Set(products.map(p=>p.status))].map(s=>[s,products.filter(p=>p.status===s).length])),publications,
    products,rows,variants,active_missing_online_store:rows.filter(r=>r.online_store&&r.pending==='ATIVO_NAO_PUBLICADO'),
    active_missing_other_channels:rows.filter(r=>!r.online_store&&r.pending==='ATIVO_NAO_PUBLICADO'),inactive_published:rows.filter(r=>r.pending==='REVISAR_STATUS_E_PUBLICACAO'),
    missing_skus:variants.filter(v=>!v.sku),duplicate_skus:[...skuIndex].filter(([,v])=>v.length>1).map(([sku,variants])=>({sku,variants})),
    public_comparison:{baseline_count:baselinePublic.length,current_public_count:publicNow.length,admin_count:catalog.size,
      admin_absent_from_baseline:products.filter(p=>!baselineIds.has(idOf(p))),baseline_absent_from_admin:baselinePublic.filter(p=>!adminIds.has(idOf(p))),
      public_absent_from_admin:publicNow.filter(p=>!adminIds.has(idOf(p))),
      active_published_online_absent_from_public:products.filter(p=>p.status==='ACTIVE'&&p.channels.some(c=>c.online_store&&c.published)&&!publicIds.has(idOf(p)))},
    limitations:['No Shopify mutations. API access is limited to publications visible to the installed app; reconcile with Admin sales-channel list.',
      'Publication booleans do not prove market eligibility, stock, scheduled publication date, external channel approval or checkout.',
      'A missing public product is not evidence of discontinuation. Bagy comparison requires a full authorized export.']};
  await fs.mkdir(outputDir,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(outputDir,'sales-channel-publications.json'),JSON.stringify(result,null,2),{mode:0o600});
  const cell=v=>{let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const csv=async(name,columns,data)=>fs.writeFile(path.join(outputDir,name),'\uFEFF'+[columns,...data.map(r=>columns.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\n')+'\n',{mode:0o600});
  const columns=['product_id','handle','title','skus','status','publication_id','publication','published','expected','pending','online_store','online_store_url','updated_at'];
  await csv('sales-channel-publications.csv',columns,rows);
  await csv('pending-products.csv',columns,rows.filter(r=>r.pending));
  await csv('product-variants-skus.csv',['product_id','product','status','variant_id','variant','sku'],variants);
  return result;
}

export async function diagnoseAuthorization({shop,env=process.env,request=fetch}) {
  const auth=await acquireLocalToken({shop,env,request});
  const result=await listPublications({shop,token:auth.token,request});
  return {diagnostic_version:1,stage:'complete',code:'AUTH_AND_READ_ACCESS_OK',category:'SUCCESS',
    shop,auth_method:auth.method,scopes:REQUIRED_SCOPES,sales_publications_visible:result.publications.length,
    message:'Autenticação, identidade da loja e os dois escopos de leitura conferidos. Nenhum produto foi auditado neste modo.',
    next_action:'Execute o roteiro sem --diagnose-auth para iniciar a auditoria completa.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const shop=process.env.SHOPIFY_SHOP||'adula-brasil.myshopify.com';
    if(shop!=='adula-brasil.myshopify.com')throw new Error('This local audit is restricted to adula-brasil.myshopify.com.');
    if(process.argv.includes('--diagnose-auth')) {
      console.log(JSON.stringify(await diagnoseAuthorization({shop}),null,2));
    } else {
    const {token}=await acquireLocalToken({shop}),outputDir=process.env.OUTPUT_DIR||path.join(os.homedir(),'adula-audit-results');
    if(process.argv.includes('--list-publications')) {
      const list=await listPublications({shop,token});console.log(JSON.stringify(list,null,2));
    } else {
      const baselinePath=path.resolve(path.dirname(process.argv[1]),'../reports/migration-readiness-2026-11-17/public-baseline-850.json');
      const baselinePublic=JSON.parse(await fs.readFile(baselinePath,'utf8'));
      const r=await auditPublications({shop,token,onlineStorePublicationId:process.env.ONLINE_STORE_PUBLICATION_ID,allChannels:process.env.ALL_SALES_CHANNELS==='1',baselinePublic,outputDir});
      console.log(JSON.stringify({outputDir,products:r.product_count,variants:r.variant_count,statuses:r.status_counts,public_now:r.public_comparison.current_public_count,missing_online:r.active_missing_online_store.length,missing_other_channels:r.active_missing_other_channels.length},null,2));
    }
    }
  } catch(error) {console.error(JSON.stringify(safeDiagnostic(error),null,2));process.exitCode=1;}
}
