import { currentMockMember } from './store.js';

const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

export function createMockSession() {
    const member = currentMockMember();
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const user = {
        id: member.id, email: member.email, aud: 'authenticated', role: 'authenticated',
        user_metadata: { full_name: member.name }
    };
    const access_token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: expires })}.mock-only-signature`;
    return { access_token, refresh_token: 'mock-only-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
}
