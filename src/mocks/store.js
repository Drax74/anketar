import { createMockData } from './data.js';

const dataKey = 'anketar-mock-data-v1';
const userKey = 'anketar-mock-user';
const events = new EventTarget();
const channel = new BroadcastChannel('anketar-mock-changes-v1');

export function readMockData() {
    try {
        const data = JSON.parse(localStorage.getItem(dataKey));
        if (data?.version === 1 && Array.isArray(data.members) && data.members.length && Array.isArray(data.options) && Array.isArray(data.votes)) return data;
    } catch { /* A corrupted demo cache is safe to reset. */ }
    const data = createMockData();
    writeMockData(data);
    return data;
}

export function writeMockData(data) { localStorage.setItem(dataKey, JSON.stringify(data)); }

export function withMockWrite(operation) {
    // localStorage writes alone do not make a read/modify/write atomic across
    // tabs. Serialize mock mutations when the browser supports Web Locks.
    if (navigator.locks) return navigator.locks.request(dataKey, () => operation(readMockData()));
    return Promise.resolve(operation(readMockData()));
}

export function currentMockMember() {
    const { members } = readMockData();
    return members.find(member => member.email === sessionStorage.getItem(userKey)) || members[0];
}

export function switchMockUser(email) {
    sessionStorage.setItem(userKey, email);
    location.reload();
}

export async function resetMockData(scenario) {
    await withMockWrite(() => writeMockData(createMockData(scenario)));
    channel.postMessage({ reset: true });
    location.reload();
}

export function onMockChange(callback) {
    events.addEventListener('change', event => callback(event.detail));
}

export function publishMockChange(table, type, record = {}, old_record = {}) {
    const change = structuredClone({ table, type, record, old_record });
    events.dispatchEvent(new CustomEvent('change', { detail: change }));
    channel.postMessage(change);
}

channel.addEventListener('message', event => {
    if (event.data.reset) location.reload();
    else events.dispatchEvent(new CustomEvent('change', { detail: event.data }));
});

export function simulateMockVote() {
    return withMockWrite(data => {
        const option = data.options[0];
        if (!option) return;
        const ownEmail = currentMockMember().email;
        const member = data.members.find(member => member.email !== ownEmail && !data.votes.some(vote => vote.option_id === option.id && vote.user_email === member.email)) || data.members.find(member => member.email !== ownEmail);
        const previous = data.votes.find(vote => vote.option_id === option.id && vote.user_email === member.email);
        if (previous) {
            data.votes = data.votes.filter(vote => vote.id !== previous.id);
            writeMockData(data);
            publishMockChange('votes', 'DELETE', {}, { id: previous.id });
        } else {
            const vote = { id: crypto.randomUUID(), option_id: option.id, user_email: member.email };
            data.votes.push(vote);
            writeMockData(data);
            publishMockChange('votes', 'INSERT', vote);
        }
    });
}
