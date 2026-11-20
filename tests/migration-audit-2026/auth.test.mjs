import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {acquireLocalToken,safeDiagnostic,normalizeCredential,oauthFailure} from '../../scripts/shopify-readonly-auth.mjs';
import {diagnoseAuthorization} from '../../scripts/audit-sales-channel-publications.mjs';
const shop='adula-brasil.myshopify.com';
const env={SHOPIFY_CLIENT_ID:'MOCK-ID-ONLY',SHOPIFY_CLIENT_SECRET:'MOCK+SECRET&NOT=A%REAL!VALUE'};
const token='MOCK-NOT-A-REAL-TOKEN';let passed=0;
const noLeaks=value=>{const text=JSON.stringify(value);for(const secret of [...Object.values(env),token])assert.ok(!text.includes(secret));};
const reply=(status,body)=>({status,ok:status>=200&&status<300,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
const request=async(url,options)=>{
 assert.equal(url,`https://${shop}/admin/oauth/access_token`);assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');
 assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');
 const fields=new URLSearchParams(options.body);assert.equal(fields.get('grant_type'),'client_credentials');assert.equal(fields.get('client_id'),env.SHOPIFY_CLIENT_ID);assert.equal(fields.get('client_secret'),env.SHOPIFY_CLIENT_SECRET);assert.equal(fields.has('scope'),false);
 return reply(200,{access_token:token});
};
assert.equal((await acquireLocalToken({shop,env,request})).token,token);passed++;
assert.equal((await acquireLocalToken({shop,env:{SHOPIFY_CLIENT_ID:' \ufeff'+env.SHOPIFY_CLIENT_ID+'\r\n',SHOPIFY_CLIENT_SECRET:'\n'+env.SHOPIFY_CLIENT_SECRET+'\r\n'},request})).token,token);passed++;
for(const [code,category]of Object.entries({shop_not_permitted:'ORGANIZATION_OR_GRANT',app_not_installed:'APP_INSTALLATION',application_cannot_be_found:'CLIENT_IDENTIFICATION',invalid_client:'CLIENT_CREDENTIALS',invalid_request:'REQUEST_OR_CREDENTIALS',unsupported_grant_type:'GRANT_CONFIGURATION',unauthorized_client:'GRANT_CONFIGURATION',invalid_scope:'ACCESS_CONFIGURATION',access_denied:'ACCESS_CONFIGURATION'})) {
 const r=async()=>reply(400,{error:code,error_description:Object.values(env).join(' '),access_token:token});
 await assert.rejects(()=>acquireLocalToken({shop,env,request:r}),error=>{
  const diagnostic=safeDiagnostic(error);noLeaks(diagnostic);assert.equal(diagnostic.oauth_code,code);assert.equal(diagnostic.category,category);assert.equal(diagnostic.http_status,400);return true;
 });passed++;
}
const html=`<html><h1>400 - Oauth error shop_not_permitted</h1>${Object.values(env)} ${token}</html>`;
noLeaks(safeDiagnostic(oauthFailure(400,html)));assert.equal(safeDiagnostic(oauthFailure(400,html)).oauth_code,'shop_not_permitted');passed++;
assert.equal(safeDiagnostic(oauthFailure(400,JSON.stringify({errors:'Oauth error app_not_installed: other text'}))).oauth_code,'app_not_installed');passed++;
for(const body of [JSON.stringify({error:env.SHOPIFY_CLIENT_SECRET,access_token:token}),`<p>Unknown ${env.SHOPIFY_CLIENT_SECRET} ${token}</p>`]) {
 const diagnostic=safeDiagnostic(oauthFailure(400,body));assert.equal(diagnostic.oauth_code,null);noLeaks(diagnostic);
}passed++;
for(const raw of ['',"'MOCK-SECRET'",'MOCK SECRET','MOCK\u200bSECRET','MOCK\nSECRET','shpat_NOT-REAL']) {
 let called=false;
 await assert.rejects(()=>acquireLocalToken({shop,env:{...env,SHOPIFY_CLIENT_SECRET:raw},request:async()=>{called=true;}}),error=>{noLeaks(safeDiagnostic(error));return true;});
 assert.equal(called,false);
}passed++;
await assert.rejects(()=>acquireLocalToken({shop:'other.myshopify.com',env,request}),/restrito/);passed++;
await assert.rejects(()=>acquireLocalToken({shop,env,request:async()=>{throw Error(env.SHOPIFY_CLIENT_SECRET);}}),error=>{const d=safeDiagnostic(error);noLeaks(d);return d.code==='AUTH_NETWORK_FAILURE';});passed++;
await assert.rejects(()=>acquireLocalToken({shop,env,request:async()=>reply(302,env.SHOPIFY_CLIENT_SECRET)}),error=>{const d=safeDiagnostic(error);noLeaks(d);return d.code==='AUTH_REDIRECT_REFUSED';});passed++;
for(const body of [token,{other:token},{access_token:''}])await assert.rejects(()=>acquireLocalToken({shop,env,request:async()=>reply(200,body)}),error=>{noLeaks(safeDiagnostic(error));return true;});passed++;
assert.equal((await acquireLocalToken({shop,env:{SHOPIFY_ADMIN_ACCESS_TOKEN:token},request:async()=>{throw Error('Should not fetch');}})).method,'existing_token');passed++;
let calls=0;
const diagnostic=await diagnoseAuthorization({shop,env,request:async(url,options)=>{
 calls++;
 if(url.endsWith('/oauth/access_token'))return request(url,options);
 const query=JSON.parse(options.body).query;let data;
 if(query.includes('query AuditIdentity'))data={shop:{name:'Adula',myshopifyDomain:shop},currentAppInstallation:{accessScopes:[{handle:'read_products'},{handle:'read_publications'}]}};
 else if(query.includes('query PublicationInventory'))data={publications:{nodes:[{id:'gid://shopify/Publication/1',name:'Loja virtual',catalog:null}],pageInfo:{hasNextPage:false}}};
 else throw Error('Diagnostic must not query catalog, variants or counts');
 return {ok:true,status:200,json:async()=>({data})};
}});
assert.equal(diagnostic.code,'AUTH_AND_READ_ACCESS_OK');assert.equal(calls,3);noLeaks(diagnostic);passed++;
noLeaks(safeDiagnostic(Error(env.SHOPIFY_CLIENT_SECRET)));passed++;
assert.equal(normalizeCredential(' \ufeffMOCK\r\n','client_id'),'MOCK');passed++;
for(const [scopes,expected]of [[['read_products'],'READ_SCOPES_MISSING'],[['read_products','read_publications','write_products'],'READ_SCOPES_EXCESS']]) {
 const scopeRequest=async()=>({ok:true,status:200,json:async()=>({data:{
   shop:{myshopifyDomain:shop},currentAppInstallation:{accessScopes:scopes.map(handle=>({handle}))}
 }})});
 await assert.rejects(()=>diagnoseAuthorization({shop,env:{SHOPIFY_ADMIN_ACCESS_TOKEN:token},request:scopeRequest}),error=>{
   const d=safeDiagnostic(error);noLeaks(d);return d.code===expected;
 });
}passed++;
await assert.rejects(()=>diagnoseAuthorization({shop,env:{SHOPIFY_ADMIN_ACCESS_TOKEN:token},request:async()=>({ok:true,status:200,json:async()=>{throw Error(token);}})}),error=>{noLeaks(safeDiagnostic(error));return safeDiagnostic(error).code==='ADMIN_RESPONSE_INVALID';});passed++;
await fs.mkdir(new URL('./.test-output/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('./.test-output/auth-results.json',import.meta.url),JSON.stringify({passed,failed:0,scope:'Mock OAuth/Admin only. No real credentials, requests or Windows runtime.'},null,2));
console.log('PASS',passed,'safe OAuth/diagnostic scenarios; no secret values logged.');
