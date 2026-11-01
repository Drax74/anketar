import { t } from '../i18n.js';
import { state } from '../state.js';
import { addOption } from '../services/api.js';
import { scrapeAccommodation } from '../services/scraper.js';
import { normalizeUrl, safeWebUrl } from '../shared/helpers/url.js';
import {
    isValidUrl,
    isBookingOrAirbnbUrl
} from '../shared/helpers/validation.js';
import { renderOptions } from './cards.js';
import { showToast } from './toast.js';
import { renderLeaderboard } from './leaderboard.js';

let scrapeGeneration = 0;

let pendingScrapedData = {
    scrapedSuccessfully: false,
    title: '',
    image: '',
    description: '',
    link: ''
};

export function openAddModal() {
    if (!state.userEmail || !state.whitelistedUsers.some(user => user.email === state.userEmail)) {
        showToast(t('add.approvedRequired'), 'error');
        return;
    }
    resetAddModalStep();

    const overlay = document.getElementById('add-modal-overlay');

    if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
}

export function closeAddModal() {
    const overlay = document.getElementById('add-modal-overlay');

    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    document.body.style.overflow = '';
    resetAddModalStep();
}

export function resetAddModalStep() {
    scrapeGeneration++;
    pendingScrapedData = {
        scrapedSuccessfully: false,
        title: '',
        image: '',
        description: '',
        link: ''
    };

    const step1 = document.getElementById('add-step-1');
    const step2 = document.getElementById('add-step-2');
    const skeleton = document.getElementById('add-skeleton-loading');

    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (skeleton) skeleton.style.display = 'none';

    for (const id of [
        'input-link',
        'input-title',
        'input-price',
        'input-image',
        'input-note'
    ]) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    }
}

export async function submitLinkAndFetch() {
    const linkInput = document.getElementById('input-link');
    if (!linkInput) return;

    const rawLink = linkInput.value.trim();

    if (
        !rawLink ||
        !isValidUrl(rawLink) ||
        !isBookingOrAirbnbUrl(rawLink)
    ) {
        showToast(
            t('add.supportedLinksOnly'),
            'error'
        );
        return;
    }

    const formattedLink = safeWebUrl(rawLink);

    if (!formattedLink) {
        showToast(t('add.httpRequired'), 'error');
        return;
    }

    const normalizedNewLink = normalizeUrl(formattedLink);
    const isDuplicate = state.options.some(
        option => normalizeUrl(option.link) === normalizedNewLink
    );

    if (isDuplicate) {
        showToast(t('add.duplicate'), 'error');
        return;
    }

    const generation = ++scrapeGeneration;
    pendingScrapedData.link = formattedLink;

    const step1 = document.getElementById('add-step-1');
    const skeleton = document.getElementById('add-skeleton-loading');

    if (step1) step1.style.display = 'none';
    if (skeleton) skeleton.style.display = 'block';

    try {
        const metadata = await scrapeAccommodation(formattedLink);
        if (generation !== scrapeGeneration) return;

        pendingScrapedData = {
            ...metadata,
            scrapedSuccessfully: true
        };

        showToast(t('add.fetched'));
        renderAddModalStep2(true);
    } catch (error) {
        if (generation !== scrapeGeneration) return;
        console.warn('[Metadata Scraper] Request failed:', error);

        pendingScrapedData.scrapedSuccessfully = false;

        showToast(
            t('add.manualFallback'),
            'error'
        );

        renderAddModalStep2(false);
    }
}

function renderAddModalStep2(scrapedSuccessfully) {
    const skeleton = document.getElementById('add-skeleton-loading');
    const step2 = document.getElementById('add-step-2');

    if (skeleton) skeleton.style.display = 'none';
    if (step2) step2.style.display = 'block';

    const successPreview = document.getElementById('scraper-success-preview');
    const groupTitle = document.getElementById('group-title');
    const groupImage = document.getElementById('group-image');
    const previewTitle = document.getElementById('preview-title');
    const previewDesc = document.getElementById('preview-desc');
    const previewImg = document.getElementById('add-preview-img');
    const imagePlaceholder = document.getElementById('add-image-placeholder');

    if (scrapedSuccessfully) {
        if (successPreview) successPreview.style.display = 'block';
        if (groupTitle) groupTitle.style.display = 'none';
        if (groupImage) groupImage.style.display = 'none';

        if (previewTitle) {
            previewTitle.textContent = pendingScrapedData.title;
        }

        if (previewDesc) {
            previewDesc.textContent =
                pendingScrapedData.description || t('add.noDescription');
        }

        const previewImage = safeWebUrl(pendingScrapedData.image);

        if (previewImage && previewImg && imagePlaceholder) {
            previewImg.src = previewImage;
            previewImg.style.display = 'block';
            imagePlaceholder.style.display = 'none';
        } else {
            if (previewImg) previewImg.style.display = 'none';
            if (imagePlaceholder) imagePlaceholder.style.display = 'flex';
        }
    } else {
        if (successPreview) successPreview.style.display = 'none';
        if (groupTitle) groupTitle.style.display = 'block';
        if (groupImage) groupImage.style.display = 'block';

        if (previewImg) {
            previewImg.src = '';
            previewImg.style.display = 'none';
        }

        if (imagePlaceholder) {
            imagePlaceholder.style.display = 'flex';
        }
    }
}

export async function submitNewOption() {
    const fallbackImage = '';

    let finalTitle = '';
    let finalImage = '';
    let finalDescription = '';

    if (pendingScrapedData.scrapedSuccessfully) {
        finalTitle = pendingScrapedData.title;
        finalImage = pendingScrapedData.image || fallbackImage;
        finalDescription = pendingScrapedData.description;
    } else {
        finalTitle = document
            .getElementById('input-title')?.value.trim() || '';

        const manualImage = document
            .getElementById('input-image')?.value.trim() || '';

        finalImage = manualImage || fallbackImage;
    }

    const rawPrice = document
        .getElementById('input-price')?.value.trim() || 'N/A';

    const finalPrice = rawPrice !== 'N/A' && !rawPrice.includes('€')
        ? `${rawPrice}€`
        : rawPrice;

    const note = document
        .getElementById('input-note')?.value.trim() || '';

    if (!finalTitle) {
        showToast(t('form.titleRequired'), 'error');
        return;
    }

    const tempId = 'opt_' + Date.now();

    const creatorUser = state.whitelistedUsers.find(
        user => user.email === state.userEmail
    );

    const newOption = {
        id: tempId,
        title: finalTitle,
        link: pendingScrapedData.link,
        price: finalPrice,
        image: finalImage,
        description: finalDescription,
        note,
        created_by: state.userEmail,
        creatorName: creatorUser
            ? creatorUser.name
            : (state.userEmail || t('common.unknown')),
        voterEmails: [],
        voters: []
    };

    // Capture database fields before closing resets the form state.
    const dbPayload = {
        id: newOption.id,
        title: newOption.title,
        link: newOption.link,
        price: newOption.price,
        image: newOption.image,
        description: newOption.description,
        note: newOption.note,
        created_by: newOption.created_by
    };

    closeAddModal();

    state.options = [newOption, ...state.options];
    renderOptions(true, tempId);
    renderLeaderboard(false);

    try {
        await addOption(dbPayload);
    } catch (error) {
        console.error('Add failed:', error);

        state.options = state.options.filter(
            option => option.id !== tempId
        );

        renderOptions();
        renderLeaderboard(false);
        showToast(t('add.failed'), 'error');
        return;
    }

    return tempId;
}