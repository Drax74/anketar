export function formatVotes(count) {
    const last = count % 10;
    const teen = count % 100;
    const word = last === 1 && teen !== 11 ? 'glas'
        : last >= 2 && last <= 4 && (teen < 12 || teen > 14) ? 'glasa'
        : 'glasova';
    return `${count} ${word}`;
}

export function formatPrice(value) {
    const price = String(value ?? '').trim();
    if (!price || price === 'N/A') return 'Cijena na upit';
    if (price.includes('€')) return price.replace(/\s*€/g, ' €').trim();
    return /^[\d.,\s]+$/.test(price) ? `${price} €` : price;
}

export function getInitials(value = '') {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    return !parts.length ? '?' : parts.length === 1 ? parts[0].substring(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
