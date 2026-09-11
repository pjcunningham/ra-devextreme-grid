import { writeFile } from 'node:fs/promises';
import { test, expect, type Page, type Request, type TestInfo } from '@playwright/test';
import {
  attachPageErrorListeners,
  clearFilterInput,
  getColumnValues,
  setDateFilter,
  setFilterInput,
  waitForGridResponse,
  type GridRequestBody,
} from './helpers';

const totalSummary = [
  { selector: 'id', summaryType: 'count' },
  { selector: 'age', summaryType: 'avg' },
  { selector: 'age', summaryType: 'min' },
  { selector: 'age', summaryType: 'max' },
] satisfies NonNullable<GridRequestBody['loadOptions']['totalSummary']>;

// Independently calculated from seed.py, not from an API summary or the visible page.
// 100 rows: 85 non-null ages, sum 3550. UK: eight non-null ages, sum 331.
const allSummary = [100, 3550 / 85, 22, 62];
const ukAges = [null, 62, 22, 27, 32, 37, 42, null, 52, 57];
const ukIds = [8, 18, 28, 38, 48, 58, 68, 78, 88, 98];
const ukSummary = [10, 331 / 8, 22, 62];
const allFooter = ['Customers: 100', 'Average age: 41.76', 'Minimum age: 22', 'Maximum age: 62'];
const ukFooter = ['Customers: 10', 'Average age: 41.38', 'Minimum age: 22', 'Maximum age: 62'];

async function roundTrip(
  page: Page,
  testInfo: TestInfo,
  name: string,
  action: () => Promise<unknown>,
  expected: {
    options: GridRequestBody['loadOptions'];
    summary: Array<number | null>;
    footer: string[];
    screenshot?: boolean;
  }
) {
  const requests: Request[] = [];
  const record = (request: Request) => {
    if (request.url().includes('/api/customers/grid') && request.method() === 'POST') {
      requests.push(request);
    }
  };
  page.on('request', record);
  try {
    const { response, body } = await waitForGridResponse(page, async () => {
      await action();
    });
    const requestBody = response.request().postDataJSON() as GridRequestBody;
    expect(response.status()).toBe(200);
    expect(requestBody.loadOptions).toEqual({ ...expected.options, totalSummary });
    expect(body.totalCount).toBe(expected.summary[0]);
    expect(body.summary).toEqual(expected.summary);
    expect(body.data).toHaveLength(
      Math.min(expected.options.take ?? 10, Number(body.totalCount) - (expected.options.skip ?? 0))
    );
    for (const customer of body.data) {
      expect(customer.joined_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    const footer = page.locator('.dx-datagrid-total-footer');
    const items = footer.locator('.dx-datagrid-summary-item:visible');
    await expect(footer).toBeVisible();
    await expect(items).toHaveText(expected.footer);
    await expect
      .poll(() => getColumnValues(page, 'ID'))
      .toEqual(body.data.map((customer) => String(customer.id)));
    await expect(page.locator('.dx-loadpanel-content')).not.toBeVisible();
    await expect(page.locator('.app-error-alert[role="alert"]')).toHaveCount(0);
    await expect(footer).not.toContainText(/NaN|undefined|null/);

    const footerTexts = await items.allInnerTexts();
    const evidencePath = testInfo.outputPath(`${name}.json`);
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          seedExpectations: {
            allSummary,
            allNonNullAges: 85,
            allAgeSum: 3550,
            ukIds,
            ukAges,
            ukSummary,
          },
          request: {
            method: response.request().method(),
            url: response.url(),
            body: requestBody,
          },
          response: { status: response.status(), body },
          footerTexts,
        },
        null,
        2
      )
    );
    await testInfo.attach(`${name}-request-response-footer`, {
      path: evidencePath,
      contentType: 'application/json',
    });
    if (expected.screenshot) {
      const screenshotPath = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await testInfo.attach(`${name}-visible-footer`, {
        path: screenshotPath,
        contentType: 'image/png',
      });
      console.log(`[summary screenshot] ${screenshotPath}`);
    }
    // One complete HTTP load carries all four descriptors, rows, count, and summary.
    expect(requests).toHaveLength(1);
    console.log(
      `[summary evidence] ${name} ${JSON.stringify({ request: requestBody, summary: body.summary, footerTexts })} ${evidencePath}`
    );
    return { requestBody, body };
  } finally {
    page.off('request', record);
  }
}

function pageButton(page: Page, number: number) {
  return page.locator('.dx-pages .dx-page').filter({ hasText: new RegExp(`^${number}$`) });
}

function size5Button(page: Page) {
  return page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: /^5$/ });
}

function header(page: Page, caption: string) {
  return page.locator('.dx-datagrid-headers .dx-header-row td').filter({ hasText: caption });
}

test.describe('FastAPI native total summary round trips', () => {
  test.beforeEach(async ({ page }) => {
    attachPageErrorListeners(page);
  });

  test('initial 100-row totals survive page size 10 to 5 and forward/back navigation', async ({
    page,
  }, testInfo) => {
    const initial = await roundTrip(page, testInfo, 'initial', () => page.goto('/'), {
      options: { skip: 0, take: 10, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
      screenshot: true,
    });
    expect(initial.body.data.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await roundTrip(page, testInfo, 'page-size-5', () => size5Button(page).click(), {
      options: { skip: 0, take: 5, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
    await expect(page.locator('.dx-page-sizes .dx-page-size.dx-selection')).toHaveText('5');
    const next = await roundTrip(page, testInfo, 'page-2', () => pageButton(page, 2).click(), {
      options: { skip: 5, take: 5, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
    expect(next.body.data.map((row) => row.id)).toEqual([6, 7, 8, 9, 10]);
    await roundTrip(page, testInfo, 'page-1-again', () => pageButton(page, 1).click(), {
      options: { skip: 0, take: 5, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
  });

  test('UK totals survive filtered paging and multi-sort, then clear restores all totals', async ({
    page,
  }, testInfo) => {
    await roundTrip(page, testInfo, 'initial', () => page.goto('/'), {
      options: { skip: 0, take: 10, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
    const options = { skip: 0, take: 10, requireTotalCount: true, filter: ['country', '=', 'UK'] };
    const uk = await roundTrip(
      page,
      testInfo,
      'uk-filter',
      () => setFilterInput(page, 'Country', 'UK'),
      {
        options,
        summary: ukSummary,
        footer: ukFooter,
        screenshot: true,
      }
    );
    expect(uk.body.data.map((row) => row.id)).toEqual(ukIds);
    expect(uk.body.data.map((row) => row.age)).toEqual(ukAges);
    expect(uk.body.data.every((row) => row.country === 'UK')).toBe(true);
    options.take = 5;
    await roundTrip(page, testInfo, 'uk-size-5', () => size5Button(page).click(), {
      options,
      summary: ukSummary,
      footer: ukFooter,
    });
    const next = await roundTrip(page, testInfo, 'uk-page-2', () => pageButton(page, 2).click(), {
      options: { ...options, skip: 5 },
      summary: ukSummary,
      footer: ukFooter,
    });
    expect(next.body.data.map((row) => row.id)).toEqual(ukIds.slice(5));
    await roundTrip(page, testInfo, 'uk-page-1-again', () => pageButton(page, 1).click(), {
      options,
      summary: ukSummary,
      footer: ukFooter,
    });
    const sort = [{ selector: 'company', desc: false }];
    await roundTrip(page, testInfo, 'uk-company-sort', () => header(page, 'Company').click(), {
      options: { ...options, sort },
      summary: ukSummary,
      footer: ukFooter,
    });
    sort.push({ selector: 'name', desc: false });
    await roundTrip(
      page,
      testInfo,
      'uk-multi-sort-ascending',
      () => header(page, 'Name').click({ modifiers: ['Shift'] }),
      { options: { ...options, sort }, summary: ukSummary, footer: ukFooter }
    );
    expect(sort[1]).toEqual({ selector: 'name', desc: false });
    sort[1]!.desc = true;
    const sorted = await roundTrip(
      page,
      testInfo,
      'filtered-sorted',
      () => header(page, 'Name').click({ modifiers: ['Shift'] }),
      { options: { ...options, sort }, summary: ukSummary, footer: ukFooter, screenshot: true }
    );
    expect(sorted.body.data.map((row) => row.id)).toEqual([28, 8, 88, 68, 98]);
    const sortedNext = await roundTrip(
      page,
      testInfo,
      'filtered-sorted-page-2',
      () => pageButton(page, 2).click(),
      {
        options: { ...options, skip: 5, sort },
        summary: ukSummary,
        footer: ukFooter,
        screenshot: true,
      }
    );
    expect(sortedNext.body.data.map((row) => row.id)).toEqual([48, 18, 58, 78, 38]);
    await roundTrip(page, testInfo, 'clear-country', () => clearFilterInput(page, 'Country'), {
      options: { skip: 0, take: 5, requireTotalCount: true, sort },
      summary: allSummary,
      footer: allFooter,
      screenshot: true,
    });
    await expect(page.locator('.dx-page-sizes .dx-page-size.dx-selection')).toHaveText('5');
  });

  test('empty results and an all-null age result show zero/count without fake numeric aggregates', async ({
    page,
  }, testInfo) => {
    await roundTrip(page, testInfo, 'initial', () => page.goto('/'), {
      options: { skip: 0, take: 10, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
    const empty = await roundTrip(page, testInfo, 'empty', () => setFilterInput(page, 'ID', '-1'), {
      options: { skip: 0, take: 10, requireTotalCount: true, filter: ['id', '=', -1] },
      summary: [0, null, null, null],
      footer: ['Customers: 0', 'Average age:', 'Minimum age:', 'Maximum age:'],
      screenshot: true,
    });
    expect(empty.body.data).toEqual([]);
    await expect(page.locator('.dx-datagrid-nodata')).toBeVisible();
    const nullAge = await roundTrip(
      page,
      testInfo,
      'null-age',
      () => setFilterInput(page, 'ID', '1'),
      {
        options: { skip: 0, take: 10, requireTotalCount: true, filter: ['id', '=', 1] },
        summary: [1, null, null, null],
        footer: ['Customers: 1', 'Average age:', 'Minimum age:', 'Maximum age:'],
        screenshot: true,
      }
    );
    expect(nullAge.body.data).toHaveLength(1);
    expect(nullAge.body.data[0]).toBeDefined();
    expect(nullAge.body.data[0]!.age).toBeNull();
    await roundTrip(page, testInfo, 'clear-id', () => clearFilterInput(page, 'ID'), {
      options: { skip: 0, take: 10, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
  });

  test('date-only filtering keeps summary and date response values in Asia/Tokyo', async ({
    page,
  }, testInfo) => {
    await roundTrip(page, testInfo, 'initial', () => page.goto('/'), {
      options: { skip: 0, take: 10, requireTotalCount: true },
      summary: allSummary,
      footer: allFooter,
    });
    const filtered = await roundTrip(
      page,
      testInfo,
      'date-filter',
      () => setDateFilter(page, 'Joined On', 2021, 4, 23),
      {
        options: {
          skip: 0,
          take: 10,
          requireTotalCount: true,
          filter: [['joined_on', '>=', '2021-04-23'], 'and', ['joined_on', '<', '2021-04-24']],
        },
        summary: [1, 62, 62, 62],
        footer: ['Customers: 1', 'Average age: 62.00', 'Minimum age: 62', 'Maximum age: 62'],
        screenshot: true,
      }
    );
    expect(filtered.body.data[0]).toMatchObject({ id: 9, joined_on: '2021-04-23', age: 62 });
  });
});
