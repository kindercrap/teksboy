import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
// Export only public archive configuration. Never export collector or account data.
const root=process.cwd(),db=new DatabaseSync(path.join(root,'.local/teksboy.sqlite'),{readOnly:true});
const allowed=['groups','collections','tracks','community','community-types','avatars'];
const exported={};let copied=0;
function rewrite(value){if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));if(typeof value==='string'&&value.startsWith('/local-media/')){const filename=path.basename(value);if(value!=='/local-media/'+filename)throw Error('Unexpected upload path');const source=path.join(root,'public/local-media',filename);if(!fs.existsSync(source))throw Error('Missing public media: '+filename);const target=path.join(root,'public/images/catalog-import',filename);fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target)){fs.copyFileSync(source,target);copied++;}return '/images/catalog-import/'+filename;}return value;}
for(const kind of allowed)exported[kind]=db.prepare('SELECT data FROM records WHERE kind=? ORDER BY id').all(kind).map(r=>rewrite(JSON.parse(r.data)));
db.close();fs.mkdirSync('supabase/import',{recursive:true});fs.writeFileSync('supabase/import/public-catalog.json',JSON.stringify(exported,null,2)+'\n');console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(exported).map(([k,v])=>[k,v.length])),publicAssetsCopied:copied,excluded:'users, checklists, comments, notifications, activity, proof and verification evidence'}));
