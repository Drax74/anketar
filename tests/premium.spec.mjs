import { test, expect } from '@playwright/test';
import { mockPoll } from './fixtures/poll.mjs';

async function openPoll(page, options) {
    const backend = await mockPoll(page, options);
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    await page.evaluate(() => document.fonts.ready);
    return backend;
}

test('mobile browsing has local fonts, accessible navigation, and safe titles', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openPoll(page);
    await expect(page.locator('#user-avatar-initials')).toHaveText('MK');
    await expect(page.locator('.trip-hero')).toBeVisible();
    await expect(page.locator('#leader-teaser')).toBeVisible();
    await expect(page.locator('.rankings-sidebar')).toBeHidden();
    await expect(page.locator('.browse-toolbar__add')).toBeHidden();
    await expect(page.locator('.stay-card').first().locator('.voter-stack__selection')).toHaveText('Tvoj glas');
    await expect(page.locator('.stay-card__title-button').last()).toHaveText('Smještaj <b>Madrid</b> & "ekipa"');
    await expect(page.locator('.stay-card b')).toHaveCount(0);
    expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"') && document.fonts.check('24px "Material Symbols Outlined Variable"'))).toBe(true);
    for (const width of [360, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
});

test('desktop has a compact sidebar and a three-column card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPoll(page);
    await expect(page.locator('.rankings-sidebar')).toBeVisible();
    await expect(page.locator('.app-navigation')).toBeHidden();
    await expect(page.locator('#leader-teaser')).toBeHidden();
    await expect(page.locator('.browse-toolbar__add')).toBeVisible();
    expect(await page.locator('.stay-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
});

test('rankings expose the full list and represent ties without a false winner', async ({ page }) => {
    await openPoll(page, { tied: true });
    await expect(page.locator('#leader-teaser')).toContainText('Izjednačeno na vrhu');
    await page.locator('.app-navigation [data-nav-view="rankings"]').click();
    await expect(page.locator('#leaderboard-container .ranking-row')).toHaveCount(4);
    await expect(page.locator('#leaderboard-container .ranking-row__rank')).toHaveText(['01', '01', '03', '04']);
    await expect(page.locator('.ranking-row--featured')).toHaveCount(0);
    await page.locator('#leaderboard-container .ranking-row').nth(1).click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
    await page.goBack();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#rankings-view')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#stays-view')).toBeVisible();
});

test('owners read first, edit explicitly, and recover from a failed save', async ({ page }) => {
    const backend = await openPoll(page);
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('#detail-readonly-section')).toBeVisible();
    await expect(page.locator('#detail-editable-section')).toBeHidden();
    await expect(page.locator('.detail-sheet .card-heart-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.accommodation-detail__edit').click();
    await page.locator('#edit-detail-title').fill('Uređeni loft');
    backend.failWrites = true;
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('.accommodation-detail__save-status')).toContainText('Spremanje nije uspjelo');
    await expect(page.locator('#edit-detail-title')).toHaveValue('Uređeni loft');
    backend.failWrites = false;
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-editable-section')).toBeHidden();
    await expect(page.locator('.accommodation-detail__title')).toHaveText('Uređeni loft');
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.stay-card__title-button').first()).toHaveText('Uređeni loft');
});

test('rapid vote actions send one request and update personal vote state', async ({ page }) => {
    const backend = await openPoll(page);
    backend.writeDelay = 250;
    const button = page.locator('.stay-card').first().locator('.card-heart-btn');
    await button.click();
    await expect(button).toBeDisabled();
    await button.dispatchEvent('click');
    await expect(button).toBeEnabled();
    expect(backend.writes.filter(write => write.table === 'votes')).toHaveLength(1);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.stay-card').first().locator('.voter-stack__selection')).toHaveCount(0);
});

test('manual add fallback works from rankings and returns to browsing', async ({ page }) => {
    const backend = await openPoll(page, { failScrape: true });
    await page.locator('.app-navigation [data-nav-view="rankings"]').click();
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://www.airbnb.com/rooms/new');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#input-title')).toBeVisible();
    await page.locator('#input-title').fill('Ručni prijedlog');
    await page.locator('#input-price').fill('450');
    await page.locator('#btn-add-submit').click();
    await expect(page.locator('#stays-view')).toBeVisible();
    await expect(page.locator('.stay-card')).toHaveCount(6);
    await expect(page.locator('.stay-card__title-button').first()).toHaveText('Ručni prijedlog');
    await expect(page.locator('.stay-card__image').first()).toHaveAttribute('src', /madrid-default\.webp$/);
    await expect(page.locator('.stay-card__placeholder').first()).toBeHidden();
    expect(backend.options.at(-1).link).toBe('https://www.airbnb.com/rooms/new');
});

test('failed loading shows retry and recovers without reloading', async ({ page }) => {
    const backend = await mockPoll(page, { failReads: true });
    await page.goto('./');
    const retry = page.locator('#options-container .poll-status__action');
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#options-container')).toContainText('Podatke nije moguće učitati');
    backend.failReads = false;
    await retry.click();
    await expect(page.locator('.stay-card')).toHaveCount(5);
});

test('reduced-motion details stay usable and return to the list', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPoll(page);
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('.detail-transition')).toHaveCount(0);
    await expect(page.locator('#detail-overlay')).toHaveClass(/detail-page/);
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('.app-scroll-container').evaluate(element => element.inert)).toBe(false);
});

test('shared image and controls animate together and restore the saved list position', async ({ page }) => {
    await openPoll(page);
    await page.locator('.stay-card .card-cover').first().evaluate(image => image.decode());
    const previousScroll = await page.evaluate(() => {
        const position = window.scrollY;
        document.querySelector('.stay-card__title-button').click();
        return position;
    });
    await expect(page.locator('.detail-transition__control')).toHaveCount(2);
    const geometry = await page.locator('.detail-transition').evaluate(layer => {
        const outer = new DOMMatrix(getComputedStyle(layer).transform);
        const controls = Array.from(layer.querySelectorAll('.detail-transition__control'));
        const heart = controls[0].getBoundingClientRect();
        return {
            circle: Math.abs(heart.width - heart.height) < .1,
            unscaled: controls.every(control => {
                const inner = new DOMMatrix(getComputedStyle(control).transform);
                return Math.abs(outer.a * inner.a - 1) < .001 && Math.abs(outer.d * inner.d - 1) < .001;
            })
        };
    });
    expect(geometry).toEqual({ circle: true, unscaled: true });
    await expect(page.locator('.detail-transition')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => window.scrollY)).toBe(previousScroll);
    await expect(page.locator('.detail-transition')).toHaveCount(0);
    expect(await page.locator('.stay-card .card-heart-btn').first().evaluate(button => button.style.visibility)).not.toBe('hidden');
});

test('signed-out visitors see login without requesting poll records', async ({ page }) => {
    const reads = [];
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (url.pathname.startsWith('/rest/v1/')) reads.push(url.pathname);
        return route.abort();
    });
    await page.goto('./');
    await expect(page.locator('#auth-modal')).toBeVisible();
    await expect(page.locator('#options-container')).toContainText('Prijavite se');
    await expect(page.locator('.app-navigation [data-add-accommodation]')).toBeDisabled();
    expect(reads).toEqual([]);
});


test('first-row photos load eagerly and hero keeps its top edge', async ({ page }) => {
    await openPoll(page);
    const images = page.locator('.stay-card__image');
    for (let index = 0; index < 3; index++) await expect(images.nth(index)).toHaveAttribute('loading', 'eager');
    await expect(images.first()).toHaveAttribute('fetchpriority', 'high');
    await expect(images.nth(3)).toHaveAttribute('loading', 'lazy');
    await expect(page.locator('.trip-hero__image')).toHaveCSS('object-position', '50% 0%');
    await expect(page.locator('.trip-hero')).toHaveCSS('height', '168px');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.trip-hero')).toHaveCSS('height', '400px');
    await expect(page.locator('.trip-hero__image')).toHaveCSS('object-position', '50% 0%');
});

test('loading rankings do not push the accommodation list down', async ({ page }) => {
    await mockPoll(page);
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    await page.route('**/rest/v1/options*', async route => {
        await ready;
        await route.fallback();
    });
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#leader-teaser')).toHaveAttribute('aria-busy', 'true');
    // Compare settled layout, not a frame of the view-enter translateY animation
    // or fallback-font metrics while the local fonts are still loading.
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#stays-view').evaluate(element =>
        Promise.all(element.getAnimations().map(animation => animation.finished))
    );
    const before = await page.locator('.browse-toolbar').boundingBox();
    release();
    await expect(page.locator('.stay-card')).toHaveCount(5);
    await expect(page.locator('#leader-teaser')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => document.fonts.ready);
    const after = await page.locator('.browse-toolbar').boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test('Croatian UI uses the small font while other language faces stay available', async ({ page }) => {
    const fonts = [];
    page.on('request', request => {
        if (request.url().includes('.woff2')) fonts.push(request.url());
    });
    await openPoll(page);
    expect(fonts.some(url => url.includes('inter-croatian.woff2'))).toBe(true);
    expect(fonts.some(url => url.includes('inter-latin-ext-wght-normal'))).toBe(false);
    await page.evaluate(async () => {
        await document.fonts.load('16px "Inter Variable"', 'Łódź Ελληνικά');
    });
    expect(fonts.some(url => url.includes('inter-latin-ext-wght-normal'))).toBe(true);
    expect(fonts.some(url => url.includes('inter-greek-wght-normal'))).toBe(true);
});

test('hero selects the smaller source on a high-density phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    try {
        await mockPoll(page);
        await page.goto('./');
        const hero = page.locator('.trip-hero__image');
        await expect.poll(() => hero.evaluate(image => image.currentSrc)).toContain('hero-cover-image-800.webp');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await expect.poll(() => hero.evaluate(image => image.currentSrc)).toMatch(/\/hero-cover-image\.webp$/);
    } finally {
        await context.close();
    }
});

test('legacy, empty, and failed photos share the local default across views', async ({ page }) => {
    const backend = await mockPoll(page);
    backend.options[0].image = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';
    backend.options[1].image = '';
    backend.options[3].image = 'https://example.test/missing-photo.webp';
    backend.options[4].image = 'javascript:alert(1)';
    const unsplashRequests = [];
    page.on('request', request => {
        if (new URL(request.url()).hostname === 'images.unsplash.com') unsplashRequests.push(request.url());
    });
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    const images = page.locator('.stay-card__image');
    for (const index of [0, 1, 3, 4]) await expect(images.nth(index)).toHaveAttribute('src', /\/madrid-default\.webp$/);
    await expect(images.nth(2)).toHaveAttribute('src', /\/hero-cover-image\.webp$/);
    await expect(page.locator('.leader-teaser__image')).toHaveAttribute('src', /\/madrid-default\.webp$/);
    await expect(page.locator('#leaderboard-container .ranking-row__image').first()).toHaveAttribute('src', /\/madrid-default\.webp$/);
    await images.first().evaluate(image => image.decode());
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('.accommodation-detail__image')).toHaveAttribute('src', /\/madrid-default\.webp$/);
    await expect(page.locator('.accommodation-detail__placeholder')).toBeHidden();
    expect(unsplashRequests).toEqual([]);
});
