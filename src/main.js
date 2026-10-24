import { supabase } from './supabase.js';
import {getWhitelistedUsers, getPollData, addVote, removeVote, addOption, sendMagicLink, updateOption} from './api.js';
import { normalizeUrl } from "./shared/helpers/url";
import { isValidUrl, isBookingOrAirbnbUrl } from "./shared/helpers/validation.js";

const fallbackImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';

let state = {
    userEmail: localStorage.getItem('poll_user_email') || '',
    userName: localStorage.getItem('poll_user_name') || '',
    selectedOptionIds: new Set(),
    options: [],
    votes: [],
    whitelistedUsers: [],
    cooldownTimer: null,
    savingVotes: false
};

function openDetail(optionId) {
    const opt = state.options.find(item => String(item.id) === String(optionId));
    if (!opt) return;
    activeDetailId = opt.id;

    const overlay = document.getElementById('detail-overlay');
    const image = document.getElementById('detail-image');
    const title = document.getElementById('detail-title');
    const priceEl = document.getElementById('detail-price');
    const votesEl = document.getElementById('detail-votes');
    const noteEl = document.getElementById('detail-note');
    const link = document.getElementById('detail-link');
    const voteBtn = document.getElementById('detail-vote');

    const safeImage = opt.image || fallbackImage;
    if (image) {
        image.src = safeImage;
        image.alt = opt.title || 'Accommodation';
    }

    if (votesEl) votesEl.textContent = `${opt.voters?.length || 0} glasova`;

    if (voteBtn) {
        voteBtn.textContent = state.selectedOptionIds.has(opt.id) ? 'Ukloni svoj glas' : 'Glasaj za ovaj smještaj';
    }

    // CHECK IF CURRENT USER IS THE CREATOR
    const isCreator = Boolean(state.userEmail && opt.created_by && opt.created_by.toLowerCase() === state.userEmail.toLowerCase());

    const editableSection = document.getElementById('detail-editable-section');
    const readonlySection = document.getElementById('detail-readonly-section');

    if (isCreator) {
        // Show editable inputs for creator
        if (readonlySection) readonlySection.style.display = 'none';
        if (editableSection) editableSection.style.display = 'block';

        const editTitle = document.getElementById('edit-detail-title');
        const editPrice = document.getElementById('edit-detail-price');
        const editImage = document.getElementById('edit-detail-image');
        const editNote = document.getElementById('edit-detail-note');

        if (editTitle) editTitle.value = opt.title || '';
        if (editPrice) editPrice.value = opt.price || '';
        if (editImage) editImage.value = (opt.image && opt.image !== fallbackImage) ? opt.image : '';
        if (editNote) editNote.value = opt.note || '';
    } else {
        // Show clean read-only view for other users
        if (editableSection) editableSection.style.display = 'none';
        if (readonlySection) readonlySection.style.display = 'block';

        if (title) title.textContent = opt.title || 'Smještaj';
        if (priceEl) priceEl.textContent = opt.price || 'Cijena nije navedena';
        if (noteEl) noteEl.textContent = opt.note || 'Nema dodatnih napomena za ovaj smještaj.';
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
    setTimeout(() => document.querySelector('.detail-close')?.focus({ preventScroll: true }), 80);
}

async function saveOptionDetails() {
    if (!activeDetailId) return;

    const opt = state.options.find(item => String(item.id) === String(activeDetailId));
    if (!opt) return;

    // Extra security check: Creator validation
    const isCreator = Boolean(state.userEmail && opt.created_by && opt.created_by.toLowerCase() === state.userEmail.toLowerCase());
    if (!isCreator) {
        showToast('Samo autor prijedloga može uređivati ove podatke.', 'error');
        return;
    }

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
        image: editImage || fallbackImage,
        note: editNote || ''
    };

    // 1. Optimistically patch state tree
    state.options = state.options.map(o => {
        if (String(o.id) === String(activeDetailId)) {
            return { ...o, ...updates };
        }
        return o;
    });

    renderOptions();
    closeDetail();
    showToast('Izmjene uspješno spremljene!');

    // 2. Persist update in backend
    try {
        await updateOption(activeDetailId, updates);
    } catch (err) {
        console.error('Failed to save option edits:', err);
        showToast('Greška pri spremanju izmjena. Osvježavam podatke…', 'error');
        await fetchPollData();
    }
}

// SURGICAL REALTIME SUBSCRIPTION WITH IMMUTABLE STATE PATCHING & SELF-ECHO FILTERING
function setupRealtimeSubscription() {
    supabase.channel('public-poll-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, payload => {
            const newVote = payload.new;
            const oldVote = payload.old;
            const eventUserEmail = newVote?.user_email || oldVote?.user_email;

            // Ignore our own actions since we already handled them optimistically locally
            if (eventUserEmail && eventUserEmail === state.userEmail) {
                return;
            }

            if (payload.eventType === 'INSERT' && newVote) {
                state.votes = [...state.votes, newVote];

                state.options = state.options.map(opt => {
                    if (String(opt.id) === String(newVote.option_id)) {
                        const voterEmails = [...(opt.voterEmails || []), newVote.user_email];
                        const whitelistedUser = state.whitelistedUsers.find(u => u.email === newVote.user_email);
                        const voterName = whitelistedUser ? whitelistedUser.name : newVote.user_email;
                        const voters = [...(opt.voters || []), voterName];
                        return { ...opt, voterEmails, voters };
                    }
                    return opt;
                });
            } else if (payload.eventType === 'DELETE' && oldVote) {
                state.votes = state.votes.filter(v =>
                    !(String(v.option_id) === String(oldVote.option_id) && v.user_email === oldVote.user_email)
                );

                state.options = state.options.map(opt => {
                    if (String(opt.id) === String(oldVote.option_id)) {
                        const voterEmails = (opt.voterEmails || []).filter(e => e !== oldVote.user_email);
                        const whitelistedUser = state.whitelistedUsers.find(u => u.email === oldVote.user_email);
                        const voterName = whitelistedUser ? whitelistedUser.name : oldVote.user_email;
                        const voters = (opt.voters || []).filter(n => n !== voterName && n !== oldVote.user_email);
                        return { ...opt, voterEmails, voters };
                    }
                    return opt;
                });
            }

            renderOptions();
            if (activeDetailId !== null) {
                updateDetailModalIfOpen(activeDetailId);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'options' }, payload => {
            const newOpt = payload.new;
            const oldOpt = payload.old;
            const eventCreator = newOpt?.created_by || oldOpt?.created_by;

            // Ignore our own created options since we added them optimistically
            if (eventCreator && eventCreator === state.userEmail) {
                return;
            }

            if (payload.eventType === 'INSERT' && newOpt) {
                const creatorUser = state.whitelistedUsers.find(u => u.email === newOpt.created_by);
                const creatorName = creatorUser ? creatorUser.name : (newOpt.created_by || 'Nepoznato');

                const enrichedOpt = {
                    ...newOpt,
                    voterEmails: [],
                    voters: [],
                    creatorName
                };

                // Check if already exists in state to avoid duplicates
                if (!state.options.some(o => String(o.id) === String(newOpt.id))) {
                    state.options = [enrichedOpt, ...state.options];
                    renderOptions(true, newOpt.id);
                }
            } else if (payload.eventType === 'UPDATE' && newOpt) {
                state.options = state.options.map(opt => {
                    if (String(opt.id) === String(newOpt.id)) {
                        const creatorUser = state.whitelistedUsers.find(u => u.email === newOpt.created_by);
                        const creatorName = creatorUser ? creatorUser.name : (newOpt.created_by || 'Nepoznato');
                        return {
                            ...opt,
                            ...newOpt,
                            creatorName
                        };
                    }
                    return opt;
                });
                renderOptions();
            } else if (payload.eventType === 'DELETE' && oldOpt) {
                state.options = state.options.filter(opt => String(opt.id) !== String(oldOpt.id));
                if (activeDetailId && String(activeDetailId) === String(oldOpt.id)) {
                    closeDetail();
                }
                renderOptions();
            }
        })
        .subscribe();
}

// Native-like modal dismissal: tap the scrim or press Escape.
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', event => {
        if (event.target !== overlay) return;
        if (overlay.id === 'add-modal') closeAddModal();
    });
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const addModal = document.getElementById('add-modal');
    const detail = document.getElementById('detail-overlay');
    if (detail.classList.contains('active')) closeDetail();
    else if (addModal.classList.contains('active')) closeAddModal();
});

// UNIFIED INITIALIZATION: Fetch everything once on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Check Supabase's native session directly
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            state.userEmail = session.user.email;
        }

        // 2. Fetch all poll data (whitelist, options, votes) in one clean batch
        const { whitelist, options, votes } = await getPollData();
        state.whitelistedUsers = whitelist;
        state.votes = votes;

        // 3. Populate dropdown list immediately so it's always ready for anyone logging in/out
        const selectEl = document.getElementById('user-select');
        if (selectEl) {
            selectEl.innerHTML = '<option value="" disabled selected>-- Izaberi svoje ime --</option>';
            whitelist.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.email;
                opt.innerText = u.name;
                selectEl.appendChild(opt);
            });
        }

        // 4. Resolve names, emails, and creators for option cards
        state.options = options.map(opt => {
            const optVotes = votes.filter(v => v.option_id === opt.id);
            const voterEmails = optVotes.map(v => v.user_email);
            const voterNames = optVotes
                .map(v => {
                    const user = state.whitelistedUsers.find(u => u.email === v.user_email);
                    return user ? user.name : v.user_email;
                })
                .filter(Boolean);

            const creatorUser = state.whitelistedUsers.find(u => u.email === opt.created_by);
            const creatorName = creatorUser ? creatorUser.name : (opt.created_by || 'Nepoznato');

            return {
                ...opt,
                voterEmails,
                voters: voterNames,
                creatorName
            };
        });

        // 5. Handle active session or show login modal accordingly
        const authModal = document.getElementById('auth-modal');
        if (state.userEmail) {
            const matchedUser = state.whitelistedUsers.find(u => u.email === state.userEmail);
            state.userName = matchedUser ? matchedUser.name : state.userEmail;

            // Sync selections
            state.selectedOptionIds.clear();
            state.options.forEach(opt => {
                if (opt.voterEmails && opt.voterEmails.includes(state.userEmail)) {
                    state.selectedOptionIds.add(opt.id);
                }
            });

            if (authModal) {
                authModal.classList.remove('active');
                authModal.setAttribute('aria-hidden', 'true');
            }
            updateUserUI();
        } else {
            if (authModal) {
                authModal.classList.add('active');
                authModal.removeAttribute('aria-hidden');
            }
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                if (selectEl) selectEl.focus({ preventScroll: true });
            }, 100);
        }

        // 6. Render final view, reveal container, and initialize real-time listeners
        renderOptions();
        const container = document.getElementById('options-container');
        if (container) container.classList.add('loaded');

        setupRealtimeSubscription();
    } catch (err) {
        console.error('Initialization failed:', err);
        showToast('Greška pri učitavanju aplikacije.', 'error');
    }
});

// AUTH STATE CHANGE: Strictly handles incoming magic link returns post-login
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && session.user) {
        state.userEmail = session.user.email;

        if (state.whitelistedUsers.length === 0) {
            try {
                state.whitelistedUsers = await getWhitelistedUsers();
            } catch (err) {
                console.error('Failed to fetch whitelist on sign in:', err);
            }
        }

        const matchedUser = state.whitelistedUsers.find(u => u.email === state.userEmail);
        state.userName = matchedUser ? matchedUser.name : (localStorage.getItem('poll_user_name') || session.user.email);

        localStorage.setItem('poll_user_email', state.userEmail);
        localStorage.setItem('poll_user_name', state.userName);

        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.classList.remove('active');
            authModal.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
        showToast(`Dobrodošao, ${state.userName}!`);
        updateUserUI();
    }
});

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

// Handles user selection for direct login from dropdown
function onUserSelected() {
    const selectEl = document.getElementById('user-select');
    const selectedEmail = selectEl.value;
    const user = state.whitelistedUsers.find(u => u.email === selectedEmail);

    if (user) {
        clearFieldError('user-select', 'error-user-select');
        state.userEmail = user.email;
        state.userName = user.name;

        localStorage.setItem('poll_user_email', user.email);
        localStorage.setItem('poll_user_name', user.name);

        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.classList.remove('active');
            authModal.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
        showToast(`Dobrodošao, ${user.name}!`);
        updateUserUI();
    }
}

function showFieldError(inputId, errorId) {
    const field = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (field) field.classList.add('error');
    if (error) error.classList.add('visible');
}

function clearFieldError(inputId, errorId) {
    const field = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    if (field) field.classList.remove('error');
    if (error) error.classList.remove('visible');
}

function updateUserUI() {
    const nameEl = document.getElementById('footer-user-name');
    const avatarEl = document.getElementById('user-avatar-initials');
    if (nameEl) nameEl.innerText = state.userName;
    if (avatarEl) avatarEl.innerText = getInitials(state.userName);
}

async function logoutUser() {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Supabase sign out error:', err);
    }

    localStorage.removeItem('poll_user_email');
    localStorage.removeItem('poll_user_name');
    location.reload();
}

function renderOptions(isNewItemAdded = false, newItemId = null) {
    const container = document.getElementById('options-container');
    const countEl = document.getElementById('options-count');
    if (countEl) countEl.innerText = state.options.length;
    if (!container) return;

    // REMOVE THE LOADING CARD AUTOMATICALLY ONCE DATA RENDERS
    container.querySelectorAll('.loading-card').forEach(el => el.remove());

    const totalWhitelistCount = state.whitelistedUsers.length > 0 ? state.whitelistedUsers.length : 1;
    const sorted = [...state.options].sort((a, b) => (b.voters?.length || 0) - (a.voters?.length || 0));

    // Get current order of card IDs in the DOM
    const currentDomIds = Array.from(container.querySelectorAll('.option-card')).map(card => card.dataset.id);
    const targetSortedIds = sorted.map(opt => String(opt.id));

    // Check if the overall sorting order has actually changed
    const orderChanged = currentDomIds.length !== targetSortedIds.length ||
        currentDomIds.some((id, idx) => id !== targetSortedIds[idx]);

    // Capture rects only if we are reordering
    const prevRects = new Map();
    if (orderChanged) {
        container.querySelectorAll('.option-card').forEach(card => {
            prevRects.set(card.dataset.id, card.getBoundingClientRect());
        });
    }

    const existingCardsMap = new Map();
    container.querySelectorAll('.option-card').forEach(card => {
        existingCardsMap.set(card.dataset.id, card);
    });

    sorted.forEach(opt => {
        const isSelected = state.selectedOptionIds.has(opt.id);
        const votes = opt.voters ? opt.voters.length : 0;
        const pct = Math.round((votes / totalWhitelistCount) * 100) || 0;
        const isBrandNew = isNewItemAdded && opt.id === newItemId;

        let cardEl = existingCardsMap.get(String(opt.id));

        if (cardEl) {
            // SURGICAL IN-PLACE UPDATE (No DOM node re-mounting or flicker)
            cardEl.classList.toggle('selected', isSelected);
            if (isBrandNew) cardEl.classList.add('new-item');

            const fillEl = cardEl.querySelector('.progress-bar-fill');
            if (fillEl && fillEl.style.width !== `${pct}%`) {
                fillEl.style.width = `${pct}%`;
            }

            const progressInfoEl = cardEl.querySelector('.progress-info');
            if (progressInfoEl) {
                progressInfoEl.innerHTML = `<span>Broj glasova: ${votes}</span><span>${pct}%</span>`;
            }

            const votersListContainer = cardEl.querySelector('.voters-list-row');
            if (votersListContainer) {
                const votersListHtml = opt.voters?.length ? opt.voters.map(v => `<span class="voter-tag">${v}</span>`).join('') : '<em>Nema glasova</em>';
                votersListContainer.innerHTML = `<span>Glasali:</span> ${votersListHtml}`;
            }
        } else {
            // CREATE NEW CARD NODE
            cardEl = document.createElement('div');
            cardEl.className = `option-card ${isSelected ? 'selected' : ''} ${isBrandNew ? 'new-item' : ''}`;
            cardEl.dataset.id = opt.id;
            cardEl.setAttribute('onclick', `toggleVote('${opt.id}')`);

            const creatorUser = state.whitelistedUsers.find(u => u.email === opt.created_by);
            const creatorName = creatorUser ? creatorUser.name : (opt.created_by || 'Nepoznato');
            const creatorHtml = `<div class="voters-container" style="margin-bottom: 4px;"><span>Dodao:</span> <span class="voter-tag" style="background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);">${creatorName}</span></div>`;
            const votersList = opt.voters?.length ? opt.voters.map(v => `<span class="voter-tag">${v}</span>`).join('') : '<em>Nema glasova</em>';
            const noteHtml = opt.note ? `<div class="card-note-box"><span class="material-symbols-outlined">chat_bubble</span><span>${opt.note}</span></div>` : '';

            cardEl.innerHTML = `
                <div class="card-cover-container" onclick="event.stopPropagation(); openDetail('${opt.id}')">
                  <img class="card-cover" style="view-transition-name: cover-${String(opt.id).replace(/[^a-zA-Z0-9_-]/g, '')};" src="${opt.image}" alt="${opt.title}" loading="lazy" onError="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80'" />
                  <div class="price-badge">${opt.price}</div>
                  <button class="cover-detail-button" type="button" onclick="event.stopPropagation(); openDetail('${opt.id}')" aria-label="View details for ${opt.title}">Pogledaj detalje ↗</button>
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
        }

        // Only re-append to container if the order actually changed or it's a new element
        if (orderChanged || !existingCardsMap.has(String(opt.id))) {
            container.appendChild(cardEl);
        }
    });

    // Remove deleted cards
    container.querySelectorAll('.option-card').forEach(card => {
        if (!state.options.some(o => String(o.id) === String(card.dataset.id))) {
            card.remove();
        }
    });

    // Run FLIP animation ONLY if rank/order changed
    if (orderChanged) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        container.querySelectorAll('.option-card').forEach((card, index) => {
            const id = card.dataset.id;
            const prevRect = prevRects.get(id);
            if (prevRect && !reducedMotion) {
                const nextRect = card.getBoundingClientRect();
                const deltaY = prevRect.top - nextRect.top;
                const deltaX = prevRect.left - nextRect.left;
                if (Math.abs(deltaY) > 1 || Math.abs(deltaX) > 1) {
                    card.animate([
                        { transform: `translate(${deltaX}px, ${deltaY}px) scale(.985)` },
                        { transform: 'translate(0, 0) scale(1)' }
                    ], { duration: 520, easing: 'cubic-bezier(.2, 1.15, .3, 1)', fill: 'none' });
                }
            }
        });
    }
}
function applyOptimisticVote(optionId, isAdding) {
    const targetOpt = state.options.find(o => String(o.id) === String(optionId));
    if (!targetOpt) return;

    if (!targetOpt.voterEmails) targetOpt.voterEmails = [];
    if (!targetOpt.voters) targetOpt.voters = [];

    if (isAdding) {
        state.selectedOptionIds.add(optionId);
        if (!targetOpt.voterEmails.includes(state.userEmail)) {
            targetOpt.voterEmails.push(state.userEmail);
        }
        if (!targetOpt.voters.includes(state.userName)) {
            targetOpt.voters.push(state.userName);
        }
        state.votes.push({ user_email: state.userEmail, option_id: optionId });
    } else {
        state.selectedOptionIds.delete(optionId);
        targetOpt.voterEmails = targetOpt.voterEmails.filter(email => email !== state.userEmail);
        targetOpt.voters = targetOpt.voters.filter(nameOrEmail =>
            nameOrEmail !== state.userName && nameOrEmail !== state.userEmail
        );
        state.votes = state.votes.filter(v => !(String(v.option_id) === String(optionId) && v.user_email === state.userEmail));
    }

    renderOptions();
    updateDetailModalIfOpen(optionId);
}

function updateDetailModalIfOpen(optionId) {
    if (activeDetailId === null) return;
    const detailOpt = state.options.find(o => String(o.id) === String(activeDetailId));
    if (detailOpt) {
        const votesEl = document.getElementById('detail-votes');
        const voteBtn = document.getElementById('detail-vote');
        if (votesEl) votesEl.textContent = `${detailOpt.voters?.length || 0} glasova`;
        if (voteBtn) voteBtn.textContent = state.selectedOptionIds.has(detailOpt.id)
            ? 'Ukloni svoj glas'
            : 'Glasaj za ovaj smještaj';
    }
}

function scrollToCardIfNeeded(optionId) {
    setTimeout(() => {
        const cardEl = document.querySelector(`.option-card[data-id="${optionId}"]`);
        if (!cardEl) return;
        const rect = cardEl.getBoundingClientRect();
        const visible = rect.top >= 84 && rect.bottom <= window.innerHeight - 110;
        if (!visible) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 360);
}

async function toggleVote(optionId) {
    if (!state.userEmail) {
        showToast('Molimo odaberite korisnika za glasovanje.', 'error');
        return;
    }

    const isAdding = !state.selectedOptionIds.has(optionId);

    applyOptimisticVote(optionId, isAdding);
    scrollToCardIfNeeded(optionId);

    try {
        if (isAdding) {
            await addVote(state.userEmail, optionId);
        } else {
            await removeVote(state.userEmail, optionId);
        }
    } catch (err) {
        console.error('Vote sync failed:', err);
        showToast('Glas nije spremljen. Vraćam stanje…', 'error');
        // Rollback optimistic change on error
        applyOptimisticVote(optionId, !isAdding);
    }
}

let activeDetailId = null;
let toastTimer = null;

function showToast(message, kind = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function closeDetail() {
    const overlay = document.getElementById('detail-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    activeDetailId = null;
}

async function voteFromDetail() {
    if (!activeDetailId) return;
    const id = activeDetailId;
    closeDetail();
    await toggleVote(id);
}

async function autoFetchMetadata() {
    const linkInput = document.getElementById('input-link');
    const titleInput = document.getElementById('input-title');
    const imageInput = document.getElementById('input-image');
    if (!linkInput) return;
    const url = linkInput.value.trim();

    if (!url) return;

    try {
        const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
        const response = await fetch(endpoint);
        const result = await response.json();

        if (!response.ok || result.status !== 'success' || !result.data) {
            return;
        }

        if (result.data.title && titleInput && !titleInput.value.trim()) {
            titleInput.value = result.data.title;
        }

        if (result.data.image?.url && imageInput && !imageInput.value.trim()) {
            imageInput.value = `https://api.microlink.io/?url=${encodeURIComponent(url)}&embed=image.url`;
        }
    } catch (error) {
        console.error('[Metadata] Fetch failed:', error);
    }
}

async function submitNewOption() {
    const titleInput = document.getElementById('input-title');
    const linkInput = document.getElementById('input-link');
    const priceInput = document.getElementById('input-price');
    const imageInput = document.getElementById('input-image');
    const noteInput = document.getElementById('input-note');

    const title = titleInput?.value.trim() || '';
    const link = linkInput?.value.trim() || '';
    const price = priceInput?.value.trim() || 'N/A';
    const rawImage = imageInput?.value.trim() || '';
    const note = noteInput?.value.trim() || '';

    let hasError = false;

    // Clear previous error states
    clearFieldError('input-link', 'error-input-link');
    clearFieldError('input-title', 'error-input-title');
    clearFieldError('input-image', 'error-input-image');

    // 1. Link Validation (Must be a valid URL AND belong to Booking.com or Airbnb)
    if (!link) {
        showFieldError('input-link', 'error-input-link');
        const errEl = document.getElementById('error-input-link');
        if (errEl) errEl.textContent = 'Link je obavezan.';
        hasError = true;
    } else if (!isValidUrl(link)) {
        showFieldError('input-link', 'error-input-link');
        const errEl = document.getElementById('error-input-link');
        if (errEl) errEl.textContent = 'Unesite valjani URL link.';
        hasError = true;
    } else if (!isBookingOrAirbnbUrl(link)) {
        showFieldError('input-link', 'error-input-link');
        const errEl = document.getElementById('error-input-link');
        if (errEl) errEl.textContent = 'Dozvoljeni su isključivo Booking.com i Airbnb linkovi!';
        hasError = true;
    }

    // 2. Title Validation
    if (!title) {
        showFieldError('input-title', 'error-input-title');
        const errEl = document.getElementById('error-input-title');
        if (errEl) errEl.textContent = 'Naziv smještaja je obavezan.';
        hasError = true;
    }

    // 3. Image URL Validation (if user entered a custom image URL)
    let finalImage = fallbackImage;
    if (rawImage) {
        if (!isValidUrl(rawImage)) {
            showFieldError('input-image', 'error-input-image');
            const imgErrEl = document.getElementById('error-input-image');
            if (imgErrEl) imgErrEl.textContent = 'Unesite valjani URL slike.';
            hasError = true;
        } else {
            finalImage = rawImage.startsWith('http') ? rawImage : `https://${rawImage}`;
        }
    }

    if (hasError) return;

    // 4. Duplicate Check
    const normalizedNewLink = normalizeUrl(link);
    const isDuplicate = state.options.some(opt => normalizeUrl(opt.link) === normalizedNewLink);

    if (isDuplicate) {
        showFieldError('input-link', 'error-input-link');
        const errEl = document.getElementById('error-input-link');
        if (errEl) errEl.textContent = 'Ovaj smještaj (link) je već dodan na popis!';
        showToast('Smještaj već postoji na popisu.', 'error');
        return;
    }

    const tempId = 'opt_' + Date.now();
    const formattedLink = link.startsWith('http') ? link : `https://${link}`;

    const creatorUser = state.whitelistedUsers.find(u => u.email === state.userEmail);
    const creatorName = creatorUser ? creatorUser.name : (state.userEmail || 'Nepoznato');

    const newOption = {
        id: tempId,
        title: title,
        link: formattedLink,
        price: price,
        image: finalImage,
        note: note,
        created_by: state.userEmail,
        creatorName: creatorName,
        voterEmails: [],
        voters: []
    };

    closeAddModal();

    state.options = [newOption, ...state.options];
    renderOptions(true, tempId);

    // SCROLL TO NEW CARD AUTOMATICALLY
    scrollToCardIfNeeded(tempId);

    try {
        await addOption({
            id: tempId,
            title,
            link: formattedLink,
            price,
            image: finalImage,
            note,
            created_by: state.userEmail
        });
    } catch (err) {
        console.error('Background add option failed:', err);
        showToast('Smještaj nije spremljen. Uklonjen je iz popisa.', 'error');
        state.options = state.options.filter(o => o.id !== tempId);
        renderOptions();
    }
}

function openAddModal() {
    const overlay = document.getElementById('add-modal');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('input-link')?.focus({ preventScroll: true }), 120);
}

function closeAddModal() {
    const overlay = document.getElementById('add-modal');
    if (overlay) overlay.classList.remove('active');

    const authModal = document.getElementById('auth-modal');
    const detailOverlay = document.getElementById('detail-overlay');
    if (authModal && !authModal.classList.contains('active') && detailOverlay && !detailOverlay.classList.contains('active')) {
        document.body.style.overflow = '';
    }

    const titleInput = document.getElementById('input-title');
    const linkInput = document.getElementById('input-link');
    const priceInput = document.getElementById('input-price');
    const imageInput = document.getElementById('input-image');
    const noteInput = document.getElementById('input-note');

    if (titleInput) titleInput.value = '';
    if (linkInput) linkInput.value = '';
    if (priceInput) priceInput.value = '';
    if (imageInput) imageInput.value = '';
    if (noteInput) noteInput.value = '';

    clearFieldError('input-link', 'error-input-link');
    clearFieldError('input-title', 'error-input-title');
}

async function requestMagicLink() {
    const selectEl = document.getElementById('user-select');
    const selectedEmail = selectEl.value;

    if (!selectedEmail) {
        showFieldError('user-select', 'error-user-select');
        return;
    }

    const user = state.whitelistedUsers.find(u => u.email === selectedEmail);
    if (!user) return;

    const triggerBtn = document.getElementById('btn-verify-trigger');
    triggerBtn.innerText = 'Šaljem Magic Link...';
    triggerBtn.disabled = true;

    try {
        await sendMagicLink(selectedEmail);

        state.userEmail = selectedEmail;
        state.userName = user.name;

        document.getElementById('auth-step-1').style.display = 'none';
        document.getElementById('auth-step-2').style.display = 'block';
        showToast('Magic link poslan na vaš email!');
    } catch (err) {
        console.error('Magic link error:', err);
        showToast('Greška pri slanju linka. Pokušajte ponovno.', 'error');
        triggerBtn.innerText = 'Pošalji Mi Magic Link Na Email';
        triggerBtn.disabled = false;
    }
}

// Expose necessary global actions for HTML inline bindings
window.onUserSelected = onUserSelected;
window.clearFieldError = clearFieldError;
window.requestMagicLink = requestMagicLink;
window.toggleVote = toggleVote;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.voteFromDetail = voteFromDetail;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.submitNewOption = submitNewOption;
window.autoFetchMetadata = autoFetchMetadata;
window.logoutUser = logoutUser;
window.saveOptionDetails = saveOptionDetails;