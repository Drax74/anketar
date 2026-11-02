export const state = {
    pendingOptions: new Map(),
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
