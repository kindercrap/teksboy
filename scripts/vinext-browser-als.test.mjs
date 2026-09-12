import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import fix from '../local/vinext-browser-als.mjs';
const id = '/node_modules/vinext/dist/shims/internal/als-registry.js';
const source=fs.readFileSync(new URL('../node_modules/vinext/dist/shims/internal/als-registry.js',import.meta.url),'utf8');
function execute(code){
 const context=vm.createContext({AsyncLocalStorage:class {getStore(){} exit(fn){return fn();}}, Symbol, Set});
 vm.runInContext(code.replace(/^import .*;$/m,'').replace(/^export .*;$/m,'')+'\n globalThis.testApi={registerAlsForScopeExit,runOutsideRequestScopes};',context);
 for(let i=0;i<20000;i++)context.testApi.registerAlsForScopeExit({exit:fn=>fn()});
 return context.testApi.runOutsideRequestScopes;
}
test('browser scope exit avoids deep recursion and invokes callback exactly once',()=>{
 assert.throws(()=>execute(source)(()=>42),/call stack/);
 const patched=fix().transform.call({environment:{name:'client'}},source,id);
 let calls=0;assert.equal(execute(patched.code)(()=>{calls++;return 42;}),42);assert.equal(calls,1);
 const failure=new Error('callback failure');assert.throws(()=>execute(patched.code)(()=>{throw failure;}),e=>e===failure);
});
test('server request isolation and unrelated modules are untouched',()=>{
 for(const name of ['rsc','ssr'])assert.equal(fix().transform.call({environment:{name}},source,id),null);
 assert.equal(fix().transform.call({environment:{name:'client'}},source,'/app/page.tsx'),null);
});
