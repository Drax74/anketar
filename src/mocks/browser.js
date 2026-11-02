import { setupWorker } from 'msw/browser';
import { handlers } from './handlers.js';
import { createMockSession } from './session.js';
import { mockAuthStorageKey } from '../backend-config.js';
import { mountMockTools } from './tools.js';

export async function startMocks() {
    const worker = setupWorker(...handlers);
    await worker.start({
        quiet: true,
        onUnhandledFrame: 'bypass',
        serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` }
    });
    // Unique per-document keys also isolate Supabase Auth's BroadcastChannel.
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('anketar-mock-auth-')) sessionStorage.removeItem(key);
    }
    sessionStorage.setItem(mockAuthStorageKey, JSON.stringify(createMockSession()));
    document.documentElement.dataset.mockMode = 'true';
    document.title = `[MOCK] ${document.title}`;
    mountMockTools();
}
