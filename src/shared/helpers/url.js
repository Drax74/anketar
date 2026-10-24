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