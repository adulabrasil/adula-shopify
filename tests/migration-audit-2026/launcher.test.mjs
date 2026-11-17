import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'adula-launcher-test-'));
const bin=path.join(dir,'bin'),events=path.join(dir,'events'),output=path.join(dir,'results');
await fs.mkdir(bin);
const id='MOCK-ID-LOCAL',secret='MOCK-SECRET-LOCAL',token='MOCK-TOKEN-LOCAL';
const script=new URL('../../scripts/run-local-publication-audit.sh',import.meta.url).pathname;
await fs.writeFile(path.join(bin,'node'),`#!/usr/bin/env bash
set -eu
printf '%s|%s|%s|%s\\n' "\${2:-audit}" "\${OUTPUT_DIR:-unset}" "\${ALL_SALES_CHANNELS:-unset}" "\${SHOPIFY_SHOP:-unset}" >> "$AUDIT_TEST_EVENTS"
if [[ "\${2:-}" == '--diagnose-auth' ]]; then
 if [[ "\${AUDIT_TEST_FAILURE:-0}" == 1 ]]; then printf '{"code":"OAUTH_REJECTED","oauth_code":"shop_not_permitted"}\\n' >&2; exit 1; fi
 printf '{"code":"AUTH_AND_READ_ACCESS_OK"}\\n'
elif [[ "\${2:-}" == '--list-publications' ]]; then
 printf '{"publications":[{"id":"gid://shopify/Publication/1","name":"Loja virtual"}]}\\n'
else printf '{"products":3}\\n'
fi
`,{mode:0o700});
const testEnv={...process.env,PATH:bin+path.delimiter+process.env.PATH,OUTPUT_DIR:output,AUDIT_TEST_EVENTS:events};
let passed=0;
const run=(args,input,extra={})=>spawnSync('bash',[script,...args],{env:{...testEnv,...extra},input,encoding:'utf8'});
const noLeaks=r=>{for(const s of [id,secret,token])assert.ok(!(r.stdout+r.stderr).includes(s));};
try {
 let r=run(['--diagnose-auth'],id+'\n'+secret+'\n');assert.equal(r.status,0);noLeaks(r);assert.ok(r.stdout.includes('AUTH_AND_READ_ACCESS_OK'));
 assert.ok(!(await fs.stat(output).catch(()=>null)));passed++;
 r=run(['--diagnose-auth'],id+'\n'+secret+'\n',{AUDIT_TEST_FAILURE:'1'});assert.equal(r.status,1);noLeaks(r);assert.ok(r.stderr.includes('shop_not_permitted'));passed++;
 r=run(['--existing-token','--diagnose-auth'],token+'\n');assert.equal(r.status,0);noLeaks(r);passed++;
 await fs.writeFile(path.join(bin,'cygpath'),'#!/usr/bin/env bash\nprintf "C:/Audit Results\\n"\n',{mode:0o700});
 r=run([],id+'\n'+secret+'\ngid://shopify/Publication/1\n');assert.equal(r.status,0);noLeaks(r);
 const lines=(await fs.readFile(events,'utf8')).trim().split('\n');
 assert.ok(lines.at(-2).includes('--list-publications|C:/Audit Results|'));
 assert.ok(lines.at(-1).includes('audit|C:/Audit Results|1|adula-brasil.myshopify.com'));
 assert.ok((await fs.readFile(path.join(output,'publications.json'),'utf8')).includes('Loja virtual'));passed++;
 const before=lines.length;r=run(['--'+secret],'');assert.equal(r.status,2);noLeaks(r);assert.equal((await fs.readFile(events,'utf8')).trim().split('\n').length,before);passed++;
 r=run(['--help'],'');assert.equal(r.status,0);noLeaks(r);passed++;
 await fs.mkdir(new URL('./.test-output/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('./.test-output/launcher-results.json',import.meta.url),JSON.stringify({passed,failed:0,scope:'Bash integration with mock node/cygpath; not an actual Windows execution'},null,2));
 console.log('PASS',passed,'Bash launcher scenarios; diagnostic-only mode, failures, path adapter, no leaked input.');
} finally {await fs.rm(dir,{recursive:true,force:true});}
