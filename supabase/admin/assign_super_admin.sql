-- Run only as a trusted database owner, after the migration. This is the
-- account explicitly selected for this role; it is never assigned by the app.
begin;
do $$
declare matches integer;
begin
    select count(*) into matches from public.whitelist
        where lower(btrim(email)) = 'draksic.m@gmail.com';
    if matches <> 1 then
        raise exception 'Expected exactly one whitelist entry for the selected super admin; found %.', matches;
    end if;
    update public.whitelist set role = 'super_admin'
        where lower(btrim(email)) = 'draksic.m@gmail.com';
end;
$$;
commit;
