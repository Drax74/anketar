import { supabase } from '../supabase.js';
import { state } from '../state.js';

export function initAuthListener(onAuthSuccess) {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user && session.user.email) {
            state.userEmail = session.user.email;

            if (state.whitelistedUsers.length > 0) {
                const matched = state.whitelistedUsers.find(u => u.email === state.userEmail);
                state.userName = matched ? matched.name : state.userEmail;
            } else {
                state.userName = localStorage.getItem('poll_user_name') || state.userEmail;
            }

            localStorage.setItem('poll_user_email', state.userEmail);
            localStorage.setItem('poll_user_name', state.userName);

            document.getElementById('auth-modal')?.classList.remove('active');
            document.body.style.overflow = '';

            if (typeof onAuthSuccess === 'function') {
                onAuthSuccess();
            }
        }
    });
}

export async function checkInitialSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user && session.user.email) {
            state.userEmail = session.user.email;
            localStorage.setItem('poll_user_email', state.userEmail);
            return true;
        }
    } catch (err) {
        console.error('Session check failed:', err);
    }
    return false;
}

export async function logoutUserSession() {
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.error('Sign out error:', e);
    }
    localStorage.clear();
    location.reload();
}