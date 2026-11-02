import { t } from './i18n.js';
import '@fontsource-variable/inter/wght.css';
import './styles/fonts.css';
import { setupAppNavigation, showAppView } from './components/app-navigation.js';
import { setupTouchControls } from './components/touch-controls.js';
import { getInitials } from './shared/helpers/format.js';
import { state } from './state.js';
import { getPollData } from './services/api.js';
import { refreshVotesFromServer, renderVoteUI, setupRealtimeSubscription} from './services/realtime.js';
import { initAuthListener, checkInitialSession, logoutUserSession, loginWithGoogle } from './services/auth.js';
import { findOptionCard, renderOptions, scrollToCardIfNeeded } from './components/cards.js';
import { renderLeaderboard } from './components/leaderboard.js';
import { openDetail, closeDetail, saveOptionDetails } from './components/modals.js';
import { addVote, removeVote } from './services/api.js';
import { isVotePending, rebuildVoteState, setConfirmedVote } from './shared/helpers/votes.js';
import { showToast } from './components/toast.js';
import { openAddModal, closeAddModal,submitNewOption } from './components/add-modal.js';
async function toggleVote(optionId) {
    if (!state.userEmail) {
        showToast(t('votes.signIn'), 'error');
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
            t('votes.unconfirmed'),
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
                t('votes.unavailable'),
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
    btn.classList.remove('is-popping', 'vote-button--popping');
    void btn.offsetWidth;
    btn.classList.add('is-popping', 'vote-button--popping');
    setTimeout(() => btn.classList.remove('is-popping', 'vote-button--popping'), 320);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const layer = btn.querySelector('.vote-heart-particles');
        if (layer) {
            layer.replaceChildren();
            const colors = ['#FFC857', '#ff536b'];

            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 * i) / 6;
                const distance = 12 + (i % 3) * 4;
                const particle = document.createElement('span');

                particle.className = 'vote-heart-particle vote-heart-particles__particle';
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
    showToast(t('stays.sorted'));
}

async function voteFromDetail() {
    if (!state.activeDetailId) return;
    const id = state.activeDetailId;
    closeDetail();
    await toggleVote(id);
}

function updateUserUI() {
    const displayName = state.userName || state.userEmail || t('user.fallback');
    const initials = getInitials(displayName);

    const nameEl = document.getElementById('footer-user-name');
    const avatarEl = document.getElementById('user-avatar-initials');
    const emailEl = document.getElementById('footer-user-email');
    if (nameEl) nameEl.innerText = displayName;
    if (avatarEl) avatarEl.innerText = initials;
    if (emailEl) emailEl.innerText = state.userEmail || '';

    const desktopAvatarEl = document.getElementById('desktop-user-avatar-initials');
    if (desktopAvatarEl) desktopAvatarEl.innerText = initials;
}

function setPollAvailability(available) {
    document.querySelectorAll('[data-add-accommodation], #btn-manual-sort').forEach(button => {
        button.disabled = !available;
    });
}

function showPollMessage(message, onRetry = null, { loading = false } = {}) {
    const teaser = document.getElementById('leader-teaser');
    if (teaser) {
        teaser.hidden = !loading;
        teaser.disabled = loading;
        teaser.setAttribute('aria-busy', String(loading));
    }
    for (const id of ['options-container', 'leaderboard-container', 'leaderboard-preview']) {
        const container = document.getElementById(id);
        if (!container) continue;
        const notice = document.createElement('div');
        notice.className = 'poll-status';
        notice.setAttribute('role', 'status');
        const text = document.createElement('p');
        text.className = 'poll-status__message';
        text.textContent = message;
        notice.append(text);
        if (loading && id === 'options-container') {
            notice.classList.add('poll-status--loading');
            const skeletons = document.createElement('div');
            skeletons.className = 'poll-status__skeletons';
            skeletons.setAttribute('aria-hidden', 'true');
            for (let index = 0; index < 3; index++) {
                const card = document.createElement('div');
                card.className = 'poll-status__skeleton';
                card.innerHTML = '<div class="poll-status__skeleton-image"></div><div class="poll-status__skeleton-line"></div><div class="poll-status__skeleton-line poll-status__skeleton-line--short"></div>';
                skeletons.append(card);
            }
            notice.append(skeletons);
        }
        if (typeof onRetry === 'function') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary poll-status__action';
            button.textContent = t('common.retry');
            button.addEventListener('click', onRetry);
            notice.append(button);
        }
        container.replaceChildren(notice);
    }
    document.querySelectorAll('.options-count').forEach(element => { element.textContent = '0'; });
}

async function initializeApp() {
    setupAppNavigation();
    setPollAvailability(false);
    await checkInitialSession();

    let pollLoaded = false;
    let loading = false;

    initAuthListener(({ identityChanged }) => {
        if (identityChanged) {
            closeDetail({ immediate: true });
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
            showPollMessage(t('poll.signIn'));
            return;
        }

        loading = true;
        pollLoaded = false;
        showPollMessage(t('poll.loading'), null, { loading: true });

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
                    creatorName: creator ? creator.name : t('common.unknown')
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
            setPollAvailability(true);
            setupRealtimeSubscription();
            window.dispatchEvent(new Event('poll:ready'));
        } catch (error) {
            if (requestedEmail !== state.userEmail) return;

            console.error('Poll loading failed:', error);
            setPollAvailability(false);

            state.whitelistedUsers = [];
            state.options = [];
            state.votes = [];
            rebuildVoteState();

            if (error.code === 'AUTH_REQUIRED') {
                await checkInitialSession();
                updateUserUI();

                document.getElementById('auth-modal')
                    ?.classList.add('active');

                showPollMessage(t('poll.signIn'));
            } else if (error.code === 'ACCESS_NOT_APPROVED') {
                showPollMessage(
                    t('poll.notApproved'),
                    loadPollData
                );
            } else {
                showPollMessage(
                    t('poll.failed'),
                    loadPollData
                );
            }
        } finally {
            loading = false;
        }
    }

    setupTouchControls({
        refresh: loadPollData,
        canRefresh: () => !loading && pollLoaded && state.pendingVotes.size === 0
    });
    updateUserUI();
    await loadPollData();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
else initializeApp();

export async function handleNewOptionSubmission() {
    const tempId = await submitNewOption();
    if (tempId) {
        showAppView('stays');
        scrollToCardIfNeeded(tempId);
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu) {
        const expanded = menu.classList.toggle('active');
        document.getElementById('floating-avatar-btn')?.setAttribute('aria-expanded', String(expanded));
    }
}

document.addEventListener('click', (e) => {
    const container = document.querySelector('.profile-menu');
    const menu = document.getElementById('user-dropdown-menu');
    if (container && menu && !container.contains(e.target)) {
        menu.classList.remove('active');
        document.getElementById('floating-avatar-btn')?.setAttribute('aria-expanded', 'false');
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
window.submitNewOption = handleNewOptionSubmission;
window.loginWithGoogle = loginWithGoogle;
window.logoutUser = logoutUserSession;
window.toggleUserMenu = toggleUserMenu;
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        document.getElementById('user-dropdown-menu')?.classList.remove('active');
        document.getElementById('floating-avatar-btn')?.setAttribute('aria-expanded', 'false');
    }
});
