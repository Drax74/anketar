import { t, htmlText } from '../i18n.js';
import { setAccommodationImage } from '../shared/helpers/images.js';
import { materialIcon } from '../shared/helpers/icons.js';
import { state } from '../state.js';
import { updateOption } from '../services/api.js';
import { safeWebUrl, getListingSource } from '../shared/helpers/url.js';
import { formatPrice } from '../shared/helpers/format.js';
import { renderLeaderboard } from './leaderboard.js';
import { isVotePending } from '../shared/helpers/votes.js';
import { renderVoters } from './voters.js';
import { showToast } from './toast.js';
import { renderOptions, findOptionCard } from './cards.js';
import { canEditAccommodation } from '../shared/helpers/permissions.js';
import { renderAvailabilityBadge, supportsAvailability } from './availability-badge.js';
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
    content.style.padding = '';

    back.classList.toggle('detail-page__back', mobile);
    vote.classList.toggle('detail-page__vote', mobile);
    sheet.querySelector('.accommodation-detail__availability').classList.toggle('detail-page__availability', mobile);

    back.querySelector('.material-symbols-outlined').textContent =
        materialIcon(mobile ? 'arrow_back' : 'close');

    back.setAttribute(
        'aria-label',
        mobile ? t('detail.back') : t('common.close')
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

export function openDetail(optionId, { fromHistory = false } = {}) {
    const option = state.options.find(item => String(item.id) === String(optionId));
    if (!option) return;
    const overlay = document.getElementById('detail-overlay');
    if (!overlay) return;
    if (String(state.activeDetailId) === String(option.id) && overlay.classList.contains('active') && !closeTask) return;

    const version = ++detailVersion;
    cancelDetailTransition();
    closeTask = null;
    state.activeDetailId = option.id;
    const sourceImage = findDetailSource(option.id);
    lockDetailPage(overlay);
    const sheet = overlay.querySelector('.detail-sheet');
    if (!sheet) {
        state.activeDetailId = null;
        unlockDetailPage(option.id);
        return;
    }

    sheet.classList.add('accommodation-detail');
    sheet.innerHTML = `
        <div class="card-cover-container accommodation-detail__cover">
            <span class="accommodation-detail__availability" hidden></span>
            <img class="card-cover accommodation-detail__image" alt="" /><span class="accommodation-detail__placeholder" hidden><span class="material-symbols-outlined" aria-hidden="true">&#xe58a;</span>${htmlText('common.imageUnavailable')}</span>
            <button class="card-heart-btn vote-button" type="button" aria-label="${htmlText('votes.add')}" aria-pressed="false">
                <span class="material-symbols-outlined vote-button__icon" aria-hidden="true">&#xe87e;</span>
                <span class="vote-heart-particles" aria-hidden="true"></span>
            </button>
            <button class="detail-close accommodation-detail__close" type="button" aria-label="${htmlText('common.close')}"><span class="material-symbols-outlined accommodation-detail__close-icon" aria-hidden="true">&#xe5cd;</span></button>
            <div class="price-badge accommodation-detail__price"><span class="price-value"></span></div>
        </div>
        <div class="detail-content accommodation-detail__content">
            <div class="accommodation-detail__heading">
                <h2 id="detail-title" class="detail-title accommodation-detail__title"></h2>
                <button class="accommodation-detail__edit" type="button" hidden>${htmlText('detail.edit')}</button>
            </div>
            <div id="detail-readonly-section" class="accommodation-detail__read-view">
                <p class="accommodation-detail__source"></p>
                <p class="card-creator-subtitle accommodation-detail__creator"></p>
                <div class="voters-row accommodation-detail__voters"></div>
                <section class="accommodation-detail__description-section"><h3 class="accommodation-detail__section-title">${htmlText('detail.about')}</h3><p class="accommodation-detail__description"></p></section>
                <aside class="accommodation-detail__note"><h3 class="accommodation-detail__note-title">${htmlText('detail.note')}</h3><p class="detail-note-text accommodation-detail__note-text"></p></aside>
            </div>
            <form id="detail-editable-section" class="accommodation-detail__form" hidden>
                <div class="form-group"><label for="edit-detail-title">${htmlText('form.title')}</label><input type="text" id="edit-detail-title" class="input-field" required /></div>
                <div class="form-group"><label for="edit-detail-price">${htmlText('form.price')}</label><input type="text" id="edit-detail-price" class="input-field" /></div>
                <div class="form-group"><label for="edit-detail-image">${htmlText('form.imageUrl')}</label><input type="text" inputmode="url" id="edit-detail-image" class="input-field" /></div>
                <div class="form-group"><label for="edit-detail-note">${htmlText('form.note')}</label><textarea id="edit-detail-note" class="input-field"></textarea></div>
                <div class="accommodation-detail__availability-field" hidden><label class="accommodation-detail__availability-label"><input type="checkbox" id="edit-detail-is-taken" class="accommodation-detail__availability-input" aria-describedby="detail-availability-help" />${htmlText('availability.taken')}</label><p id="detail-availability-help" class="accommodation-detail__availability-help">${htmlText('availability.help')}</p></div>
                <div class="accommodation-detail__form-actions"><button class="btn btn-primary" type="submit">${htmlText('detail.save')}</button><button class="btn btn-secondary accommodation-detail__cancel" type="button">${htmlText('common.cancel')}</button></div>
                <p class="accommodation-detail__save-status" role="status"></p>
            </form>
        </div>
        <footer class="accommodation-detail__footer"><a class="btn btn-primary accommodation-detail__offer" target="_blank" rel="noopener noreferrer">${htmlText('detail.offer')} <span class="material-symbols-outlined accommodation-detail__offer-icon" aria-hidden="true">&#xf1e1;</span></a></footer>`;

    populateDetail(sheet, option);
    sheet.querySelector('.card-heart-btn').addEventListener('click', () => window.toggleVote(option.id));
    sheet.querySelector('.detail-close').addEventListener('click', closeDetail);
    sheet.querySelector('.accommodation-detail__edit').addEventListener('click', () => setDetailEditing(true));
    sheet.querySelector('.accommodation-detail__cancel').addEventListener('click', () => setDetailEditing(false));
    sheet.querySelector('form').addEventListener('submit', event => { event.preventDefault(); saveOptionDetails(); });

    const mobile = applyDetailLayout(overlay, sheet);
    sheet.scrollTop = 0;
    const targetImage = sheet.querySelector('.card-cover');
    if (mobile && sourceImage?.complete && sourceImage.naturalWidth > 0) targetImage.src = sourceImage.currentSrc || sourceImage.src;
    sheet.classList.add('accommodation-detail--open');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    updateDetailModalIfOpen();
    if (mobile && !fromHistory) rememberDetail(option.id);
    if (mobile) {
        animateDetailOpen({ sourceImage, targetImage, sheet }).then(completed => {
            if (completed && version === detailVersion) sheet.focus({ preventScroll: true });
        });
    } else sheet.focus({ preventScroll: true });
}

function populateDetail(sheet, option) {
    const creator = state.whitelistedUsers.find(user => user.email === option.created_by);
    const image = sheet.querySelector('.card-cover');
    const placeholder = sheet.querySelector('.accommodation-detail__placeholder');
    placeholder.hidden = true;
    setAccommodationImage(image, option.image, () => { placeholder.hidden = false; });
    sheet.querySelector('.card-cover').alt = option.title || t('common.stay');
    sheet.querySelector('.price-value').textContent = formatPrice(option.price);
    sheet.querySelector('.detail-title').textContent = option.title || t('common.stay');
    const source = sheet.querySelector('.accommodation-detail__source');
    source.textContent = getListingSource(option.link);
    source.hidden = !source.textContent;
    sheet.querySelector('.accommodation-detail__creator').textContent = t('stay.creator', { name: creator?.name || option.creatorName || t('common.teamMember') });
    sheet.querySelector('.accommodation-detail__description').textContent = option.description || '';
    sheet.querySelector('.accommodation-detail__description-section').hidden = !option.description;
    sheet.querySelector('.detail-note-text').textContent = option.note || '';
    sheet.querySelector('.accommodation-detail__note').hidden = !option.note;
    const offer = sheet.querySelector('.accommodation-detail__offer');
    const url = safeWebUrl(option.link);
    if (url) offer.href = url;
    else offer.removeAttribute('href');
    sheet.querySelector('.accommodation-detail__footer').hidden = !url;
    const editable = canEditAccommodation(option);
    sheet.querySelector('.accommodation-detail__edit').hidden = !editable;
    renderAvailabilityBadge(sheet.querySelector('.accommodation-detail__availability'), option);
    sheet.querySelector('.accommodation-detail__availability-field').hidden = !supportsAvailability(option);
    sheet.querySelector('#edit-detail-is-taken').checked = option.is_taken === true;
    for (const field of ['title', 'price', 'image', 'note']) sheet.querySelector(`#edit-detail-${field}`).value = option[field] ?? '';
    renderVoters(sheet.querySelector('.voters-row'), option.voters || [], option.voterEmails || [], { selected: state.selectedOptionIds.has(option.id) });
}

function setDetailEditing(editing) {
    const option = state.options.find(item => String(item.id) === String(state.activeDetailId));
    const sheet = document.querySelector('#detail-overlay .detail-sheet');
    if (!option || !sheet) return;
    const editable = canEditAccommodation(option);
    if (editing && !editable) return;
    if (editing) populateDetail(sheet, option);
    sheet.querySelector('#detail-readonly-section').hidden = editing;
    sheet.querySelector('#detail-editable-section').hidden = !editing;
    sheet.querySelector('.accommodation-detail__edit').hidden = editing || !editable;
    sheet.querySelector('.accommodation-detail__footer').hidden = editing || !safeWebUrl(option.link);
    sheet.querySelector('.accommodation-detail__save-status').textContent = '';
    if (editing) sheet.querySelector('#edit-detail-title').focus();
    else sheet.querySelector('.accommodation-detail__edit').focus({ preventScroll: true });
}

function findDetailSource(optionId) {
    const card = findOptionCard(optionId);
    const rows = Array.from(document.querySelectorAll('[data-detail-id]')).filter(row => row.dataset.detailId === String(optionId));
    return [card, ...rows].filter(Boolean).map(element => element.querySelector('.card-cover')).find(image => image?.getBoundingClientRect().width > 0);
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
                sourceImage: findDetailSource(optionId),
                targetImage: sheet.querySelector('.card-cover'),
                sheet
            });
        } else {
            cancelDetailTransition();
        }

        if (!completed || version !== detailVersion) return;

        sheet?.classList.remove('accommodation-detail--open');
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
    renderAvailabilityBadge(overlay.querySelector('.accommodation-detail__availability'), opt);

    const isSelected = state.selectedOptionIds.has(opt.id);
    const heartBtn = overlay.querySelector('.card-heart-btn');

    if (heartBtn) {
        const pending = isVotePending(opt.id);

        heartBtn.classList.toggle('voted', isSelected);
        heartBtn.classList.toggle('vote-button--selected', isSelected);
        heartBtn.setAttribute('aria-pressed', String(isSelected));
        heartBtn.disabled = pending;
        heartBtn.setAttribute('aria-busy', String(pending));
    }

    const votersRow = overlay.querySelector('.voters-row');
    if (votersRow) {
        renderVoters(
            votersRow,
            opt.voters || [],
            opt.voterEmails || [],
            { selected: isSelected }
        );
    }
}

export async function saveOptionDetails() {
    const optionId = state.activeDetailId;
    const option = state.options.find(item => String(item.id) === String(optionId));
    const sheet = document.querySelector('#detail-overlay .detail-sheet');
    if (!option || !sheet) return;
    if (!canEditAccommodation(option)) {
        showToast(t('detail.editForbidden'), 'error');
        return;
    }
    const form = sheet.querySelector('#detail-editable-section');
    const button = form.querySelector('button[type="submit"]');
    if (form.hidden || button.disabled) return;
    const title = form.querySelector('#edit-detail-title').value.trim();
    if (!title) { showToast(t('detail.titleRequired'), 'error'); return; }
    const rawPrice = form.querySelector('#edit-detail-price').value.trim();
    const updates = {
        title,
        price: rawPrice && !rawPrice.includes('€') ? `${rawPrice}€` : rawPrice || 'N/A',
        image: form.querySelector('#edit-detail-image').value.trim(),
        note: form.querySelector('#edit-detail-note').value.trim()
    };
    if (supportsAvailability(option)) updates.is_taken = form.querySelector('#edit-detail-is-taken').checked;
    button.disabled = true;
    const status = sheet.querySelector('.accommodation-detail__save-status');
    status.textContent = t('detail.saving');
    try {
        const saved = await updateOption(optionId, updates);
        if (!Array.isArray(saved) || saved.length !== 1) throw new Error('The update was not confirmed.');
        state.options = state.options.map(item => String(item.id) === String(optionId) ? { ...item, ...saved[0] } : item);
        await renderOptions(false, null, false);
        await renderLeaderboard(false);
        if (String(state.activeDetailId) === String(optionId)) {
            populateDetail(sheet, state.options.find(item => String(item.id) === String(optionId)));
            setDetailEditing(false);
        }
        showToast(t('detail.saved'));
    } catch (error) {
        console.error('Failed to save option edits:', error);
        status.textContent = t('detail.saveFailedStatus');
        showToast(t('detail.saveFailed'), 'error');
    } finally { button.disabled = false; }
}
