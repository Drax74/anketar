import { t } from '../i18n.js';
import { formatVotes, getInitials } from '../shared/helpers/format.js';
import { avatarColor } from '../shared/helpers/avatars.js';
import { openVotersDialog } from './voters-dialog.js';

export function renderVoters(container, voters = [], voterEmails = [], { selected = false, optionId = null } = {}) {
    container.replaceChildren();
    container.classList.add('voter-stack');

    if (voters.length) {
        const stack = document.createElement(optionId == null ? 'div' : 'button');
        stack.className = 'voter-stack__avatars';
        if (optionId != null) {
            stack.type = 'button';
            stack.dataset.votersOption = String(optionId);
            stack.setAttribute('aria-label', t('votes.viewVoters', { votes: formatVotes(voters.length) }));
            stack.setAttribute('aria-haspopup', 'dialog');
            stack.addEventListener('click', event => {
                event.stopPropagation();
                openVotersDialog(optionId, stack);
            });
        }
        voters.slice(0, 3).forEach((name, index) => {
            const text = String(name ?? '');
            const identifier = String(voterEmails[index] || text);
            const avatar = document.createElement('span');
            avatar.className = 'voter-stack__avatar';
            avatar.style.setProperty('--avatar-color', avatarColor(identifier));
            avatar.title = text;
            avatar.textContent = getInitials(text);
            stack.append(avatar);
        });
        if (voters.length > 3) {
            const more = document.createElement('span');
            more.className = 'voter-stack__avatar voter-stack__avatar--more';
            more.textContent = t('votes.more', { count: voters.length - 3 });
            stack.append(more);
        }
        container.append(stack);
    }

    const summary = document.createElement('span');
    summary.className = 'voter-stack__summary';
    summary.textContent = voters.length ? formatVotes(voters.length) : t('votes.first');
    container.append(summary);
    if (selected) {
        const selection = document.createElement('span');
        selection.className = 'voter-stack__selection';
        selection.textContent = t('votes.yours');
        container.append(selection);
    }
}
