import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../../src/state.js';
import { canEditAccommodation } from '../../src/shared/helpers/permissions.js';

test('only approved owners and explicit super admins can edit accommodations', () => {
    const original = { email: state.userEmail, members: state.whitelistedUsers };
    try {
        state.userEmail = 'owner@example.test';
        const own = { created_by: 'owner@example.test' };
        const other = { created_by: 'other@example.test' };
        for (const role of [undefined, 'user']) {
            state.whitelistedUsers = [{ email: state.userEmail, role }];
            assert.equal(canEditAccommodation(own), true);
            assert.equal(canEditAccommodation(other), false);
        }
        state.whitelistedUsers[0].role = 'super_admin';
        assert.equal(canEditAccommodation(other), true);
        state.whitelistedUsers[0].role = 'administrator';
        assert.equal(canEditAccommodation(own), false);
        state.whitelistedUsers = [];
        assert.equal(canEditAccommodation(own), false);
        state.userEmail = '';
        assert.equal(canEditAccommodation(own), false);
    } finally {
        state.userEmail = original.email;
        state.whitelistedUsers = original.members;
    }
});
