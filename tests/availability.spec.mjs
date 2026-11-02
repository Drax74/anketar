import { test, expect } from '@playwright/test';
import { mockPoll } from './fixtures/poll.mjs';

async function openPoll(page, options) {
    const backend = await mockPoll(page, options);
    await page.goto('./');
    await expect(page.locator('.stay-card')).toHaveCount(5);
    return backend;
}

test('owner toggles availability and all card, detail, ranking and teaser badges follow it', async ({ page }) => {
    const backend = await openPoll(page);
    const card = page.locator('.stay-card').first();
    await expect(page.locator('.availability-badge')).toHaveCount(0);
    await card.locator('.stay-card__title-button').click();
    await page.locator('.accommodation-detail__edit').click();
    await page.locator('#edit-detail-is-taken').check();
    backend.failWrites = true;
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('.accommodation-detail__save-status')).toContainText('Spremanje nije uspjelo');
    await expect(page.locator('#edit-detail-is-taken')).toBeChecked();
    await expect(card.locator('.availability-badge')).toHaveCount(0);
    backend.failWrites = false;
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-editable-section')).toBeHidden();
    await expect(page.locator('.accommodation-detail__availability')).toHaveText('Zauzeto');
    expect(backend.options[0].is_taken).toBe(true);
    expect(backend.options[0].created_by).toBe('marko@example.test');
    await page.locator('.detail-close').click();
    await expect(card.locator('.availability-badge')).toHaveText('Zauzeto');
    await expect(page.locator('.leader-teaser__availability')).toHaveText('Zauzeto');
    await page.locator('.app-navigation [data-nav-view="rankings"]').click();
    const row = page.locator('#leaderboard-container .ranking-row').first();
    await expect(row.locator('.availability-badge')).toHaveText('Zauzeto');
    await expect(row).toHaveAttribute('aria-label', /zauzeto/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.trip-header__tab[data-nav-view="stays"]').click();
    await expect(page.locator('#leaderboard-preview .ranking-row').first().locator('.availability-badge')).toHaveText('Zauzeto');
    await card.locator('.stay-card__title-button').click();
    await page.locator('.accommodation-detail__edit').click();
    await page.locator('#edit-detail-is-taken').uncheck();
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-editable-section')).toBeHidden();
    await expect(page.locator('.availability-badge')).toHaveCount(0);
    expect(backend.options[0].is_taken).toBe(false);
});

test('super admin edits another member proposal without changing its creator', async ({ page }) => {
    const backend = await openPoll(page, { role: 'super_admin' });
    await page.locator('.stay-card__title-button').nth(1).click();
    await expect(page.locator('.accommodation-detail__creator')).toHaveText('Prijedlog: Ana Novak');
    await page.locator('.accommodation-detail__edit').click();
    await page.locator('#edit-detail-title').fill('Admin edited');
    await page.locator('#edit-detail-is-taken').check();
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-title')).toHaveText('Admin edited');
    await expect(page.locator('.accommodation-detail__availability')).toHaveText('Zauzeto');
    expect(backend.options[1].created_by).toBe('user1@example.test');
    expect(backend.options[1].is_taken).toBe(true);
});

test('regular users cannot edit other proposals even by invoking the save handler directly', async ({ page }) => {
    const backend = await openPoll(page);
    await page.locator('.stay-card__title-button').nth(1).click();
    await expect(page.locator('.accommodation-detail__edit')).toBeHidden();
    await page.evaluate(async () => {
        document.getElementById('detail-editable-section').hidden = false;
        document.getElementById('edit-detail-title').value = 'Unauthorized';
        await window.saveOptionDetails();
    });
    await expect(page.locator('#app-toast')).toHaveText('Nemaš dopuštenje za uređivanje ovog smještaja.');
    expect(backend.writes).toHaveLength(0);
    expect(backend.options[1].title).toBe('Apartman Sol');
});

test('legacy schema retains owner editing and adding until migration is applied', async ({ page }) => {
    const backend = await openPoll(page, { legacySchema: true });
    await page.locator('.stay-card__title-button').first().click();
    await page.locator('.accommodation-detail__edit').click();
    await expect(page.locator('.accommodation-detail__availability-field')).toBeHidden();
    await page.locator('#edit-detail-title').fill('Legacy edit');
    await page.locator('#detail-editable-section button[type="submit"]').click();
    await expect(page.locator('#detail-title')).toHaveText('Legacy edit');
    expect(Object.hasOwn(backend.options[0], 'is_taken')).toBe(false);
    await page.locator('.detail-close').click();
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://www.airbnb.com/rooms/new');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#add-step-2')).toBeVisible();
    await page.locator('#input-price').fill('600');
    await page.locator('#btn-add-submit').click();
    await expect(page.locator('.stay-card')).toHaveCount(6);
    await expect.poll(() => backend.options.length).toBe(6);
});

test('new proposals receive available status from the database', async ({ page }) => {
    const backend = await openPoll(page);
    await page.locator('.app-navigation [data-add-accommodation]').click();
    await page.locator('#input-link').fill('https://www.airbnb.com/rooms/new');
    await page.locator('#btn-confirm-link').click();
    await expect(page.locator('#add-step-2')).toBeVisible();
    await page.locator('#input-price').fill('600');
    await page.locator('#btn-add-submit').click();
    await expect.poll(() => backend.options.at(-1).is_taken).toBe(false);
    await expect(page.locator('.stay-card')).toHaveCount(6);
    await page.locator('.stay-card__title-button').first().click();
    await page.locator('.accommodation-detail__edit').click();
    await expect(page.locator('#edit-detail-is-taken')).toBeVisible();
    await expect(page.locator('#edit-detail-is-taken')).not.toBeChecked();
});
