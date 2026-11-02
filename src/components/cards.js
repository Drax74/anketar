import { t, htmlText } from '../i18n.js';
import { setAccommodationImage } from '../shared/helpers/images.js';
import { formatPrice } from '../shared/helpers/format.js';
import { isVotePending } from '../shared/helpers/votes.js';
import { renderVoters } from './voters.js';
import { state } from '../state.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';
import { renderAvailabilityBadge } from './availability-badge.js';

export async function renderOptions(isNewItemAdded = false, newItemId = null, animateIn = true) {
    const container = document.getElementById('options-container');
    document.querySelectorAll('.options-count').forEach(element => { element.textContent = String(state.options.length); });
    if (!container) return;

    const renderDOM = () => {
        container.replaceChildren();
        if (!state.options.length) {
            container.innerHTML = `<div class="poll-status"><span class="material-symbols-outlined poll-status__icon" aria-hidden="true">&#xe58a;</span><h3 class="poll-status__title">${htmlText('stays.emptyTitle')}</h3><p class="poll-status__message">${htmlText('stays.emptyDescription')}</p><button class="btn btn-primary poll-status__action" type="button">${htmlText('stays.add')}</button></div>`;
            container.querySelector('button').addEventListener('click', () => window.openAddModal());
            return;
        }

        const fragment = document.createDocumentFragment();
        state.options.forEach((option, index) => {
            const selected = state.selectedOptionIds.has(option.id);
            const card = document.createElement('article');
            card.className = `option-card stay-card animate-item${selected ? ' stay-card--selected selected' : ''}${isNewItemAdded && option.id === newItemId ? ' stay-card--new' : ''}`;
            card.dataset.id = option.id;
            card.addEventListener('click', () => openDetail(option.id));
            card.innerHTML = `
                <div class="card-cover-container stay-card__cover">
                    <span class="stay-card__availability" hidden></span>
                    <img class="card-cover stay-card__image" alt="" loading="lazy" decoding="async" /><span class="stay-card__placeholder" hidden><span class="material-symbols-outlined" aria-hidden="true">&#xe58a;</span>${htmlText('common.imageUnavailable')}</span>
                    <button class="card-heart-btn vote-button${selected ? ' voted vote-button--selected' : ''}" type="button" aria-label="${htmlText('votes.add')}" aria-pressed="${selected}">
                        <span class="material-symbols-outlined vote-button__icon" aria-hidden="true">&#xe87e;</span>
                        <span class="vote-heart-particles" aria-hidden="true"></span>
                    </button>
                    <div class="price-badge"><span class="price-value"></span></div>
                </div>
                <div class="stay-card__body">
                    <h3 class="stay-card__title"><button class="stay-card__title-button" type="button"></button></h3>
                    <p class="stay-card__creator"></p>
                    <div class="voters-row stay-card__voters"></div>
                </div>`;
            card.querySelector('.stay-card__title-button').textContent = option.title || t('common.stay');
            const creator = state.whitelistedUsers.find(user => user.email === option.created_by);
            card.querySelector('.stay-card__creator').textContent = t('stay.creator', { name: creator?.name || option.creatorName || t('common.teamMember') });
            card.querySelector('.price-value').textContent = formatPrice(option.price);
            renderAvailabilityBadge(card.querySelector('.stay-card__availability'), option);
            const image = card.querySelector('.card-cover');
            const placeholder = card.querySelector('.stay-card__placeholder');
            image.alt = option.title || t('common.stay');
            placeholder.hidden = true;
            // The first row can be the LCP element; discover it without lazy-load delay.
            if (index < 3) {
                image.loading = 'eager';
                image.fetchPriority = index === 0 ? 'high' : 'auto';
            }
            setAccommodationImage(image, option.image, () => { placeholder.hidden = false; });
            card.querySelector('.card-heart-btn').addEventListener('click', event => {
                event.stopPropagation();
                window.toggleVote(option.id);
            });
            updateVoteControls(card, option);
            fragment.append(card);
        });
        container.append(fragment);
    };

    if (animateIn && !isNewItemAdded) {
        await animateLayoutTransition(container, renderDOM, { selector: '.stay-card', stiffness: 230, damping: 30, fadeIn: true });
    } else {
        renderDOM();
    }
}

function updateVoteControls(card, option) {
    const selected = state.selectedOptionIds.has(option.id);
    const pending = isVotePending(option.id);
    card.classList.toggle('selected', selected);
    card.classList.toggle('stay-card--selected', selected);
    const button = card.querySelector('.card-heart-btn');
    button.classList.toggle('voted', selected);
    button.classList.toggle('vote-button--selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', selected ? t('votes.remove') : t('votes.add'));
    button.disabled = pending;
    button.setAttribute('aria-busy', String(pending));
    renderVoters(card.querySelector('.voters-row'), option.voters || [], option.voterEmails || [], { selected, optionId: option.id });
}

export function updateCardSubelements(optionId) {
    const option = state.options.find(item => String(item.id) === String(optionId));
    const card = findOptionCard(optionId);
    if (option && card) updateVoteControls(card, option);
}

export function scrollToCardIfNeeded(optionId) {
    setTimeout(() => {
        const card = findOptionCard(optionId);
        if (!card) return;
        const bounds = card.getBoundingClientRect();
        if (bounds.top < 84 || bounds.bottom > window.innerHeight - 100) {
            card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
        }
    }, 300);
}

export function findOptionCard(optionId) {
    return Array.from(document.querySelectorAll('.option-card')).find(card => card.dataset.id === String(optionId));
}
