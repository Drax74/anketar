export const isMockMode = import.meta.env.DEV && import.meta.env.MODE === 'mock';
export const mockAuthStorageKey = isMockMode ? `anketar-mock-auth-${crypto.randomUUID()}` : '';

// Even if a mock handler fails, mock mode can only reach this local endpoint.
// It never reads or reuses the real project's session or publishable key.
export const backendUrl = isMockMode
    ? `${window.location.origin}${import.meta.env.BASE_URL}mock-api`
    : 'https://aucksurcmgkzuulpwuvu.supabase.co';
export const backendKey = isMockMode
    ? 'mock-publishable-key'
    : 'sb_publishable_qhaNCJwGGNi9mUERYDFVAg_tPw1O1HU';
