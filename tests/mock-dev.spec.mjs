import { test as base, expect } from '@playwright/test';

const test = base.extend({
    context: async ({ context }, use) => {
        const external = [];
        const errors = [];
        context.on('request', request => {
            const url = new URL(request.url());
            if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(url.hostname);
        });
        context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        await use(context);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
    }
});
test.use({ baseURL: 'http://127.0.0.1:4175/anketar/', serviceWorkers: 'allow' });

async function openMock(page) {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-mock-mode', 'true');
    await expect(page.locator('.stay-card')).toHaveCount(16);
    await page.evaluate(() => document.fonts.ready);
}

test('crowded seed has 32 users, large vote stacks and safe layouts from phone to desktop', async ({ page }) => {
    await openMock(page);
    await expect(page.locator('.mock-tools [aria-label="Mock user"] option')).toHaveCount(32);
    await expect(page.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('28 glasova');
    await expect(page.locator('.stay-card').first().locator('.voter-stack__avatar--more')).toHaveText('+25');
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const view of ['stays', 'rankings']) {
            await page.locator(width < 1024 ? `.app-navigation [data-nav-view="${view}"]` : `.trip-header__tab[data-nav-view="${view}"]`).click();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const broken = await page.locator(view === 'stays' ? '.stay-card' : '#leaderboard-container .ranking-row').evaluateAll(elements => elements.filter(el => {
                const bounds = el.getBoundingClientRect();
                return bounds.left < 0 || bounds.right > innerWidth + 1;
            }).length);
            expect(broken).toBe(0);
        }
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('.app-navigation [data-nav-view="stays"]').click();
    const lines = await page.locator('.stay-card__title-button').nth(3).evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    expect(lines).toBeGreaterThan(1.5);
    expect(lines).toBeLessThanOrEqual(2.1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.app-navigation [data-nav-view="stays"]').click();
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('.accommodation-detail__voters .voter-stack__summary')).toHaveText('28 glasova');
    expect(await page.locator('.detail-sheet').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('#detail-title b')).toHaveCount(0);
});

test('mock votes, edits, availability and new accommodations persist locally across reloads', async ({ page }) => {
    await openMock(page);
    const first = page.locator('.stay-card').first();
    await first.locator('.card-heart-btn').click();
    await expect(first.locator('.voter-stack__summary')).toHaveText('27 glasova');
    await first.locator('.stay-card__title-button').click();
    await page.locator('.accommodation-detail__edit').click();
    await page.locator('#edit-detail-title').fill('Lokalni mock naslov');
    await page.locator('#edit-detail-is-taken').check();
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-title')).toHaveText('Lokalni mock naslov');
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await page.reload();
    await expect(first.locator('.stay-card__title-button')).toHaveText('Lokalni mock naslov');
    await expect(first.locator('.availability-badge')).toHaveText('Zauzeto');
    await expect(first.locator('.voter-stack__summary')).toHaveText('27 glasova');
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://www.airbnb.com/rooms/mock-new');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#add-step-2')).toBeVisible();
    await page.locator('#input-price').fill('850');
    await page.locator('#btn-add-submit').click();
    await expect(page.locator('.stay-card')).toHaveCount(17);
    await page.reload();
    await expect(page.locator('.stay-card')).toHaveCount(17);
});

test('mock controls simulate realtime votes and switch users and scenarios', async ({ page }) => {
    await openMock(page);
    await page.locator('.mock-tools__summary').click();
    await page.locator('[data-mock-vote]').click();
    await expect(page.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('29 glasova');
    await page.locator('[aria-label="Mock user"]').selectOption('member2@example.test');
    await expect(page.locator('#footer-user-name')).toHaveText('Aleksandra Katarina Horvat-Novak');
    await page.locator('.mock-tools__summary').click();
    await page.locator('[aria-label="Mock scenario"]').selectOption('tied');
    await expect(page.locator('.leader-teaser')).toContainText('Izjednačeno na vrhu');
    await page.locator('.mock-tools__summary').click();
    await page.locator('[aria-label="Mock scenario"]').selectOption('empty');
    await expect(page.locator('.stay-card')).toHaveCount(0);
    await expect(page.locator('.poll-status__title')).toHaveText('Prvi prijedlog je tvoj.');
    await page.locator('.mock-tools__summary').click();
    await page.locator('[aria-label="Mock scenario"]').selectOption('crowded');
    await expect(page.locator('.stay-card')).toHaveCount(16);
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('.accommodation-detail__edit')).toBeHidden();
});

test('two mock tabs keep independent identities and share realtime votes', async ({ page, context }) => {
    await openMock(page);
    const second = await context.newPage();
    await second.addInitScript(() => sessionStorage.setItem('anketar-mock-user', 'member2@example.test'));
    await openMock(second);
    await expect(page.locator('#footer-user-name')).toHaveText('Željka Marić');
    await expect(second.locator('#footer-user-name')).toHaveText('Aleksandra Katarina Horvat-Novak');
    await page.locator('.stay-card').first().locator('.card-heart-btn').click();
    await expect(second.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('27 glasova');
    await second.locator('.stay-card').first().locator('.card-heart-btn').click();
    await expect(page.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('26 glasova');
    await Promise.all([
        page.locator('.stay-card').first().locator('.card-heart-btn').click(),
        second.locator('.stay-card').first().locator('.card-heart-btn').click()
    ]);
    await expect(page.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('28 glasova');
    await expect(second.locator('.stay-card').first().locator('.voter-stack__summary')).toHaveText('28 glasova');
    await expect(page.locator('#footer-user-name')).toHaveText('Željka Marić');
    await expect(second.locator('#footer-user-name')).toHaveText('Aleksandra Katarina Horvat-Novak');
});
