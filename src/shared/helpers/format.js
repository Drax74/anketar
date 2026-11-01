import { t, plural } from '../../i18n.js';
export function formatVotes(count) {
    return plural('votes', count);
}

export function formatPrice(value) {
    const price = String(value ?? '').trim();
    if (!price || price === 'N/A') return t('price.onRequest');
    if (price.includes('€')) return price.replace(/\s*€/g, ' €').trim();
    return /^[\d.,\s]+$/.test(price) ? `${price} €` : price;
}

export function getInitials(value = '') {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    return !parts.length ? '?' : parts.length === 1 ? parts[0].substring(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
