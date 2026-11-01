-- Disposable PostgreSQL test database only; never apply this file to Supabase.
create role anon;
create role authenticated;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
    select (auth.jwt() ->> 'sub')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
create table public.whitelist (email text primary key, name text);
create table public.options (
    id text primary key, created_by text not null, title text,
    price text, image text, note text
);
insert into public.whitelist values
    ('owner@example.test', 'Owner'), ('other@example.test', 'Other'),
    ('draksic.m@gmail.com', 'Admin');
insert into public.options values
    ('own', 'owner@example.test', 'Own', '450€', '', ''),
    ('other', 'other@example.test', 'Other', '500€', '', '');
grant select, insert, update, delete on public.whitelist, public.options to authenticated;
alter table public.whitelist enable row level security;
alter table public.options enable row level security;
create policy fixture_members on public.whitelist for all to authenticated using (true) with check (true);
create policy fixture_select on public.options for select to authenticated using (true);
-- Intentionally broad: the migration's restrictive guard must contain this.
create policy fixture_update on public.options for update to authenticated using (true) with check (true);
create schema test;
grant usage on schema test to authenticated;
create function test.assert(value boolean, message text) returns void language plpgsql as $$
begin
    if value is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;
create function test.denied(statement text) returns void language plpgsql as $$
begin
    begin
        execute statement;
    exception when insufficient_privilege then
        return;
    end;
    raise exception 'Expected permission denial: %', statement;
end;
$$;
