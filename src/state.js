export const state = {
    userEmail: '',
    userName: '',
    selectedOptionIds: new Set(),
    options: [],
    votes: [],
    whitelistedUsers: [],
    activeDetailId: null,
    cooldownTimer: null,
    savingVotes: false,
    pendingVotes: new Map()
};