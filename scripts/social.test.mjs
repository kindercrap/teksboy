import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openStore} from '../local/cms-plugin.mjs';import {socialService} from '../local/social.mjs';
test('social privacy, sessions, moderation, references, visits and notifications',async()=>{
const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-social-'));fs.mkdirSync(path.join(root,'lib'));fs.writeFileSync(path.join(root,'lib/categories.json'),'[]');fs.writeFileSync(path.join(root,'lib/catalog.json'),'[]');const store=openStore(root),service=socialService(store);let cookie='';
async function call(op,data,admin=null){let result;await service.handle({method:data?'POST':'GET',url:'/__local/social/'+op,headers:{cookie,'user-agent':'test'}},{setHeader:(k,v)=>{if(k==='Set-Cookie')cookie=v.split(';')[0];}},'/__local/social/'+op.split('?')[0],data||{},admin,(_,r)=>result=r);return result;}
try{
store.put('users',{id:'owner',name:'Collector',email:'private@example.test',role:'Normal',status:'active',public_profile:false});store.put('collections',{id:'s',name:'Set',cards:[{id:'a',number:10,image:'/a.webp'},{id:'b',number:20,image:'/b.webp'}]});store.put('checklists',{id:'owner:s',user_id:'owner',set_id:'s',owned:['a'],public:true,notes:'SECRET',proof:'/private',verified:true});
assert.equal((await call('profile?user=owner')).user.id,'owner');store.put('users',{...store.get('users','owner'),public_profile:true});let p=await call('profile?user=owner&set=s');assert.ok(!JSON.stringify(p).includes('SECRET'));assert.ok(!JSON.stringify(p).includes('private@example'));
await assert.rejects(()=>call('comment',{owner:'owner',set:'s',text:'hi'}),/Sign in/);await call('login',{});await assert.rejects(()=>call('settings',{set:'s',public:false}),/Unknown social action/);
await call('comment',{owner:'owner',set:'s',text:'Have #020',cards:['b'],offer:true});assert.equal(store.list('notifications')[0].user_id,'owner');assert.equal(store.list('comments')[0].offer,true);const comment=store.list('comments')[0];await call('comment',{owner:'owner',set:'s',text:'Reply',parent:comment.id});assert.ok(store.list('comments').some(c=>c.parent===comment.id));await assert.rejects(()=>call('report',{id:comment.id,reason:'Review'}),/Unknown social action/);
await assert.rejects(()=>call('delete-comment',{id:comment.id}),/Unknown social action/);
await call('edit-comment',{id:comment.id,text:'Sold'});assert.equal(store.get('comments',comment.id).text,'Sold');assert.ok(store.get('comments',comment.id).edited_at);
store.put('comments',{id:'foreign',owner:'owner',set:'s',author_id:'owner',text:'Owner comment',cards:[]});await assert.rejects(()=>call('edit-comment',{id:'foreign',text:'Forged'}),/Only the author/);
await assert.rejects(()=>call('moderation'),/Administrator/);await call('moderation',{action:'delete',id:comment.id},store.get('users','local-admin'));
await call('visit',{owner:'owner',set:'s'});await call('visit',{owner:'owner',set:'s'});assert.equal(store.list('visits').length,1);assert.ok(!('user_id' in store.list('visits')[0]));
assert.equal((await call('profile?user=owner&set=s')).comments.some(c=>c.id===comment.id),false);
store.put('checklists',{...store.get('checklists','owner:s'),public:false});assert.equal((await call('profile?user=owner&set=s')).checklists.length,1);
service.notify('local-demo','comments','Hello','/collectors');assert.equal((await call('notifications')).items.length,1);await call('notifications',{});assert.equal((await call('notifications')).items[0].read,true);
store.put('groups',{id:'g',name:'Group'});store.save('collections',{...store.get('collections','s'),category_id:'g',status:'published',cards:[{id:'b',image:'/b.webp'},{id:'a',image:'/a.webp'}]});assert.deepEqual(store.get('collections','s').cards.map(c=>c.number),[20,10]);
store.save('collections',{...store.get('collections','s'),cards:[{id:'a',image:'/a.webp'}]});store.save('collections',{...store.get('collections','s'),cards:[{id:'a',image:'/a.webp'},{id:'new',image:'/new.webp'}]});assert.equal(store.get('collections','s').cards[1].number,21);
await assert.rejects(()=>call('settings',{public:false}),/Unknown social action/);service.notify('local-demo','offers','Offer','/collectors');assert.equal(store.list('notifications').filter(n=>n.user_id==='local-demo'&&n.type==='offers').length,1);
service.notify('local-demo','comments','Another','/collectors');service.notify('local-demo','comments','Another again','/collectors');assert.equal(store.list('notifications').find(n=>n.user_id==='local-demo'&&n.type==='comments'&&!n.read).count,2);
store.put('users',{...store.get('users','local-demo'),status:'suspended'});await assert.rejects(()=>call('comment',{owner:'owner',text:'hi'}),/Sign in/);

}finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

import localCms from '../local/cms-plugin.mjs';
import {Readable} from 'node:stream';
test('local account switching isolates checklist and profile writes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-account-'));fs.mkdirSync(path.join(root,'lib'));fs.writeFileSync(path.join(root,'lib/categories.json'),'[]');fs.writeFileSync(path.join(root,'lib/catalog.json'),JSON.stringify([{id:'s',name:'Set',cards:[{id:'c',number:1,image:'/c.webp'}]}]));let handler,close;
 localCms().configureServer({config:{root},middlewares:{use:fn=>handler=fn},httpServer:{once:(_,fn)=>close=fn}});
 let cookie='';async function call(url,data){let result,status;const req=Readable.from(data?[JSON.stringify(data)]:[]);req.url=url;req.method=data?'POST':'GET';req.headers={host:'localhost:3100',cookie,'content-type':'application/json'};req.socket={remoteAddress:'127.0.0.1'};const res={statusCode:200,setHeader:(k,v)=>{if(k==='Set-Cookie')cookie=v.split(';')[0]},end:text=>{status=res.statusCode;result=JSON.parse(text)}};await handler(req,res,()=>{});return {status,result};}
 try{assert.equal((await call('/__local/collector',{lists:{s:'x'},owned:{s:['c']}})).status,401);await call('/__local/social/login',{id:'local-demo'});await call('/__local/collector',{lists:{s:'forged'},owned:{s:['c']},user_id:'local-admin'});await call('/__local/social/login',{id:'local-admin'});let state=(await call('/__local/collector')).result;assert.equal(state.profile.id,'local-admin');assert.deepEqual(state.lists,{});await call('/__local/collector',{profile:{displayName:'Changed admin',photo:''}});await call('/__local/social/login',{id:'local-demo'});state=(await call('/__local/collector')).result;assert.deepEqual(state.owned.s,['c']);assert.notEqual(state.profile.display_name,'Changed admin');
assert.equal((await call('/__local/collector',{profile:{displayName:'Collector',photo:'',bio:'Looking for missing teks.',facebookUrl:'https://www.facebook.com/example.collector'}})).status,200);
assert.equal((await call('/__local/collector',{profile:{displayName:'Collector',photo:'',bio:'x'.repeat(91)}})).status,400);
assert.equal((await call('/__local/collector',{profile:{displayName:'Collector',photo:'',facebookUrl:'https://facebook.com.evil.test/person'}})).status,400);
assert.equal((await call('/__local/collector',{pin:{setId:'s',text:'For sale'}})).status,200);
assert.equal((await call('/__local/collector',{pin:{setId:'s',text:'x'.repeat(101)}})).status,400);
let publicProfile=(await call('/__local/social/profile?user=local-demo&set=s')).result;
assert.equal(publicProfile.user.bio,'Looking for missing teks.');assert.equal(publicProfile.user.facebook_url,'https://www.facebook.com/example.collector');assert.equal(publicProfile.checklists[0].pinned_message,'For sale');
await call('/__local/social/login',{id:'local-admin'});
assert.equal((await call('/__local/collector',{pin:{setId:'s',text:'Overwrite'}})).status,400);
await call('/__local/social/login',{id:'local-demo'});await call('/__local/collector',{pin:{setId:'s',text:''}});
assert.equal((await call('/__local/collector')).result.metadata.s.pinned_message,'');
}finally{close();fs.rmSync(root,{recursive:true,force:true});}
});
