import { state } from '../../state.js';

let voteRevision = 0;

export function getVoteRevision() {
    return voteRevision;
}

function voteKey(vote) {
    return JSON.stringify([
        String(vote.option_id),
        vote.user_email
    ]);
}

function isCompleteVote(vote) {
    return (
        vote?.option_id != null &&
        typeof vote.user_email === 'string' &&
        Boolean(vote.user_email)
    );
}

export function isVotePending(optionId) {
    return state.pendingVotes.has(String(optionId));
}

// Derive the displayed votes from confirmed records and pending requests.
export function rebuildVoteState() {
    voteRevision++;

    const confirmed = new Map();

    for (const vote of state.votes) {
        if (isCompleteVote(vote)) {
            confirmed.set(voteKey(vote), vote);
        }
    }

    state.votes = [...confirmed.values()];

    const visible = new Map(confirmed);

    for (const pending of state.pendingVotes.values()) {
        const vote = {
            option_id: pending.optionId,
            user_email: pending.userEmail
        };

        if (pending.isAdding) {
            visible.set(voteKey(vote), vote);
        } else {
            visible.delete(voteKey(vote));
        }
    }

    const names = new Map(
        state.whitelistedUsers.map(user => [user.email, user.name])
    );

    const votesByOption = new Map();

    for (const vote of visible.values()) {
        const key = String(vote.option_id);

        if (!votesByOption.has(key)) {
            votesByOption.set(key, []);
        }

        votesByOption.get(key).push(vote);
    }

    state.selectedOptionIds.clear();

    state.options = state.options.map(option => {
        const votes = votesByOption.get(String(option.id)) || [];
        const voterEmails = votes.map(vote => vote.user_email);

        const voters = voterEmails.map(email =>
            names.get(email) ||
            (email === state.userEmail
                ? state.userName || email
                : email)
        );

        if (state.userEmail && voterEmails.includes(state.userEmail)) {
            state.selectedOptionIds.add(option.id);
        }

        return { ...option, voterEmails, voters };
    });
}

export function setConfirmedVote(optionId, userEmail, isAdding) {
    const vote = {
        option_id: optionId,
        user_email: userEmail
    };

    state.votes = state.votes.filter(
        existing => voteKey(existing) !== voteKey(vote)
    );

    if (isAdding) {
        state.votes.push(vote);
    }

    rebuildVoteState();
}

// Return false when the event needs a fresh snapshot from the server.
export function applyRealtimeVote(payload) {
    const {
        eventType,
        new: newVote,
        old: oldVote
    } = payload;

    if (eventType === 'INSERT') {
        if (!isCompleteVote(newVote)) return false;

        state.votes = state.votes.filter(
            vote => voteKey(vote) !== voteKey(newVote)
        );
        state.votes.push(newVote);
    } else if (eventType === 'DELETE' || eventType === 'UPDATE') {
        const recordId = oldVote?.id ??
            (eventType === 'UPDATE' ? newVote?.id : undefined);

        const completeOldVote = isCompleteVote(oldVote);

        const matches = vote =>
            (
                recordId != null &&
                vote.id != null &&
                String(vote.id) === String(recordId)
            ) ||
            (
                completeOldVote &&
                voteKey(vote) === voteKey(oldVote)
            );

        if (!completeOldVote && !state.votes.some(matches)) {
            return false;
        }

        if (eventType === 'UPDATE' && !isCompleteVote(newVote)) {
            return false;
        }

        state.votes = state.votes.filter(vote => !matches(vote));

        if (eventType === 'UPDATE') {
            state.votes = state.votes.filter(
                vote => voteKey(vote) !== voteKey(newVote)
            );
            state.votes.push(newVote);
        }
    } else {
        return false;
    }

    rebuildVoteState();
    return true;
}