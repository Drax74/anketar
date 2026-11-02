import { mockScenarios } from './data.js';
import { readMockData, currentMockMember, switchMockUser, resetMockData, simulateMockVote } from './store.js';
import './mock-tools.css';

export function mountMockTools() {
    if (new URLSearchParams(location.search).get('mockControls') === '0') return;
    const data = readMockData();
    const tools = document.createElement('details');
    tools.className = 'mock-tools';
    tools.innerHTML = '<summary class="mock-tools__summary">MOCK · 32 users</summary><div class="mock-tools__panel"><p class="mock-tools__notice">Fictional local data · no Supabase connection</p><label class="mock-tools__label">User<select class="mock-tools__select" aria-label="Mock user"></select></label><label class="mock-tools__label">Scenario<select class="mock-tools__select" aria-label="Mock scenario"></select></label><button class="mock-tools__button" type="button" data-mock-vote>Simulate another user’s vote</button><button class="mock-tools__button" type="button" data-mock-reset>Reset mock data</button></div>';
    const userSelect = tools.querySelector('[aria-label="Mock user"]');
    for (const member of data.members) {
        const option = new Option(`${member.name} · ${member.role}`, member.email);
        option.selected = member.email === currentMockMember().email;
        userSelect.add(option);
    }
    userSelect.addEventListener('change', () => switchMockUser(userSelect.value));
    const scenarioSelect = tools.querySelector('[aria-label="Mock scenario"]');
    for (const scenario of mockScenarios) {
        const option = new Option(scenario, scenario);
        option.selected = scenario === data.scenario;
        scenarioSelect.add(option);
    }
    scenarioSelect.addEventListener('change', () => resetMockData(scenarioSelect.value));
    tools.querySelector('[data-mock-reset]').addEventListener('click', () => resetMockData(scenarioSelect.value));
    tools.querySelector('[data-mock-vote]').disabled = data.options.length === 0;
    tools.querySelector('[data-mock-vote]').addEventListener('click', simulateMockVote);
    const hide = document.createElement('button');
    hide.className = 'mock-tools__button';
    hide.type = 'button';
    hide.textContent = 'Hide controls (reload to restore)';
    hide.addEventListener('click', () => tools.remove());
    tools.querySelector('.mock-tools__panel').append(hide);
    document.body.append(tools);
}
