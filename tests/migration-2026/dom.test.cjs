const path=require('path');
const {JSDOM}=require('jsdom');const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const captured=[];
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'.test-output/shop-look-rendered.html'),'utf8'),{runScripts:'dangerously',url:'https://fixture.invalid',beforeParse(w){w.Shopify={routes:{root:'/'}};w.fetch=async(u,o)=>{captured.push({u,body:JSON.parse(o.body)});return{ok:true}}}});
const d=dom.window.document;assert.ok(d.querySelector('[data-look-total]').textContent.includes('110,40'));
const select=d.querySelector('select[data-look-variant]');select.value='125';select.dispatchEvent(new dom.window.Event('change'));
assert.ok(d.querySelector('[data-look-total]').textContent.includes('118,40'));
const active=d.querySelector('[data-look-product="two"]');assert.ok(active.querySelector('[data-look-sale]').textContent.includes('63,20'));assert.equal(active.querySelector('[data-look-original]').hidden,false);
d.querySelector('[data-look-add]').click();await new Promise(r=>setTimeout(r,0));assert.deepEqual(captured[0].body.items,[{id:123,quantity:1},{id:125,quantity:1}]);dom.window.close();console.log('PASS Shop the Look: variante, soma e IDs enviados, sem chamadas reais à loja');
const file=fs.readFileSync(path.resolve(__dirname,'../../sections/footer.liquid'),'utf8');const script=file.slice(file.indexOf('/* App embeds can arrive'),file.indexOf('</script>',file.indexOf('/* App embeds can arrive')));
let moves=0;
const wishlist=new JSDOM('<div class="shopify-section--main-product"><div class="product-info__block-item" data-block-type="title"><h1 class="product-title">Produto</h1></div></div><script>'+script+'</script>',{runScripts:'dangerously',beforeParse(w){w.Maestrooo={moveProductPageButton(){moves++}}}});
await new Promise(r=>setTimeout(r,0));assert.equal(moves,0);
const wrap=wishlist.window.document.createElement('div');wrap.id='_block_wishlist_product_page_button_123';wrap.innerHTML='<ooo-wl-access-button></ooo-wl-access-button>';wishlist.window.document.querySelector('.shopify-section--main-product').append(wrap);
await new Promise(r=>setTimeout(r,0));assert.equal(moves,1);wrap.append(wishlist.window.document.createElement('span'));await new Promise(r=>setTimeout(r,0));assert.equal(moves,1);wishlist.window.close();console.log('PASS wishlist: não chama sem botão; move uma única vez após app inserir o elemento');
const vm=require('node:vm');const root=path.resolve(__dirname,'../..');
for(const flag of [undefined,false]) {
 let calls=0;const events=[];const original=()=>{calls++;throw Error('Paused gifts must not fetch')};
 const window={fetch:original,AdulaAutoGiftsEnabled:flag,Shopify:{routes:{root:'/'}},setTimeout(){calls++},clearTimeout(){}};
 const document={documentElement:{lang:'pt-BR'},readyState:'loading',addEventListener(n){events.push(n)},querySelectorAll(){return []}};
 const context=vm.createContext({window,document,fetch:original,console,Intl,Map,Set});
 for(const name of ['adula-product-card-variants-v2.js','adula-gift-tier-guard-v2.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),context);
 assert.equal(calls,0);assert.equal(window.fetch,original);assert.deepEqual(events,['change']);
}
assert.ok(fs.readFileSync(path.join(root,'layout/theme.liquid'),'utf8').includes('window.AdulaAutoGiftsEnabled = false;'));
console.log('PASS brindes pausados: sem requisições, temporizadores ou interceptação de fetch; listener dos cards preservado');
fs.writeFileSync(path.join(__dirname,'.test-output/dom-test-results.json'),JSON.stringify({passed:3,failed:0,engine:'JSDOM; fetch and wishlist app mocked; no live Shopify deployment'},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
