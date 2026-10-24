import { state } from './state.js';
import { getPollData } from './services/api.js';
import { setupRealtimeSubscription } from './services/realtime.js';
import { renderOptions, scrollToCardIfNeeded, updateCardSubelements } from './components/cards.js';
import { openDetail, closeDetail, saveOptionDetails, openAddModal, closeAddModal, submitNewOption, requestMagicLink, showToast } from './components/modals.js';
import { addVote, removeVote } from './services/api.js';

async function toggleVote(optionId) {
    if (!state.userEmail) {
        showToast('Molimo odaberite korisnika za glasovanje.', 'error');
        return;
    }

    const isAdding = !state.selectedOptionIds.has(optionId);
    applyOptimisticVote(optionId, isAdding);
    scrollToCardIfNeeded(optionId);

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

function onUserSelected() {
    const selectEl = document.getElementById('user-select');
    const user = state.whitelistedUsers.find(u => u.email === selectEl?.value);
    if (user) {
        state.userEmail = user.email;
        state.userName = user.name;
        localStorage.setItem('poll_user_email', user.email);
        localStorage.setItem('poll_user_name', user.name);

        document.getElementById('auth-modal')?.classList.remove('active');
        document.body.style.overflow = '';
        showToast(`Dobrodošao, ${user.name}!`);
        updateUserUI();
    }
}

function updateUserUI() {
    const nameEl = document.getElementById('footer-user-name');
    const avatarEl = document.getElementById('user-avatar-initials');
    if (nameEl) nameEl.innerText = state.userName;
    if (avatarEl) avatarEl.innerText = state.userName.substring(0, 2).toUpperCase();
}

async function logoutUser() {
    localStorage.clear();
    location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { whitelist, options, votes } = await getPollData();
        state.whitelistedUsers = whitelist;
        state.votes = votes;

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

        state.options = options.map(opt => {
            const optVotes = votes.filter(v => v.option_id === opt.id);
            const voterEmails = optVotes.map(v => v.user_email);
            const voterNames = optVotes.map(v => whitelist.find(u => u.email === v.user_email)?.name || v.user_email);
            const creator = whitelist.find(u => u.email === opt.created_by);
            return { ...opt, voterEmails, voters: voterNames, creatorName: creator ? creator.name : 'Nepoznato' };
        });

        if (state.userEmail) {
            const user = whitelist.find(u => u.email === state.userEmail);
            state.userName = user ? user.name : state.userEmail;
            state.options.forEach(opt => {
                if (opt.voterEmails?.includes(state.userEmail)) state.selectedOptionIds.add(opt.id);
            });
            document.getElementById('auth-modal')?.classList.remove('active');
            updateUserUI();
        } else {
            document.getElementById('auth-modal')?.classList.add('active');
        }

        await renderOptions(false, null, false);
        setupRealtimeSubscription();
    } catch (err) {
        console.error('Initialization error:', err);
    }
});

// Expose globals for HTML inline listeners
window.toggleVote = toggleVote;
window.toggleManualSort = toggleManualSort;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.voteFromDetail = voteFromDetail;
window.saveOptionDetails = saveOptionDetails;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.submitNewOption = submitNewOption;
window.requestMagicLink = requestMagicLink;
window.onUserSelected = onUserSelected;
window.logoutUser = logoutUser;