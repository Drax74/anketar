import { state } from '../state.js';
import { addOption, updateOption, sendMagicLink } from '../services/api.js';
import { renderOptions } from './cards.js';
import { normalizeUrl } from '../shared/helpers/url.js';
import { isValidUrl, isBookingOrAirbnbUrl } from '../shared/helpers/validation.js';

let toastTimer = null;

export function showToast(message, kind = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

export function openDetail(optionId) {
    const opt = state.options.find(item => String(item.id) === String(optionId));
    if (!opt) return;
    state.activeDetailId = opt.id;

    const overlay = document.getElementById('detail-overlay');
    const image = document.getElementById('detail-image');
    const title = document.getElementById('detail-title');
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
    const editPrice = document.getElementById('edit-detail-price')?.value.trim();
    const editImage = document.getElementById('edit-detail-image')?.value.trim();
    const editNote = document.getElementById('edit-detail-note')?.value.trim();

    if (!editTitle) {
        showToast('Naziv smještaja ne može biti prazan.', 'error');
        return;
    }

    const updates = {
        title: editTitle,
        price: editPrice || 'N/A',
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

export function openAddModal() {
    const overlay = document.getElementById('add-modal');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

export function closeAddModal() {
    const overlay = document.getElementById('add-modal');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

export async function submitNewOption() {
    const title = document.getElementById('input-title')?.value.trim() || '';
    const link = document.getElementById('input-link')?.value.trim() || '';
    const price = document.getElementById('input-price')?.value.trim() || 'N/A';
    const rawImage = document.getElementById('input-image')?.value.trim() || '';
    const note = document.getElementById('input-note')?.value.trim() || '';

    if (!link || !isValidUrl(link) || !isBookingOrAirbnbUrl(link)) {
        showToast('Dozvoljeni su isključivo valjani Booking.com i Airbnb linkovi!', 'error');
        return;
    }

    if (!title) {
        showToast('Naziv smještaja je obavezan.', 'error');
        return;
    }

    const formattedLink = link.startsWith('http') ? link : `https://${link}`;
    const normalizedNewLink = normalizeUrl(formattedLink);
    const isDuplicate = state.options.some(opt => normalizeUrl(opt.link) === normalizedNewLink);

    if (isDuplicate) {
        showToast('Ovaj smještaj (link) je već dodan na popis!', 'error');
        return;
    }

    const tempId = 'opt_' + Date.now();
    const creatorUser = state.whitelistedUsers.find(u => u.email === state.userEmail);
    const creatorName = creatorUser ? creatorUser.name : (state.userEmail || 'Nepoznato');

    const newOption = {
        id: tempId,
        title,
        link: formattedLink,
        price,
        image: rawImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',
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
        await addOption(newOption);
    } catch (err) {
        console.error('Add failed:', err);
        state.options = state.options.filter(o => o.id !== tempId);
        renderOptions();
        showToast('Greška pri dodavanju smještaja.', 'error');
    }
}

export async function requestMagicLink() {
    const selectEl = document.getElementById('user-select');
    const selectedEmail = selectEl?.value;

    if (!selectedEmail) {
        showToast('Molimo odaberite korisnika.', 'error');
        return;
    }

    const user = state.whitelistedUsers.find(u => u.email === selectedEmail);
    if (!user) return;

    const triggerBtn = document.getElementById('btn-verify-trigger');
    if (triggerBtn) {
        triggerBtn.innerText = 'Šaljem Magic Link...';
        triggerBtn.disabled = true;
    }

    try {
        await sendMagicLink(selectedEmail);
        state.userEmail = selectedEmail;
        state.userName = user.name;

        const step1 = document.getElementById('auth-step-1');
        const step2 = document.getElementById('auth-step-2');
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        showToast('Magic link poslan na vaš email!');
    } catch (err) {
        console.error('Magic link error:', err);
        showToast('Greška pri slanju linka.', 'error');
        if (triggerBtn) {
            triggerBtn.innerText = 'Pošalji Mi Magic Link Na Email';
            triggerBtn.disabled = false;
        }
    }
}