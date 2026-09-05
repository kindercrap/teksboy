begin;
create function public.has_checklist(target_set text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.checklists where set_id=target_set and user_id=auth.uid()) and public.is_active(); $$;
revoke all on function public.has_checklist(text) from public;
grant execute on function public.has_checklist(text) to anon,authenticated;
alter policy sets_read on public.sets using(status='published' or public.is_admin() or public.has_checklist(id));
commit;
