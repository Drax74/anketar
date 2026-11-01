import { formatVotes, getInitials } from '../shared/helpers/format.js';

const AVATAR_PALETTE = ['#647FA8', '#648C79', '#B87983', '#B58A45', '#8A78B5', '#B97655', '#4E9290', '#858B98'];

export function renderVoters(container, voters = [], voterEmails = [], { selected = false } = {}) {
    container.replaceChildren();
    container.classList.add('voter-stack');

    if (voters.length) {
        const stack = document.createElement('div');
        stack.className = 'voter-stack__avatars';
        voters.slice(0, 3).forEach((name, index) => {
            const text = String(name ?? '');
            const identifier = String(voterEmails[index] || text);
            let hash = 0;
            for (let i = 0; i < identifier.length; i++) hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
            const avatar = document.createElement('span');
            avatar.className = 'voter-stack__avatar';
            avatar.style.setProperty('--avatar-color', AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]);
            avatar.title = text;
            avatar.textContent = getInitials(text);
            stack.append(avatar);
        });
        if (voters.length > 3) {
            const more = document.createElement('span');
            more.className = 'voter-stack__avatar voter-stack__avatar--more';
            more.textContent = `+${voters.length - 3}`;
            stack.append(more);
        }
        container.append(stack);
    }

    const summary = document.createElement('span');
    summary.className = 'voter-stack__summary';
    summary.textContent = voters.length ? formatVotes(voters.length) : 'Budi prvi koji će glasati';
    container.append(summary);
    if (selected) {
        const selection = document.createElement('span');
        selection.className = 'voter-stack__selection';
        selection.textContent = 'Tvoj glas';
        container.append(selection);
    }
}
