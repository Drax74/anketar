import { state } from '../state.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';

window.openDetail = openDetail;

export async function renderLeaderboard(animateTransition = true) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    const totalWhitelistCount = state.whitelistedUsers.length > 0 ? state.whitelistedUsers.length : 1;

    const votedOptions = [...state.options]
        .filter(opt => opt.voters && opt.voters.length > 0)
        .sort((a, b) => b.voters.length - a.voters.length)
        .slice(0, 3);

    const renderDOM = () => {
        if (votedOptions.length === 0) {
            container.innerHTML = `<div class="leaderboard-empty">Još nema glasova. Budi prvi koji će pokrenuti ljestvicu! 🗳️</div>`;
            return;
        }

        let html = '';
        votedOptions.forEach((opt, index) => {
            const votes = opt.voters.length;
            const pct = Math.min(100, Math.round((votes / totalWhitelistCount) * 100)) || 0;
            const rank = index + 1;
            const zIndexVal = 10 - index;

            html += `
                <div class="leaderboard-item animate-item" data-id="${opt.id}" style="z-index: ${zIndexVal}; position: relative;">
                    <div class="leaderboard-rank">${rank}</div>
                    <div class="leaderboard-info">
                        <span class="leaderboard-item-title" onclick="openDetail('${opt.id}')">${opt.title}</span>
                        <div class="leaderboard-bar-bg">
                            <div class="leaderboard-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                    <div class="leaderboard-votes-count">${votes} glas${votes === 1 ? '' : 'a'}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    };

    if (animateTransition && container.children.length > 0 && !container.querySelector('.leaderboard-empty')) {
        await animateLayoutTransition(container, renderDOM, { selector: '.leaderboard-item', stiffness: 260, damping: 25, fadeIn: true });
    } else {
        renderDOM();
    }
}