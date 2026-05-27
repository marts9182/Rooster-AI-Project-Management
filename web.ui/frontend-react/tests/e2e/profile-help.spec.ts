/**
 * E2E: Profile editor saves & reloads + Help drawer opens/closes.
 */
import { test, expect } from '@playwright/test';

test.describe('Profile editor', () => {
  test.beforeEach(async ({ request }) => {
    const reset = await request.post('/api/__test__/reset');
    expect(reset.ok()).toBeTruthy();
  });

  test('saves and reloads', async ({ page }) => {
    await page.goto('/profile');
    await page.getByLabel(/Display name/i).fill('Shane Test');
    await page
      .getByLabel(/Etsy shop URL/i)
      .fill('https://etsy.com/shop/PocketRoosterPress');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Green "Saved ✓" badge appears.
    await expect(page.getByRole('status')).toContainText(/saved/i);

    // Reload — values persist.
    await page.reload();
    await expect(page.getByLabel(/Display name/i)).toHaveValue('Shane Test');
    await expect(page.getByLabel(/Etsy shop URL/i)).toHaveValue(
      'https://etsy.com/shop/PocketRoosterPress',
    );
  });
});

test.describe('Help drawer', () => {
  test('opens ASIN article from the help index and closes on Escape', async ({
    page,
  }) => {
    await page.goto('/help');

    // The Help index lists "Finding your ASIN".
    await page
      .getByRole('listitem', { name: /open help: finding your asin/i })
      .click();

    // Drawer becomes visible with the ASIN article rendered.
    const dialog = page.getByRole('dialog', { name: /help: asin/i });
    await expect(dialog).toBeVisible();
    // Markdown wraps "10-character ID" and "Amazon assigns" onto separate lines,
    // so match a substring rather than a regex across the line break.
    await expect(dialog).toContainText('10-character ID');

    // Pressing Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('closes via the close button', async ({ page }) => {
    await page.goto('/help');
    await page
      .getByRole('listitem', { name: /open help: finding your asin/i })
      .click();

    const dialog = page.getByRole('dialog', { name: /help: asin/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /close help/i }).click();
    await expect(dialog).toBeHidden();
  });
});
