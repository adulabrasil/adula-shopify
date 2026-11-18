import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../reports/revista-301-revalidacao/',import.meta.url),base='https://adula-brasil.myshopify.com';
const e=JSON.parse(fs.readFileSync(new URL('evidencia-publica.json',root),'utf8'));
const parse=name=>{
 const b=fs.readFileSync(new URL(name,root));assert.deepEqual([...b.subarray(0,3)],[239,187,191]);assert.ok(!b.includes(13));
 const lines=b.toString('utf8').replace(/^\uFEFF/,'').trim().split('\n');assert.equal(lines.shift(),'Redirect from,Redirect to');return lines.map(l=>l.split(','));
};
const delta=[['/blog','/blogs/revista-adula']];assert.deepEqual(parse('04-revista-1.csv'),delta);
assert.equal(parse('01-novos-atualizado-41.csv').length,41);assert.equal(parse('00-consolidado-atualizado-51.csv').length,51);
const full=parse('00-consolidado-opcional-atualizado-56.csv');assert.equal(full.length,56);assert.equal(new Set(full.map(r=>r[0])).size,56);
const sources=new Set(full.map(r=>r[0]));assert.equal(full.filter(r=>r[0]==='/blog').length,1);assert.ok(!sources.has('/garantia'));assert.ok(!sources.has('/sobre-a-adula'));
for(const [s,t]of full){assert.ok(!sources.has(t));assert.notEqual(s,t);assert.ok(!t.includes('#'));const check=e.checks[base+t];assert.equal(check.status,200);assert.equal(check.hops.length,0);assert.ok(!check.liquid_error);assert.ok(!check.robots.some(v=>v.toLowerCase().includes('noindex')));}
assert.equal(e.checks[base+'/blog'].status,404);assert.equal(e.checks[base+'/blog'].hops.length,0);
assert.equal(e.articles.length,17);assert.equal(e.articles_visible_in_index.length,17);assert.deepEqual(e.index_pages.map(v=>v.links),[10,7]);
for(const article of e.articles){assert.ok(e.articles_visible_in_index.includes(article.url));const c=e.checks[article.url];assert.equal(c.status,200);assert.equal(c.hops.length,0);assert.equal(c.h1.length,1);assert.deepEqual(c.canonical,[article.url]);assert.ok(c.article_body_length>200);assert.ok(!c.robots.some(v=>v.toLowerCase().includes('noindex')));}
for(const p of ['/pages/garantia','/pages/sobre-a-adula'])assert.equal(e.checks[base+p].status,404);
console.log('PASS Revista: 17 visible articles, 10+7 pagination, 200/canonical, single blog rule, 51/56 consolidated counts and institutional pages excluded. Stored live HTTP evidence, no imports.');
