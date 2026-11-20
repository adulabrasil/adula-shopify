import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {auditPublications,listPublications,readPublicCatalog} from '../../scripts/audit-sales-channel-publications.mjs';
const appChannels=Array.from({length:12},(_,i)=>({id:`gid://shopify/Publication/${i+1}`,name:i===0?'Loja virtual':`Channel ${i+1}`,catalog:i===1?null:{__typename:'AppCatalog'}}));
const all=[...appChannels,{id:'gid://shopify/Publication/99',name:'Market',catalog:{__typename:'MarketCatalog'}}];
const products=[1,2,3].map((id,i)=>({id:`gid://shopify/Product/${id}`,handle:`product-${id}`,title:`Product ${id}`,status:['ACTIVE','DRAFT','ARCHIVED'][i],onlineStoreUrl:null,updatedAt:'2026-11-17'}));
const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'adula-audit-test-'));
function mock({scopes=['read_products','read_publications'],count=3,missingBoolean=false,identity='test.myshopify.com',drift=false}={}) {
 let productPages=0;
 return async(url,options={})=>{
  assert.ok(url==='https://test.myshopify.com/admin/api/2026-10/graphql.json');
  assert.equal(options.method,'POST');
  const {query,variables}=JSON.parse(options.body);assert.ok(query.trimStart().startsWith('query '));assert.ok(!/\bmutation\b/.test(query));
  let data;
  if(query.includes('query AuditIdentity'))data={shop:{name:'Test',myshopifyDomain:identity},currentAppInstallation:{accessScopes:scopes.map(handle=>({handle}))}};
  else if(query.includes('query PublicationInventory')) data={publications:{nodes:variables.after?all.slice(10):all.slice(0,10),pageInfo:{hasNextPage:!variables.after,endCursor:'publicationcursor'}}};
  else if(query.includes('query AdminProductCount'))data={productsCount:{count,precision:'EXACT'}};
  else if(query.includes('query ProductVariantPages'))data={product:{id:products[0].id,updatedAt:products[0].updatedAt,variants:{nodes:[{id:'variant51',title:'Last variant',sku:'SKU-LAST'}],pageInfo:{hasNextPage:false,endCursor:null}}}};
  else if(query.includes('query ProductPublications')) {
   productPages++;
   assert.ok(!query.includes('query:')); // No ACTIVE-only/public-only filter.
   const selected=variables.after?products.slice(1):products.slice(0,1);
   const nodes=selected.map((original,i)=>{
    const p={...original};
    if(drift&&productPages>2)p.updatedAt='changed';
    if(query.includes('variants(first:50)'))p.variants={nodes:p.id===products[0].id?Array.from({length:50},(_,i)=>({id:`variant${i+1}`,title:`Variant ${i+1}`,sku:`SKU${i+1}`})):[{id:`variant${p.status}`,title:'Default',sku:p.status==='DRAFT'?'':'SKU1'}],pageInfo:{hasNextPage:p.id===products[0].id,endCursor:'variantcursor'}};
    for(const m of query.matchAll(/channel(\d+): publishedOnPublication\(publicationId:"([^"]+)"\)/g))
     if(!missingBoolean)p[`channel${m[1]}`]=p.status==='ACTIVE'?![appChannels[0].id,appChannels[11].id].includes(m[2]):p.status==='DRAFT';
    return p;
   });
   data={products:{nodes,pageInfo:{hasNextPage:!variables.after,endCursor:'productcursor'}}};
  } else throw Error('Unexpected query');
  return {ok:true,status:200,json:async()=>({data})};
 };
}
const options={shop:'test.myshopify.com',token:'MOCK-NOT-A-CREDENTIAL',onlineStorePublicationId:appChannels[0].id,allChannels:true,baselinePublic:[{id:1,title:'Baseline'}, {id:4,title:'Old public absent Admin'}],currentPublic:[{id:1}],outputDir};
let passed=0;
try {
 const r=await auditPublications({...options,request:mock()});
 assert.equal(r.product_count,3);assert.equal(r.variant_count,53);assert.equal(r.rows.length,36);assert.deepEqual(r.status_counts,{ACTIVE:1,DRAFT:1,ARCHIVED:1});passed++;
 assert.equal(r.active_missing_online_store.length,1);assert.equal(r.active_missing_other_channels.length,1);assert.equal(r.inactive_published.length,12);assert.equal(r.excluded_market_b2b_catalogs.length,1);passed++;
 assert.ok(r.rows[0].skus.includes('SKU-LAST'));assert.equal(r.missing_skus.length,1);assert.equal(r.duplicate_skus.length,1);passed++;
 assert.equal(r.public_comparison.admin_absent_from_baseline.length,2);assert.equal(r.public_comparison.baseline_absent_from_admin.length,1);passed++;
 const out=await fs.readFile(path.join(outputDir,'sales-channel-publications.json'),'utf8');assert.ok(!out.includes(options.token));assert.ok(out.includes('ARCHIVED'));passed++;
 const list=await listPublications({shop:options.shop,token:options.token,request:mock()});assert.equal(list.publications.length,12);assert.equal(list.excluded_market_b2b_catalogs.length,1);passed++;
 await assert.rejects(()=>auditPublications({...options,onlineStorePublicationId:'wrong',request:mock()}),/not returned/);passed++;
 for(const scopes of [['read_products'],['read_products','read_publications','write_products'],['read_products','read_publications','read_orders']])await assert.rejects(()=>auditPublications({...options,request:mock({scopes})}),/dedicated/);passed++;
 await assert.rejects(()=>auditPublications({...options,request:mock({identity:'other.myshopify.com'})}),/identity mismatch/);passed++;
 await assert.rejects(()=>auditPublications({...options,request:mock({count:4})}),/count\/coverage/);passed++;
 await assert.rejects(()=>auditPublications({...options,request:mock({missingBoolean:true})}),/Missing publication/);passed++;
 await assert.rejects(()=>auditPublications({...options,request:mock({drift:true})}),/changed between/);passed++;
 await assert.rejects(()=>auditPublications({...options,allChannels:false,request:mock()}),/expectation must be explicit/);passed++;
 await assert.rejects(()=>auditPublications({...options,request:async()=>({ok:true,status:200,json:async()=>({errors:[{message:options.token}]})})}),error=>!error.message.includes(options.token)&&/Admin read failed/.test(error.message));passed++;
 let page=0;
 const publicProducts=await readPublicCatalog(options.shop,async()=>({ok:true,status:200,json:async()=>({products:++page===1?Array.from({length:250},(_,i)=>({id:i})): [{id:250}]})}));
 assert.equal(publicProducts.length,251);assert.equal(page,2);passed++;
 console.log('PASS',passed,'read-only audit scenarios; all network calls mocked.');
 await fs.mkdir(new URL('./.test-output/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('./.test-output/results.json',import.meta.url),JSON.stringify({passed,failed:0,scope:'Mocks only: Admin status/SKU/channel pagination, least privilege, public baseline comparison. No real Admin audit.'},null,2));
} finally {await fs.rm(outputDir,{recursive:true,force:true});}
