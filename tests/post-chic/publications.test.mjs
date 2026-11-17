import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { auditPublications } from '../../scripts/audit-sales-channel-publications.mjs';
const publications=Array.from({length:12},(_,i)=>({id:`gid://shopify/Publication/${i+1}`,name:i===0?'Loja virtual':`Channel ${i+1}`}));
let calls=0;
const request=async(url,options)=>{
  assert.ok(url.endsWith('/admin/api/2026-10/graphql.json'));assert.equal(options.method,'POST');
  const {query,variables}=JSON.parse(options.body);assert.ok(query.trimStart().startsWith('query '));assert.ok(!query.includes('mutation'));
  calls++;
  if(query.includes('query PublicationInventory'))return{ok:true,status:200,json:async()=>({data:{publications:{nodes:variables.after?publications.slice(10):publications.slice(0,10),pageInfo:{hasNextPage:!variables.after,endCursor:'pubcursor'}}}})};
  const active=!variables.after;
  const product={id:active?'p1':'p2',handle:active?'active':'draft',title:'Test',status:active?'ACTIVE':'DRAFT',onlineStoreUrl:null,updatedAt:'2026-11-17'};
  for(const match of query.matchAll(/channel(\d+): publishedOnPublication\(publicationId: "([^"]+)"\)/g))
    product[`channel${match[1]}`]=match[2]===publications[0].id?!active:true;
  return{ok:true,status:200,json:async()=>({data:{products:{nodes:[product],pageInfo:{hasNextPage:active,endCursor:'productcursor'}}}})};
};
const outputDir=new URL('./.test-output/channels/',import.meta.url).pathname;
const result=await auditPublications({shop:'test.myshopify.com',token:'fake',onlineStorePublicationId:publications[0].id,outputDir,request});
assert.equal(result.product_count,2);assert.equal(result.rows.length,24);assert.equal(result.active_missing_online_store.length,1);assert.equal(result.inactive_published.length,12);assert.equal(calls,6);
await assert.rejects(()=>auditPublications({shop:'test.myshopify.com',token:'fake',onlineStorePublicationId:'wrong',outputDir,request}),/not returned/);
await assert.rejects(()=>auditPublications({shop:'test.myshopify.com',token:'fake',onlineStorePublicationId:publications[0].id,outputDir,request:async()=>({ok:true,status:200,json:async()=>({errors:[{message:'permission denied'}]})})}),/Admin read failed/);
await assert.rejects(()=>auditPublications({shop:'bad.invalid',token:'fake',onlineStorePublicationId:'any',outputDir,request}),/Provide/);
await fs.writeFile(new URL('./.test-output/publication-results.json',import.meta.url),JSON.stringify({passed:4,failed:0,scope:'Mock Admin GraphQL; pagination, 12 channels, 2 products, fail-closed permission checks'},null,2));
console.log('PASS read-only channel audit, pagination, exceptions:',4);
