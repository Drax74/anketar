import { supabase } from '../supabase.js';
import { state } from '../state.js';

const REDIRECT_URL = `${window.location.origin}/anketar/`;

export async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: REDIRECT_URL,
            queryParams: {
                prompt: 'select_account'
            }
        }
    });

    if (error) {
        console.error('Error initiating Google login:', error.message);
        alert(`Login failed: ${error.message}`);
    }
}

export function initAuthListener(onAuthSuccess) {
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user && session.user.email) {
            state.userEmail = session.user.email;
            state.userName = session.user.user_metadata?.full_name || session.user.email;

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
            state.userName = session.user.user_metadata?.full_name || session.user.email;
            localStorage.setItem('poll_user_email', state.userEmail);
            localStorage.setItem('poll_user_name', state.userName);
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