import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { addOption, updateOption } from '../services/api.js';
import { renderOptions } from './cards.js';
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
}

export function openDetail(optionId) {
    const opt = state.options.find(item => String(item.id) === String(optionId));
    if (!opt) return;
    state.activeDetailId = opt.id;

    const overlay = document.getElementById('detail-overlay');
    const image = document.getElementById('detail-image');
    const title = document.getElementById('detail-title');
    const descriptionEl = document.getElementById('detail-description');
    const priceEl = document.getElementById('detail-price');
    const votesEl = document.getElementById('detail-votes');
    const noteEl = document.getElementById('detail-note');
    const link = document.getElementById('detail-link');
    const voteBtn = document.getElementById('detail-vote');

    const safeImage = opt.image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=85';
    if (image) {
        image.src = safeImage;
        image.alt = opt.title || 'Accommodation';
    }

    if (votesEl) votesEl.textContent = `${opt.voters?.length || 0} glasova`;
    if (voteBtn) {
        voteBtn.textContent = state.selectedOptionIds.has(opt.id) ? 'Ukloni svoj glas' : 'Glasaj za ovaj smještaj';
    }

    const isCreator = Boolean(state.userEmail && opt.created_by && opt.created_by.toLowerCase() === state.userEmail.toLowerCase());
    const editableSection = document.getElementById('detail-editable-section');
    const readonlySection = document.getElementById('detail-readonly-section');

    if (isCreator) {
        if (readonlySection) readonlySection.style.display = 'none';
        if (editableSection) editableSection.style.display = 'block';

        const editTitle = document.getElementById('edit-detail-title');
        const editPrice = document.getElementById('edit-detail-price');
        const editImage = document.getElementById('edit-detail-image');
        const editNote = document.getElementById('edit-detail-note');

        if (editTitle) editTitle.value = opt.title || '';
        if (editPrice) editPrice.value = opt.price || '';
        if (editImage) editImage.value = opt.image || '';
        if (editNote) editNote.value = opt.note || '';
    } else {
        if (editableSection) editableSection.style.display = 'none';
        if (readonlySection) readonlySection.style.display = 'block';

        if (title) title.textContent = opt.title || 'Smještaj';
        if (descriptionEl) {
            descriptionEl.textContent = opt.description || '';
            descriptionEl.style.display = opt.description ? 'block' : 'none';
        }
        if (priceEl) priceEl.textContent = opt.price || 'Cijena nije navedena';
        if (noteEl) noteEl.textContent = opt.note || 'Nema dodatnih napomena.';
    }

    if (link) {
        link.href = opt.link || '#';
        link.style.display = opt.link ? 'inline-flex' : 'none';
    }

    if (overlay) {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    }
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
    const detailOpt = state.options.find(o => String(o.id) === String(state.activeDetailId));
    if (detailOpt) {
        const votesEl = document.getElementById('detail-votes');
        const voteBtn = document.getElementById('detail-vote');
        if (votesEl) votesEl.textContent = `${detailOpt.voters?.length || 0} glasova`;
        if (voteBtn) voteBtn.textContent = state.selectedOptionIds.has(detailOpt.id)
            ? 'Ukloni svoj glas'
            : 'Glasaj za ovaj smještaj';
    }
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