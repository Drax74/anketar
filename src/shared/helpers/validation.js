export function isValidUrl(string) {
    if (!string) return false;
    try {
        const formatted = string.startsWith('http') ? string : `https://${string}`;
        new URL(formatted);
        return true;
    } catch {
        return false;
    }
}

export function isBookingOrAirbnbUrl(url) {
    if (!isValidUrl(url)) return false;
    try {
        const formatted = url.startsWith('http') ? url : `https://${url}`;
        const parsed = new URL(formatted);
        const hostname = parsed.hostname.toLowerCase();
        return hostname.includes('booking.com') || hostname.includes('airbnb.');
    } catch {
        return false;
    }
}