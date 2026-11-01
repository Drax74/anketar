import { test, expect } from '@playwright/test';
import { mockPoll } from './fixtures/poll.mjs';

// Real Chromium touch input exercises native scrolling and cancelability too.
async function swipe(page, { x = 180, y = 120, dx = 0, dy = 0 }) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }]
        });
        await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
}

async function openPoll(page) {
    const backend = await mockPoll(page);
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    await page.evaluate(() => document.fonts.ready);
    return backend;
}

test.describe('mobile touch controls', () => {
    test.use({ hasTouch: true, isMobile: true });

    test('horizontal swipes change views and preserve browser history and each scroll position', async ({ page }) => {
        await openPoll(page);
        await swipe(page, { x: 270, dx: -160 });
        await expect(page.locator('#rankings-view')).toBeVisible();
        await expect(page.locator('.app-navigation [data-nav-view="rankings"]')).toHaveAttribute('aria-current', 'page');
        await page.goBack();
        await expect(page.locator('#stays-view')).toBeVisible();
        await page.goForward();
        await expect(page.locator('#rankings-view')).toBeVisible();
        const row = await page.locator('#leaderboard-container .ranking-row').first().boundingBox();
        await swipe(page, { x: 100, y: row.y + 30, dx: 160 });
        await expect(page.locator('#stays-view')).toBeVisible();
        await expect(page.locator('#detail-overlay')).not.toHaveClass(/active/);
        await page.evaluate(() => scrollTo(0, 350));
        const saved = await page.evaluate(() => scrollY);
        // A blank gutter belongs to the view, away from card buttons.
        await swipe(page, { x: 270, y: 250, dx: -160 });
        await expect(page.locator('#rankings-view')).toBeVisible();
        await swipe(page, { x: 100, dx: 160 });
        await expect(page.locator('#stays-view')).toBeVisible();
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(saved);
    });

    test('short drags, edge starts and vertical scrolling do not navigate or refresh', async ({ page }) => {
        const backend = await openPoll(page);
        const reads = backend.reads.length;
        await swipe(page, { x: 220, dx: -40 });
        await swipe(page, { x: 5, dx: 140 });
        await swipe(page, { x: 385, dx: -160 });
        await swipe(page, { dy: 40 });
        await expect(page.locator('#stays-view')).toBeVisible();
        expect(backend.reads).toHaveLength(reads);
        await swipe(page, { y: 230, dy: -150 });
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40);
        await swipe(page, { y: 100, dy: 130 });
        expect(backend.reads).toHaveLength(reads);
        await expect(page.locator('#stays-view')).toBeVisible();
    });

    test('pull refresh shows a spinner, reloads data once and clears after completion', async ({ page }) => {
        const backend = await openPoll(page);
        backend.options[0].title = 'Osvježeni loft';
        backend.readDelay = 700;
        const reads = backend.reads.filter(table => table === 'options').length;
        await swipe(page, { dy: 120 });
        await expect(page.locator('.pull-refresh--loading')).toBeVisible();
        await expect(page.locator('.pull-refresh')).toContainText('Osvježavanje');
        await swipe(page, { dy: 120 });
        await expect(page.locator('.stay-card__title-button').first()).toHaveText('Osvježeni loft');
        await expect(page.locator('.pull-refresh')).toBeHidden();
        expect(backend.reads.filter(table => table === 'options')).toHaveLength(reads + 1);
        await expect(page.locator('#stays-view')).toBeVisible();
    });

    test('failed refresh clears spinner and the existing retry recovers', async ({ page }) => {
        const backend = await openPoll(page);
        backend.failReads = true;
        await swipe(page, { dy: 120 });
        await expect(page.locator('#options-container .poll-status__action')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.pull-refresh')).toBeHidden();
        backend.failReads = false;
        await page.locator('#options-container .poll-status__action').click();
        await expect(page.locator('.stay-card')).toHaveCount(5);
    });

    test('detail dismisses at the top, preserves scroll and history, and leaves editing alone', async ({ page }) => {
        const backend = await openPoll(page);
        backend.options[0].description = 'Dugi opis smještaja za provjeru pomicanja. '.repeat(80);
        // Refresh the fixture through the same user-facing reload path.
        await swipe(page, { dy: 120 });
        await expect(page.locator('.stay-card')).toHaveCount(5);
        await page.locator('.stay-card__title-button').first().tap();
        const sheet = page.locator('#detail-overlay .detail-sheet');
        await expect(sheet).toBeFocused();
        await swipe(page, { y: 130, dy: 130 });
        await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
        await page.goForward();
        await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
        await expect(sheet).toBeFocused();
        await swipe(page, { y: 300, dy: -160 });
        await expect.poll(() => sheet.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        await swipe(page, { y: 200, dy: 120 });
        await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
        await sheet.evaluate(el => { el.scrollTop = 0; });
        await page.locator('.accommodation-detail__edit').click();
        await page.locator('#edit-detail-title').fill('Sačuvani unos');
        await swipe(page, { y: 130, dy: 130 });
        await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
        await expect(page.locator('#edit-detail-title')).toHaveValue('Sačuvani unos');
    });

    test('add sheet dismisses from its handle and never consumes input editing', async ({ page }) => {
        await openPoll(page);
        await page.locator('.app-navigation [data-add-accommodation]').click();
        const input = page.locator('#input-link');
        await input.fill('https://www.airbnb.com/rooms/draft');
        await page.locator('.native-sheet-container').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        const handle = page.locator('.native-sheet-handle');
        const box = await handle.boundingBox();
        await swipe(page, { x: 180, y: box.y + 2, dy: 120 });
        await expect(page.locator('#add-modal-overlay')).toHaveClass(/active/);
        await expect(input).toHaveValue('https://www.airbnb.com/rooms/draft');
        await input.evaluate(el => el.blur());
        await swipe(page, { x: 180, y: box.y + 2, dy: 120 });
        await expect(page.locator('#add-modal-overlay')).not.toHaveClass(/active/);
        await expect(page.locator('#stays-view')).toBeVisible();
    });

    test('canceled and multi-touch drags do not trigger actions', async ({ page }) => {
        const backend = await openPoll(page);
        const reads = backend.reads.length;
        await page.locator('.trip-hero').evaluate(el => {
            const point = new Touch({ identifier: 1, target: el, clientX: 180, clientY: 120 });
            const second = new Touch({ identifier: 2, target: el, clientX: 240, clientY: 120 });
            const send = (type, touches) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches }));
            send('touchstart', [point]);
            send('touchmove', [new Touch({ identifier: 1, target: el, clientX: 180, clientY: 240 })]);
            send('touchcancel', []);
            send('touchend', []);
            send('touchstart', [point]);
            send('touchmove', [point, second]);
            send('touchend', []);
        });
        await expect(page.locator('.pull-refresh')).toBeHidden();
        await expect(page.locator('#stays-view')).toBeVisible();
        expect(backend.reads).toHaveLength(reads);
    });

    test('reduced motion keeps gestures working without spinning animation', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const backend = await openPoll(page);
        backend.readDelay = 700;
        await swipe(page, { dy: 120 });
        await expect(page.locator('.pull-refresh--loading')).toBeVisible();
        await expect(page.locator('.pull-refresh__spinner')).toHaveCSS('animation-name', 'none');
        await expect(page.locator('.stay-card')).toHaveCount(5);
        await swipe(page, { x: 270, dx: -160 });
        await expect(page.locator('#rankings-view')).toBeVisible();
    });
});

test('desktop touch input preserves the current view and open detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const backend = await openPoll(page);
    const reads = backend.reads.length;
    await swipe(page, { x: 500, dx: -160 });
    await swipe(page, { x: 500, dy: 120 });
    await expect(page.locator('#stays-view')).toBeVisible();
    expect(backend.reads).toHaveLength(reads);
    await page.locator('.stay-card__title-button').first().click();
    await swipe(page, { x: 600, y: 250, dy: 120 });
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
});
