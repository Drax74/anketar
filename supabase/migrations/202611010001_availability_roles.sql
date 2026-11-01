-- Run as the database owner in Supabase SQL Editor, before assigning roles.
-- Existing SELECT/INSERT/DELETE policies remain in place.
begin;

-- Unknown restrictive UPDATE/ALL policies combine with ours using AND. Rather
-- than silently blocking admin edits or deleting existing safeguards, require
-- their review before applying this migration.
do $$
begin
    if exists (
        select 1 from pg_policy
        where polrelid = 'public.options'::regclass
          and not polpermissive and polcmd in ('w', '*')
          and polname <> 'accommodation_edit_guard'
          and (0::oid = any(polroles) or 'authenticated'::regrole::oid = any(polroles))
    ) then
        raise exception 'Review existing restrictive UPDATE/ALL policies on public.options before adding super-admin editing.';
    end if;
end;
$$;

alter table public.options add column if not exists is_taken boolean not null default false;
update public.options set is_taken = false where is_taken is null;
alter table public.options alter column is_taken set default false;
alter table public.options alter column is_taken set not null;

alter table public.whitelist add column if not exists role text not null default 'user';
update public.whitelist set role = 'user' where role is null;
alter table public.whitelist alter column role set default 'user';
alter table public.whitelist alter column role set not null;
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.whitelist'::regclass and conname = 'whitelist_app_role_check'
    ) then
        alter table public.whitelist add constraint whitelist_app_role_check
            check (role in ('user', 'super_admin'));
    end if;
end;
$$;

-- This function deliberately reads trusted table data, not user_metadata or a
-- role supplied by the client. The fixed search_path avoids object substitution.
create or replace function public.can_edit_accommodation(creator_email text)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select auth.uid() is not null and exists (
        select 1 from public.whitelist as member
        where lower(btrim(member.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and (
              member.role = 'super_admin'
              or (member.role = 'user' and
                  lower(btrim(creator_email)) = lower(btrim(auth.jwt() ->> 'email')))
          )
    );
$$;
revoke all on function public.can_edit_accommodation(text) from public, anon;
grant execute on function public.can_edit_accommodation(text) to authenticated;

alter table public.options enable row level security;
-- The permissive policy enables the two allowed paths. The restrictive policy
-- prevents unrelated existing permissive policies from granting wider edits.
drop policy if exists accommodation_edit_allowed on public.options;
create policy accommodation_edit_allowed on public.options
    as permissive for update to authenticated
    using (public.can_edit_accommodation(created_by))
    with check (public.can_edit_accommodation(created_by));
drop policy if exists accommodation_edit_guard on public.options;
create policy accommodation_edit_guard on public.options
    as restrictive for update to authenticated
    using (public.can_edit_accommodation(created_by))
    with check (public.can_edit_accommodation(created_by));
grant update (title, price, image, note, is_taken) on public.options to authenticated;

-- RLS alone is insufficient if an existing policy permits whitelist updates.
-- Browser clients may never change a role or move a role to another email.
-- Trusted database/service roles can administer these values separately.
create or replace function public.guard_whitelist_identity_role()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            if new.role <> 'user' then
                raise exception 'Only trusted administrators can assign roles.' using errcode = '42501';
            end if;
        elsif new.role is distinct from old.role or new.email is distinct from old.email then
            raise exception 'Only trusted administrators can change roles or member identity.' using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;
revoke all on function public.guard_whitelist_identity_role() from public, anon, authenticated;
drop trigger if exists protect_whitelist_identity_role on public.whitelist;
create trigger protect_whitelist_identity_role before insert or update on public.whitelist
    for each row execute function public.guard_whitelist_identity_role();

-- Editing a proposal must not rewrite who proposed it, including admin edits.
create or replace function public.guard_accommodation_creator()
returns trigger
language plpgsql set search_path = ''
as $$
begin
    if current_user in ('authenticated', 'anon') and new.created_by is distinct from old.created_by then
        raise exception 'The proposal creator cannot be reassigned by the app.' using errcode = '42501';
    end if;
    return new;
end;
$$;
revoke all on function public.guard_accommodation_creator() from public, anon, authenticated;
drop trigger if exists protect_accommodation_creator on public.options;
create trigger protect_accommodation_creator before update on public.options
    for each row execute function public.guard_accommodation_creator();

commit;
