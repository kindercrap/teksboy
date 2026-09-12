-- Latest Teksboy backend. Existing v1 tables are preserved.
begin;
create table if not exists public.teks_records (
 kind text not null, id text not null, data jsonb not null,
 primary key(kind,id), check (data->>'id'=id)
);
create table if not exists public.teks_revision (
 singleton boolean primary key default true check(singleton), revision bigint not null default 0
);
insert into public.teks_revision(singleton) values(true) on conflict do nothing;
alter table public.teks_records enable row level security;
alter table public.teks_revision enable row level security;
revoke all on public.teks_records,public.teks_revision from anon,authenticated;
grant all on public.teks_records,public.teks_revision to service_role;
create or replace function public.teks_snapshot() returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('revision',(select revision from teks_revision where singleton),
 'records',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'data',data)) from teks_records),'[]'::jsonb));
$$;
create or replace function public.teks_commit(expected_revision bigint, changes jsonb) returns bigint
language plpgsql security invoker set search_path=public as $$
declare current_revision bigint; item jsonb;
begin
 select revision into current_revision from teks_revision where singleton for update;
 if current_revision <> expected_revision then raise exception 'Concurrent update; retry' using errcode='PT409'; end if;
 for item in select * from jsonb_array_elements(changes) loop
  if coalesce((item->>'deleted')::boolean,false) then
   delete from teks_records where kind=item->>'kind' and id=item->>'id';
  else
   insert into teks_records(kind,id,data) values(item->>'kind',item->>'id',item->'data')
   on conflict(kind,id) do update set data=excluded.data;
  end if;
 end loop;
 update teks_revision set revision=revision+1 where singleton returning revision into current_revision;
 return current_revision;
end; $$;
revoke all on function public.teks_snapshot() from public,anon,authenticated;
revoke all on function public.teks_commit(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.teks_snapshot(),public.teks_commit(bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('teksboy-media','teksboy-media',true,12582912,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav']),
 ('teksboy-evidence','teksboy-evidence',false,8388608,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do nothing;
commit;
