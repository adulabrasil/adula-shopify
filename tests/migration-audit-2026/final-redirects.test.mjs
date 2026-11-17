import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../../reports/redirect-final-2026-11-17/',import.meta.url),base='https://adula-brasil.myshopify.com';
const json=name=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
const parse=name=>{
 const data=fs.readFileSync(new URL(name,root));assert.deepEqual([...data.subarray(0,3)],[239,187,191]);assert.ok(!data.includes(13));
 const lines=data.toString('utf8').replace(/^\uFEFF/,'').trim().split('\n');assert.equal(lines.shift(),'Redirect from,Redirect to');
 return lines.map(line=>{const row=line.split(',');assert.equal(row.length,2);return row;});
};
const fresh=parse('01-novos-40.csv'),changes=parse('02-corrigir-existentes-10.csv'),extra=parse('03-adicionais-produtos-5.csv');
assert.equal(fresh.length,40);assert.equal(changes.length,10);assert.equal(extra.length,5);
assert.deepEqual(parse('00-consolidado-50.csv'),[...fresh,...changes]);
const ready=parse('00-consolidado-opcional-55.csv');assert.deepEqual(ready,[...fresh,...changes,...extra]);
const summary=json('resumo.json'),origins=json('http-origens-909.json'),evidence=json('http-destinos.json');
assert.equal(origins.length,909);assert.equal(summary.working_redirect_sources_preserved,674);
const preserved=new Set(origins.filter(r=>r.status===200&&r.hops.length).map(r=>r.path));assert.equal(preserved.size,674);
const sourceIndex=new Map(origins.map(r=>[r.path,r]));const candidates=new Set(ready.map(([s])=>s));assert.equal(candidates.size,55);
for(const [source,target]of ready) {
 assert.ok(source.startsWith('/')&&target.startsWith('/'));assert.notEqual(source,target);assert.ok(!target.includes('#'));assert.ok(!candidates.has(target));assert.ok(!preserved.has(source));
 assert.ok(!/^(\/apps(?:\/|$)|\/cart(?:\/|$)|\/orders(?:\/|$)|\/services(?:\/|$))/.test(source));
 const a=sourceIndex.get(source)||evidence.targets[base+source];assert.equal(a.status,404);
 const b=evidence.targets[base+target]||evidence.additional[target];assert.equal(b.status,200);assert.equal(b.hops.length,0);assert.equal(b.liquid_error,false);assert.ok(!b.robots.some(v=>v.toLowerCase().includes('noindex')));
 assert.equal(b.final||b.url,base+target);assert.ok(b.canonical.includes(base+target));
 assert.ok(!['/blog','/garantia','/sobre-a-adula'].includes(source));
}
for(const [source]of changes)assert.equal(sourceIndex.get(source).hops[0].status,301);
for(const [source]of [...fresh,...extra])assert.equal((sourceIndex.get(source)||evidence.targets[base+source]).hops.length,0);
assert.equal(origins.filter(r=>r.status===404&&r.hops.length&&!candidates.has(r.path)).length,6);
assert.deepEqual(summary.unmatched_outside_ready55,{conteudo_editorial:2,colecao_categoria_provavel:10,produto_provavel:166,institucional:2});
assert.equal(origins.filter(r=>r.status===404&&!candidates.has(r.path)).length,180);
const metadata=json('paginas-rascunho/metadados.json');assert.equal(metadata.length,2);
for(const page of metadata){
 assert.equal(page.published,false);assert.equal(page.visibility,'HIDDEN');assert.ok(page.meta_description.length<=160);assert.ok(page.seo_title.length<=70);
 const html=fs.readFileSync(new URL('paginas-rascunho/'+page.file,root),'utf8');assert.ok(html.includes('<h2>'));assert.ok(!/<h1\b|<script\b|<style\b|<iframe\b|\son\w+=|javascript:|{[%{]/i.test(html));assert.ok(!/CHIC FRIDAY/i.test(html));
 assert.equal(summary.dedicated_pages[page.intended_path],404);
}
assert.equal(summary.imports_executed,0);assert.equal(summary.admin_redirect_backup_obtained,false);assert.equal(summary.global_zero_404_claim,false);
const manifest=json('manifesto-arquivos.json');
for(const entry of manifest.files){
 const content=fs.readFileSync(new URL(entry.path,root));assert.equal(content.length,entry.bytes);assert.equal(createHash('sha256').update(content).digest('hex'),entry.sha256);
}
const zip=fs.readFileSync(new URL('adula-301-para-aprovacao.zip',root));const expected=fs.readFileSync(new URL('adula-301-para-aprovacao.zip.sha256',root),'utf8').split(' ')[0];assert.equal(createHash('sha256').update(zip).digest('hex'),expected);
console.log('PASS final redirect package: 55 valid destinations, 40+10+5 partition, no cycles, 674 preserved sources, 180 pending, hidden page drafts. Uses stored real HTTP evidence; no import/deploy.');
