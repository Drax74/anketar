export const state = {
    userEmail: localStorage.getItem('poll_user_email') || '',
    userName: localStorage.getItem('poll_user_name') || '',
    selectedOptionIds: new Set(),
    options: [],
    votes: [],
    whitelistedUsers: [],
    activeDetailId: null,
    cooldownTimer: null,
    savingVotes: false
};