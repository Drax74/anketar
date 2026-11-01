import { safeWebUrl } from './url.js';

export const DEFAULT_ACCOMMODATION_IMAGE = `${import.meta.env.BASE_URL}madrid-default.webp`;
const LEGACY_DEFAULT_PATH = '/photo-1566073771259-6a8506099945';

export function getAccommodationImageUrl(value) {
    const source = safeWebUrl(value);
    if (!source) return DEFAULT_ACCOMMODATION_IMAGE;
    const url = new URL(source);
    if (url.hostname === 'images.unsplash.com' && url.pathname === LEGACY_DEFAULT_PATH) {
        return DEFAULT_ACCOMMODATION_IMAGE;
    }
    return source;
}

// Share the same cached default across cards, rankings, and the detail transition.
export function setAccommodationImage(image, value, onUnavailable = () => {}) {
    const source = getAccommodationImageUrl(value);
    let usingDefault = source === DEFAULT_ACCOMMODATION_IMAGE;
    image.hidden = false;
    image.onerror = () => {
        if (!usingDefault) {
            usingDefault = true;
            image.src = DEFAULT_ACCOMMODATION_IMAGE;
        } else {
            image.hidden = true;
            onUnavailable();
        }
    };
    image.src = source;
}
