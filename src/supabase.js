import { createClient } from '@supabase/supabase-js';
import { backendUrl, backendKey, isMockMode, mockAuthStorageKey } from './backend-config.js';

export const supabase = createClient(backendUrl, backendKey, isMockMode ? {
    auth: { storage: window.sessionStorage, storageKey: mockAuthStorageKey }
} : {});
