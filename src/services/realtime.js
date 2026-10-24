import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { renderLeaderboard } from '../components/leaderboard.js';
import { renderOptions, updateCardSubelements } from '../components/cards.js';
import { updateDetailModalIfOpen, closeDetail } from '../components/modals.js';

export function setupRealtimeSubscription() {
    supabase.channel('public-poll-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, payload => {
            const newVote = payload.new;
            const oldVote = payload.old;
            const eventUserEmail = newVote?.user_email || oldVote?.user_email;
            const targetOptionId = newVote?.option_id || oldVote?.option_id;

            if (eventUserEmail && eventUserEmail === state.userEmail) return;

            if (payload.eventType === 'INSERT' && newVote) {
                state.votes = [...state.votes, newVote];
                state.options = state.options.map(opt => {
                    if (String(opt.id) === String(newVote.option_id)) {
                        const voterEmails = [...(opt.voterEmails || []), newVote.user_email];
                        const whitelistedUser = state.whitelistedUsers.find(u => u.email === newVote.user_email);
                        const voterName = whitelistedUser ? whitelistedUser.name : newVote.user_email;
                        return { ...opt, voterEmails, voters: [...(opt.voters || []), voterName] };
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

            if (targetOptionId) updateCardSubelements(targetOptionId);
            renderLeaderboard();
            updateDetailModalIfOpen();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'options' }, payload => {
            const newOpt = payload.new;
            const oldOpt = payload.old;
            if (newOpt?.created_by === state.userEmail || oldOpt?.created_by === state.userEmail) return;

            if (payload.eventType === 'INSERT' && newOpt) {
                const creatorUser = state.whitelistedUsers.find(u => u.email === newOpt.created_by);
                const enrichedOpt = { ...newOpt, voterEmails: [], voters: [], creatorName: creatorUser ? creatorUser.name : 'Nepoznato' };
                if (!state.options.some(o => String(o.id) === String(newOpt.id))) {
                    state.options = [enrichedOpt, ...state.options];
                    renderOptions(true, newOpt.id);
                }
            } else if (payload.eventType === 'DELETE' && oldOpt) {
                state.options = state.options.filter(opt => String(opt.id) !== String(oldOpt.id));
                if (state.activeDetailId && String(state.activeDetailId) === String(oldOpt.id)) closeDetail();
                renderOptions();
            }
        })
        .subscribe();
}