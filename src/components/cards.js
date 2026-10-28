import { state } from '../state.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';

window.openDetail = openDetail;

const AVATAR_PALETTE = [
    '#647FA8', // Slate Blue
    '#648C79', // Sage Green
    '#B87983', // Dusty Rose
    '#B58A45', // Muted Amber
    '#8A78B5', // Lavender
    '#B97655', // Terracotta
    '#4E9290', // Teal
    '#858B98'  // Cool Gray
];

function getDeterministicAvatarColor(identifier = '') {
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[index];
}

function getTwoInitials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function renderOptions(isNewItemAdded = false, newItemId = null, animateIn = true) {
    const container = document.getElementById('options-container');
    document.querySelectorAll('.options-count').forEach((countEl) => {
        countEl.textContent = String(state.options.length);
    });
    if (!container) return;

    const renderDOM = () => {
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        if (state.options.length === 0) {
            container.innerHTML = `
                <div class="empty-state-container" style="text-align: center; padding: 48px 20px; color: var(--md-sys-color-on-surface-variant);">
                    <span class="material-symbols-outlined" style="font-size: 3rem; color: var(--md-sys-color-primary); margin-bottom: 12px;">flights_and_hotels</span>
                    <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--md-sys-color-on-surface); margin-bottom: 4px;">Još nema dodanih smještaja</h3>
                    <p style="font-size: 0.880rem; color: var(--md-sys-color-outline);">Budite prvi koji će predložiti savršeni smještaj za putovanje!</p>
                </div>
            `;
            container.classList.add('loaded');
            return;
        }

        state.options.forEach((opt) => {
            const isSelected = state.selectedOptionIds.has(opt.id);
            const voters = opt.voters || [];
            const voterEmails = opt.voterEmails || [];
            const isBrandNew = isNewItemAdded && opt.id === newItemId;

            const cardEl = document.createElement('div');
            cardEl.className = `option-card animate-item ${isSelected ? 'selected' : ''} ${isBrandNew ? 'new-item' : ''}`;
            cardEl.dataset.id = opt.id;
            cardEl.setAttribute('onclick', `openDetail('${opt.id}')`);

            const creatorUser = state.whitelistedUsers.find(u => u.email === opt.created_by);
            const creatorName = creatorUser ? creatorUser.name : (opt.created_by || 'Nepoznato');

            const rawAmount = opt.price ? opt.price.replace('€', '').trim() : 'N/A';
            const displayPrice = rawAmount !== 'N/A' ? `${rawAmount}€` : 'N/A';

            let votersHtml = '';
            if (voters.length > 0) {
                const maxVisible = 3;
                const visibleCount = Math.min(voters.length, maxVisible);
                const remainingCount = voters.length - visibleCount;

                let avatarCircles = '';
                for (let i = 0; i < visibleCount; i++) {
                    const voterName = voters[i];
                    const voterEmail = voterEmails[i] || voterName;
                    const initials = getTwoInitials(voterName);
                    const color = getDeterministicAvatarColor(voterEmail);
                    avatarCircles += `<div class="voter-avatar" style="--avatar-color: ${color};" title="${voterName}">${initials}</div>`;
                }

                const moreCircle = remainingCount > 0
                    ? `<div class="voter-avatar more-count" title="+${remainingCount} još">+${remainingCount}</div>`
                    : '';

                votersHtml = `
                    <span class="voters-label">Glasali:</span>
                    <div class="voters-avatar-stack">
                        ${avatarCircles}
                        ${moreCircle}
                    </div>
                `;
            } else {
                votersHtml = `
                    <span class="voters-label">Glasali:</span>
                    <span class="voters-empty-text">Još nitko</span>
                `;
            }

            cardEl.innerHTML = `
                <div class="card-cover-container">
                  <button class="card-heart-btn ${isSelected ? 'voted' : ''}" type="button" 
                          aria-label="Glasaj za ovaj smještaj"
                          aria-pressed="${isSelected}"
                          onclick="event.stopPropagation(); toggleVote('${opt.id}')">
                    <span class="material-symbols-outlined">favorite</span>
                    <span class="vote-heart-particles" aria-hidden="true"></span>
                  </button>
                  <img class="card-cover" src="${opt.image}" alt="${opt.title}" loading="lazy" onError="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80'" />
                  <div class="price-badge"><span class="material-symbols-outlined" style="font-size: 0.95rem; font-variation-settings: 'FILL' 1, 'wght' 500; vertical-align: -2px;">local_offer</span> ${displayPrice}</div>
                </div>
                <div class="card-body">
                  <div class="card-main-info">
                    <div class="card-title-group">
                      <h4 class="card-title">${opt.title}</h4>
                      <span class="card-creator-subtitle">Dodao: ${creatorName}</span>
                    </div>
                  </div>
                  <div class="voters-row">
                    ${votersHtml}
                  </div>
                </div>
            `;
            fragment.appendChild(cardEl);
        });

        container.appendChild(fragment);
        container.classList.add('loaded');
    };

    if (animateIn && !isNewItemAdded) {
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
    const voters = opt.voters || [];
    const voterEmails = opt.voterEmails || [];

    cardEl.classList.toggle('selected', isSelected);

    const heartBtn = cardEl.querySelector('.card-heart-btn');
    if (heartBtn) {
        heartBtn.classList.toggle('voted', isSelected);
        heartBtn.setAttribute('aria-pressed', String(isSelected));
    }

    const votersRow = cardEl.querySelector('.voters-row');
    if (votersRow) {
        if (voters.length > 0) {
            const maxVisible = 3;
            const visibleCount = Math.min(voters.length, maxVisible);
            const remainingCount = voters.length - visibleCount;

            let avatarCircles = '';
            for (let i = 0; i < visibleCount; i++) {
                const voterName = voters[i];
                const voterEmail = voterEmails[i] || voterName;
                const initials = getTwoInitials(voterName);
                const color = getDeterministicAvatarColor(voterEmail);
                avatarCircles += `<div class="voter-avatar" style="--avatar-color: ${color};" title="${voterName}">${initials}</div>`;
            }

            const moreCircle = remainingCount > 0
                ? `<div class="voter-avatar more-count" title="+${remainingCount} još">+${remainingCount}</div>`
                : '';

            votersRow.innerHTML = `
                <span class="voters-label">Glasali:</span>
                <div class="voters-avatar-stack">
                    ${avatarCircles}
                    ${moreCircle}
                </div>
            `;
        } else {
            votersRow.innerHTML = `
                <span class="voters-label">Glasali:</span>
                <span class="voters-empty-text">Još nitko</span>
            `;
        }
    }
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