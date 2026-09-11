import { expect, test } from '@playwright/test';
import path from 'node:path';
import { attachPageErrorListeners } from './helpers';

test('native adaptive hiding and automatic sizing do not change public visibility or width', async ({
  page,
}) => {
  attachPageErrorListeners(page);
  await page.setViewportSize({ width: 1200, height: 800 });
  const fixture = path.resolve('tests/e2e/fixtures/layout-probe.html').replace(/\\/g, '/');
  await page.goto(`/@fs/${fixture}`);
  const city = page.locator('.dx-header-row td').filter({ hasText: /^City$/ });
  await expect(city).toBeVisible();
  const read = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          layoutProbe: () => {
            events: string[];
            columns: { key: string; visible: boolean; width?: number | string }[];
          };
        }
      ).layoutProbe()
    );
  const wide = await read();
  expect(wide.columns.find((column) => column.key === 'city')).toEqual({
    key: 'city',
    visible: true,
  });
  await page.setViewportSize({ width: 400, height: 800 });
  await expect(city).toBeHidden();
  const narrow = await read();
  expect(narrow.columns).toEqual(wide.columns);
  expect(narrow.events.filter((event) => /^columns\[\d+\]\.(visible|width)$/.test(event))).toEqual(
    []
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.reload();
  await expect(city).toBeVisible();
  await page.getByRole('button', { name: 'Column Chooser' }).click();
  await page
    .locator('.dx-treeview-node')
    .filter({ hasText: /^City$/ })
    .getByRole('checkbox')
    .click();
  await expect(city).toBeHidden();
  const hidden = await read();
  expect(hidden.columns.find((column) => column.key === 'city')?.visible).toBe(false);
  expect(hidden.events).toContain('columns[2].visible');
});
