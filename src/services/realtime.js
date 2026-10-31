import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { getVotes } from './api.js';
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

export function renderVoteUI() {
    state.options.forEach(option => updateCardSubelements(option.id));
    updateDetailModalIfOpen();
    return renderLeaderboard();
}

let refreshTask = null;
let refreshVersion = 0;
let pollChannel = null;

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
                const newOpt = payload.new;
                const oldOpt = payload.old;

                if (
                    newOpt?.created_by === state.userEmail ||
                    oldOpt?.created_by === state.userEmail
                ) {
                    return;
                }

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
                            : 'Nepoznato'
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
                }
            }
        )
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                requestVoteRefresh();
            }
        });

    return pollChannel;
}