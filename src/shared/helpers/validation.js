export function isValidUrl(string) {
    if (!string || typeof string !== 'string') return false;
    const trimmed = string.trim();
    if (!trimmed) return false;

    try {
        // Handle domain-only inputs or scheme-less strings safely
        const formatted = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
            ? trimmed
            : `https://${trimmed}`;

        const parsed = new URL(formatted);
        return Boolean(parsed.hostname && parsed.hostname.includes('.'));
    } catch {
        return false;
    }
}

export function isBookingOrAirbnbUrl(url) {
    if (!isValidUrl(url)) return false;

    try {
        const formatted = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url.trim())
            ? url.trim()
            : `https://${url.trim()}`;

        const parsed = new URL(formatted);
        const hostname = parsed.hostname.toLowerCase();

        // Comprehensive domain & mobile short-link matching
        const isBooking =
            hostname === 'booking.com' ||
            hostname.endsWith('.booking.com') ||
            hostname === 'bkg.to' ||
            hostname.endsWith('.bkg.to');

        const isAirbnb =
            hostname === 'airbnb.com' ||
            hostname.endsWith('.airbnb.com') ||
            hostname === 'airbnb.hr' || // Country TLDs
            hostname.endsWith('.airbnb.hr') ||
            hostname === 'abnb.me' ||   // Mobile short link
            hostname.endsWith('.abnb.me');

        return isBooking || isAirbnb;
    } catch {
        return false;
    }
}