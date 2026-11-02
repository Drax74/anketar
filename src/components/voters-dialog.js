import { t } from '../i18n.js';
import { state } from '../state.js';
import { formatVotes, getInitials } from '../shared/helpers/format.js';
import { avatarColor } from '../shared/helpers/avatars.js';
import { materialIcon } from '../shared/helpers/icons.js';

let dialog;
let activeOptionId = null;
let opener;
let previousOverflow = '';
let previousInert = false;

function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'voters-dialog';
    dialog.setAttribute('aria-labelledby', 'voters-dialog-title');
    dialog.setAttribute('aria-describedby', 'voters-dialog-stay');

    const header = document.createElement('div');
    header.className = 'voters-dialog__header';
    const heading = document.createElement('h2');
    heading.id = 'voters-dialog-title';
    heading.className = 'voters-dialog__title';
    heading.textContent = t('votes.votersTitle');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'voters-dialog__close';
    close.setAttribute('aria-label', t('common.close'));
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined voters-dialog__close-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = materialIcon('close');
    close.append(icon);
    close.addEventListener('click', () => dialog.close());
    header.append(heading, close);

    const stay = document.createElement('p');
    stay.id = 'voters-dialog-stay';
    stay.className = 'voters-dialog__stay';
    const count = document.createElement('p');
    count.className = 'voters-dialog__count';
    count.setAttribute('role', 'status');
    const list = document.createElement('ul');
    list.className = 'voters-dialog__list';
    dialog.append(header, stay, count, list);

    // Keep Escape and Tab within this modal instead of the underlying detail's
    // keyboard handler. Native <dialog> supplies modal focus containment.
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape' || event.key === 'Tab') event.stopPropagation();
        if (event.key !== 'Tab') return;
        const items = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
            .filter(element => element.getClientRects().length);
        const first = items[0];
        const last = items.at(-1);
        if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        }
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
        document.body.style.overflow = previousOverflow;
        dialog.inert = previousInert;
        const canFocus = element => element?.isConnected && element.getClientRects().length && !element.closest('[inert]');
        const replacement = [...document.querySelectorAll('[data-voters-option]')].find(element =>
            element.dataset.votersOption === String(activeOptionId) && canFocus(element)
        );
        const fallback = [
            document.querySelector('#detail-overlay.active .detail-sheet'),
            document.getElementById('rankings-heading'),
            document.getElementById('stays-heading')
        ].find(canFocus);
        const target = canFocus(opener) ? opener : replacement || fallback;
        activeOptionId = null;
        opener = null;
        target?.focus({ preventScroll: true });
    });
    document.body.append(dialog);
}

export function openVotersDialog(optionId, trigger) {
    const option = state.options.find(item => String(item.id) === String(optionId));
    if (!option) return;
    if (!dialog) createDialog();
    activeOptionId = option.id;
    opener = trigger;
    renderList(option);
    if (!dialog.open) {
        previousOverflow = document.body.style.overflow;
        previousInert = dialog.inert;
        // The custom detail page may have marked an existing, closed dialog
        // inert with the rest of the background. A native modal must be active.
        dialog.inert = false;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
    }
    dialog.querySelector('.voters-dialog__close').focus({ preventScroll: true });
}

export function refreshVotersDialog() {
    if (!dialog?.open) return;
    const option = state.options.find(item => String(item.id) === String(activeOptionId));
    if (!option) dialog.close();
    else renderList(option);
}

function renderList(option) {
    dialog.querySelector('.voters-dialog__stay').textContent = option.title || t('common.stay');
    dialog.querySelector('.voters-dialog__count').textContent = formatVotes(option.voters?.length || 0);
    const list = dialog.querySelector('.voters-dialog__list');
    const rows = document.createDocumentFragment();
    (option.voters || []).forEach((name, index) => {
        const email = option.voterEmails?.[index] || '';
        const row = document.createElement('li');
        row.className = 'voters-dialog__row';
        const avatar = document.createElement('span');
        avatar.className = 'voters-dialog__avatar';
        avatar.style.setProperty('--avatar-color', avatarColor(email || name));
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = getInitials(name);
        const label = document.createElement('span');
        label.className = 'voters-dialog__name';
        label.textContent = name || t('common.teamMember');
        row.append(avatar, label);
        if (email && email === state.userEmail) {
            const own = document.createElement('span');
            own.className = 'voters-dialog__you';
            own.textContent = t('votes.yours');
            row.append(own);
        }
        rows.append(row);
    });
    if (!rows.childNodes.length) {
        const empty = document.createElement('li');
        empty.className = 'voters-dialog__empty';
        empty.textContent = t('votes.emptyList');
        rows.append(empty);
    }
    list.replaceChildren(rows);
}
