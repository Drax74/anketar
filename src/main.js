import { state } from './state.js';
import { getPollData } from './services/api.js';
import { refreshVotesFromServer, renderVoteUI, setupRealtimeSubscription} from './services/realtime.js';
import { initAuthListener, checkInitialSession, logoutUserSession, loginWithGoogle } from './services/auth.js';
import { findOptionCard, renderOptions, scrollToCardIfNeeded } from './components/cards.js';
import { renderLeaderboard } from './components/leaderboard.js';
import { openDetail, closeDetail, saveOptionDetails } from './components/modals.js';
import { addVote, removeVote } from './services/api.js';
import { isVotePending, rebuildVoteState, setConfirmedVote } from "./shared/helpers/votes";
import { showToast } from "./components/toast";
import { openAddModal, closeAddModal,submitNewOption } from "./components/add-modal";
async function toggleVote(optionId) {
    if (!state.userEmail) {
        showToast('Molimo prijavite se za glasovanje.', 'error');
        return;
    }

    const option = state.options.find(
        item => String(item.id) === String(optionId)
    );

    if (!option || isVotePending(option.id)) return;

    const key = String(option.id);
    const userEmail = state.userEmail;
    const isAdding = !state.selectedOptionIds.has(option.id);

    state.pendingVotes.set(key, {
        optionId: option.id,
        userEmail,
        isAdding
    });

    rebuildVoteState();
    renderVoteUI();

    if (isAdding) {
        triggerHeartAnimation(option.id);
    }

    let failed = false;

    try {
        if (isAdding) {
            await addVote(userEmail, option.id);
        } else {
            await removeVote(userEmail, option.id);
        }

        setConfirmedVote(option.id, userEmail, isAdding);
    } catch (error) {
        failed = true;
        console.error('Vote sync failed:', error);
        showToast(
            'Spremanje glasa nije potvrđeno. Provjeravam stanje…',
            'error'
        );
    } finally {
        state.pendingVotes.delete(key);
        rebuildVoteState();
        renderVoteUI();
    }

    // The server may have accepted a write before its response was lost.
    if (failed) {
        try {
            await refreshVotesFromServer();
        } catch (error) {
            console.warn('Vote reconciliation failed:', error);
            showToast(
                'Stanje glasova nije moguće provjeriti. Osvježite stranicu kada veza proradi.',
                'error'
            );
        }
    }
}

function triggerHeartAnimation(optionId) {
    const cardEl = findOptionCard(optionId);
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

function showPollMessage(message, onRetry = null) {
    const container = document.getElementById('options-container');

    if (container) {
        const notice = document.createElement('div');
        notice.className = 'empty-state-container';

        const text = document.createElement('p');
        text.textContent = message;
        notice.append(text);

        if (typeof onRetry === 'function') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary';
            button.textContent = 'Pokušaj ponovno';
            button.addEventListener('click', onRetry);
            notice.append(button);
        }

        container.replaceChildren(notice);
        container.classList.add('loaded');
    }

    document.getElementById('leaderboard-container')?.replaceChildren();

    document.querySelectorAll('.options-count').forEach(element => {
        element.textContent = '0';
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkInitialSession();

    let pollLoaded = false;
    let loading = false;

    initAuthListener(({ identityChanged }) => {
        if (identityChanged) {
            closeDetail();
            closeAddModal();
            window.location.reload();
            return;
        }

        if (state.userEmail) {
            const user = state.whitelistedUsers.find(
                user => user.email === state.userEmail
            );

            state.userName = user
                ? user.name
                : (state.userName || state.userEmail);
        }

        updateUserUI();

        if (pollLoaded) {
            rebuildVoteState();
            renderVoteUI();
        }
    });

    async function loadPollData() {
        if (loading) return;

        const requestedEmail = state.userEmail;

        if (!requestedEmail) {
            showPollMessage('Prijavite se za pristup glasovanju.');
            return;
        }

        loading = true;
        pollLoaded = false;
        showPollMessage('Učitavanje podataka…');

        try {
            const {
                userEmail,
                whitelist,
                options,
                votes
            } = await getPollData();

            if (
                requestedEmail !== state.userEmail ||
                userEmail !== state.userEmail
            ) {
                return;
            }

            state.whitelistedUsers = whitelist;
            state.votes = votes;

            state.options = options.map(option => {
                const creator = whitelist.find(
                    user => user.email === option.created_by
                );

                return {
                    ...option,
                    creatorName: creator ? creator.name : 'Nepoznato'
                };
            });

            const currentUser = whitelist.find(
                user => user.email === state.userEmail
            );

            state.userName = currentUser
                ? currentUser.name
                : (state.userName || state.userEmail);

            rebuildVoteState();
            updateUserUI();

            await renderOptions(false, null, false);
            await renderLeaderboard(false);

            pollLoaded = true;
            setupRealtimeSubscription();
        } catch (error) {
            if (requestedEmail !== state.userEmail) return;

            console.error('Poll loading failed:', error);

            state.whitelistedUsers = [];
            state.options = [];
            state.votes = [];
            rebuildVoteState();

            if (error.code === 'AUTH_REQUIRED') {
                await checkInitialSession();
                updateUserUI();

                document.getElementById('auth-modal')
                    ?.classList.add('active');

                showPollMessage('Prijavite se za pristup glasovanju.');
            } else if (error.code === 'ACCESS_NOT_APPROVED') {
                showPollMessage(
                    'Vaš račun nema odobren pristup ovom glasovanju. Obratite se administratoru.',
                    loadPollData
                );
            } else {
                showPollMessage(
                    'Podatke nije moguće učitati. Provjerite vezu i pokušajte ponovno.',
                    loadPollData
                );
            }
        } finally {
            loading = false;
        }
    }

    updateUserUI();
    await loadPollData();
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