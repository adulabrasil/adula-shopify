const {Liquid}=require('liquidjs');
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../..'),root=path.join(__dirname,'.test-output');
fs.mkdirSync(root,{recursive:true});
for(const f of fs.readdirSync(source+'/snippets').filter(f=>f.endsWith('.liquid')))
  fs.writeFileSync(path.join(root,f),fs.readFileSync(source+'/snippets/'+f,'utf8').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g,''));
const e=new Liquid({root,extname:'.liquid',strictFilters:false});
e.registerFilter('json',v=>JSON.stringify(v??null));
e.registerFilter('money',v=>'R$ '+(Number(v)/100).toFixed(2).replace('.',','));
e.registerFilter('money_with_currency',v=>'R$ '+(Number(v)/100).toFixed(2).replace('.',','));
e.registerFilter('t',(v,args)=>v+JSON.stringify(args||''));
e.registerFilter('image_url',()=>'/test.jpg');
e.registerFilter('structured_data',p=>JSON.stringify({'@type':'Product',offers:{price:p.selected_or_first_available_variant.price/100}}));
const v={id:123,title:'12 / Rosa',price:6900,compare_at_price:9900,available:true};
const p={id:1,title:'Anel',handle:'anel',price:6900,compare_at_price:9900,tags:['Chic Friday'],collections:[{id:514558328995}],variants:[v],selected_or_first_available_variant:v,metafields:{}};
const base={product:p,variant:v,context:'product',settings:{show_discount:true,discount_mode:'percentage'},request:{page_type:'product'},cart:{currency:{iso_code:'BRL'}},shop:{currency:'BRL',name:'Adüla',url:'https://fixture.invalid'}};
(async()=>{
  let passed=0;
  for(const [name,price,compare] of [['normal',6900,0],['catalog sale',6900,9900],['zero',0,0],['rounding',6901,0]]) {
    const variant={...v,price,compare_at_price:compare};
    const product={...p,price,compare_at_price:compare,variants:[variant],selected_or_first_available_variant:variant};
    const ctx={...base,product,variant};
    assert.equal(Number(await e.renderFile('adula-display-price',ctx)),price,name);
    const list=await e.renderFile('price-list',ctx);assert.ok(list.includes('R$ '+(price/100).toFixed(2).replace('.',',')));
    const badges=await e.renderFile('product-badges',ctx);assert.ok(!badges.includes('CHIC FRIDAY'));
    assert.equal(badges.includes('<on-sale-badge'),compare>price);
    passed++; console.log('PASS price/badge',name);
  }
  for(const now of ['2026-11-17T12:00:00-03:00','2026-11-30T23:59:59-03:00','2026-12-01T00:00:00-03:00']) {
    e.registerFilter('date',()=>new Date(now).getTime()/1000);
    assert.equal(Number(await e.renderFile('adula-display-price',base)),6900);passed++;
  }
  const gift=await e.renderFile('product-giftback',base);assert.ok(gift.includes('R$ 6,90'));assert.ok(gift.includes('ESTIMADO'));passed++;
  const social=await e.renderFile('social-meta-tags',base);assert.ok(social.includes('content="69"'));passed++;
  const schema=await e.renderFile('microdata-schema',base);assert.ok(schema.includes('"price":69'));assert.ok(!schema.includes('priceValidUntil'));passed++;
  // The complete gallery retains the native media/variant filtering implementation.
  const gallery=fs.readFileSync(source+'/snippets/product-gallery.liquid','utf8');
  assert.ok(gallery.includes('product-gallery-carousel-'));assert.ok(!/chic.friday/i.test(gallery));passed++;
  const raw=fs.readFileSync(source+'/sections/adula-shop-the-look.liquid','utf8').split('{% schema %}')[0].replace(/{%-?\s*style\s*-?%}/g,'<style>').replace(/{%-?\s*endstyle\s*-?%}/g,'</style>');
  const q={...p,id:2,variants:[{...v,id:124},{...v,id:125,price:7900}],selected_or_first_available_variant:{...v,id:124}};
  const rendered=await e.parseAndRender(raw,{...base,localization:{language:{iso_code:'pt-BR'}},section:{id:'look',settings:{heading:'Look',enable_buy_look:true},blocks:[{id:'one',settings:{product:p}},{id:'two',settings:{product:q}}]}});
  const captured=[];
  const dom=new JSDOM(rendered,{url:'https://fixture.invalid',runScripts:'dangerously',beforeParse(w){w.Shopify={routes:{root:'/'}};w.fetch=async(url,options)=>{captured.push(JSON.parse(options.body));return{ok:true}};}});
  const d=dom.window.document;assert.ok(d.querySelector('[data-look-total]').textContent.includes('138,00'));
  const select=d.querySelector('select[data-look-variant]');select.value='125';select.dispatchEvent(new dom.window.Event('change'));
  assert.ok(d.querySelector('[data-look-total]').textContent.includes('148,00'));
  assert.ok(d.querySelector('[data-look-product="two"] [data-look-sale]').textContent.includes('79,00'));
  d.querySelector('[data-look-add]').click();await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(captured[0].items,[{id:123,quantity:1},{id:125,quantity:1}]);dom.window.close();passed++;
  const file=fs.readFileSync(source+'/sections/footer.liquid','utf8');
  const script=file.slice(file.indexOf('/* App embeds can arrive'),file.indexOf('</script>',file.indexOf('/* App embeds can arrive')));
  let moves=0;
  const wishlist=new JSDOM('<div class="shopify-section--main-product"><div class="product-info__block-item" data-block-type="title"><h1 class="product-title">Produto</h1></div></div><script>'+script+'</script>',{runScripts:'dangerously',beforeParse(w){w.Maestrooo={moveProductPageButton(){moves++}}}});
  await new Promise(r=>setTimeout(r,0));assert.equal(moves,0);
  const wrap=wishlist.window.document.createElement('div');wrap.id='_block_wishlist_product_page_button_123';wrap.innerHTML='<ooo-wl-access-button></ooo-wl-access-button>';
  wishlist.window.document.querySelector('.shopify-section--main-product').append(wrap);
  await new Promise(r=>setTimeout(r,0));assert.equal(moves,1);wrap.append(wishlist.window.document.createElement('span'));await new Promise(r=>setTimeout(r,0));assert.equal(moves,1);wishlist.window.close();passed++;
  for(const dir of ['snippets','sections','layout'])for(const f of fs.readdirSync(source+'/'+dir).filter(f=>f.endsWith('.liquid')))
    assert.ok(!/chic[ -_]friday|514558328995|2026-11-30/i.test(fs.readFileSync(source+'/'+dir+'/'+f,'utf8')),dir+'/'+f);
  passed++;
  fs.writeFileSync(root+'/presentation-results.json',JSON.stringify({passed,failed:0,scope:'LiquidJS mocked Shopify filters and JSDOM; not Shopify remote rendering'},null,2));
  console.log('PASS presentation, native schema, Shop the Look, delayed wishlist, no campaign:',passed);
})().catch(error=>{console.error(error);process.exit(1)});
