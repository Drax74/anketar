import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { addOption, updateOption } from '../services/api.js';
import { renderOptions, updateCardSubelements } from './cards.js';
import { normalizeUrl } from '../shared/helpers/url.js';
import { isValidUrl, isBookingOrAirbnbUrl } from '../shared/helpers/validation.js';

let toastTimer = null;

let pendingScrapedData = {
    scrapedSuccessfully: false,
    title: '',
    image: '',
    description: '',
    link: ''
};

// 8-color frosted avatar palette mapping (matching cards.js)
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

export function showToast(message, kind = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

export function openAddModal() {
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

    const linkInput = document.getElementById('input-link');
    const titleInput = document.getElementById('input-title');
    const priceInput = document.getElementById('input-price');
    const imageInput = document.getElementById('input-image');
    const noteInput = document.getElementById('input-note');

    if (linkInput) linkInput.value = '';
    if (titleInput) titleInput.value = '';
    if (priceInput) priceInput.value = '';
    if (imageInput) imageInput.value = '';
    if (noteInput) noteInput.value = '';
}

export async function submitLinkAndFetch() {
    const linkInput = document.getElementById('input-link');
    if (!linkInput) return;

    const rawLink = linkInput.value.trim();
    if (!rawLink || !isValidUrl(rawLink) || !isBookingOrAirbnbUrl(rawLink)) {
        showToast('Dozvoljeni su isključivo valjani Booking.com i Airbnb linkovi!', 'error');
        return;
    }

    const formattedLink = rawLink.startsWith('http') ? rawLink : `https://${rawLink}`;
    const normalizedNewLink = normalizeUrl(formattedLink);
    const isDuplicate = state.options.some(opt => normalizeUrl(opt.link) === normalizedNewLink);

    if (isDuplicate) {
        showToast('Ovaj smještaj (link) je već dodan na popis!', 'error');
        return;
    }

    pendingScrapedData.link = formattedLink;

    const step1 = document.getElementById('add-step-1');
    const skeleton = document.getElementById('add-skeleton-loading');
    if (step1) step1.style.display = 'none';
    if (skeleton) skeleton.style.display = 'block';

    try {
        const { data, error } = await supabase.functions.invoke('scraper', {
            body: { url: formattedLink }
        });

        if (error || !data) {
            console.warn('[Metadata Scraper] Function error:', error?.message);
            showToast('Automatsko dohvaćanje nije uspjelo. Unesite podatke ručno.', 'error');
            pendingScrapedData.scrapedSuccessfully = false;
            renderAddModalStep2(false);
            return;
        }

        const { title, image, description, providerUsed } = data;
        console.log(`[Scraper] Successfully fetched using provider: ${providerUsed}`);

        pendingScrapedData.scrapedSuccessfully = true;
        pendingScrapedData.title = title ? title.split(' - ')[0].trim() : 'Smještaj';
        pendingScrapedData.image = image || '';
        pendingScrapedData.description = description ? description.trim() : '';

        showToast('Podaci o smještaju uspješno dohvaćeni!');
        renderAddModalStep2(true);
    } catch (networkError) {
        console.warn('[Metadata Scraper] Network/Execution failed:', networkError);
        showToast('Automatsko dohvaćanje nije uspjelo. Unesite podatke ručno.', 'error');
        pendingScrapedData.scrapedSuccessfully = false;
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

        if (previewTitle) previewTitle.textContent = pendingScrapedData.title;
        if (previewDesc) previewDesc.textContent = pendingScrapedData.description || 'Opis nije dostupan.';

        if (pendingScrapedData.image && previewImg && imagePlaceholder) {
            previewImg.src = pendingScrapedData.image;
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
    let finalTitle = '';
    let finalImage = '';
    let finalDescription = '';

    if (pendingScrapedData.scrapedSuccessfully) {
        finalTitle = pendingScrapedData.title;
        finalImage = pendingScrapedData.image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';
        finalDescription = pendingScrapedData.description;
    } else {
        finalTitle = document.getElementById('input-title')?.value.trim() || '';
        const manualImage = document.getElementById('input-image')?.value.trim() || '';
        finalImage = manualImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';
        finalDescription = '';
    }

    let rawPrice = document.getElementById('input-price')?.value.trim() || 'N/A';
    const finalPrice = rawPrice !== 'N/A' && !rawPrice.includes('€') ? `${rawPrice}€` : rawPrice;

    const note = document.getElementById('input-note')?.value.trim() || '';

    if (!finalTitle) {
        showToast('Naziv smještaja je obavezan.', 'error');
        return;
    }

    const tempId = 'opt_' + Date.now();
    const creatorUser = state.whitelistedUsers.find(u => u.email === state.userEmail);
    const creatorName = creatorUser ? creatorUser.name : (state.userEmail || 'Nepoznato');

    const newOption = {
        id: tempId,
        title: finalTitle,
        link: pendingScrapedData.link,
        price: finalPrice,
        image: finalImage,
        description: finalDescription,
        note,
        created_by: state.userEmail,
        creatorName,
        voterEmails: [],
        voters: []
    };

    closeAddModal();
    state.options = [newOption, ...state.options];
    renderOptions(true, tempId);

    try {
        const dbPayload = {
            id: tempId,
            title: finalTitle,
            link: pendingScrapedData.link,
            price: finalPrice,
            image: finalImage,
            description: finalDescription,
            note,
            created_by: state.userEmail
        };
        await addOption(dbPayload);
    } catch (err) {
        console.error('Add failed:', err);
        state.options = state.options.filter(o => o.id !== tempId);
        renderOptions();
        showToast('Greška pri dodavanju smještaja.', 'error');
    }
    return tempId;
}

export function openDetail(optionId) {
    const opt = state.options.find(item => String(item.id) === String(optionId));
    if (!opt) return;
    state.activeDetailId = opt.id;

    const overlay = document.getElementById('detail-overlay');
    if (!overlay) return;

    const isSelected = state.selectedOptionIds.has(opt.id);
    const voters = opt.voters || [];
    const voterEmails = opt.voterEmails || [];

    const creatorUser = state.whitelistedUsers.find(u => u.email === opt.created_by);
    const creatorName = creatorUser ? creatorUser.name : (opt.created_by || 'Nepoznato');
    const rawAmount = opt.price ? opt.price.replace('€', '').trim() : 'N/A';
    const displayPrice = rawAmount !== 'N/A' ? `${rawAmount}€` : 'N/A';

    // Build Voters Stack HTML
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

    // Determine platform link label
    let linkText = 'Pogledaj ponudu ↗';
    let isAirbnb = false;
    let isBooking = false;
    if (opt.link) {
        try {
            const parsed = new URL(opt.link.startsWith('http') ? opt.link : `https://${opt.link}`);
            const host = parsed.hostname.toLowerCase();
            isAirbnb = host.includes('airbnb') || host.includes('abnb.me');
            isBooking = host.includes('booking') || host.includes('bkg.to');
        } catch {}

        if (isAirbnb) linkText = 'Pogledaj na Airbnb-u ↗';
        else if (isBooking) linkText = 'Pogledaj na Booking.com ↗';
    }

    const safeImage = opt.image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=85';
    const isCreator = Boolean(state.userEmail && opt.created_by && opt.created_by.toLowerCase() === state.userEmail.toLowerCase());

    const sheet = overlay.querySelector('.detail-sheet');
    if (sheet) {
        sheet.innerHTML = `
            <div style="position: relative; width: 100%; height: clamp(220px, 38vh, 320px); background: #1B1C20; overflow: hidden; isolation: isolate;">
                <!-- Top-Left Heart Vote Button -->
                <button class="card-heart-btn ${isSelected ? 'voted' : ''}" type="button" 
                        aria-label="Glasaj"
                        onclick="toggleVote('${opt.id}'); openDetail('${opt.id}')">
                    <span class="material-symbols-outlined">favorite</span>
                </button>

                <!-- Top-Right Close Button -->
                <button class="detail-close" type="button" onclick="closeDetail()" aria-label="Zatvori" style="position: absolute; top: 12px; right: 12px; width: 38px; height: 38px; border-radius: 50%; background: rgba(18, 19, 22, 0.72); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.18); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 1.25rem; cursor: pointer; z-index: 10;">&times;</button>

                <!-- Property Cover Image -->
                <img src="${safeImage}" alt="${opt.title}" style="width: 100%; height: 100%; object-fit: cover;" />

                <!-- Bottom-Right Price Badge -->
                <div class="price-badge" style="position: absolute; bottom: 12px; right: 12px; left: auto; top: auto; width: auto; max-width: max-content; background: rgba(18, 19, 22, 0.88); backdrop-filter: blur(8px); padding: 6px 12px; border-radius: var(--md-shape-corner-small); font-size: 0.85rem; font-weight: 600; color: #ffffff; border: 1px solid rgba(255,255,255,0.12); z-index: 5; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px;"><span class="material-symbols-outlined" style="font-size: 0.95rem; font-variation-settings: 'FILL' 1, 'wght' 500; vertical-align: -2px;">local_offer</span>${displayPrice}</div>
            </div>
            
            <div class="detail-content" style="padding: 24px; display: flex; flex-direction: column; gap: 8px;">
                <div class="voters-row" style="display: flex; align-items: center; gap: 10px; min-height: 40px; border-top: none; padding-top: 0;">
                    ${votersHtml}
                </div>

                <div id="detail-readonly-section" style="display: ${isCreator ? 'none' : 'block'};">
                    <h2 class="detail-title" style="font-size: 1.35rem; font-weight: 600; color: var(--md-sys-color-on-surface); margin-bottom: 4px;">${opt.title || 'Smještaj'}</h2>
                    <span class="card-creator-subtitle" style="font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant);">Dodao: ${creatorName}</span>
                </div>

                <div id="detail-editable-section" style="display: ${isCreator ? 'block' : 'none'};">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Naziv smještaja</label>
                        <input type="text" id="edit-detail-title" class="input-field" value="${opt.title || ''}" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Cijena (€)</label>
                        <input type="text" id="edit-detail-price" class="input-field" value="${opt.price || ''}" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">URL slike</label>
                        <input type="text" id="edit-detail-image" class="input-field" value="${opt.image || ''}" />
                    </div>
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; color: var(--md-sys-color-on-surface-variant);">Napomena / Bilješka</label>
                        <textarea id="edit-detail-note" class="input-field">${opt.note || ''}</textarea>
                    </div>
                    <button class="btn btn-primary" type="button" onclick="saveOptionDetails()">Spremi izmjene</button>
                </div>

                ${opt.note && !isCreator ? `<div class="card-note-box" style="background: var(--md-sys-color-surface-container); border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-shape-corner-small); padding: 12px 16px; font-size: 0.88rem; color: var(--md-sys-color-on-surface-variant); display: flex; gap: 10px; align-items: flex-start;"><span class="material-symbols-outlined" style="color: var(--md-sys-color-primary); font-size: 1.15rem;">chat_bubble</span><span>${opt.note}</span></div>` : ''}
                
                ${opt.description && !isCreator ? `<p style="font-size: 0.9rem; color: var(--md-sys-color-on-surface-variant); line-height: 1.5;">${opt.description}</p>` : ''}

                ${opt.link ? `<a href="${opt.link}" target="_blank" class="btn btn-primary" style="margin-top: 16px; text-decoration: none; justify-content: center; display: inline-flex; align-items: center; gap: 6px;">${linkText}</a>` : ''}
            </div>
        `;
    }

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

export function closeDetail() {
    const overlay = document.getElementById('detail-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    state.activeDetailId = null;
}

export function updateDetailModalIfOpen() {
    if (state.activeDetailId === null) return;
    openDetail(state.activeDetailId);
}

export async function saveOptionDetails() {
    if (!state.activeDetailId) return;

    const opt = state.options.find(item => String(item.id) === String(state.activeDetailId));
    if (!opt) return;

    const editTitle = document.getElementById('edit-detail-title')?.value.trim();
    let rawPrice = document.getElementById('edit-detail-price')?.value.trim();
    const editPrice = rawPrice && !rawPrice.includes('€') ? `${rawPrice}€` : (rawPrice || 'N/A');
    const editImage = document.getElementById('edit-detail-image')?.value.trim();
    const editNote = document.getElementById('edit-detail-note')?.value.trim();

    if (!editTitle) {
        showToast('Naziv smještaja ne može biti prazan.', 'error');
        return;
    }

    const updates = {
        title: editTitle,
        price: editPrice,
        image: editImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',
        note: editNote || ''
    };

    state.options = state.options.map(o => {
        if (String(o.id) === String(state.activeDetailId)) {
            return { ...o, ...updates };
        }
        return o;
    });

    renderOptions();
    closeDetail();
    showToast('Izmjene uspješno spremljene!');

    try {
        await updateOption(state.activeDetailId, updates);
    } catch (err) {
        console.error('Failed to save option edits:', err);
        showToast('Greška pri spremanju izmjena.', 'error');
    }
}

window.submitLinkAndFetch = submitLinkAndFetch;
window.submitNewOption = submitNewOption;
window.resetAddModalStep = resetAddModalStep;
window.saveOptionDetails = saveOptionDetails;