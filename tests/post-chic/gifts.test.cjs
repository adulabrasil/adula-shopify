const vm=require('node:vm'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(root+'/assets/adula-gift-tier-guard-v2.js','utf8').split('\n(() => {')[0];
const keychain=48066040496291,tray=47977612837027;
(async()=>{
 let passed=0;
 for(const test of [
   {subtotal:19899,existing:[],desired:null},
   {subtotal:19900,existing:[],desired:keychain},
   {subtotal:39899,existing:[keychain],desired:keychain},
   {subtotal:39900,existing:[keychain],desired:tray},
   {subtotal:19900,existing:[tray],desired:keychain},
   {subtotal:19899,existing:[keychain,tray],desired:null},
   {subtotal:39900,existing:[tray,tray],desired:tray},
 ]) {
   let items=[{id:1,variant_id:1,key:'goods',quantity:1,final_line_price:test.subtotal},...test.existing.map((id,i)=>({id,variant_id:id,key:'gift'+i,quantity:1,final_line_price:4900}))];
   const calls=[],timers=[],events=[];
   const cart=()=>({items:structuredClone(items)});
   const fetch=async(url,options={})=>{
     calls.push(url);
     let data;
     if(url.includes('/products/')) data={variants:[{id:url.includes('chaveiro')?keychain:tray,available:true}]};
     else if(url.endsWith('cart/add.js')){for(const i of JSON.parse(options.body).items)items.push({...i,variant_id:i.id,key:'newgift',final_line_price:4900});data=cart();}
     else if(url.endsWith('cart/update.js')){const updates=JSON.parse(options.body).updates;items=items.filter(i=>updates[i.key]!==0).map(i=>({...i,quantity:updates[i.key]??i.quantity}));data=cart();}
     else if(url.endsWith('cart.js')) data=cart();
     else throw Error('Unexpected '+url);
     return{ok:true,json:async()=>data};
   };
   const window={fetch,AdulaAutoGiftsEnabled:true,Shopify:{routes:{root:'/'}},setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){}};
   const document={readyState:'complete',addEventListener(){},dispatchEvent(e){events.push(e)}};
   vm.runInNewContext(source,{window,document,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}}});
   await timers[0]();
   assert.deepEqual(items.filter(i=>i.id!==1).map(i=>i.id),test.desired?[test.desired]:[],JSON.stringify(test));
   assert.equal(items[0].final_line_price,test.subtotal);assert.ok(calls.length>0);passed++;
 }
 // Both robust IIFEs are silent when paused; legacy guard cannot compete when enabled.
 const all=fs.readFileSync(root+'/assets/adula-gift-tier-guard-v2.js','utf8');
 vm.runInNewContext(all,{window:{AdulaAutoGiftsEnabled:false}});passed++;
 const legacy=fs.readFileSync(root+'/assets/adula-product-card-variants-v2.js','utf8').split('})();')[0]+'})();';
 for (const enabled of [true,false,undefined]) vm.runInNewContext(legacy,{window:{AdulaAutoGiftsEnabled:enabled}});passed++;
 assert.ok(fs.readFileSync(root+'/layout/theme.liquid','utf8').includes('window.AdulaAutoGiftsEnabled = true;'));passed++;
 console.log('PASS normal gifts thresholds, transitions, deduplication, pause and single owner:',passed);
 fs.writeFileSync(__dirname+'/.test-output/gift-results.json',JSON.stringify({passed,failed:0,scope:'VM mocked cart, no requests to Shopify'},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
