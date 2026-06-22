-- Доступ по общему паролю на стороне приложения (без Supabase-логина).
-- Поэтому данные доступны анонимному ключу (anon). Это не биометрия, не платежи —
-- маркетинговый список; защита — общий пароль в приложении.

do $$
declare t text;
begin
  foreach t in array array['channels','sprints','placements','integrations'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- storage: публичная запись/чтение скринов и файлов
drop policy if exists screens_read on storage.objects;
drop policy if exists screens_write on storage.objects;
drop policy if exists screens_delete on storage.objects;
create policy screens_read on storage.objects for select
  using (bucket_id = 'screens');
create policy screens_write on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'screens');
create policy screens_delete on storage.objects for delete to anon, authenticated
  using (bucket_id = 'screens');
