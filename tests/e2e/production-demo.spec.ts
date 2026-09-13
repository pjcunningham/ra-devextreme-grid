import { expect, test } from '@playwright/test';
import { attachPageErrorListeners, waitForGridRequest } from './helpers';

test('production build uses the same origin for the grid API', async ({ page, request }) => {
  attachPageErrorListeners(page);
  const { request: gridRequest, body } = await waitForGridRequest(page, async () => {
    await page.goto('/');
  });

  expect(gridRequest.url()).toBe('http://127.0.0.1:4174/api/customers/grid');
  expect(body.loadOptions.take).toBe(10);
  await expect(page.getByRole('heading', { name: 'ra-devextreme-grid live demo' })).toBeVisible();
  await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);
  await expect(page.getByRole('link', { name: 'Source code' })).toHaveAttribute(
    'href',
    'https://github.com/pjcunningham/ra-devextreme-grid/tree/main/examples/remote-fastapi'
  );
  await expect(page.getByRole('link', { name: 'Sponsors' })).toHaveAttribute(
    'href',
    'https://github.com/sponsors/pjcunningham'
  );

  const health = await request.get('/api/health');
  expect(await health.json()).toEqual({ status: 'ok' });
  const spaFallback = await request.get('/production-smoke-route');
  expect(await spaFallback.text()).toContain('<div id="root"></div>');
});
