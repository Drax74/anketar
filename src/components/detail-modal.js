import { state } from '../state.js';
import { updateOption } from '../services/api.js';
import { safeWebUrl } from '../shared/helpers/url.js';
import { isVotePending } from '../shared/helpers/votes.js';
import { renderVoters } from './voters.js';
import { showToast } from './toast.js';
import { renderOptions, findOptionCard } from './cards.js';
import {
    animateDetailOpen,
    animateDetailClose,
    cancelDetailTransition
} from '../animations/detail-transition.js';

const mobileDetail = window.matchMedia('(max-width: 1023px)');

let detailVersion = 0;
let closeTask = null;
let backPending = false;
let pageLock = null;
let restoreScrollAnchor = null;

function lockDetailPage(overlay) {
    if (pageLock) return;

    restoreScrollAnchor?.();

    const body = document.body;
    const properties = [
        'overflow', 'position', 'top', 'left', 'right', 'width'
    ];

    pageLock = {
        scrollY: window.scrollY,
        overflowAnchor: document.documentElement.style.overflowAnchor,
        focus: document.activeElement,
        styles: Object.fromEntries(
            properties.map(key => [key, body.style[key]])
        ),
        background: Array.from(body.children)
            .filter(element =>
                element !== overlay &&
                !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)
            )
            .map(element => [element, element.inert])
    };

    document.documentElement.style.overflowAnchor = 'none';

    pageLock.background.forEach(([element]) => {
        element.inert = true;
    });

    body.style.overflow = 'hidden';

    if (mobileDetail.matches) {
        body.style.position = 'fixed';
        body.style.top = `-${pageLock.scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
    }
}

function unlockDetailPage(optionId) {
    if (!pageLock) return;

    const saved = pageLock;
    pageLock = null;

    Object.assign(document.body.style, saved.styles);

    saved.background.forEach(([element, inert]) => {
        element.inert = inert;
    });

    window.scrollTo({
        top: saved.scrollY,
        behavior: 'instant'
    });

    let restored = false;

    const restore = () => {
        if (restored) return;
        restored = true;

        document.documentElement.style.overflowAnchor = saved.overflowAnchor;

        if (restoreScrollAnchor === restore) {
            restoreScrollAnchor = null;
        }
    };

    restoreScrollAnchor = restore;
    requestAnimationFrame(restore);

    const focus =
        saved.focus?.isConnected && saved.focus !== document.body
            ? saved.focus
            : findOptionCard(optionId)?.querySelector('.card-heart-btn');

    focus?.focus({ preventScroll: true });
}

function applyDetailLayout(overlay, sheet) {
    const mobile = mobileDetail.matches;

    overlay.classList.toggle('detail-page', mobile);
    sheet.classList.toggle('detail-page__sheet', mobile);

    const cover = sheet.querySelector('.card-cover-container');
    const content = sheet.querySelector('.detail-content');
    const back = sheet.querySelector('.detail-close');
    const vote = sheet.querySelector('.card-heart-btn');

    cover.classList.toggle('detail-page__cover', mobile);
    cover.style.height = mobile
        ? ''
        : 'clamp(220px, 38vh, 340px)';

    content.classList.toggle('detail-page__content', mobile);
    content.style.padding = mobile ? '' : '24px';

    back.classList.toggle('detail-page__back', mobile);
    vote.classList.toggle('detail-page__vote', mobile);

    back.querySelector('.material-symbols-outlined').textContent =
        mobile ? 'arrow_back' : 'close';

    back.setAttribute(
        'aria-label',
        mobile ? 'Natrag na smještaje' : 'Zatvori'
    );

    sheet.setAttribute('role', mobile ? 'region' : 'dialog');

    if (mobile) {
        sheet.removeAttribute('aria-modal');
    } else {
        sheet.setAttribute('aria-modal', 'true');
    }

    sheet.tabIndex = -1;

    return mobile;
}

function rememberDetail(optionId) {
    const previous =
        history.state && typeof history.state === 'object'
            ? history.state
            : {};

    const entry = {
        ...previous,
        anketarDetail: { id: String(optionId) }
    };

    if (previous.anketarDetail) {
        history.replaceState(entry, '');
    } else {
        history.pushState(entry, '');
    }
}

function restoreDetailFromHistory() {
    backPending = false;

    const id = history.state?.anketarDetail?.id;

    if (
        id != null &&
        state.options.some(option => String(option.id) === String(id))
    ) {
        openDetail(id, { fromHistory: true });
    } else {
        closeDetail({ fromHistory: true });
    }
}

window.addEventListener('popstate', restoreDetailFromHistory);
window.addEventListener('poll:ready', restoreDetailFromHistory);

mobileDetail.addEventListener('change', () => {
    if (state.activeDetailId == null) return;

    if (closeTask) {
        closeDetail({ fromHistory: true, immediate: true });
        return;
    }

    detailVersion++;
    cancelDetailTransition();

    const overlay = document.getElementById('detail-overlay');
    const sheet = overlay?.querySelector('.detail-sheet');

    if (!sheet) return;

    if (applyDetailLayout(overlay, sheet)) {
        rememberDetail(state.activeDetailId);
    }
});

document.addEventListener('keydown', event => {
    if (state.activeDetailId == null) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
    }

    if (event.key === 'Tab') {
        const sheet = document.querySelector(
            '#detail-overlay .detail-sheet'
        );

        const items = Array.from(sheet.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)'
        )).filter(element => element.getClientRects().length);

        const first = items[0];
        const last = items.at(-1);

        if (!first) {
            event.preventDefault();
            sheet.focus({ preventScroll: true });
        } else if (
            event.shiftKey &&
            (
                document.activeElement === first ||
                document.activeElement === sheet
            )
        ) {
            event.preventDefault();
            last.focus();
        } else if (
            !event.shiftKey &&
            document.activeElement === last
        ) {
            event.preventDefault();
            first.focus();
        }
    }
});

export function openDetail(
    optionId,
    { fromHistory = false } = {}
) {
    const opt = state.options.find(
        item => String(item.id) === String(optionId)
    );
    if (!opt) return;

    const overlay = document.getElementById('detail-overlay');
    if (!overlay) return;

    if (
        String(state.activeDetailId) === String(opt.id) &&
        overlay.classList.contains('active') &&
        !closeTask
    ) {
        return;
    }

    const version = ++detailVersion;

    cancelDetailTransition();
    closeTask = null;
    state.activeDetailId = opt.id;

    const sourceImage = findOptionCard(opt.id)
        ?.querySelector('.card-cover');

    lockDetailPage(overlay);

    const isSelected = state.selectedOptionIds.has(opt.id);
    const voters = opt.voters || [];
    const voterEmails = opt.voterEmails || [];

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

    let linkText = 'Pogledaj ponudu ↗';
    let isAirbnb = false;
    let isBooking = false;

    if (opt.link) {
        try {
            const parsed = new URL(
                opt.link.startsWith('http')
                    ? opt.link
                    : `https://${opt.link}`
            );
            const host = parsed.hostname.toLowerCase();
            isAirbnb = host.includes('airbnb') || host.includes('abnb.me');
            isBooking = host.includes('booking') || host.includes('bkg.to');
        } catch {}

        if (isAirbnb) linkText = 'Pogledaj na Airbnb-u ↗';
        else if (isBooking) linkText = 'Pogledaj na Booking.com ↗';
    }

    const safeImage = safeWebUrl(
        opt.image,
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=85'
    );

    const isCreator = Boolean(
        state.userEmail &&
        opt.created_by &&
        opt.created_by.toLowerCase() === state.userEmail.toLowerCase()
    );

    const sheet = overlay.querySelector('.detail-sheet');

    if (sheet) {
        sheet.classList.add('accommodation-detail');
        sheet.innerHTML = `
            <div class="card-cover-container" style="height: clamp(220px, 38vh, 340px);">
                <button class="card-heart-btn ${isSelected ? 'voted' : ''}"
                        type="button"
                        aria-label="Glasaj"
                        aria-pressed="${isSelected}">
                    <span class="material-symbols-outlined">favorite</span>
                    <span class="vote-heart-particles" aria-hidden="true"></span>
                </button>

                <button
                    class="detail-close accommodation-detail__close"
                    type="button"
                    aria-label="Zatvori">
                    <span
                        class="material-symbols-outlined accommodation-detail__close-icon"
                        aria-hidden="true">close</span>
                </button>

                <img class="card-cover" alt="" />

                <div class="price-badge accommodation-detail__price">
                    <span class="material-symbols-outlined" style="font-size: 0.95rem; font-variation-settings: 'FILL' 1, 'wght' 500; vertical-align: -2px;">local_offer</span>
                    <span class="price-value"></span>
                </div>
            </div>

            <div class="detail-content" style="padding: 24px; display: flex; flex-direction: column; gap: 8px;">
                <div class="voters-row" style="display: flex; align-items: center; gap: 10px; min-height: 40px; border-top: none; padding-top: 0;"></div>

                <div id="detail-readonly-section" style="display: ${isCreator ? 'none' : 'block'};">
                    <h2 id="detail-title" class="detail-title" style="font-size: 1.35rem; font-weight: 600; color: var(--md-sys-color-on-surface); margin-bottom: 4px;"></h2>
                    <span class="card-creator-subtitle" style="font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);"></span>
                </div>

                <div id="detail-editable-section" style="display: ${isCreator ? 'block' : 'none'};">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Naziv smještaja</label>
                        <input type="text" id="edit-detail-title" class="input-field" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Cijena (€)</label>
                        <input type="text" id="edit-detail-price" class="input-field" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">URL slike</label>
                        <input type="text" id="edit-detail-image" class="input-field" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Napomena / Bilješka</label>
                        <textarea id="edit-detail-note" class="input-field"></textarea>
                    </div>
                    <button class="btn btn-primary" type="button">Spremi izmjene</button>
                </div>

                ${opt.note && !isCreator ? `
                    <div class="card-note-box" style="background: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-shape-corner-small); padding: 12px 16px; font-size: 0.88rem; color: var(--md-sys-color-on-surface-variant); display: flex; gap: 10px; align-items: flex-start;">
                        <span class="material-symbols-outlined" style="color: var(--md-sys-color-primary); font-size: 1.15rem;">chat_bubble</span>
                        <span class="detail-note-text"></span>
                    </div>
                ` : ''}

                ${opt.description && !isCreator ? `
                    <p style="font-size: 0.9rem; color: var(--md-sys-color-on-surface-variant); line-height: 1.5;"></p>
                ` : ''}

                ${safeWebUrl(opt.link) ? `
                    <a rel="noopener noreferrer"
                       target="_blank"
                       class="btn btn-primary"
                       style="margin-top: 16px; text-decoration: none; justify-content: center; display: inline-flex; align-items: center; gap: 6px;">${linkText}</a>
                ` : ''}
            </div>
        `;

        sheet.querySelector('.card-cover').src = safeImage;
        sheet.querySelector('.card-cover').alt = opt.title ?? '';
        sheet.querySelector('.price-value').textContent = displayPrice;
        sheet.querySelector('.detail-title').textContent =
            opt.title || 'Smještaj';
        sheet.querySelector('.card-creator-subtitle').textContent =
            `Dodao: ${creatorName}`;

        for (const field of ['title', 'price', 'image', 'note']) {
            sheet.querySelector(`#edit-detail-${field}`).value =
                opt[field] ?? '';
        }

        const note = sheet.querySelector('.detail-note-text');
        if (note) note.textContent = opt.note;

        const description = sheet.querySelector('.detail-content > p');
        if (description) description.textContent = opt.description;

        const link = sheet.querySelector('a');
        if (link) link.href = safeWebUrl(opt.link);

        sheet.querySelector('.card-heart-btn').addEventListener(
            'click',
            () => window.toggleVote(opt.id)
        );
        sheet.querySelector('.detail-close').addEventListener(
            'click',
            closeDetail
        );
        sheet.querySelector('#detail-editable-section button').addEventListener(
            'click',
            saveOptionDetails
        );

        const heartBtn = sheet.querySelector('.card-heart-btn');
        const pending = isVotePending(opt.id);

        heartBtn.disabled = pending;
        heartBtn.setAttribute('aria-busy', String(pending));

        renderVoters(
            sheet.querySelector('.voters-row'),
            voters,
            voterEmails
        );
    }

    if (!sheet) {
        state.activeDetailId = null;
        unlockDetailPage(opt.id);
        return;
    }

    const mobile = applyDetailLayout(overlay, sheet);
    sheet.scrollTop = 0;

    const targetImage = sheet.querySelector('.card-cover');

    if (
        mobile &&
        sourceImage?.complete &&
        sourceImage.naturalWidth > 0
    ) {
        targetImage.src = sourceImage.currentSrc || sourceImage.src;
    }

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    if (mobile && !fromHistory) {
        rememberDetail(opt.id);
    }

    if (mobile) {
        animateDetailOpen({
            sourceImage,
            targetImage,
            sheet
        }).then(completed => {
            if (completed && version === detailVersion) {
                sheet.focus({ preventScroll: true });
            }
        });
    } else {
        sheet.focus({ preventScroll: true });
    }
}

export function closeDetail({
                                fromHistory = false,
                                immediate = false
                            } = {}) {
    if (state.activeDetailId == null) {
        return Promise.resolve();
    }

    if (
        !fromHistory &&
        !immediate &&
        history.state?.anketarDetail
    ) {
        if (!backPending) {
            backPending = true;
            history.back();
        }

        return Promise.resolve();
    }

    if (closeTask && !immediate) return closeTask;

    backPending = false;

    if (immediate && history.state?.anketarDetail) {
        const entry = { ...history.state };
        delete entry.anketarDetail;
        history.replaceState(entry, '');
    }

    const version = ++detailVersion;
    const optionId = state.activeDetailId;
    const overlay = document.getElementById('detail-overlay');
    const sheet = overlay?.querySelector('.detail-sheet');

    closeTask = (async () => {
        let completed = true;

        if (
            !immediate &&
            overlay?.classList.contains('detail-page') &&
            sheet
        ) {
            completed = await animateDetailClose({
                sourceImage: findOptionCard(optionId)
                    ?.querySelector('.card-cover'),
                targetImage: sheet.querySelector('.card-cover'),
                sheet
            });
        } else {
            cancelDetailTransition();
        }

        if (!completed || version !== detailVersion) return;

        overlay?.classList.remove('active');
        overlay?.setAttribute('aria-hidden', 'true');

        state.activeDetailId = null;
        unlockDetailPage(optionId);
    })().finally(() => {
        if (version === detailVersion) {
            closeTask = null;
        }
    });

    return closeTask;
}

export function updateDetailModalIfOpen() {
    if (state.activeDetailId === null) return;

    const opt = state.options.find(
        item => String(item.id) === String(state.activeDetailId)
    );
    if (!opt) return;

    const overlay = document.getElementById('detail-overlay');
    if (!overlay || !overlay.classList.contains('active')) return;

    const isSelected = state.selectedOptionIds.has(opt.id);
    const heartBtn = overlay.querySelector('.card-heart-btn');

    if (heartBtn) {
        const pending = isVotePending(opt.id);

        heartBtn.classList.toggle('voted', isSelected);
        heartBtn.setAttribute('aria-pressed', String(isSelected));
        heartBtn.disabled = pending;
        heartBtn.setAttribute('aria-busy', String(pending));
    }

    const votersRow = overlay.querySelector('.voters-row');
    if (votersRow) {
        renderVoters(
            votersRow,
            opt.voters || [],
            opt.voterEmails || []
        );
    }
}

export async function saveOptionDetails() {
    const optionId = state.activeDetailId;
    if (optionId == null) return;

    const opt = state.options.find(
        option => String(option.id) === String(optionId)
    );
    if (!opt) return;

    const saveButton = document.querySelector(
        '#detail-editable-section button'
    );

    if (saveButton?.disabled) return;

    const editTitle = document
        .getElementById('edit-detail-title')?.value.trim();

    const rawPrice = document
        .getElementById('edit-detail-price')?.value.trim();

    const editImage = document
        .getElementById('edit-detail-image')?.value.trim();

    const editNote = document
        .getElementById('edit-detail-note')?.value.trim();

    if (!editTitle) {
        showToast('Naziv smještaja ne može biti prazan.', 'error');
        return;
    }

    const editPrice = rawPrice && !rawPrice.includes('€')
        ? `${rawPrice}€`
        : (rawPrice || 'N/A');

    const updates = {
        title: editTitle,
        price: editPrice,
        image: editImage ||
            'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',
        note: editNote || ''
    };

    if (saveButton) saveButton.disabled = true;

    try {
        const savedOptions = await updateOption(optionId, updates);

        if (!Array.isArray(savedOptions) || savedOptions.length !== 1) {
            throw new Error(
                'The accommodation was not updated. It may no longer exist or you may not have permission.'
            );
        }

        const savedOption = savedOptions[0];

        state.options = state.options.map(option =>
            String(option.id) === String(optionId)
                ? { ...option, ...savedOption }
                : option
        );

        await renderOptions();

        if (String(state.activeDetailId) === String(optionId)) {
            closeDetail();
        }

        showToast('Izmjene uspješno spremljene!');
    } catch (error) {
        console.error('Failed to save option edits:', error);
        showToast('Greška pri spremanju izmjena.', 'error');
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}