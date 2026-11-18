// Read-only checks for two local theme trees. Never connects to Shopify.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const roots=process.argv.slice(2).map(value=>path.resolve(value));
if(roots.length!==2)throw new Error('Usage: node scripts/check-paired-media-labels.mjs <official-tree> <chic-tree>');
const bases=['6f5fae433066e6d29b225483b35636197a85f8ab','2649e7b6df56a054602bb1d7cb008914dae75815'];
const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const original=(root,base,file)=>execFileSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8'});
const shared=['snippets/adula-customer-media-alt.liquid','AGENTS.md','tests/internal-media-labels/labels.test.cjs'];
for(const file of shared)assert.equal(read(roots[0],file),read(roots[1],file),file+' diverged');
for(const file of ['assets/theme.js','assets/adula-product-card-variants-v2.js']){
 const helper=root=>read(root,file).split('// End customer-facing media text helper.')[0];
 assert.equal(helper(roots[0]),helper(roots[1]),file+' helper diverged');
}
const preserved=[];
for(let i=0;i<roots.length;i++){
 const root=roots[i],base=bases[i];
 const files=execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(file=>/^(config|templates|locales|layout)\//.test(file));
 files.push('assets/theme.css','assets/adula-gift-tier-guard-v2.js','snippets/price-list.liquid','snippets/variant-picker.liquid','snippets/facets.liquid','snippets/active-facets.liquid');
 files.push(i===0?'snippets/adula-display-price.liquid':'snippets/adula-chic-friday-price.liquid');
 for(const file of files)assert.equal(read(root,file),original(root,base,file),file+' changed from its own base');
 const look=read(root,'sections/adula-shop-the-look.liquid').replace("{%- capture customer_look_alt -%}{%- render 'adula-customer-media-alt', text: look_product.featured_image.alt, fallback: look_product.title -%}{%- endcapture -%}",'').replace('image_tag: alt:customer_look_alt,','image_tag:');
 assert.equal(look,original(root,base,'sections/adula-shop-the-look.liquid'),'Shop the Look changed beyond image alt');
 preserved.push({version:i===0?'official':'chic',base,protected_files:files.length,shop_the_look_only_alt:true});
}
assert.match(read(roots[0],'layout/theme.liquid'),/window\.AdulaAutoGiftsEnabled = true;/);
assert.match(read(roots[1],'layout/theme.liquid'),/window\.AdulaAutoGiftsEnabled = false;/);
assert.ok(!read(roots[0],'snippets/product-gallery.liquid').includes('CHIC FRIDAY'));
assert.ok(read(roots[1],'snippets/product-gallery.liquid').includes('CHIC FRIDAY'));
console.log(JSON.stringify({passed:true,shared:shared.map(file=>({file,sha256:hash(read(roots[0],file))})),preserved,scope:'Local source invariants only; not remote settings or real storefront validation'},null,2));
