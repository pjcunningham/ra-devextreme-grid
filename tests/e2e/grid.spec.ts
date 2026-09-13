import { test, expect } from '@playwright/test';
import {
  attachPageErrorListeners,
  getColumnValues,
  setBooleanFilter,
  setDateFilter,
  setFilterInput,
  setFilterOperation,
  waitForGridRequest,
  waitForGridResponse,
} from './helpers';

test.describe('FastAPI Remote Grid End-to-End Tests', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorListeners(page);
  });

  test('1. Initial real HTTP load and paging state', async ({ page }) => {
    const { body } = await waitForGridRequest(page, async () => {
      await page.goto('/');
    });

    // Request payload contract assertions
    expect(body.loadOptions.skip).toBe(0);
    expect(body.loadOptions.take).toBe(10);
    expect(body.loadOptions.requireTotalCount).toBe(true);

    // Grid DOM rendering assertions
    const dataRows = page.locator('.dx-datagrid-rowsview .dx-data-row:visible');
    await expect(dataRows).toHaveCount(10);

    await expect(page.getByRole('heading', { name: 'ra-devextreme-grid live demo' })).toBeVisible();
    await expect(page.getByText('All demo data is synthetic.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/pjcunningham/ra-devextreme-grid'
    );
    await expect(page.getByRole('link', { name: 'npm package' })).toHaveAttribute(
      'href',
      'https://www.npmjs.com/package/ra-devextreme-grid'
    );
    await page.getByText('Latest getGrid() request').click();
    await expect(page.locator('.request-inspector pre')).toContainText('"skip": 0');

    // Pager reports backend dataset count
    const pager = page.locator('.dx-datagrid-pager');
    await expect(pager).toContainText('100');

    // No application error alert is displayed
    const alert = page.locator('.app-error-alert[role="alert"]');
    await expect(alert).toHaveCount(0);
  });

  test('2. Page-size selection persistence (10 -> 5 -> 25) without rollback', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // Switch page size to 5
    const size5 = page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: /^5$/ });
    const { body: body5 } = await waitForGridRequest(page, async () => {
      await size5.click();
    });

    expect(body5.loadOptions.take).toBe(5);
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(5);
    await expect(page.locator('.dx-page-sizes .dx-page-size.dx-selection')).toHaveText('5');

    // Switch page size to 25
    const size25 = page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: /^25$/ });
    const { body: body25 } = await waitForGridRequest(page, async () => {
      await size25.click();
    });

    expect(body25.loadOptions.take).toBe(25);
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(25);
    // Assert value persists and does not roll back to 10
    await expect(page.locator('.dx-page-sizes .dx-page-size.dx-selection')).toHaveText('25');
  });

  test('3. Paging navigation with correct skip and take', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    const page1Ids = await getColumnValues(page, 'ID');
    expect(page1Ids).toHaveLength(10);

    // Navigate to page 2
    const page2Button = page.locator('.dx-pages .dx-page').filter({ hasText: /^2$/ });
    const { body } = await waitForGridRequest(page, async () => {
      await page2Button.click();
    });

    expect(body.loadOptions.skip).toBe(10);
    expect(body.loadOptions.take).toBe(10);

    const page2Ids = await getColumnValues(page, 'ID');
    expect(page2Ids).toHaveLength(10);
    // Page 2 IDs must differ from page 1 IDs
    expect(page2Ids).not.toEqual(page1Ids);
  });

  test('4. String filter row filtering by Country', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    const { body } = await setFilterInput(page, 'Country', 'UK');

    // Verify filter expression emitted over the wire
    expect(body.loadOptions.filter).toEqual(['country', '=', 'UK']);

    // Assert visible rows all have Country UK
    const visibleCountries = await getColumnValues(page, 'Country');
    expect(visibleCountries.length).toBeGreaterThan(0);
    for (const c of visibleCountries) {
      expect(c).toBe('UK');
    }

    // Exactly 10 seeded customers in the database are from the UK
    const pager = page.locator('.dx-datagrid-pager');
    await expect(pager).toContainText('10');
  });

  test('5. Numeric filter row filtering by Age', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // Set filter operation to >= on Age column
    await setFilterOperation(page, 'Age', 'Greater than or equal to');

    // Fill filter value 50
    const { body } = await setFilterInput(page, 'Age', '50');

    // Verify scalar numeric typing (number 50, not string "50")
    expect(body.loadOptions.filter).toBeDefined();
    const filter = body.loadOptions.filter as [string, string, unknown];
    expect(filter[0]).toBe('age');
    expect(filter[1]).toBe('>=');
    expect(typeof filter[2]).toBe('number');
    expect(filter[2]).toBe(50);

    // Assert visible rows all have age >= 50
    const visibleAges = await getColumnValues(page, 'Age');
    expect(visibleAges.length).toBeGreaterThan(0);
    for (const a of visibleAges) {
      expect(Number(a)).toBeGreaterThanOrEqual(50);
    }
  });

  test('6. Boolean filter row filtering by Active status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // Select True from Active select box
    const { body } = await setBooleanFilter(page, 'Active', 'True');

    // Verify scalar boolean typing (boolean true, not "true" or 1)
    expect(body.loadOptions.filter).toBeDefined();
    const filter = body.loadOptions.filter as [string, string, unknown];
    expect(filter[0]).toBe('active');
    expect(filter[1]).toBe('=');
    expect(typeof filter[2]).toBe('boolean');
    expect(filter[2]).toBe(true);

    // In DevExtreme DataGrid, boolean column renders checked checkbox or indicator
    const rows = page.locator('.dx-datagrid-rowsview .dx-data-row:visible');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('7. Multi-column sorting with ordered descriptors', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    const countryHeader = page.locator('.dx-datagrid-headers td').filter({ hasText: /^Country$/ });
    const companyHeader = page.locator('.dx-datagrid-headers td').filter({ hasText: /^Company$/ });

    // Click Country ASC
    await waitForGridRequest(page, async () => {
      await countryHeader.click();
    });

    // Shift-click Company ASC
    const { body } = await waitForGridRequest(page, async () => {
      await companyHeader.click({ modifiers: ['Shift'] });
    });

    // Assert multi-column sort descriptors in order
    expect(body.loadOptions.sort).toEqual([
      { selector: 'country', desc: false },
      { selector: 'company', desc: false },
    ]);
  });

  test('8. Combined filtering, multi-sorting, and paging', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // 1. Set Country filter to UK
    await setFilterInput(page, 'Country', 'UK');

    // 2. Set Active filter to True
    await setBooleanFilter(page, 'Active', 'True');

    // 3. Multi-sort: Company ASC then Shift-click Name DESC
    const companyHeader = page
      .locator('.dx-datagrid-headers .dx-header-row td')
      .filter({ hasText: 'Company' });
    const nameHeader = page
      .locator('.dx-datagrid-headers .dx-header-row td')
      .filter({ hasText: 'Name' });

    await waitForGridRequest(page, async () => {
      await companyHeader.click();
    });
    // Click Name once for ASC, then again with Shift for DESC
    await waitForGridRequest(page, async () => {
      await nameHeader.click({ modifiers: ['Shift'] });
    });
    await waitForGridRequest(page, async () => {
      await nameHeader.click({ modifiers: ['Shift'] });
    });

    // 4. Change page size to 5
    const size5 = page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: /^5$/ });
    await waitForGridRequest(page, async () => {
      await size5.click();
    });

    // 5. Navigate to page 2
    const page2Button = page.locator('.dx-pages .dx-page').filter({ hasText: /^2$/ });
    const { body } = await waitForGridRequest(page, async () => {
      await page2Button.click();
    });

    // Verify all dimensions combined in one request
    expect(body.loadOptions.skip).toBe(5);
    expect(body.loadOptions.take).toBe(5);
    expect(body.loadOptions.sort).toEqual([
      { selector: 'company', desc: false },
      { selector: 'name', desc: true },
    ]);
    expect(body.loadOptions.filter).toEqual([['country', '=', 'UK'], 'and', ['active', '=', true]]);

    // Verify displayed rows match filter condition
    const visibleCountries = await getColumnValues(page, 'Country');
    for (const c of visibleCountries) {
      expect(c).toBe('UK');
    }
  });

  test('9. Date filtering in non-UTC timezone (Asia/Tokyo) sends date-only strings', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // Filter by date 2021-04-23 (Customer 8 seeded date)
    const { body } = await setDateFilter(page, 'Joined On', 2021, 4, 23);

    // Verify wire payload format
    expect(body.loadOptions.filter).toBeDefined();
    const filterJson = JSON.stringify(body.loadOptions.filter);

    // Assert date operands are normalized YYYY-MM-DD strings
    expect(filterJson).toContain('2021-04-23');

    // Assert NO ISO timestamps or times (T...Z) cross the wire
    expect(filterJson).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
    expect(filterJson).not.toContain('Z');

    // Verify DevExtreme date range expansion operands are both date-only
    if (Array.isArray(body.loadOptions.filter) && Array.isArray(body.loadOptions.filter[0])) {
      const lower = body.loadOptions.filter[0] as [string, string, string];
      const upper = body.loadOptions.filter[2] as [string, string, string];
      expect(lower[0]).toBe('joined_on');
      expect(lower[1]).toBe('>=');
      expect(lower[2]).toBe('2021-04-23');

      expect(upper[0]).toBe('joined_on');
      expect(upper[1]).toBe('<');
      expect(upper[2]).toBe('2021-04-24');
    }
  });

  test('10. Surfaces real backend HTTP 422 errors into accessible alert banner', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // Intercept grid POST request and inject an invalid selector
    await page.route('**/api/customers/grid', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      postData.loadOptions = postData.loadOptions || {};
      postData.loadOptions.filter = ['invalid_column', '=', 'test'];

      await route.continue({
        postData: JSON.stringify(postData),
      });
    });

    // Trigger request by changing Country filter
    await setFilterInput(page, 'Country', 'Germany');

    // Verify alert element appears with the exact FastAPI error message
    const alert = page.locator('.app-error-alert[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Unknown filter selector: 'invalid_column'");
  });

  test('11. Recovers from error state on subsequent valid query', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    // 1. Force a 422 error via route modification
    await page.route('**/api/customers/grid', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      postData.loadOptions = postData.loadOptions || {};
      postData.loadOptions.filter = ['unsupported_field', '=', 'bad'];

      await route.continue({
        postData: JSON.stringify(postData),
      });
    });

    await setFilterInput(page, 'Country', 'France');
    const alert = page.locator('.app-error-alert[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Unknown filter selector: 'unsupported_field'");

    // 2. Clear route modification so real queries pass through unmodified
    await page.unroute('**/api/customers/grid');

    // 3. Apply a valid filter
    await setFilterInput(page, 'Country', 'UK');

    // Verify grid recovers: rows load and alert banner is cleared
    await expect(alert).toHaveCount(0);
    const visibleCountries = await getColumnValues(page, 'Country');
    expect(visibleCountries.length).toBeGreaterThan(0);
    for (const c of visibleCountries) {
      expect(c).toBe('UK');
    }
  });

  test('12. Shows native DevExtreme loading panel during delayed requests', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(10);

    let resumeRequest!: () => void;
    const requestHold = new Promise<void>((resolve) => {
      resumeRequest = resolve;
    });

    await page.route('**/api/customers/grid', async (route) => {
      await requestHold;
      await route.continue();
    });

    const size5 = page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: /^5$/ });
    const loadPanel = page.locator('.dx-loadpanel-content');

    // Initiate page size change and wait for the loading panel to appear while request is on hold
    await size5.click();
    await expect(loadPanel).toBeVisible();

    // Release the request and assert loading panel disappears
    resumeRequest();
    await expect(loadPanel).not.toBeVisible();
    await expect(page.locator('.dx-datagrid-rowsview .dx-data-row:visible')).toHaveCount(5);

    await page.unroute('**/api/customers/grid');
  });

  test('13. Receives proper CORS headers matching frontend origin', async ({ page }) => {
    const { response } = await waitForGridResponse(page, async () => {
      await page.goto('/');
    });

    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBe('http://127.0.0.1:5174');
  });
});
