const {Liquid}=require('liquidjs');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../..'),root=path.join(__dirname,'.test-output/liquid-fixtures');fs.mkdirSync(root,{recursive:true});
for(const dir of ['snippets'])for(const f of fs.readdirSync(path.join(source,dir)).filter(f=>f.endsWith('.liquid'))){fs.writeFileSync(path.join(root,f),fs.readFileSync(path.join(source,dir,f),'utf8').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g,''))}
const e=new Liquid({root,extname:'.liquid',strictFilters:false});let now='2026-11-17T12:00:00-03:00';
e.registerFilter('date',(v,format)=>{let d=new Date(v==='now'?now:v);return format==='%s'?Math.floor(d.getTime()/1000):d.toISOString().slice(0,10)});
e.registerFilter('json',v=>JSON.stringify(v??null));e.registerFilter('money',v=>'R$ '+(Number(v)/100).toFixed(2).replace('.',','));e.registerFilter('money_with_currency',v=>'R$ '+(Number(v)/100).toFixed(2).replace('.',','));e.registerFilter('t',v=>v);e.registerFilter('image_url',v=>'//cdn.example/'+(v?.src||'image.jpg'));
const variant={id:123,title:'12 / Quartzo Rosa',price:6900,compare_at_price:null,available:true,sku:'TEST',barcode:'1234567890123',options:['12','Quartzo Rosa'],featured_image:{src:'rose.jpg'}};
const product={id:99,title:'Anel de teste',handle:'anel-de-teste',url:'/products/anel-de-teste',type:'Anéis',vendor:'Adüla',description:'<p>Descrição</p>',collections:[{id:514558328995}],tags:[],price:6900,compare_at_price:0,images:[{src:'rose.jpg'}],featured_image:{src:'rose.jpg'},options_with_values:[{name:'Tamanho'},{name:'Pedra'}],variants:[variant],selected_or_first_available_variant:variant,metafields:{}};
const base={product,variant,context:'card',settings:{show_discount:true,discount_mode:'percentage'},cart:{currency:{iso_code:'BRL'}},shop:{url:'https://loja.example',currency:'BRL',name:'Adüla'}};
(async()=>{
let count=0;
for(const test of [
 {name:'participante',price:5520},
 {name:'Santuário',tags:['Santuário de Paris'],price:6900},
 {name:'Santuario sem acento',tags:['santuario de paris'],price:6900},
 {name:'brinde por tag',tags:['brinde'],price:6900},
 {name:'bandeja',handle:'bandeja-de-joias-em-veludo',price:6900},
 {name:'chaveiro',handle:'chaveiro-de-torre-eiffel',price:6900},
 {name:'fora da coleção',collections:[],price:6900},
 {name:'promoção anterior preservada',prior:9900,price:6900},
 {name:'zero',catalog:0,price:0},
 {name:'antes da campanha',now:'2026-11-15T23:59:59-03:00',price:6900},
 {name:'início inclusivo',now:'2026-11-16T00:00:00-03:00',price:5520},
 {name:'fim inclusivo',now:'2026-11-30T23:59:59-03:00',price:5520},
 {name:'depois da campanha',now:'2026-12-01T00:00:00-03:00',price:6900}
]){
 now=test.now||'2026-11-17T12:00:00-03:00';const v={...variant,price:test.catalog??6900,compare_at_price:test.prior??null};const p={...product,tags:test.tags||[],collections:test.collections||product.collections,handle:test.handle||product.handle,variants:[v],selected_or_first_available_variant:v};const ctx={...base,product:p,variant:v};
 const price=Number(await e.renderFile('adula-chic-friday-price',ctx));assert.equal(price,test.price,test.name);
 const list=await e.renderFile('price-list',ctx);assert.ok(list.includes('R$ '+(test.price/100).toFixed(2).replace('.',',')),test.name+' same as tested price-list');
 const badge=await e.renderFile('product-badges',ctx);assert.equal(badge.includes('badge--chic-friday__text'),test.price<v.price,test.name+' badge');
 count++;console.log('PASS',test.name);
}
now='2026-11-17T12:00:00-03:00';
const json=JSON.parse(await e.renderFile('adula-chic-friday-structured-data',base));assert.equal(json.hasVariant[0].offers.price,55.2);assert.equal(json.hasVariant[0].offers.priceCurrency,'BRL');assert.equal(json.hasVariant[0].offers.priceValidUntil,'2026-11-30');assert.equal(json.hasVariant[0].additionalProperty[1].value,'Quartzo Rosa');count++;console.log('PASS JSON-LD válido e preço 55.20');
const mixed={...base,product:{...product,variants:[variant,{...variant,id:124,price:9900,compare_at_price:12000,available:false}]}};
const mixedSchema=JSON.parse(await e.renderFile('adula-chic-friday-structured-data',mixed));assert.equal(mixedSchema.hasVariant[0].offers.price,55.2);assert.equal(mixedSchema.hasVariant[1].offers.price,99);assert.equal(mixedSchema.hasVariant[1].offers.availability,'https://schema.org/OutOfStock');assert.equal(mixedSchema.hasVariant[1].offers.priceValidUntil,undefined);count++;console.log('PASS JSON-LD por variante: preço anterior e disponibilidade preservados');
e.registerFilter('structured_data',()=>JSON.stringify({'@type':'Product',offers:{price:69}}));
now='2026-12-01T00:00:00-03:00';const nativeSchema=await e.renderFile('microdata-schema',{...base,request:{page_type:'product'}});assert.ok(nativeSchema.includes('"price":69'));assert.ok(!nativeSchema.includes('priceValidUntil'));count++;console.log('PASS schema nativo retomado após campanha');now='2026-11-17T12:00:00-03:00';
const gift=await e.renderFile('product-giftback',base);assert.ok(gift.includes('R$ 5,52'));count++;console.log('PASS Giftback estimado 5.52');
const social=await e.renderFile('social-meta-tags',{...base,request:{page_type:'product'},seo_description:'Descrição',canonical_url:'https://loja.example/products/anel'});assert.ok(social.includes('content="55.2"'));count++;console.log('PASS Open Graph preço sem formatação local');
const gallery=fs.readFileSync(source+'/snippets/product-gallery.liquid','utf8');const start=gallery.indexOf('{%- capture gallery_display_price');const stop=gallery.indexOf('<div class="{% if mobile_controls',start);const promoGallery=await e.parseAndRender(gallery.slice(start,stop),base);assert.ok(promoGallery.includes('badge--chic-friday__text'));count++;console.log('PASS selo da galeria alinhado com card');
const section=fs.readFileSync(source+'/sections/adula-shop-the-look.liquid','utf8').split('{% schema %}')[0].replace(/{%-?\s*style\s*-?%}/g,'<style>').replace(/{%-?\s*endstyle\s*-?%}/g,'</style>');const ctx={...base,section:{id:'look',settings:{heading:'Look',enable_buy_look:true},blocks:[{id:'one',settings:{product}},{id:'two',settings:{product:{...product,id:100,variants:[{...variant,id:124},{...variant,id:125,price:7900}],selected_or_first_available_variant:variant}}}]},localization:{language:{iso_code:'pt-BR'}}};const rendered=await e.parseAndRender(section,ctx);assert.ok(rendered.includes('data-price="5520"'));assert.ok(rendered.includes('data-price="6320"'));assert.ok(rendered.includes('R$ 55,20'));fs.writeFileSync(path.join(__dirname,'.test-output/shop-look-rendered.html'),rendered);count++;console.log('PASS Shop the Look: preços por variante e total usam apresentação testada');
fs.writeFileSync(path.join(__dirname,'.test-output/liquid-test-results.json'),JSON.stringify({passed:count,failed:0,engine:'LiquidJS; custom Shopify filters mocked; not remote Shopify rendering'},null,2));console.log('TOTAL',count);
})().catch(err=>{console.error(err);process.exit(1)});
