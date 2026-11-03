import { t } from '../i18n.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
async function createNonce() {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hashed = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    return { raw, hashed }; // raw -> sent to Supabase, hashed -> sent to Google
}

function waitForGoogle(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
            if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
            if (Date.now() - start > timeoutMs) return reject(new Error('Google script failed to load'));
            setTimeout(check, 50);
        })();
    });
}

export async function initGoogleLogin(containerId = 'google-btn') {
    try {
        const buttonContainer = document.getElementById(containerId);

        if (!buttonContainer || buttonContainer.children.length > 0) {
            return;
        }

        const gsi = await waitForGoogle();
        const { raw, hashed } = await createNonce();

        gsi.initialize({
            client_id: GOOGLE_CLIENT_ID,
            nonce: hashed,
            callback: async (response) => {
                const credential = response.credential;
                const { error } = await supabase.auth.signInWithIdToken({
                    provider: 'google',
                    token: credential,
                    nonce: raw,
                });
                if (error) {
                    console.error('Supabase sign-in failed:', error.message);
                }
            },
        });

        gsi.renderButton(buttonContainer, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            width: 280,
        });
    } catch (err) {
        console.error('Google login initialization error:', err);
    }
}

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
    authModal?.setAttribute('aria-hidden', state.userEmail ? 'true' : 'false');

    if (state.userEmail) {
        authModal?.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        authModal?.classList.add('active');
    }

    return identityChanged;
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

        if (window.google?.accounts?.id) {
            window.google.accounts.id.disableAutoSelect();
        }

        applySession(null);
        location.reload();
    } catch (error) {
        console.error('Sign out failed:', error);
        alert(t('auth.logoutFailed'));
    }
}