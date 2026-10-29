-- Applied to the live Flowboard project on 2026-10-29. Kept here so the security rules are versioned
-- and covered by src/security.test.ts.

-- 1. Allowlist of people who may use the board, keyed by user id (not email, which can be claimed at signup).
create table public.team_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
alter table public.team_members force row level security;

-- A signed-in user can see only their own membership row. Nobody can write through the API;
-- members are added from the SQL editor / service role.
create policy "Users can see their own membership"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.team_members from public, anon, authenticated;
grant select on public.team_members to authenticated;

-- The live project's first member was added with a one-off statement like this (run it with your own email):
--   insert into public.team_members (user_id) select id from auth.users where email = 'you@example.com';

-- 2. Replace the wide-open card policies.
drop policy "Team members can view cards"   on public.cards;
drop policy "Team members can add cards"    on public.cards;
drop policy "Team members can edit cards"   on public.cards;
drop policy "Team members can delete cards" on public.cards;

create policy "Members can view cards"
  on public.cards for select to authenticated
  using (exists (select 1 from public.team_members m where m.user_id = (select auth.uid())));

create policy "Members can add their own cards"
  on public.cards for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()))
  );

create policy "Members can edit cards"
  on public.cards for update to authenticated
  using (exists (select 1 from public.team_members m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.team_members m where m.user_id = (select auth.uid())));

create policy "Members can delete their own cards"
  on public.cards for delete to authenticated
  using (
    created_by = (select auth.uid())
    and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()))
  );

alter table public.cards force row level security;

-- 3. Ownership and identity fields cannot be changed by an edit.
create function public.cards_protect_columns() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function public.cards_protect_columns() from public, anon, authenticated;

create trigger cards_protect_columns
  before update on public.cards
  for each row execute function public.cards_protect_columns();

-- 4. Least-privilege table grants (RLS is the gate, but don't hand out more than needed).
revoke all on public.cards from public, anon;
revoke truncate, references, trigger on public.cards from authenticated;

-- 5. Input limits matching the UI.
alter table public.cards
  add constraint cards_title_len    check (char_length(title) <= 100),
  add constraint cards_assignee_len check (char_length(assignee) <= 60);
