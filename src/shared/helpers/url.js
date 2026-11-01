import { t } from '../../i18n.js';
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
export function getListingSource(value) {
    const url = safeWebUrl(value);
    if (!url) return '';
    const host = new URL(url).hostname;
    if (['airbnb.com', 'airbnb.hr', 'abnb.me'].some(domain => host === domain || host.endsWith(`.${domain}`))) return t('listing.airbnb');
    if (['booking.com', 'bkg.to'].some(domain => host === domain || host.endsWith(`.${domain}`))) return t('listing.booking');
    return host.replace(/^www\./, '');
}
