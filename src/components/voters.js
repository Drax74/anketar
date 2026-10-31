const AVATAR_PALETTE = [
    '#647FA8', '#648C79', '#B87983', '#B58A45',
    '#8A78B5', '#B97655', '#4E9290', '#858B98'
];

// Names are assigned as text, never interpreted as HTML.
export function renderVoters(container, voters = [], voterEmails = []) {
    container.replaceChildren();

    const label = document.createElement('span');
    label.className = 'voters-label';
    label.textContent = 'Glasali:';
    container.append(label);

    if (!voters.length) {
        const empty = document.createElement('span');
        empty.className = 'voters-empty-text';
        empty.textContent = 'Još nitko';
        container.append(empty);
        return;
    }

    const stack = document.createElement('div');
    stack.className = 'voters-avatar-stack';

    voters.slice(0, 3).forEach((name, index) => {
        const text = String(name ?? '');
        const identifier = String(voterEmails[index] || text);

        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
            hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
        }

        const parts = text.trim().split(/\s+/).filter(Boolean);
        const initials = !parts.length ? '?' : parts.length === 1
            ? parts[0].substring(0, 2).toUpperCase()
            : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

        const avatar = document.createElement('div');
        avatar.className = 'voter-avatar';
        avatar.style.setProperty(
            '--avatar-color',
            AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
        );
        avatar.title = text;
        avatar.textContent = initials;
        stack.append(avatar);
    });

    if (voters.length > 3) {
        const more = document.createElement('div');
        more.className = 'voter-avatar more-count';
        more.title = `+${voters.length - 3} još`;
        more.textContent = `+${voters.length - 3}`;
        stack.append(more);
    }

    container.append(stack);
}