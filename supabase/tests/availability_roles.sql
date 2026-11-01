select test.assert((select bool_and(role = 'user') from public.whitelist where email <> 'draksic.m@gmail.com'), 'members default to regular users');
select test.assert((select bool_and(is_taken = false) from public.options), 'existing options default to available');

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","email":"owner@example.test","user_metadata":{"role":"super_admin"}}';
select test.assert(public.can_edit_accommodation('owner@example.test'), 'owner can edit own proposal');
select test.assert(not public.can_edit_accommodation('other@example.test'), 'Google metadata cannot grant admin');
update public.options set is_taken = true, title = 'Edited by owner' where id = 'own';
select test.assert((select is_taken from public.options where id = 'own'), 'owner availability edit persists');
do $$
declare changed integer;
begin
    update public.options set title = 'Unauthorized' where id = 'other';
    get diagnostics changed = row_count;
    perform test.assert(changed = 0, 'regular user cannot edit others even with a broad existing policy');
end;
$$;
select test.denied($q$update public.whitelist set role = 'super_admin' where email = 'owner@example.test'$q$);
select test.denied($q$update public.whitelist set email = 'stolen@example.test' where email = 'draksic.m@gmail.com'$q$);
select test.denied($q$insert into public.whitelist (email, name, role) values ('fake@example.test', 'Fake', 'super_admin')$q$);
select test.denied($q$update public.options set created_by = 'other@example.test' where id = 'own'$q$);
reset role;
select 'PASS: regular ownership, availability, forged claims and escalation guards' as result;

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","email":"draksic.m@gmail.com"}';
select test.assert(public.can_edit_accommodation('owner@example.test'), 'admin can edit owner proposal');
update public.options set title = 'Edited by admin', is_taken = true where id = 'other';
select test.assert((select title = 'Edited by admin' and is_taken from public.options where id = 'other'), 'admin edits another member proposal');
update public.options set is_taken = false where id = 'own';
select test.assert((select not is_taken from public.options where id = 'own'), 'admin can clear availability');
select test.denied($q$update public.options set created_by = 'draksic.m@gmail.com' where id = 'other'$q$);
select test.denied($q$update public.whitelist set role = 'super_admin' where email = 'other@example.test'$q$);
reset role;
select 'PASS: super-admin edits without reassignment or role administration' as result;

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","email":"outsider@example.test"}';
select test.assert(not public.can_edit_accommodation('outsider@example.test'), 'unapproved user cannot edit');
do $$
declare changed integer;
begin
    update public.options set is_taken = true;
    get diagnostics changed = row_count;
    perform test.assert(changed = 0, 'unapproved user cannot update any option');
end;
$$;
set request.jwt.claims = '{}';
select test.assert(not public.can_edit_accommodation('owner@example.test'), 'missing identity cannot edit');
reset role;
select 'PASS: unapproved and unauthenticated edits denied' as result;

-- Trusted database administration is the only way to assign/revoke roles.
update public.whitelist set role = 'user' where email = 'draksic.m@gmail.com';
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","email":"draksic.m@gmail.com"}';
select test.assert(not public.can_edit_accommodation('owner@example.test'), 'revocation applies without refreshing JWT');
reset role;
select 'PASS: role revocation is immediate at the database' as result;
