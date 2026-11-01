import { t } from '../i18n.js';

export function supportsAvailability(option) {
    return Object.hasOwn(option, 'is_taken');
}

export function renderAvailabilityBadge(container, option) {
    container.replaceChildren();
    container.hidden = option?.is_taken !== true;
    if (container.hidden) return;
    const badge = document.createElement('span');
    badge.className = 'availability-badge';
    badge.textContent = t('availability.taken');
    container.append(badge);
}
