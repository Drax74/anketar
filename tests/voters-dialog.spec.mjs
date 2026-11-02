import { test, expect } from '@playwright/test';
import { mockPoll, createPollBackend } from './fixtures/poll.mjs';
import { createRealtimeHub } from './fixtures/realtime.mjs';

async function openPoll(page) {
    await mockPoll(page);
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
}

test('card avatars open every voter without opening accommodation details', async ({ page }) => {
    await openPoll(page);
    const trigger = page.locator('.stay-card').first().locator('.voter-stack__avatars');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Glasali su' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.voters-dialog__row')).toHaveCount(8);
    await expect(dialog.locator('.voters-dialog__count')).toHaveText('8 glasova');
    await expect(dialog.locator('.voters-dialog__name').first()).toHaveText('Marko Kovač');
    await expect(dialog.locator('.voters-dialog__name').last()).toHaveText('Sara Matić');
    await expect(dialog.locator('.voters-dialog__you')).toHaveText('Tvoj glas');
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(dialog.locator('.voters-dialog__close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
});

test('voters modal works over details, restores focus, and Escape closes only the top modal', async ({ page }) => {
    await openPoll(page);
    // Create it before opening details to exercise the detail background's inert state.
    await page.locator('.stay-card').first().locator('.voter-stack__avatars').click();
    await page.locator('.voters-dialog__close').click();
    await expect(page.locator('.voters-dialog')).not.toBeVisible();
    await page.locator('.stay-card__title-button').first().click();
    const trigger = page.locator('.accommodation-detail__voters .voter-stack__avatars');
    await trigger.click();
    await expect(page.locator('.voters-dialog')).toBeVisible();
    await expect(page.locator('.voters-dialog')).toHaveJSProperty('inert', false);
    await page.keyboard.press('Tab');
    await expect(page.locator('.voters-dialog__close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.voters-dialog')).not.toBeVisible();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(2, 2);
    await expect(page.locator('.voters-dialog')).not.toBeVisible();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('body')).toHaveCSS('overflow', 'visible');
});

test('featured ranking avatars open the voters list without nested buttons or accidental navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPoll(page);
    await page.locator('.trip-header__tab[data-nav-view="rankings"]').click();
    const row = page.locator('#leaderboard-container .ranking-row').first();
    await row.locator('.voter-stack__avatars').click();
    await expect(page.locator('.voters-dialog__row')).toHaveCount(8);
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('button button')).toHaveCount(0);
    await page.locator('.voters-dialog__close').click();
    await row.locator('.ranking-row__open').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
});

test('the open list follows another user adding and removing their vote', async ({ page, browser, baseURL }) => {
    const backend = createPollBackend();
    const hub = createRealtimeHub(backend);
    hub.duplicateEvents = true;
    const secondContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const second = await secondContext.newPage();
    try {
        await mockPoll(page, { backend, memberIndex: 0, realtimeHub: hub, clientName: 'owner' });
        await mockPoll(second, { backend, memberIndex: 1, realtimeHub: hub, clientName: 'other' });
        await Promise.all([page.goto('./'), second.goto('./')]);
        for (const current of [page, second]) await expect(current.locator('.stay-card')).toHaveCount(5);
        await expect.poll(() => hub.clients.get('owner').joins).toBe(1);
        await expect.poll(() => hub.clients.get('other').joins).toBe(1);
        await page.locator('.stay-card').first().locator('.voter-stack__avatars').click();
        await expect(page.locator('.voters-dialog__row')).toHaveCount(8);
        await second.locator('.stay-card').first().locator('.card-heart-btn').click();
        await expect(page.locator('.voters-dialog__row')).toHaveCount(7);
        await expect(page.locator('.voters-dialog__name').filter({ hasText: 'Ana Novak' })).toHaveCount(0);
        await second.locator('.stay-card').first().locator('.card-heart-btn').click();
        await expect(page.locator('.voters-dialog__row')).toHaveCount(8);
        await expect(page.locator('.voters-dialog__name').filter({ hasText: 'Ana Novak' })).toHaveCount(1);
        await expect(page.locator('.voters-dialog__close')).toBeFocused();
        await page.locator('.voters-dialog__close').click();
        await expect(page.locator('.stay-card').first().locator('.voter-stack__avatars')).toBeFocused();
    } finally {
        await secondContext.close();
    }
});

test.describe('crowded mock voters', () => {
    test.use({ baseURL: 'http://127.0.0.1:4175/anketar/', serviceWorkers: 'allow' });
    test('all 28 names fit in a scrolling modal on phone and desktop', async ({ page }) => {
        await page.goto('./?mockControls=0');
        await expect(page.locator('.stay-card')).toHaveCount(16);
        await page.locator('.stay-card').first().locator('.voter-stack__avatars').click();
        const dialog = page.locator('.voters-dialog');
        await expect(dialog.locator('.voters-dialog__row')).toHaveCount(28);
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 844 });
            const fits = await dialog.evaluate(el => {
                const bounds = el.getBoundingClientRect();
                return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight && el.scrollWidth <= el.clientWidth;
            });
            expect(fits).toBe(true);
        }
        expect(await dialog.locator('.voters-dialog__list').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
        await expect(dialog.locator('.voters-dialog__name').last()).toHaveText('Tena Barišić');
    });
});
