import { state } from '../state.js';
import { renderLeaderboard } from './leaderboard.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';

window.openDetail = openDetail;

export async function renderOptions(isNewItemAdded = false, newItemId = null, animateIn = true) {
    const container = document.getElementById('options-container');
    const countEl = document.getElementById('options-count');
    if (countEl) countEl.innerText = state.options.length;
    if (!container) return;

    container.querySelectorAll('.loading-card').forEach(el => el.remove());
    renderLeaderboard(false);

    const totalWhitelistCount = state.whitelistedUsers.length > 0 ? state.whitelistedUsers.length : 1;

    const renderDOM = () => {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        state.options.forEach((opt) => {
            const isSelected = state.selectedOptionIds.has(opt.id);
            const votes = opt.voters ? opt.voters.length : 0;
            const pct = Math.min(100, Math.round((votes / totalWhitelistCount) * 100)) || 0;
            const isBrandNew = isNewItemAdded && opt.id === newItemId;

            const cardEl = document.createElement('div');
            cardEl.className = `option-card animate-item ${isSelected ? 'selected' : ''} ${isBrandNew ? 'new-item' : ''}`;
            cardEl.dataset.id = opt.id;
            cardEl.setAttribute('onclick', `toggleVote('${opt.id}')`);

            const creatorUser = state.whitelistedUsers.find(u => u.email === opt.created_by);
            const creatorName = creatorUser ? creatorUser.name : (opt.created_by || 'Nepoznato');
            const creatorHtml = `<div class="voters-container" style="margin-bottom: 4px;"><span>Dodao:</span> <span class="voter-tag" style="background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);">${creatorName}</span></div>`;
            const votersList = opt.voters?.length ? opt.voters.map(v => `<span class="voter-tag">${v}</span>`).join('') : '<em>Nema glasova</em>';
            const noteHtml = opt.note ? `<div class="card-note-box"><span class="material-symbols-outlined">chat_bubble</span><span>${opt.note}</span></div>` : '';

            cardEl.innerHTML = `
                <div class="card-cover-container" onclick="event.stopPropagation(); openDetail('${opt.id}')">
                  <img class="card-cover" src="${opt.image}" alt="${opt.title}" loading="lazy" onError="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80'" />
                  <div class="price-badge">${opt.price}</div>
                  <button class="cover-detail-button" type="button" onclick="event.stopPropagation(); openDetail('${opt.id}')" aria-label="View details">Pogledaj detalje ↗</button>
                </div>
                <div class="card-body">
                  ${noteHtml}
                  <div class="card-header-row">
                    <div class="checkbox-custom"></div>
                    <a href="${opt.link}" target="_blank" class="card-title" onclick="event.stopPropagation()">${opt.title} ↗</a>
                  </div>
                  <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%;"></div></div>
                  <div class="progress-info"><span>Broj glasova: ${votes}</span><span>${pct}%</span></div>
                  ${creatorHtml}
                  <div class="voters-container voters-list-row"><span>Glasali:</span> ${votersList}</div>
                </div>
            `;
            fragment.appendChild(cardEl);
        });

        container.appendChild(fragment);
        container.classList.add('loaded');
    };

    if (animateIn && !isNewItemAdded) {
        // Use smooth physics for manual sorting reorder
        await animateLayoutTransition(container, renderDOM, {
            selector: '.option-card',
            stiffness: 190,
            damping: 27,
            fadeIn: true
        });
    } else {
        renderDOM();
    }
}

export function updateCardSubelements(optionId) {
    const opt = state.options.find(o => String(o.id) === String(optionId));
    if (!opt) return;

    const cardEl = document.querySelector(`.option-card[data-id="${optionId}"]`);
    if (!cardEl) return;

    const isSelected = state.selectedOptionIds.has(opt.id);
    const votes = opt.voters ? opt.voters.length : 0;
    const totalWhitelistCount = state.whitelistedUsers.length > 0 ? state.whitelistedUsers.length : 1;
    const pct = Math.min(100, Math.round((votes / totalWhitelistCount) * 100)) || 0;

    cardEl.classList.toggle('selected', isSelected);

    const fillEl = cardEl.querySelector('.progress-bar-fill');
    if (fillEl) fillEl.style.width = `${pct}%`;

    const progressInfoEl = cardEl.querySelector('.progress-info');
    if (progressInfoEl) {
        progressInfoEl.innerHTML = `<span>Broj glasova: ${votes}</span><span>${pct}%</span>`;
    }

    const votersListContainer = cardEl.querySelector('.voters-list-row');
    if (votersListContainer) {
        const votersListHtml = opt.voters?.length
            ? opt.voters.map(v => `<span class="voter-tag">${v}</span>`).join('')
            : '<em>Nema glasova</em>';
        votersListContainer.innerHTML = `<span>Glasali:</span> ${votersListHtml}`;
    }

    renderLeaderboard();
}

export function scrollToCardIfNeeded(optionId) {
    setTimeout(() => {
        const cardEl = document.querySelector(`.option-card[data-id="${optionId}"]`);
        if (!cardEl) return;
        const rect = cardEl.getBoundingClientRect();
        const visible = rect.top >= 84 && rect.bottom <= window.innerHeight - 110;
        if (!visible) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 360);
}