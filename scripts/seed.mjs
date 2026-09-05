import fs from 'node:fs';
const catalog = JSON.parse(
  fs
    .readFileSync(new URL('../lib/catalog.json', import.meta.url), 'utf8')
    .replace(/^\uFEFF/, ''),
);
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
let sql =
  "begin;\ninsert into public.categories(id,name,position) values('ghost-fighter','Ghost Fighter',0) on conflict(id) do nothing;\n";
for (const [i, set] of catalog.entries()) {
  const suffix = set.id
    .replace('yuyuhakusho-', '')
    .split('-')
    .map(
      (x) =>
        ({
          dbest8000: 'DBest8000',
          dbest: 'DBest',
          ghostfighter: 'Ghost Fighter',
          playingcard: 'Playing Card',
        })[x] || x[0].toUpperCase() + x.slice(1),
    )
    .join(' ');
  set.name = 'Yuyu Hakusho ' + suffix;
  sql += `insert into public.sets(id,category_id,name,cover,position,status) values(${q(set.id)},'ghost-fighter',${q(set.name)},${q(set.cover)},${i},'published') on conflict(id) do nothing;\n`;
  for (const c of set.cards)
    sql += `insert into public.cards(id,set_id,number,image) values(${q(c.id)},${q(set.id)},${c.number},${q(c.image)}) on conflict(id) do nothing;\n`;
}
sql +=
  "insert into public.tracks(id,category_id,title,url,position) values('bye','ghost-fighter','Byebye','/bgm/Byebye.mp3',0),('tatakai','ghost-fighter','Tatakai no Hate','/bgm/Tatakai no Hate.mp3',1),('taiyou','ghost-fighter','太陽がまた輝くとき','/bgm/太陽がまた輝くとき.mp3',2) on conflict(id) do nothing;\ncommit;\n";
fs.writeFileSync(new URL('../supabase/002_seed.sql', import.meta.url), sql);
fs.writeFileSync(
  new URL('../lib/catalog.json', import.meta.url),
  JSON.stringify(catalog, null, 2),
);
console.log(
  `${catalog.length} sets, ${catalog.reduce((n, s) => n + s.cards.length, 0)} cards`,
);
