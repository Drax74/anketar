import { test, expect } from '@playwright/test';
import { mockPoll } from './fixtures/poll.mjs';

for (const manual of [false, true]) {
    test(`${manual ? 'manual' : 'scraped'} accommodation requires a positive price before any write`, async ({ page }) => {
        const backend = await mockPoll(page, { failScrape: manual });
        backend.options[0].price = 'N/A';
        await page.goto('./');
        await expect(page.locator('.stay-card')).toHaveCount(5);
        await expect(page.locator('.stay-card .price-value').first()).toHaveText('Cijena nije unesena');
        await page.locator('.app-navigation [data-add-accommodation]').click();
        await page.locator('#input-link').fill('https://www.airbnb.com/rooms/new');
        await page.locator('#btn-confirm-link').click();
        await expect(page.locator('#add-step-2')).toBeVisible();
        if (manual) await page.locator('#input-title').fill('Novi smještaj');
        const price = page.locator('#input-price');
        await expect(price).toHaveAttribute('required', '');
        await page.locator('#btn-add-submit').click();
        await expect(page.locator('#app-toast')).toHaveText('Unesite ukupnu cijenu smještaja.');
        await expect(price).toBeFocused();
        for (const value of ['0', '-10', '450.123']) {
            await price.fill(value);
            await page.locator('#btn-add-submit').click();
            await expect(page.locator('#app-toast')).toHaveText('Unesite cijenu veću od 0 €, s najviše dvije decimale.');
        }
        expect(backend.writes).toHaveLength(0);
        await expect(page.locator('.stay-card')).toHaveCount(5);
        await price.fill('450.50');
        await page.locator('#btn-add-submit').click();
        await expect(page.locator('.stay-card')).toHaveCount(6);
        await expect(page.locator('#add-modal-overlay')).not.toHaveClass(/active/);
        await expect.poll(() => backend.options.at(-1).price).toBe('450.50€');
        expect(backend.writes.filter(write => write.table === 'options')).toHaveLength(1);
    });
}

test('vote and proposal names prefer whitelist names over Google profile names', async ({ page }) => {
    await mockPoll(page, { googleName: 'Google Display Name' });
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    await expect(page.locator('#footer-user-name')).toHaveText('Marko Kovač');
    await expect(page.locator('.stay-card__creator').first()).toHaveText('Prijedlog: Marko Kovač');
    await expect(page.locator('.stay-card').first().locator('.voter-stack__avatar').first()).toHaveAttribute('title', 'Marko Kovač');
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('.accommodation-detail__creator')).toHaveText('Prijedlog: Marko Kovač');
    await expect(page.locator('body')).not.toContainText('Google Display Name');
});
