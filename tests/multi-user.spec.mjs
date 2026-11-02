import { test as base, expect } from '@playwright/test';
import { createPollBackend, mockPoll } from './fixtures/poll.mjs';
import { createRealtimeHub } from './fixtures/realtime.mjs';

const test = base.extend({
    secondRole: ['user', { option: true }],
    duo: async ({ browser, baseURL, secondRole }, use) => {
        const backend = createPollBackend();
        backend.members[1].role = secondRole;
        const hub = createRealtimeHub(backend);
        const contexts = [];
        const sessions = [];
        const errors = [];
        const navigations = [0, 0];
        try {
            for (let index = 0; index < 2; index++) {
                const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
                contexts.push(context);
                const page = await context.newPage();
                page.on('pageerror', error => errors.push(error.message));
                page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations[index]++; });
                await mockPoll(page, { backend, memberIndex: index, realtimeHub: hub, clientName: String(index) });
                sessions.push(page);
            }
            await Promise.all(sessions.map(page => page.goto('./')));
            for (const page of sessions) await expect(page.locator('.stay-card')).toHaveCount(5);
            for (let index = 0; index < 2; index++) {
                const email = backend.members[index].email;
                await expect.poll(() => hub.clients.get(String(index)).joins).toBe(1);
                await expect.poll(() => backend.requests.filter(request => request.email === email && request.table === 'votes' && request.method === 'GET').length).toBeGreaterThan(1);
            }
            await expect(sessions[0].locator('#footer-user-name')).toHaveText('Marko Kovač');
            await expect(sessions[1].locator('#footer-user-name')).toHaveText('Ana Novak');
            await use({ a: sessions[0], b: sessions[1], backend, hub });
            expect(errors).toEqual([]);
            expect(navigations).toEqual([1, 1]);
        } finally {
            await Promise.all(contexts.map(context => context.close()));
        }
    }
});

const card = (page, id) => page.locator(`.stay-card[data-id="${id}"]`);
const count = (page, id) => card(page, id).locator('.voter-stack__summary');
const vote = (page, id) => card(page, id).locator('.card-heart-btn');

async function addStay(page, price = '650') {
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://www.airbnb.com/rooms/realtime-new');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#add-step-2')).toBeVisible();
    await page.locator('#input-price').fill(price);
    await page.locator('#btn-add-submit').click();
}

test('a new accommodation arrives in the other session and can be voted on immediately', async ({ duo: { a, b, backend, hub } }) => {
    hub.duplicateEvents = true;
    await addStay(a);
    await expect(b.locator('.stay-card')).toHaveCount(6);
    await expect(a.locator('.stay-card')).toHaveCount(6);
    const id = backend.options.at(-1).id;
    await expect(card(b, id).locator('.stay-card__title-button')).toHaveText('Novi loft');
    await expect(card(b, id).locator('.stay-card__creator')).toHaveText('Prijedlog: Marko Kovač');
    await vote(b, id).click();
    await expect(count(a, id)).toHaveText('1 glas');
    await expect(count(b, id)).toHaveText('1 glas');
    await expect(vote(a, id)).toHaveAttribute('aria-pressed', 'false');
    await expect(vote(b, id)).toHaveAttribute('aria-pressed', 'true');
    expect(hub.events.some(event => event.table === 'options' && event.type === 'INSERT')).toBe(true);
});

test('vote add/remove updates both sessions, ranking positions, avatars and open details', async ({ duo: { a, b, hub } }) => {
    hub.duplicateEvents = true;
    await b.locator('.app-navigation [data-nav-view="rankings"]').click();
    await b.locator('#leaderboard-container [data-detail-id="option-3"]').click();
    await vote(a, 'option-3').click(); // Marko removes the original vote.
    await expect(b.locator('.accommodation-detail__voters .voter-stack__summary')).toHaveText('Budi prvi koji će glasati');
    await vote(a, 'option-3').click();
    await expect(b.locator('.accommodation-detail__voters .voter-stack__summary')).toHaveText('1 glas');
    await expect(b.locator('.accommodation-detail__voters .voter-stack__avatar')).toHaveAttribute('title', 'Marko Kovač');
    await b.locator('.detail-close').click();
    const first = b.locator('#leaderboard-container .ranking-row').first();
    await expect(first).toHaveAttribute('data-detail-id', 'option-0');
    await vote(a, 'option-0').click();
    await expect(first).toHaveAttribute('data-detail-id', 'option-0');
    await b.locator('#leaderboard-container [data-detail-id="option-0"]').click();
    await b.locator('.detail-sheet .card-heart-btn').click();
    await expect(count(a, 'option-0')).toHaveText('6 glasova');
    await b.locator('.detail-close').click();
    await expect(first).toHaveAttribute('data-detail-id', 'option-1');
    await expect(a.locator('.leader-teaser')).toContainText('Izjednačeno na vrhu');
    expect(hub.events.some(event => event.table === 'votes' && event.type === 'DELETE')).toBe(true);
});

for (const deferred of [false, true]) {
    test(`simultaneous votes converge when duplicate events arrive ${deferred ? 'after' : 'before'} write responses`, async ({ duo: { a, b, backend, hub } }) => {
        hub.duplicateEvents = true;
        backend.writeDelay = 150;
        if (deferred) hub.pauseDelivery();
        await Promise.all([vote(a, 'option-4').click(), vote(b, 'option-4').click()]);
        if (deferred) {
            await expect(vote(a, 'option-4')).toBeEnabled();
            await expect(vote(b, 'option-4')).toBeEnabled();
            await expect(count(a, 'option-4')).toHaveText('1 glas');
            await expect(count(b, 'option-4')).toHaveText('1 glas');
            hub.resumeDelivery();
        }
        await expect(count(a, 'option-4')).toHaveText('2 glasa');
        await expect(count(b, 'option-4')).toHaveText('2 glasa');
        await expect(vote(a, 'option-4')).toHaveAttribute('aria-pressed', 'true');
        await expect(vote(b, 'option-4')).toHaveAttribute('aria-pressed', 'true');
        expect(backend.votes.filter(item => item.option_id === 'option-4')).toHaveLength(2);
        if (deferred) hub.pauseDelivery();
        await Promise.all([vote(a, 'option-4').click(), vote(b, 'option-4').click()]);
        if (deferred) {
            await expect(vote(a, 'option-4')).toBeEnabled();
            await expect(vote(b, 'option-4')).toBeEnabled();
            hub.resumeDelivery();
        }
        await expect(count(a, 'option-4')).toHaveText('Budi prvi koji će glasati');
        await expect(count(b, 'option-4')).toHaveText('Budi prvi koji će glasati');
    });
}

test('owner edits reach the other user’s open detail and all availability badges', async ({ duo: { a, b } }) => {
    await a.locator('.stay-card__title-button').first().click();
    await b.locator('.stay-card__title-button').first().click();
    await a.locator('.accommodation-detail__edit').click();
    await a.locator('#edit-detail-title').fill('Realtime loft');
    await a.locator('#edit-detail-price').fill('725');
    await a.locator('#edit-detail-is-taken').check();
    await a.locator('#detail-editable-section button[type="submit"]').click();
    await expect(b.locator('#detail-title')).toHaveText('Realtime loft');
    await expect(b.locator('.detail-sheet .price-value')).toHaveText('725 €');
    await expect(b.locator('.accommodation-detail__availability')).toHaveText('Zauzeto');
    await b.locator('.detail-close').click();
    await expect(card(b, 'option-0').locator('.stay-card__title-button')).toHaveText('Realtime loft');
    await expect(card(b, 'option-0').locator('.availability-badge')).toHaveText('Zauzeto');
    await expect(b.locator('.leader-teaser__availability')).toHaveText('Zauzeto');
});

test('reconnecting catches up on missed accommodations and votes without reloading', async ({ duo: { a, b, backend, hub } }) => {
    await b.locator('.stay-card__title-button').first().click();
    hub.disconnect('1');
    await a.locator('.stay-card__title-button').first().click();
    await a.locator('.accommodation-detail__edit').click();
    await a.locator('#edit-detail-title').fill('Changed while offline');
    await a.locator('#edit-detail-is-taken').check();
    await a.locator('#detail-editable-section button[type="submit"]').click();
    await expect(a.locator('#detail-editable-section')).toBeHidden();
    await a.locator('.detail-close').click();
    await addStay(a);
    const id = backend.options.at(-1).id;
    await vote(a, id).click();
    await expect(b.locator('.stay-card')).toHaveCount(5);
    await expect(b.locator('#detail-title')).toHaveText('Loft u centru');
    hub.reconnect('1');
    await expect.poll(() => hub.clients.get('1').joins).toBeGreaterThan(1);
    await expect(b.locator('.stay-card')).toHaveCount(6);
    await expect(b.locator('#detail-title')).toHaveText('Changed while offline');
    await expect(b.locator('.accommodation-detail__availability')).toHaveText('Zauzeto');
    await b.locator('.detail-close').click();
    await expect(count(b, id)).toHaveText('1 glas');
    await expect(vote(b, id)).toHaveAttribute('aria-pressed', 'false');
});

test.describe('admin changes during owner editing', () => {
    test.use({ secondRole: 'super_admin' });
    test('remote edits preserve an unsaved form and cancellation shows current server data', async ({ duo: { a, b, backend } }) => {
        for (const page of [a, b]) {
            await page.locator('.stay-card__title-button').first().click();
            await page.locator('.accommodation-detail__edit').click();
        }
        await a.locator('#edit-detail-title').fill('Unsaved owner draft');
        await b.locator('#edit-detail-title').fill('Saved admin title');
        await b.locator('#edit-detail-price').fill('800');
        await b.locator('#edit-detail-is-taken').check();
        await b.locator('#detail-editable-section button[type="submit"]').click();
        await expect(a.locator('.accommodation-detail__availability')).toHaveText('Zauzeto');
        await expect(a.locator('#edit-detail-title')).toHaveValue('Unsaved owner draft');
        await expect(a.locator('#edit-detail-price')).toHaveValue('420');
        await expect(a.locator('#edit-detail-is-taken')).not.toBeChecked();
        await a.locator('.accommodation-detail__cancel').click();
        await expect(a.locator('#detail-title')).toHaveText('Saved admin title');
        await expect(a.locator('.detail-sheet .price-value')).toHaveText('800 €');
        expect(backend.writes.filter(request => request.table === 'options')).toHaveLength(1);
    });
});

for (const localSave of [false, true]) {
    test(`a stale reconnect snapshot cannot roll back a newer ${localSave ? 'local save' : 'live event'}`, async ({ duo: { a, b, backend, hub } }) => {
        const observer = localSave ? a : b;
        const client = localSave ? '0' : '1';
        const observerEmail = localSave ? 'marko@example.test' : 'user1@example.test';
        let held = false;
        let release;
        const barrier = new Promise(resolve => { release = resolve; });
        const readsBefore = backend.requests.filter(request => request.email === observerEmail && request.table === 'options').length;
        backend.beforeRead = async ({ email, table }) => {
            if (!held && email === observerEmail && table === 'options') { held = true; await barrier; }
        };
        try {
            hub.disconnect(client);
            hub.reconnect(client);
            await expect.poll(() => held).toBe(true);
            if (localSave) hub.pauseDelivery();
            await a.locator('.stay-card__title-button').first().click();
            await a.locator('.accommodation-detail__edit').click();
            await a.locator('#edit-detail-title').fill('Newer than snapshot');
            await a.locator('#detail-editable-section button[type="submit"]').click();
            await expect(card(observer, 'option-0').locator('.stay-card__title-button')).toHaveText('Newer than snapshot');
            release();
            await expect.poll(() => backend.requests.filter(request => request.email === observerEmail && request.table === 'options').length).toBeGreaterThan(readsBefore + 1);
            await expect(card(observer, 'option-0').locator('.stay-card__title-button')).toHaveText('Newer than snapshot');
        } finally { release(); hub.resumeDelivery(); }
    });
}

test('reconnection preserves an accommodation while its create request is still pending', async ({ duo: { a, b, backend, hub } }) => {
    let held = false;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    backend.beforeWrite = async ({ table, method }) => {
        if (table === 'options' && method === 'POST') { held = true; await barrier; }
    };
    try {
        await addStay(a);
        await expect.poll(() => held).toBe(true);
        await expect(a.locator('.stay-card')).toHaveCount(6);
        const readsBefore = backend.requests.filter(request => request.email === 'marko@example.test' && request.table === 'options').length;
        hub.disconnect('0');
        await b.locator('.stay-card__title-button').nth(1).click();
        await b.locator('.accommodation-detail__edit').click();
        await b.locator('#edit-detail-title').fill('Snapshot has arrived');
        await b.locator('#detail-editable-section button[type="submit"]').click();
        await expect(b.locator('#detail-editable-section')).toBeHidden();
        await b.locator('.detail-close').click();
        hub.reconnect('0');
        await expect.poll(() => hub.clients.get('0').joins).toBeGreaterThan(1);
        await expect.poll(() => backend.requests.filter(request => request.email === 'marko@example.test' && request.table === 'options').length).toBeGreaterThan(readsBefore);
        await expect(card(a, 'option-1').locator('.stay-card__title-button')).toHaveText('Snapshot has arrived');
        await expect(a.locator('.stay-card')).toHaveCount(6);
        await expect(b.locator('.stay-card')).toHaveCount(5);
        release();
        await expect(b.locator('.stay-card')).toHaveCount(6);
        await expect(a.locator('.stay-card')).toHaveCount(6);
    } finally { release(); }
});

test('a primary-key-only deletion removes cards and rankings and closes an open detail', async ({ duo: { a, b, backend } }) => {
    await b.locator('.app-navigation [data-nav-view="rankings"]').click();
    await b.locator('#leaderboard-container [data-detail-id="option-0"]').click();
    // There is no delete button; simulate a trusted server-side deletion.
    backend.options = backend.options.filter(option => option.id !== 'option-0');
    backend.votes = backend.votes.filter(item => item.option_id !== 'option-0');
    backend.broadcast('options', 'DELETE', {}, { id: 'option-0' });
    await expect(a.locator('.stay-card')).toHaveCount(4);
    await expect(b.locator('.stay-card')).toHaveCount(4);
    await expect(b.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(b.locator('#leaderboard-container [data-detail-id="option-0"]')).toHaveCount(0);
    await expect(b.locator('#leaderboard-container .ranking-row').first()).toHaveAttribute('data-detail-id', 'option-1');
    await expect(a.locator('.leader-teaser__title')).toHaveText('Apartman Sol');
});
