import { t } from '../i18n.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { getVotes, getPollData } from './api.js';
import { refreshVotersDialog } from '../components/voters-dialog.js';
import {
    applyRealtimeVote,
    rebuildVoteState,
    getVoteRevision
} from '../shared/helpers/votes.js';
import { renderLeaderboard } from '../components/leaderboard.js';
import {
    renderOptions,
    updateCardSubelements
} from '../components/cards.js';
import {
    updateDetailModalIfOpen,
    closeDetail
} from '../components/modals.js';

export function renderVoteUI({ refreshDetail = false } = {}) {
    refreshVotersDialog();
    state.options.forEach(option => updateCardSubelements(option.id));
    updateDetailModalIfOpen({ refreshContent: refreshDetail });
    return renderLeaderboard();
}

let refreshTask = null;
let refreshVersion = 0;
let pollChannel = null;
let pollRefreshTask = null;
let pollRefreshVersion = 0;
let optionRevision = 0;

// Rejoining does not replay missed Postgres events. Reconcile the whole poll on
// every subscription, including the initial load-to-subscribe gap. Discard a
// snapshot if live events changed state while its requests were in flight.
export function refreshPollFromServer() {
    pollRefreshVersion++;
    if (!pollRefreshTask) {
        pollRefreshTask = (async () => {
            while (true) {
                const version = pollRefreshVersion;
                const optionsBefore = optionRevision;
                const optionsState = state.options;
                const votesBefore = getVoteRevision();
                const requestedEmail = state.userEmail;
                const snapshot = await getPollData();
                if (requestedEmail !== state.userEmail || snapshot.userEmail !== state.userEmail) return;
                if (version !== pollRefreshVersion || optionsBefore !== optionRevision || optionsState !== state.options || votesBefore !== getVoteRevision()) continue;
                state.whitelistedUsers = snapshot.whitelist;
                const names = new Map(snapshot.whitelist.map(user => [user.email, user.name]));
                const serverIds = new Set(snapshot.options.map(option => String(option.id)));
                const pending = [...state.pendingOptions.values()].filter(option => !serverIds.has(String(option.id)));
                state.options = [...pending, ...snapshot.options.map(option => ({
                    ...option, creatorName: names.get(option.created_by) || t('common.unknown')
                }))];
                state.votes = snapshot.votes;
                rebuildVoteState();
                if (state.activeDetailId != null && !state.options.some(option => String(option.id) === String(state.activeDetailId))) closeDetail();
                await renderOptions(false, null, false);
                await renderVoteUI({ refreshDetail: true });
                if (version !== pollRefreshVersion) continue;
                return;
            }
        })().finally(() => { pollRefreshTask = null; });
    }
    return pollRefreshTask;
}

// Share concurrent refreshes and discard responses made stale by newer changes.
export function refreshVotesFromServer() {
    refreshVersion++;

    if (!refreshTask) {
        refreshTask = (async () => {
            while (true) {
                const version = refreshVersion;
                const revision = getVoteRevision();
                const votes = await getVotes();

                if (
                    version !== refreshVersion ||
                    revision !== getVoteRevision()
                ) {
                    continue;
                }

                state.votes = votes;
                rebuildVoteState();
                await renderVoteUI();
                return;
            }
        })().finally(() => {
            refreshTask = null;
        });
    }

    return refreshTask;
}

function requestVoteRefresh() {
    refreshVotesFromServer().catch(error => {
        console.warn('Vote refresh failed:', error);
    });
}

export function setupRealtimeSubscription() {
    if (pollChannel) return pollChannel;

    pollChannel = supabase
        .channel('public-poll-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'votes' },
            payload => {
                // Include our own events: another tab can use the same account.
                if (applyRealtimeVote(payload)) {
                    renderVoteUI();
                } else {
                    requestVoteRefresh();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'options' },
            payload => {
                optionRevision++;
                const newOpt = payload.new;
                const oldOpt = payload.old;

                if (payload.eventType === 'INSERT' && newOpt) {
                    const creatorUser = state.whitelistedUsers.find(
                        user => user.email === newOpt.created_by
                    );

                    const enrichedOpt = {
                        ...newOpt,
                        voterEmails: [],
                        voters: [],
                        creatorName: creatorUser
                            ? creatorUser.name
                            : t('common.unknown')
                    };

                    const alreadyExists = state.options.some(
                        option => String(option.id) === String(newOpt.id)
                    );

                    if (!alreadyExists) {
                        state.options = [enrichedOpt, ...state.options];
                        rebuildVoteState();
                        renderOptions(true, newOpt.id);
                        renderVoteUI();
                    }
                } else if (payload.eventType === 'UPDATE' && newOpt) {
                    state.options = state.options.map(option =>
                        String(option.id) === String(newOpt.id) ? { ...option, ...newOpt } : option
                    );
                    rebuildVoteState();
                    renderOptions(false, null, false);
                    renderVoteUI({ refreshDetail: true });
                } else if (payload.eventType === 'DELETE' && oldOpt) {
                    state.options = state.options.filter(
                        option => String(option.id) !== String(oldOpt.id)
                    );

                    if (
                        state.activeDetailId &&
                        String(state.activeDetailId) === String(oldOpt.id)
                    ) {
                        closeDetail();
                    }

                    renderOptions();
                    renderVoteUI();
                }
            }
        )
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                refreshPollFromServer().catch(error => console.warn('Poll refresh failed:', error));
            }
        });

    return pollChannel;
}
