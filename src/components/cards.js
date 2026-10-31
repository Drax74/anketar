import { safeWebUrl } from '../shared/helpers/url.js';
import { renderVoters } from './voters.js';
import { state } from '../state.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';
import {isVotePending} from "../shared/helpers/votes";

window.openDetail = openDetail;

export async function renderOptions(
    isNewItemAdded = false,
    newItemId = null,
    animateIn = true
) {
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
            cardEl.addEventListener('click', () => openDetail(opt.id));

            const creatorUser = state.whitelistedUsers.find(
                user => user.email === opt.created_by
            );
            const creatorName = creatorUser
                ? creatorUser.name
                : (opt.created_by || 'Nepoznato');

            const rawAmount = opt.price
                ? opt.price.replace('€', '').trim()
                : 'N/A';
            const displayPrice = rawAmount !== 'N/A'
                ? `${rawAmount}€`
                : 'N/A';

            cardEl.innerHTML = `
                <div class="card-cover-container">
                    <button class="card-heart-btn ${isSelected ? 'voted' : ''}"
                            type="button"
                            aria-label="Glasaj za ovaj smještaj"
                            aria-pressed="${isSelected}">
                        <span class="material-symbols-outlined">favorite</span>
                        <span class="vote-heart-particles" aria-hidden="true"></span>
                    </button>
                    <img class="card-cover" alt="" loading="lazy" />
                    <div class="price-badge">
                        <span class="material-symbols-outlined" style="font-size: 0.95rem; font-variation-settings: 'FILL' 1, 'wght' 500; vertical-align: -2px;">local_offer</span>
                        <span class="price-value"></span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-main-info">
                        <div class="card-title-group">
                            <h4 class="card-title"></h4>
                            <span class="card-creator-subtitle"></span>
                        </div>
                    </div>
                    <div class="voters-row"></div>
                </div>
            `;

            cardEl.querySelector('.card-title').textContent = opt.title ?? '';
            cardEl.querySelector('.card-creator-subtitle').textContent =
                `Dodao: ${creatorName}`;
            cardEl.querySelector('.price-value').textContent = displayPrice;

            const image = cardEl.querySelector('.card-cover');
            const fallbackImage =
                'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';

            image.alt = opt.title ?? '';
            image.addEventListener('error', () => {
                image.src = fallbackImage;
            }, { once: true });
            image.src = safeWebUrl(opt.image, fallbackImage);

            cardEl.querySelector('.card-heart-btn').addEventListener(
                'click',
                event => {
                    event.stopPropagation();
                    window.toggleVote(opt.id);
                }
            );

            const heartBtn = cardEl.querySelector('.card-heart-btn');
            const pending = isVotePending(opt.id);

            heartBtn.disabled = pending;
            heartBtn.setAttribute('aria-busy', String(pending));

            renderVoters(
                cardEl.querySelector('.voters-row'),
                voters,
                voterEmails
            );

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
    const opt = state.options.find(
        option => String(option.id) === String(optionId)
    );
    if (!opt) return;

    const cardEl = findOptionCard(optionId);
    if (!cardEl) return;

    const isSelected = state.selectedOptionIds.has(opt.id);
    const voters = opt.voters || [];
    const voterEmails = opt.voterEmails || [];

    cardEl.classList.toggle('selected', isSelected);

    const heartBtn = cardEl.querySelector('.card-heart-btn');
    if (heartBtn) {
        const pending = isVotePending(opt.id);

        heartBtn.classList.toggle('voted', isSelected);
        heartBtn.setAttribute('aria-pressed', String(isSelected));
        heartBtn.disabled = pending;
        heartBtn.setAttribute('aria-busy', String(pending));
    }

    const votersRow = cardEl.querySelector('.voters-row');
    if (votersRow) {
        renderVoters(votersRow, voters, voterEmails);
    }
}

export function scrollToCardIfNeeded(optionId) {
    setTimeout(() => {
        const cardEl = findOptionCard(optionId);
        if (!cardEl) return;

        const rect = cardEl.getBoundingClientRect();
        const visible =
            rect.top >= 84 && rect.bottom <= window.innerHeight - 110;

        if (!visible) {
            cardEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }, 360);
}

export function findOptionCard(optionId) {
    return Array.from(document.querySelectorAll('.option-card'))
        .find(card => card.dataset.id === String(optionId));
}