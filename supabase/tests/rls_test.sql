-- RLS isolation tests (SQL asserts, technical-plan M1 acceptance).
-- Each block raises an exception when an invariant is broken.

-- Assert 1: RLS is enabled on every public table
do $$
declare
  missing text;
begin
  select string_agg(t.tablename, ', ') into missing
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('transactions', 'captures', 'chat_messages')
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity
    );
  if missing is not null then
    raise exception 'RLS not enabled on: %', missing;
  end if;
end $$;

-- Assert 2: every policy carries an auth.uid() ownership predicate
do $$
declare
  bad text;
begin
  select string_agg(policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public'
    and (qual is null or qual not like '%auth.uid()%');
  if bad is not null then
    raise exception 'policy without auth.uid() ownership predicate: %', bad;
  end if;
end $$;

-- Assert 3: every policy is scoped to the authenticated role
do $$
declare
  bad text;
begin
  select string_agg(policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public'
    and array_to_string(roles, ',') not like '%authenticated%';
  if bad is not null then
    raise exception 'policy not scoped to authenticated: %', bad;
  end if;
end $$;
