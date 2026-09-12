import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../local/cms-plugin.mjs';

test('local CMS persists edits and protects referenced collections and administrator access', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-cms-test-'));
  fs.mkdirSync(path.join(root,'lib'));
  fs.writeFileSync(path.join(root,'lib/categories.json'),JSON.stringify([{id:'g',name:'Group',position:0}]));
  fs.writeFileSync(path.join(root,'lib/catalog.json'),JSON.stringify([{id:'s',name:'Set',category_id:'g',status:'published',cards:[{id:'one',number:1,image:'/one.webp'},{id:'two',number:2,image:'/two.webp'}]}]));
  let store=openStore(root);
  try {
    store.save('groups',{id:'g',name:'Updated group',status:'published',position:2});
    store.save('users',{id:'vip',name:'VIP tester',email:'vip@local.test',role:'VIP',status:'active'});
    assert.throws(()=>store.save('users',{...store.get('users','local-admin'),role:'Normal'}),/administrator/);
    assert.throws(()=>store.save('collections',{id:'bad',name:'Bad',status:'published',category_id:'missing'}),/group/);
    store.put('checklists',{id:'list',user_id:'local-demo',set_id:'s',owned:['one']});
    assert.throws(()=>store.del('collections','s'),/Archive/);
    assert.throws(()=>store.del('groups','g'),/archive/);
    assert.throws(()=>store.save('collections',{...store.get('collections','s'),cards:[{id:'two',image:'/two.webp'}]}),/collected/);
    store.save('collections',{...store.get('collections','s'),status:'archived',cards:[{id:'two',image:'/two.webp'},{id:'one',image:'/one.webp'}]});
    store.db.close();store=openStore(root);
    assert.equal(store.get('groups','g').name,'Updated group');
    assert.equal(store.get('users','vip').role,'VIP');
    assert.equal(store.get('users','local-admin').role,'Super Admin');
    store.save('users',{id:'helper',name:'Helper',email:'helper@local.test',role:'Admin',status:'active'});
    assert.throws(()=>store.save('users',{...store.get('users','vip'),role:'Admin'},'helper'),/permission|Super Admin/);
    assert.throws(()=>store.save('users',{...store.get('users','local-admin'),name:'Changed'},'helper'),/permission|Super Admin/);
    assert.equal(store.get('collections','s').cards[1].id,'one');
    assert.deepEqual(store.get('checklists','list').owned,['one']);
    assert.equal(store.get('collections','s').status,'archived');
  } finally {store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('verification is optional-proof, invalidates on changes, and rankings keep private data private', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-verification-'));
  fs.mkdirSync(path.join(root,'lib'));
  fs.writeFileSync(path.join(root,'lib/categories.json'),JSON.stringify([{id:'g',name:'Group'}]));
  fs.writeFileSync(path.join(root,'lib/catalog.json'),JSON.stringify([{id:'s',name:'Set',category_id:'g',status:'published',cards:[{id:'one',image:'/one.webp'}]}]));
  const store=openStore(root);
  try {
    let row=store.saveChecklist({user_id:'local-demo',set_id:'s',owned:['one'],verified:true,notes:'Private note'},'local-admin');
    assert.equal(row.verified,true);
    assert.equal(row.proof,'');
    assert.equal(row.verified_by,'local-admin');
    assert.ok(row.verified_at);
    const unchanged=store.saveChecklist({...row,notes:'forged'},null);
    assert.equal(unchanged.notes,'Private note');
    assert.equal(unchanged.verified_at,row.verified_at);
    assert.throws(()=>store.saveChecklist(row,'local-demo'),/permission|Administrator/);
    assert.equal(store.leaderboard('g')[0].verified,1);
    const rankBefore=store.leaderboard('g')[0].rank;
    store.save('users',{...store.get('users','local-demo'),user_verified:true});
    assert.equal(store.leaderboard('g')[0].user_verified,true);
    assert.equal(store.leaderboard('g')[0].rank,rankBefore);
    assert.equal(store.get('checklists',row.id).verified,true);
    store.save('users',{...store.get('users','local-demo'),user_verified:false});
    assert.equal(store.leaderboard('g')[0].user_verified,false);
    assert.equal(store.get('checklists',row.id).verified,true);

    assert.deepEqual(store.leaderboard('other'),[]);
    assert.ok(!JSON.stringify(store.leaderboard()).includes('Private note'));
    assert.ok(!('email' in store.leaderboard()[0]));
    row=store.saveChecklist({...row,owned:[]},null);
    assert.equal(row.verified,false);
    assert.equal(row.verified_by,null);
    row=store.saveChecklist({...row,owned:['one'],verified:true},null);
    assert.equal(row.verified,false);
    row=store.saveChecklist({...row,verified:true},'local-admin');
    row=store.saveChecklist({...row,proof:'/__local/proof/abc.webp'},'local-admin');
    assert.equal(row.verified,false);
    row=store.saveChecklist({...row,verified:true},'local-admin');
    store.save('collections',{...store.get('collections','s'),cards:[{id:'one',image:'/replacement.webp'}]});
    assert.equal(store.get('checklists',row.id).verified,false);
    store.put('users',{...store.get('users','local-demo'),leaderboard_visible:false});
    assert.equal(store.leaderboard().length,1);
    store.put('users',{...store.get('users','local-demo'),leaderboard_visible:true,status:'suspended'});
    assert.deepEqual(store.leaderboard(),[]);
  } finally {store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('leaderboard uses completed totals, shared ranks and a ten-collector limit',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-ranking-'));fs.mkdirSync(path.join(root,'lib'));fs.writeFileSync(path.join(root,'lib/catalog.json'),'[]');fs.writeFileSync(path.join(root,'lib/categories.json'),'[]');const store=openStore(root);
 try{for(let s=0;s<3;s++)store.put('collections',{id:'s'+s,cards:[{id:'c',number:1,image:'/c.webp'}]});for(let i=0;i<13;i++){const id='u'+String(i).padStart(2,'0');store.put('users',{id,name:id,role:i===0?'Super Admin':'Normal',status:'active'});for(let s=0;s<(i<2?3:2);s++)store.put('checklists',{id:id+':s'+s,user_id:id,set_id:'s'+s,owned:['c'],verified:i>1});}const rows=store.leaderboard();assert.equal(rows.length,10);assert.deepEqual(rows.slice(0,3).map(r=>r.rank),[1,1,3]);assert.equal(rows[0].completed,3);assert.equal(rows[0].verified,0);assert.equal(store.leaderboard('all',true).length,0);store.put('users',{...store.get('users','u12'),user_verified:true});assert.equal(store.leaderboard('all',true)[0].id,'u12');assert.equal(store.leaderboard('all',true)[0].rank,1);}finally{store.db.close();fs.rmSync(root,{recursive:true,force:true});}
});

 test('roles restrict contributors and support custom permissions and verified-set rankings', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teksboy-roles-'));
 fs.mkdirSync(path.join(root,'lib'));
 fs.writeFileSync(path.join(root,'lib/categories.json'),JSON.stringify([{id:'g',name:'Group'}]));
 fs.writeFileSync(path.join(root,'lib/catalog.json'),JSON.stringify([{id:'s',name:'Set',category_id:'g',status:'published',cards:[{id:'one',number:1,image:'/one.webp'}]}]));
 const store=openStore(root);
 try {
 store.save('users',{id:'contributor',name:'Contributor',email:'c@local.test',role:'Admin',status:'active'});
 assert.deepEqual(store.permissions(store.get('users','contributor')),['groups','collections','tracks']);
 store.save('groups',{id:'g',name:'Edited',logo:'/images/test.png',status:'published'},'contributor');
assert.equal(store.get('groups','g').logo,'/images/test.png');
assert.throws(()=>store.save('groups',{id:'g',name:'Edited',status:'published',logo:'javascript:alert(1)'},'contributor'),/logo/);
 store.put('avatars',{id:'slot',name:'Avatar',image:'/images/avatars/test.png',enabled:true,position:0});
assert.throws(()=>store.save('avatars',{id:'slot',name:'Changed',image:'/images/avatars/test.png'},'contributor'),/permission/);
store.save('avatars',{id:'slot',name:'Changed',image:'/images/avatars/test.png',enabled:false,position:2});
assert.equal(store.get('avatars','slot').enabled,false);
assert.throws(()=>store.save('avatars',{id:'new',name:'New',image:'/images/avatars/test.png'}),/existing/);
assert.equal(store.list('community').length,14);
 const linkType=store.save('community-types',{name:'Partners',layout:'cover'});
 assert.throws(()=>store.del('community-types','group'),/Move/);
 assert.throws(()=>store.save('community-types',{name:'Partners',layout:'profile'}),/exists/);
 store.save('community-types',{...linkType,name:'Community partners',layout:'profile'});
 assert.equal(store.get('community-types',linkType.id).layout,'profile');
 store.del('community-types',linkType.id);assert.equal(store.get('community-types',linkType.id),null);
 const link={name:'Test',url:'https://example.com',type:'website',status:'draft',description:'Test link'};
 assert.throws(()=>store.save('community',link,'contributor'),/permission/);
 assert.throws(()=>store.save('community',{...link,url:'javascript:alert(1)'}),/HTTP/);
 const savedLink=store.save('community',link);assert.equal(store.get('community',savedLink.id).status,'draft');
 store.del('community',savedLink.id);assert.equal(store.get('community',savedLink.id),null);
 const set=store.get('collections','s');
 store.save('collections',{...set,market_price_min:5000,market_price_max:7000},'contributor');
 assert.equal(store.get('collections','s').market_price_max,7000);
 assert.throws(()=>store.save('collections',{...set,market_price_min:7000,market_price_max:5000},'contributor'),/price/);
 assert.throws(()=>store.save('collections',{...set,market_price_min:5000},'contributor'),/price/);
 store.save('collections',{...set,market_price_min:null,market_price_max:null},'contributor');
 assert.equal(store.get('collections','s').market_price_min,null);
 assert.throws(()=>store.save('users',{...store.get('users','local-demo'),name:'No'},'contributor'),/permission/);
 assert.throws(()=>store.saveRole({name:'Power',color:'#ffffff',permissions:['users']},'contributor'),/permission/);
 const custom=store.saveRole({name:'Curator',color:'#123abc',permissions:['collections']},'local-admin');
 store.save('users',{id:'curator',name:'Curator',email:'curator@local.test',role:'Curator',status:'active'});
 assert.deepEqual(store.permissions(store.get('users','curator')),['collections']);
 assert.throws(()=>store.del('roles',custom.id),/Reassign/);
 store.saveRole({...custom,name:'Editor',permissions:['tracks']},'local-admin');
 assert.equal(store.get('users','curator').role,'Editor');
 assert.deepEqual(store.permissions(store.get('users','curator')),['tracks']);
 assert.throws(()=>store.saveRole({...custom,permissions:['roles']},'local-admin'),/Invalid/);
 assert.throws(()=>store.del('roles','Super Admin'),/Built-in/);
 store.save('users',{...store.get('users','curator'),role:'Normal'});
 store.del('roles',custom.id);assert.equal(store.get('roles',custom.id),null);
 store.saveChecklist({user_id:'local-demo',set_id:'s',owned:['one']},null);
 assert.equal(store.leaderboard('all',false,true).length,0);
 store.saveChecklist({...store.get('checklists','local-demo:s'),verified:true},'local-admin');
 assert.equal(store.leaderboard('all',false,true)[0].completed,1);
 assert.equal(store.leaderboard('all',true,true).length,0);
 } finally {store.db.close();fs.rmSync(root,{recursive:true,force:true});}
 });
