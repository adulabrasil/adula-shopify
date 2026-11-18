const fs=require('fs'),path=require('path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {Liquid}=require('liquidjs'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../..'),output=path.join(__dirname,'.test-output'),base=process.env.ADULA_BASE_REF||'0472f65395eac2d3e1c47fb0f8844fd082d7f4ef';fs.mkdirSync(output,{recursive:true});
const original=file=>execFileSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8'});
const strip=s=>s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g,'').replace(/{%-?\s*form\s[^%]*%}/g,'<form data-fixture="true">').replace(/{%-?\s*endform\s*-?%}/g,'</form>');
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const mode of ['before','after']){
 fs.mkdirSync(path.join(output,mode),{recursive:true});
 for(const f of fs.readdirSync(root+'/snippets').filter(f=>f.endsWith('.liquid'))){
  if(mode==='before'&&f==='adula-customer-media-alt.liquid')continue;
  fs.writeFileSync(path.join(output,mode,f),strip(mode==='before'?original('snippets/'+f):fs.readFileSync(root+'/snippets/'+f,'utf8')));
 }
}
function engine(mode){
 const e=new Liquid({root:path.join(output,mode),extname:'.liquid',strictFilters:false});
 e.registerFilter('image_url',(v,...args)=>v?.src||v?.preview_image?.src||'/fixture.jpg');
 e.registerFilter('image_tag',(src,...args)=>{const a=Object.fromEntries(args.filter(Array.isArray));return '<img src="'+escape(src)+'" '+Object.entries(a).map(([k,v])=>k+'="'+escape(v)+'"').join(' ')+'>'});
 e.registerFilter('json',v=>JSON.stringify(v??null));e.registerFilter('t',v=>v);e.registerFilter('money',v=>String(v));e.registerFilter('money_with_currency',v=>String(v));return e;
}
const before=engine('before'),after=engine('after');
const helper=file=>fs.readFileSync(root+'/'+file,'utf8').split('// End customer-facing media text helper.')[0];
const native=fs.readFileSync(root+'/assets/theme.js','utf8'),custom=fs.readFileSync(root+'/assets/adula-product-card-variants-v2.js','utf8');
const nativeContext=vm.createContext({});vm.runInContext(helper('assets/theme.js')+';this.clean=adulaCustomerMediaAlt;',nativeContext);
const customContext=vm.createContext({});vm.runInContext(helper('assets/adula-product-card-variants-v2.js')+';this.clean=adulaCustomerMediaAlt;',customContext);
const cases=[['#cor_dourado','Produto'],['#cor_prata 925','Produto'],['#COR_prateado (banhado a ródio branco)','Produto'],['Foto do anel #pedra_rosa','Foto do anel'],['#pedras_cristal','Produto'],['#signos_virgem','Produto'],['#pingente de letra_a','Produto'],['#cores_vermelho','Produto'],['#cor de metal semijoias_prata 925','Produto'],['Detalhe #cor_prata#pedra_rosa','Detalhe'],['Foto #feito_no_brasil','Foto #feito_no_brasil'],['#look_do_dia','#look_do_dia'],['Peça #1','Peça #1'],['Cor #cor','Cor #cor'],['','Produto'],['Dourado (Banho Ouro 18k)','Dourado (Banho Ouro 18k)'],['Prateado (Banhado a Ródio Branco)','Prateado (Banhado a Ródio Branco)'],['Prata 925 (Prata 925 Legítima)','Prata 925 (Prata 925 Legítima)'],['Anel A & B <delicado> #cor_dourado','Anel A & B <delicado>']];
(async()=>{
 let passed=0;
 for(const [text,expected]of cases){assert.equal(await after.renderFile('adula-customer-media-alt',{text,fallback:'Produto'}),expected);assert.equal(nativeContext.clean(text,'Produto'),expected);assert.equal(customContext.clean(text,'Produto'),expected);passed++;}
 const actual=JSON.parse(fs.readFileSync(root+'/reports/internal-media-labels-2026-11-18/media-markers.json','utf8'));assert.equal(actual.length,960);
 for(const row of actual){const value=await after.renderFile('adula-customer-media-alt',{text:row.original,fallback:row.product_title});assert.equal(value,row.customer_display);assert.equal(nativeContext.clean(row.original,row.product_title),value);assert.equal(customContext.clean(row.original,row.product_title),value);assert.ok(!/#[^#]*_/.test(value));}
 console.log('PASS 960 real catalog alt values agree in Liquid/native JS/custom JS; no catalog calls.');
 const media={id:10,position:1,media_type:'image',alt:'#cor_dourado',src:'https://cdn.example/image-unchanged.jpg',width:600,height:600,preview_image:{width:600,height:600,src:'https://cdn.example/image-unchanged.jpg'}};
 const variant={id:100,title:'Dourado (Banho Ouro 18k)',price:6900,compare_at_price:0,available:true,featured_media:media,options:['Dourado (Banho Ouro 18k)'],sku:'KEEP-SKU'};
 const product={id:1,title:'Pulseira A & B',handle:'pulseira',url:'/products/pulseira',available:true,price:6900,compare_at_price:0,has_only_default_variant:false,media:[media,{...media,id:11,position:2,alt:'#cor_prata 925'}],featured_media:media,featured_image:media,variants:[variant,{...variant,id:101,title:'Prata 925 (Prata 925 Legítima)'}],selected_or_first_available_variant:variant,options:[],options_by_name:{cor:{selected_value:'Dourado'}},metafields:{custom:{badges:{value:[]}}},selling_plan_groups:[]};
 const ctx={product,variant,media,section:{id:'fixture',index:1,settings:{desktop_media_grid_gap:12,products_per_row_desktop:4}},settings:{show_discount:true,product_image_aspect_ratio:'natural',product_card_text_font:'heading'},show_secondary_image:true,show_quick_buy:false};
 const render=name=>after.renderFile(name,ctx);
 const results=[];
 results.push(await render('media'));results.push(await render('product-card'));results.push(await render('product-card-horizontal'));
 const galleryBefore=await before.renderFile('product-gallery',{...ctx,product_form_id:'product-form',desktop_layout:'carousel_thumbnails_bottom',mobile_controls:'thumbnails'});
 const galleryAfter=await after.renderFile('product-gallery',{...ctx,product_form_id:'product-form',desktop_layout:'carousel_thumbnails_bottom',mobile_controls:'thumbnails'});results.push(galleryAfter);
 const oldDom=new JSDOM(galleryBefore),newDom=new JSDOM(galleryAfter);
 const grouping=dom=>({filtered:dom.window.document.querySelector('product-gallery').getAttribute('filtered-indexes'),media:[...dom.window.document.querySelectorAll('[data-media-id]')].map(e=>[e.getAttribute('data-media-id'),e.getAttribute('data-media-type'),e.hasAttribute('hidden')])});
 assert.deepEqual(grouping(oldDom),grouping(newDom));oldDom.window.close();newDom.window.close();passed++;
 for(const result of results){const d=new JSDOM(result);const images=[...d.window.document.querySelectorAll('img')];assert.ok(images.length);for(const image of images){assert.ok(!image.alt.includes('#cor_'));assert.equal(image.getAttribute('src'),media.src, JSON.stringify({alt:image.alt,html:image.outerHTML.slice(0,600)}));assert.ok(image.alt.includes('Pulseira A & B'));}d.window.close();passed++;}
 // Each complete finish label must keep its own image group and the same filtering.
 const finishes=['Dourado (Banho Ouro 18k)','Prateado (Banhado a Ródio Branco)','Prata 925 (Prata 925 Legítima)'];
 for(let chosen=0;chosen<finishes.length;chosen++){
  const images=finishes.map((finish,i)=>({...media,id:20+i,position:i+1,alt:'#cor_'+finish.toLowerCase()}));
  const selected={...variant,title:finishes[chosen],featured_media:images[chosen]};
  const grouped={...product,media:images,options_by_name:{cor:{selected_value:finishes[chosen]}},selected_or_first_available_variant:selected};
  const context={...ctx,product:grouped,product_form_id:'form',desktop_layout:'carousel_thumbnails_bottom',mobile_controls:'thumbnails'};
  const oldView=new JSDOM(await before.renderFile('product-gallery',context));const view=new JSDOM(await after.renderFile('product-gallery',context));
  assert.deepEqual(grouping(oldView),grouping(view));
  const galleryMedia=[...view.window.document.querySelectorAll('.product-gallery__media[data-media-id]')];
  assert.equal(galleryMedia.length,3);assert.deepEqual(galleryMedia.filter(el=>!el.hasAttribute('hidden')).map(el=>el.getAttribute('data-media-id')),[String(20+chosen)]);
  for(const image of view.window.document.querySelectorAll('img'))assert.ok(!image.alt.includes('#cor_'));
  assert.equal(images[chosen].alt,'#cor_'+finishes[chosen].toLowerCase());oldView.window.close();view.window.close();passed++;
 }
 const badgeProduct={...product,metafields:{custom:{badges:{value:['#cor_dourado','NOVO','Edição #1']}}}};
 const badges=await after.renderFile('product-badges',{...ctx,product:badgeProduct,types:'custom'});assert.ok(!badges.includes('#cor_'));assert.ok(badges.includes('NOVO'));assert.ok(badges.includes('Edição #1'));passed++;
 // Native and custom JS update image alt without modifying selection metadata, URLs or prices.
 const frozen=Object.freeze({...media,preview_image:Object.freeze(media.preview_image)});
 const imageClass=class {constructor(w,h){this.width=w;this.height=h;}setAttribute(k,v){this[k]=v;}};
 const c=vm.createContext({Image:imageClass,URL});
 const generate=native.slice(native.indexOf('function generateSrcset('),native.indexOf('// js/common/utilities/media-query.js'));
 vm.runInContext(helper('assets/theme.js')+generate+';this.create=createMediaImg;',c);
 const img=c.create(frozen,[200,400],{alt:product.title});assert.equal(img.alt,product.title);assert.equal(frozen.alt,'#cor_dourado');assert.ok(img.src.endsWith(media.src));assert.equal(img.width,600);passed++;
 const customImage=custom.slice(custom.indexOf('const imageSource ='),custom.indexOf('const sameMedia ='));
 const cc=vm.createContext({});vm.runInContext(helper('assets/adula-product-card-variants-v2.js')+customImage+';this.update=updateImage;',cc);
 const fakeImage={};cc.update(fakeImage,frozen,product.title);assert.equal(fakeImage.alt,product.title);assert.equal(frozen.alt,'#cor_dourado');assert.ok(fakeImage.src.includes(media.src));assert.equal(fakeImage.width,600);passed++;
 const groupSource=s=>s.slice(s.indexOf('  assign filtered_indexes ='),s.indexOf('\n<product-gallery'));
 assert.equal(groupSource(original('snippets/product-gallery.liquid')),groupSource(fs.readFileSync(root+'/snippets/product-gallery.liquid','utf8')));passed++;
 const optionSource=s=>s.slice(0,s.indexOf('{%- case type -%}'));assert.equal(optionSource(original('snippets/option-value.liquid')),optionSource(fs.readFileSync(root+'/snippets/option-value.liquid','utf8')));passed++;
 for(const file of ['snippets/variant-picker.liquid','snippets/facets.liquid','snippets/active-facets.liquid','snippets/price-list.liquid'])assert.equal(fs.readFileSync(root+'/'+file,'utf8'),original(file));passed++;
 // The sticky bar changes only its alt presentation; all remaining PDP code is identical.
 const pdp=fs.readFileSync(root+'/sections/main-product.liquid','utf8');
 assert.equal(pdp.replace(/            \{%- capture customer_sticky_alt -%\}[\s\S]*?\{%- endcapture -%\}\n/,'').replace('image_tag: alt: customer_sticky_alt,','image_tag:'),original('sections/main-product.liquid'));passed++;
 const sticky=pdp.slice(pdp.indexOf('            {%- assign default_media ='),pdp.indexOf('          {%- endif -%}',pdp.indexOf('            {%- assign default_media =')));
 const stickyHtml=await after.parseAndRender(sticky,ctx);const stickyDom=new JSDOM(stickyHtml);assert.equal(stickyDom.window.document.querySelector('img').alt,product.title);stickyDom.window.close();passed++;
 const gift=s=>s.slice(s.indexOf('(function giftGuardTop()'),s.indexOf('})();',s.indexOf('(function giftGuardTop()'))+5);assert.equal(gift(custom),gift(original('assets/adula-product-card-variants-v2.js')));passed++;
 fs.writeFileSync(output+'/results.json',JSON.stringify({scenarios:passed,catalog_vectors:960,failed:0,scope:'LiquidJS Shopify filters mocked, JSDOM/VM only; no deploy/catalog writes'},null,2));
 console.log('PASS',passed,'scenarios, grouping/filter/variant/gift invariants and 960 real alt vectors.');
})().catch(error=>{console.error(error.message); console.error(error.stack?.slice(0,1500));process.exit(1)});
