export function normalizeUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        // Strip www., trailing slashes, and search query params
        let clean = parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
        return clean.toLowerCase();
    } catch {
        return url.trim().toLowerCase().replace(/\/$/, '');
    }
}

export function safeWebUrl(value, fallback = '') {
    if (typeof value !== 'string' || !value.trim()) return fallback;

    const input = value.trim();

    try {
        const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
        const url = new URL(
            hasScheme || input.startsWith('/') ? input : `https://${input}`,
            window.location.origin
        );

        return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}