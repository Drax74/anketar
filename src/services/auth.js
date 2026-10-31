import { supabase } from '../supabase.js';
import { state } from '../state.js';

const REDIRECT_URL = `${window.location.origin}/anketar/`;

function applySession(session) {
    const previousEmail = state.userEmail;
    const user = session?.user;

    state.userEmail = user?.email || '';
    state.userName = state.userEmail
        ? user.user_metadata?.full_name || state.userEmail
        : '';

    const identityChanged = previousEmail !== state.userEmail;

    if (identityChanged) {
        state.selectedOptionIds.clear();
    }

    // Remove the old identity cache. Supabase manages its own session storage.
    localStorage.removeItem('poll_user_email');
    localStorage.removeItem('poll_user_name');

    const authModal = document.getElementById('auth-modal');

    if (state.userEmail) {
        authModal?.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        authModal?.classList.add('active');
    }

    return identityChanged;
}

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

export function initAuthListener(onAuthChange) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const identityChanged = applySession(session);

        if (typeof onAuthChange === 'function') {
            onAuthChange({
                event,
                session,
                identityChanged
            });
        }
    });

    return data.subscription;
}

export async function checkInitialSession() {
    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        applySession(data.session);
        return Boolean(state.userEmail);
    } catch (error) {
        console.error('Session check failed:', error);
        applySession(null);
        return false;
    }
}

export async function logoutUserSession() {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) throw error;

        applySession(null);
        location.reload();
    } catch (error) {
        console.error('Sign out failed:', error);
        alert('Odjava nije uspjela. Pokušajte ponovno.');
    }
}