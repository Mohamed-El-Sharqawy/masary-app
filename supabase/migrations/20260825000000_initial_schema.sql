-- Masary schema: transactions, captures, chat_messages + RLS.
-- Mirrors technical-plan §5 (SQLite = Postgres mirror). User isolation via
-- RLS user_id = auth.uid() on every table.

create table public.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null,
  fx_rate_to_egp double precision,
  merchant text,
  person text,
  category text not null,
  spent_at timestamptz not null,
  notes text,
  source text not null check (source in ('chat_text', 'chat_voice', 'edit')),
  raw_input text,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);

create table public.captures (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_path text,
  status text not null check (status in ('recording', 'transcribing', 'extracted', 'synced', 'failed', 'needs_review')),
  transcript text,
  extracted_json jsonb,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  transactions_json jsonb,
  created_at timestamptz not null default now()
);

-- Indexes (supabase-postgres-best-practices: index FK columns + common filters)
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_user_spent_at_idx on public.transactions (user_id, spent_at desc);
create index transactions_user_category_idx on public.transactions (user_id, category);
create index captures_user_id_idx on public.captures (user_id);
create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);

-- Row Level Security: strict per-user isolation
alter table public.transactions enable row level security;
alter table public.captures enable row level security;
alter table public.chat_messages enable row level security;

-- transactions policies (ownership predicate per supabase skill security checklist)
create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- captures policies
create policy "captures_select_own" on public.captures
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "captures_insert_own" on public.captures
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "captures_update_own" on public.captures
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "captures_delete_own" on public.captures
  for delete to authenticated using ((select auth.uid()) = user_id);

-- chat_messages policies
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "chat_messages_update_own" on public.chat_messages
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "chat_messages_delete_own" on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at touch trigger (short transactions, no logic in triggers)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();
