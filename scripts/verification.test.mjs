import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../local/cms-plugin.mjs';
import {socialService} from '../local/social.mjs';
import {verificationService} from '../local/verification.mjs';
test('verification evidence, permissions, decisions, notifications and stale requests', async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-verification-'));
 fs.mkdirSync(path.join(root,'lib'));for(const f of ['categories','catalog'])fs.writeFileSync(path.join(root,'lib',f+'.json'),'[]');
 const store=openStore(root), social=socialService(store), service=verificationService(store,root,social.notify);
 const owner=store.get('users','local-demo'), reviewer=store.get('users','local-admin');
 store.put('users',{id:'contributor',name:'Contributor',role:'Admin',status:'active'});
 const upload={setId:'s',type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='};
 async function call(endpoint,data,user=owner,admin=user){let result,code,bytes;await service.handle({url:endpoint,method:data?'POST':'GET'}, {setHeader(){},end(b){bytes=b;}},endpoint.split('?')[0],data||{},user,admin,(c,r)=>{code=c;result=r;});return {code,result,bytes};}
 try{
 store.put('collections',{id:'s',name:'Set',status:'published',cards:[{id:'a',image:'/a.png'}]});
 store.put('checklists',{id:owner.id+':s',user_id:owner.id,set_id:'s',owned:[],updated_at:'1'});
 await assert.rejects(()=>call('/__local/verification',upload),/Complete/);
 await assert.rejects(()=>call('/__local/verification',upload,null,null),/Sign in/);
 store.put('checklists',{...store.get('checklists',owner.id+':s'),owned:['a']});
 await call('/__local/verification',upload);assert.ok(store.list('notifications').some(n=>n.user_id==='local-admin'&&n.type==='verification'));assert.ok(store.list('notifications').some(n=>n.user_id==='contributor'&&n.type==='verification'));let row=store.list('verification-requests')[0];
 await assert.rejects(()=>call('/__local/verification',upload),/pending/);
 assert.equal((await call('/__local/verification-image/'+row.id,null,null,null)).code,403);
 assert.ok((await call('/__local/verification-image/'+row.id)).bytes.length);
 assert.ok((await call('/__local/verification-image/'+row.id,null,reviewer,reviewer)).bytes.length);
 await assert.rejects(()=>call('/__local/verification-review',{id:row.id,decision:'approved'}),/permission/);
 await assert.rejects(()=>call('/__local/verification-review',{id:row.id,decision:'rejected'},reviewer,reviewer),/reason/);
 await call('/__local/verification-review',{id:row.id,decision:'rejected',reason:'Please show all cards.'},reviewer,reviewer);
 assert.ok(store.list('notifications').some(n=>n.user_id===owner.id&&n.text.includes('rejected')));
 await call('/__local/verification',upload);row=store.list('verification-requests').find(r=>r.status==='pending');
 await call('/__local/verification-review',{id:row.id,decision:'approved'},reviewer,reviewer);
 assert.equal(store.get('checklists',owner.id+':s').verified,true);
 assert.ok(store.list('notifications').some(n=>n.text.includes('approved')));
 await assert.rejects(()=>call('/__local/verification-review',{id:row.id,decision:'approved'},reviewer,reviewer),/already/);
 store.put('checklists',{...store.get('checklists',owner.id+':s'),verified:false,updated_at:'2'});
 await call('/__local/verification',upload);row=store.list('verification-requests').find(r=>r.status==='pending');
 store.put('checklists',{...store.get('checklists',owner.id+':s'),updated_at:'3'});
 await assert.rejects(()=>call('/__local/verification-review',{id:row.id,decision:'approved'},reviewer,reviewer),/changed/);
 const queue=await call('/__local/verification-review',null,reviewer,reviewer);assert.equal(queue.result.requests.find(r=>r.id===row.id).status,'outdated');
 let publicResult;await social.handle({method:'GET',url:'/__local/social/set-collectors?set=s',headers:{}},{},'/__local/social/set-collectors',{},null,(_,r)=>publicResult=r);
 assert.equal(publicResult.collectors[0].id,owner.id);assert.ok(!JSON.stringify(publicResult).includes(owner.email));
 }finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});
