/**
 * E2E: KDP mark-in-review → mark-live flow.
 *
 * Seeds a single book via the ROOSTER_E2E test-only endpoint, then drives the
 * UI: catalog → detail → Mark in-review → Mark live (modal) → assert ASIN +
 * Amazon link appear in the detail view.
 */
import { test, expect } from '@playwright/test';

const SEEDED = {
  slug: 'e2e-book',
  title: 'E2E Book',
};

test.describe('KDP publish flow', () => {
  test.beforeEach(async ({ request }) => {
    // Wipe DB then seed a fresh "built" book each test for isolation.
    const reset = await request.post('/api/__test__/reset');
    expect(reset.ok()).toBeTruthy();
    const seed = await request.post('/api/__test__/seed-kdp-book', {
      data: {
        slug: SEEDED.slug,
        title: SEEDED.title,
        status: 'built',
        output_dir: './tmp/e2e-book',
        page_count: 120,
      },
    });
    expect(seed.ok()).toBeTruthy();
  });

  test('user marks a built book in-review, then live', async ({ page }) => {
    await page.goto('/kdp');

    // The seeded book row is visible.
    await expect(page.getByRole('link', { name: SEEDED.title })).toBeVisible();

    // Open detail.
    await page.getByRole('link', { name: SEEDED.title }).first().click();
    await expect(page).toHaveURL(/\/kdp\/e2e-book$/);

    // Mark in-review.
    const markReviewBtn = page.getByRole('button', { name: /mark in-review/i });
    await expect(markReviewBtn).toBeVisible();
    await markReviewBtn.click();
    await expect(page.getByText(/in review/i).first()).toBeVisible();

    // Open Mark live modal.
    await page.getByRole('button', { name: /mark live/i }).click();
    const dialog = page.getByRole('dialog', { name: /mark live/i });
    await expect(dialog).toBeVisible();

    // Fill ASIN, submit. Release date defaults to today.
    // `getByLabel(/ASIN/i)` would also match the `?` help icon (aria-label
    // "Help for asin"), so scope to <input> only via the textbox role.
    await dialog.getByRole('textbox').first().fill('B0E2EBOOK1');
    await dialog.getByRole('button', { name: /^save$/i }).click();

    // Modal closes; published state shows.
    await expect(dialog).toBeHidden();
    await expect(page.getByText('B0E2EBOOK1')).toBeVisible();
    await expect(page.getByRole('button', { name: /open on amazon/i })).toBeVisible();
  });
});
