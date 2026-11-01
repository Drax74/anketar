import { state } from '../../state.js';

const emailKey = value => String(value || '').trim().toLowerCase();

export function canEditAccommodation(option) {
    const email = emailKey(state.userEmail);
    if (!email || !option) return false;
    const member = state.whitelistedUsers.find(user => emailKey(user.email) === email);
    if (!member) return false;
    // Older schemas have no role column. Never trust Google profile metadata.
    const role = member.role ?? 'user';
    return role === 'super_admin' || (role === 'user' && emailKey(option.created_by) === email);
}
