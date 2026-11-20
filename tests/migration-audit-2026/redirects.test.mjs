import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../reports/migration-readiness-2026-11-17/',import.meta.url);
const summary=JSON.parse(fs.readFileSync(new URL('redirect-summary.json',root)));
assert.equal(summary.reviewed,53);assert.equal(summary.ready,50);assert.equal(summary.new,40);assert.equal(summary.replace_existing,10);assert.equal(summary.decisions,3);assert.equal(summary.imported,0);
const parse=name=>{
 const lines=fs.readFileSync(new URL(name,root),'utf8').replace(/^\uFEFF/,'').trim().split('\n');
 assert.equal(lines.shift(),'Redirect from,Redirect to');return lines.map(line=>line.split(','));
};
const fresh=parse('301-40-novos-candidatos.csv'),updates=parse('301-10-substituicoes-candidatas.csv');
assert.equal(fresh.length,40);assert.equal(updates.length,10);
const rows=[...fresh,...updates],sources=new Set(rows.map(r=>r[0]));assert.equal(sources.size,50);
const evidence=JSON.parse(fs.readFileSync(new URL('http-evidence.json',root)));
for(const [source,target]of rows){
 assert.ok(source.startsWith('/')&&target.startsWith('/'));assert.notEqual(source,target);assert.ok(!sources.has(target));
 const check=evidence['https://adula-brasil.myshopify.com'+target];assert.equal(check.status,200);assert.equal(check.hops.length,0);assert.equal(check.liquid_error,false);assert.equal(check.fragment_ok,true);assert.ok(!check.robots.some(r=>r.toLowerCase().includes('noindex')));
}
console.log('PASS redirect artifact integrity: counts, unique paths, no graph cycles, stored HTTP evidence for 50 candidates. No live imports.');
