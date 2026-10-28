import { state } from './state.js';
import { getPollData } from './services/api.js';
import { setupRealtimeSubscription } from './services/realtime.js';
import { initAuthListener, checkInitialSession, logoutUserSession, loginWithGoogle } from './services/auth.js';
import { renderOptions, scrollToCardIfNeeded, updateCardSubelements } from './components/cards.js';
import { renderLeaderboard } from './components/leaderboard.js';
import { openDetail, closeDetail, saveOptionDetails, openAddModal, closeAddModal, submitNewOption, showToast, updateDetailModalIfOpen } from './components/modals.js';
import { addVote, removeVote } from './services/api.js';

async function toggleVote(optionId) {
    if (!state.userEmail) {
        showToast('Molimo prijavite se za glasovanje.', 'error');
        return;
    }

    const isAdding = !state.selectedOptionIds.has(optionId);
    applyOptimisticVote(optionId, isAdding);

    try {
        if (isAdding) await addVote(state.userEmail, optionId);
        else await removeVote(state.userEmail, optionId);
    } catch (err) {
        console.error('Vote sync failed:', err);
        showToast('Glas nije spremljen. Vraćam stanje…', 'error');
        applyOptimisticVote(optionId, !isAdding);
    }
}

function applyOptimisticVote(optionId, isAdding) {
    const targetOpt = state.options.find(o => String(o.id) === String(optionId));
    if (!targetOpt) return;

    if (!targetOpt.voterEmails) targetOpt.voterEmails = [];
    if (!targetOpt.voters) targetOpt.voters = [];

    if (isAdding) {
        state.selectedOptionIds.add(optionId);
        if (!targetOpt.voterEmails.includes(state.userEmail)) targetOpt.voterEmails.push(state.userEmail);
        if (!targetOpt.voters.includes(state.userName)) targetOpt.voters.push(state.userName);
        state.votes.push({ user_email: state.userEmail, option_id: optionId });
    } else {
        state.selectedOptionIds.delete(optionId);
        targetOpt.voterEmails = targetOpt.voterEmails.filter(e => e !== state.userEmail);
        targetOpt.voters = targetOpt.voters.filter(n => n !== state.userName && n !== state.userEmail);
        state.votes = state.votes.filter(v => !(String(v.option_id) === String(optionId) && v.user_email === state.userEmail));
    }

    updateCardSubelements(optionId);
    updateDetailModalIfOpen(); // Updates both heart button and voters stack row inside active detail modal!
    renderLeaderboard(true);

    if (isAdding) {
        triggerHeartAnimation(optionId);
    }
}

function triggerHeartAnimation(optionId) {
    const cardEl = document.querySelector(`.option-card[data-id="${optionId}"]`);
    if (cardEl) {
        animateHeartButton(cardEl.querySelector('.card-heart-btn'));
    }

    const detailOverlay = document.getElementById('detail-overlay');
    if (detailOverlay && detailOverlay.classList.contains('active') && String(state.activeDetailId) === String(optionId)) {
        animateHeartButton(detailOverlay.querySelector('.card-heart-btn'));
    }
}

function animateHeartButton(btn) {
    if (!btn) return;
    const icon = btn.querySelector('.material-symbols-outlined');
    if (!icon) return;

    icon.getAnimations().forEach(a => a.cancel());
    btn.classList.remove('is-popping');
    void btn.offsetWidth;
    btn.classList.add('is-popping');
    setTimeout(() => btn.classList.remove('is-popping'), 450);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const layer = btn.querySelector('.vote-heart-particles');
        if (layer) {
            layer.replaceChildren();
            const colors = ['#FFC857', '#FF647F', '#F5F5F5', '#E8A1B0'];

            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8;
                const distance = 18 + (i % 3) * 5;
                const particle = document.createElement('span');

                particle.className = 'vote-heart-particle';
                particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
                particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
                particle.style.setProperty('--particle-color', colors[i % colors.length]);

                layer.appendChild(particle);
                particle.addEventListener('animationend', () => particle.remove(), { once: true });
            }
        }
    }
}

async function toggleManualSort() {
    state.options.sort((a, b) => {
        const votesA = a.voters?.length || 0;
        const votesB = b.voters?.length || 0;
        if (votesB !== votesA) return votesB - votesA;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });
    await renderOptions(false, null, true);
    showToast('Smještaji sortirani po broju glasova!');
}

async function voteFromDetail() {
    if (!state.activeDetailId) return;
    const id = state.activeDetailId;
    closeDetail();
    await toggleVote(id);
}

function updateUserUI() {
    const displayName = state.userName || state.userEmail || 'Korisnik';
    const initials = displayName.substring(0, 2).toUpperCase();

    const nameEl = document.getElementById('footer-user-name');
    const avatarEl = document.getElementById('user-avatar-initials');
    const emailEl = document.getElementById('footer-user-email');
    if (nameEl) nameEl.innerText = displayName;
    if (avatarEl) avatarEl.innerText = initials;
    if (emailEl) emailEl.innerText = state.userEmail || '';

    const desktopAvatarEl = document.getElementById('desktop-user-avatar-initials');
    if (desktopAvatarEl) desktopAvatarEl.innerText = initials;
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkInitialSession();

        const { whitelist, options, votes } = await getPollData();
        state.whitelistedUsers = whitelist;
        state.votes = votes;

        state.options = options.map(opt => {
            const optVotes = votes.filter(v => v.option_id === opt.id);
            const voterEmails = optVotes.map(v => v.user_email);
            const voterNames = optVotes.map(v => whitelist.find(u => u.email === v.user_email)?.name || v.user_email);
            const creator = whitelist.find(u => u.email === opt.created_by);
            return { ...opt, voterEmails, voters: voterNames, creatorName: creator ? creator.name : 'Nepoznato' };
        });

        if (state.userEmail) {
            const user = whitelist.find(u => u.email === state.userEmail);
            state.userName = user ? user.name : (state.userName || state.userEmail);
            state.options.forEach(opt => {
                if (opt.voterEmails?.includes(state.userEmail)) state.selectedOptionIds.add(opt.id);
            });
            document.getElementById('auth-modal')?.classList.remove('active');
            updateUserUI();
        } else {
            document.getElementById('auth-modal')?.classList.add('active');
        }

        await renderOptions(false, null, false);
        await renderLeaderboard(false);

        initAuthListener(() => {
            if (state.userEmail) {
                const user = state.whitelistedUsers.find(u => u.email === state.userEmail);
                state.userName = user ? user.name : (state.userName || state.userEmail);
            }
            updateUserUI();
        });

        setupRealtimeSubscription();
    } catch (err) {
        console.error('Initialization error:', err);
        await renderOptions(false, null, false);
        await renderLeaderboard(false);
    }
});

export async function handleNewOptionSubmission() {
    const tempId = await submitNewOption();
    if (tempId) {
        scrollToCardIfNeeded(tempId);
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

document.addEventListener('click', (e) => {
    const container = document.querySelector('.floating-user-container');
    const menu = document.getElementById('user-dropdown-menu');
    if (container && menu && !container.contains(e.target)) {
        menu.classList.remove('active');
    }
});

window.toggleVote = toggleVote;
window.toggleManualSort = toggleManualSort;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.voteFromDetail = voteFromDetail;
window.saveOptionDetails = saveOptionDetails;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.submitNewOption = submitNewOption;
window.loginWithGoogle = loginWithGoogle;
window.logoutUser = logoutUserSession;
window.toggleUserMenu = toggleUserMenu;