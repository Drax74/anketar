import { test, expect } from '@playwright/test';
import { mockPoll } from './fixtures/poll.mjs';

test('initial HTML includes resolved text, metadata, labels and placeholders', async ({ page }) => {
    const response = await page.request.get('./');
    expect(response.ok()).toBe(true);
    const source = await response.text();
    expect(source).not.toContain('{{t:');
    expect(source).toContain('<html lang="hr">');
    expect(source).toContain('<title>Madrid - Trkadzije &amp; Rumoljubi</title>');
    expect(source).toContain('content="Glasajte za smještaj u Madridu!"');
    expect(source).toContain('aria-label="Trkadžije &amp; Rumoljubi — početna"');
    expect(source).toContain('placeholder="Unesi Booking.com ili Airbnb link"');
});

test('localized dynamic details and validation preserve user text safely', async ({ page }) => {
    const backend = await mockPoll(page);
    backend.options[0].title = 'Loft <b>Madrid</b> & "ekipa"';
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    await page.locator('.stay-card__title-button').first().click();
    await expect(page.locator('#detail-title')).toHaveText('Loft <b>Madrid</b> & "ekipa"');
    await expect(page.locator('#detail-title b')).toHaveCount(0);
    await expect(page.locator('.accommodation-detail__creator')).toHaveText('Prijedlog: Marko Kovač');
    await page.locator('.accommodation-detail__edit').click();
    await expect(page.locator('label[for="edit-detail-title"]')).toHaveText('Naziv smještaja');
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://example.test/room');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#app-toast')).toHaveText('Dozvoljeni su isključivo valjani Booking.com i Airbnb linkovi!');
});
