-- Полный доступ всем авторизованным (без ролей).
-- can_write() используется во всех write-политиках и в storage — меняем только её.
create or replace function can_write() returns boolean
language sql stable as $$
  select auth.uid() is not null;
$$;
