import { test, expect, type Page, type TestInfo, type Response } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { GetGridParams, GetGridResult, GetGridGroupItem } from '../../src';
import { getColumnValues, setBooleanFilter } from './helpers';

interface Row {
  id: number;
  country: string;
  company: string;
  active: boolean;
  age: number | null;
}
const companies = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Umbrella Corp',
  'Hooli',
  'Soylent',
  'Massive Dynamic',
  'Stark Industries',
  'Wayne Enterprises',
  'Cyberdyne',
];
const countriesByLocation = [
  'USA',
  'USA',
  'UK',
  'Germany',
  'Germany',
  'France',
  'Japan',
  'Canada',
  'Australia',
  'Brazil',
];
const countries = ['Australia', 'Brazil', 'Canada', 'France', 'Germany', 'Japan', 'UK', 'USA'];
const seed: Row[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  company: companies[(i * 3 + 1) % 10]!,
  country: countriesByLocation[(i * 7 + 3) % 10]!,
  active: i % 4 !== 0,
  age: i % 7 === 0 ? null : 22 + ((i * 5) % 45),
}));
const group = [
  { selector: 'country', desc: false, isExpanded: false },
  { selector: 'company', desc: false, isExpanded: false },
];
const summary = [
  { selector: 'id', summaryType: 'count' },
  { selector: 'age', summaryType: 'avg' },
];
const aggregate = (rows: Row[]) => {
  const ages = rows.flatMap((row) => (row.age === null ? [] : [row.age]));
  return [rows.length, ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null];
};
const headers = (page: Page) => page.locator('.dx-datagrid-rowsview .dx-group-row:visible');
const rowFor = (page: Page, text: string) => headers(page).filter({ hasText: text }).first();
const pageButton = (page: Page, number: number) =>
  page.locator('.dx-pages .dx-page').filter({ hasText: new RegExp(`^${number}$`) });
const sizeButton = (page: Page, size: number) =>
  page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: new RegExp(`^${size}$`) });
const chip = (page: Page, text: string) =>
  page.locator('.dx-group-panel-item').filter({ hasText: text });

async function contextAction(page: Page, target: ReturnType<typeof chip>, action: string) {
  await target.click({ button: 'right' });
  await page
    .locator('.dx-overlay-content:visible .dx-menu-item')
    .filter({ hasText: new RegExp(`^${action}$`) })
    .click();
}
async function footer(page: Page, filtered = false) {
  await expect(
    page.locator('.dx-datagrid-total-footer .dx-datagrid-summary-item:visible')
  ).toHaveText([
    `Total customers: ${filtered ? 75 : 100}`,
    `Total average age: ${filtered ? '40.75' : '41.76'}`,
  ]);
  await expect(page.locator('.app-error-alert')).toHaveCount(0);
  await expect(page.locator('.dx-loadpanel-content')).not.toBeVisible();
}
type Exchange = { request: GetGridParams; response: GetGridResult<Row> };
const captures = new WeakMap<Page, { pending: Promise<Exchange>[]; failures: string[] }>();
function capture(page: Page) {
  const pending: Promise<Exchange>[] = [];
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/W0019|W0021/.test(message.text()))
      failures.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    if (response.url().endsWith('/api/customers/grid') && response.request().method() === 'POST') {
      pending.push(
        response.json().then((body) => ({
          request: response.request().postDataJSON() as GetGridParams,
          response: body as GetGridResult<Row>,
        }))
      );
    }
  });
  const log = { pending, failures };
  captures.set(page, log);
  return log;
}
async function exchange(
  page: Page,
  action: () => Promise<unknown>,
  match: (options: GetGridParams['loadOptions']) => boolean = () => true
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response: Response) =>
        response.url().endsWith('/api/customers/grid') &&
        response.request().method() === 'POST' &&
        match((response.request().postDataJSON() as GetGridParams).loadOptions)
    ),
    action(),
  ]);
  expect(response.status()).toBe(200);
  return {
    request: response.request().postDataJSON() as GetGridParams,
    response: (await response.json()) as GetGridResult<Row>,
  };
}
async function evidence(page: Page, info: TestInfo, log: ReturnType<typeof capture>) {
  await footer(page);
  expect(log.failures).toEqual([]);
  await info.attach('group-paging-http', {
    body: JSON.stringify(await Promise.all(log.pending), null, 2),
    contentType: 'application/json',
  });
  const screenshot = info.outputPath('group-paging-visible.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach('group-paging-visible', { path: screenshot, contentType: 'image/png' });
}
async function initial(page: Page) {
  const first = await exchange(page, () => page.goto('/#/group-paged-remote-customers'));
  expect(first.request.loadOptions).toEqual({
    group: [group[0]],
    groupPagingContext: { group, filter: null },
    skip: 0,
    take: 3,
    requireGroupCount: true,
    requireTotalCount: true,
    groupSummary: summary,
    totalSummary: summary,
  });
  expect(first.response.groupCount).toBe(8);
  expect(first.response.totalCount).toBe(100);
  expect(first.response.summary).toEqual(aggregate(seed));
  expect(first.response.data).toEqual(
    countries.slice(0, 3).map((key) => ({
      key,
      items: null,
      count: seed.filter((row) => row.country === key).length,
      summary: aggregate(seed.filter((row) => row.country === key)),
    }))
  );
  await expect(headers(page)).toHaveCount(3);
  await expect(page.locator('.dx-data-row:visible')).toHaveCount(0);
  await expect(rowFor(page, 'Country: Australia')).toContainText('Group customers: 10');
  await footer(page);
  return first;
}

test.describe('remote group paging through real FastAPI', () => {
  test.afterEach(async ({ page }, info) => {
    const log = captures.get(page);
    if (log) {
      const file = info.outputPath('all-http-and-errors.json');
      await writeFile(
        file,
        JSON.stringify(
          { exchanges: await Promise.all(log.pending), failures: log.failures },
          null,
          2
        )
      );
      await info.attach('all-http-and-errors', { path: file, contentType: 'application/json' });
    }
  });
  test('initial, next and resized root pages are SQL-sized with global summaries', async ({
    page,
  }, info) => {
    const log = capture(page);
    await initial(page);
    const next = await exchange(page, () => pageButton(page, 2).click());
    expect(next.request.loadOptions).toMatchObject({ skip: 3, take: 3, requireGroupCount: true });
    expect((next.response.data as GetGridGroupItem<Row>[]).map((row) => row.key)).toEqual(
      countries.slice(3, 6)
    );
    expect(next.request.loadOptions.totalSummary).toBeUndefined();
    await footer(page);
    // Previously downloaded root slices can satisfy a resized page from native cache.
    // A fresh store makes the larger first page a real HTTP request, not a cache assertion.
    await exchange(page, () => page.reload());
    await expect(rowFor(page, 'Country: Australia')).toBeVisible();
    await footer(page);
    const resized = await exchange(page, () => sizeButton(page, 5).click());
    expect(resized.request.loadOptions.take).toBe(5);
    const skip = resized.request.loadOptions.skip!;
    expect((resized.response.data as GetGridGroupItem<Row>[]).map((row) => row.key)).toEqual(
      countries.slice(skip, skip + 5)
    );
    await expect(sizeButton(page, 5)).toHaveClass(/dx-selection/);
    expect(resized.request.loadOptions.skip).toBe(0);
    expect(resized.response.data).toHaveLength(5);
    const firstPage = await exchange(page, () => pageButton(page, 2).click());
    expect(firstPage.request.loadOptions).toMatchObject({ skip: 5, take: 5 });
    expect(firstPage.response.data).toHaveLength(3);
    await expect(sizeButton(page, 5)).toHaveClass(/dx-selection/);
    await evidence(page, info, log);
  });

  test('parent, nested records, continuation pages and re-expansion are remote', async ({
    page,
  }, info) => {
    const log = capture(page);
    await initial(page);
    const parent = await exchange(
      page,
      () => rowFor(page, 'Country: Australia').locator('.dx-command-expand').first().click(),
      (options) => options.group?.[0]?.selector === 'company'
    );
    expect(parent.request.loadOptions).toMatchObject({
      filter: ['country', '=', 'Australia'],
      skip: 0,
      take: 1,
      requireGroupCount: true,
      requireTotalCount: false,
    });
    expect(parent.response.groupCount).toBe(1);
    const company = seed.find((row) => row.country === 'Australia')!.company;
    await expect(rowFor(page, `Company: ${company}`)).toContainText('Group customers: 10');
    const members = seed.filter((row) => row.country === 'Australia' && row.company === company);
    const leaf = await exchange(
      page,
      () => rowFor(page, `Company: ${company}`).locator('.dx-command-expand').last().click(),
      (options) => !options.group && options.requireTotalCount === false
    );
    expect(leaf.request.loadOptions).toMatchObject({
      filter: [['country', '=', 'Australia'], 'and', ['company', '=', company]],
      take: 1,
    });
    expect((leaf.response.data as Row[]).map((row) => row.id)).toEqual(
      members.slice(0, 1).map((row) => row.id)
    );
    await expect
      .poll(() => getColumnValues(page, 'ID'))
      .toEqual(members.slice(0, 1).map((row) => String(row.id)));
    await footer(page);
    const nextLeaf = await exchange(
      page,
      () => pageButton(page, 2).click(),
      (options) => !options.group && options.requireTotalCount === false
    );
    expect(nextLeaf.request.loadOptions.skip).toBe(1);
    expect((nextLeaf.response.data as Row[]).map((row) => row.id)).toEqual(
      members.slice(1, 1 + (nextLeaf.request.loadOptions.take ?? 100)).map((row) => row.id)
    );
    await footer(page);
    await pageButton(page, 1).click();
    await expect
      .poll(() => getColumnValues(page, 'ID'))
      .toEqual(members.slice(0, 1).map((row) => String(row.id)));
    const beforeCollapse = log.pending.length;
    await rowFor(page, 'Country: Australia').locator('.dx-command-expand').first().click();
    await expect(rowFor(page, `Company: ${company}`)).toHaveCount(0);
    await exchange(
      page,
      () => rowFor(page, 'Country: Australia').locator('.dx-command-expand').first().click(),
      (options) => options.group?.[0]?.selector === 'company'
    );
    await expect(rowFor(page, `Company: ${company}`)).toBeVisible();
    expect(log.pending.length).toBeGreaterThan(beforeCollapse);
    const traffic = await Promise.all(log.pending);
    for (const item of traffic.filter((item) => !item.request.loadOptions.group)) {
      expect(
        (item.response.data as Row[]).every(
          (row) => row.country === 'Australia' && row.company === company
        )
      ).toBe(true);
    }
    const child = traffic.find(
      (item) =>
        item.request.loadOptions.group?.[0]?.selector === 'company' &&
        item.request.loadOptions.groupSummary
    );
    expect(child!.response.data).toEqual([
      { key: company, items: null, count: 10, summary: aggregate(members) },
    ]);
    const sorted = await exchange(
      page,
      () =>
        contextAction(
          page,
          page.locator('.dx-header-row td').filter({ hasText: /^Age$/ }),
          'Sort Descending'
        ),
      (options) =>
        !options.group &&
        options.requireTotalCount === false &&
        options.sort?.some((sort) => sort.selector === 'age' && sort.desc) === true
    );
    const ordered = [...members].sort(
      (a, b) => (b.age ?? -Infinity) - (a.age ?? -Infinity) || a.id - b.id
    );
    expect((sorted.response.data as Row[]).map((row) => row.id)).toEqual(
      ordered.slice(0, sorted.request.loadOptions.take ?? 100).map((row) => row.id)
    );
    await expect
      .poll(() => getColumnValues(page, 'ID'))
      .toEqual(ordered.slice(0, 1).map((row) => String(row.id)));
    await evidence(page, info, log);
  });

  test('filtering, group direction, record sort, flat transition and complete-tree compatibility', async ({
    page,
  }, info) => {
    const log = capture(page);
    await initial(page);
    await rowFor(page, 'Country: Australia').locator('.dx-command-expand').first().click();
    await expect(rowFor(page, 'Company:')).toBeVisible();
    await exchange(
      page,
      () => setBooleanFilter(page, 'Active', 'True'),
      (options) => options.group?.[0]?.selector === 'country' && options.requireTotalCount === true
    );
    await footer(page, true);
    const filtered = (await Promise.all(log.pending)).filter(
      (item) => item.request.loadOptions.groupPagingContext?.filter !== null
    );
    expect(filtered.at(-1)!.request.loadOptions.groupPagingContext!.filter).toEqual([
      'active',
      '=',
      true,
    ]);
    await expect(rowFor(page, 'Company:')).toContainText(
      `Group customers: ${seed.filter((row) => row.country === 'Australia' && row.active).length}`
    );
    const descending = await exchange(
      page,
      () => chip(page, 'Country').click(),
      (options) =>
        options.group?.[0]?.selector === 'country' &&
        options.group[0].desc &&
        options.requireTotalCount !== false
    );
    expect((descending.response.data as GetGridGroupItem<Row>[])[0]!.key).toBe('USA');
    await footer(page, true);
    await exchange(
      page,
      () => contextAction(page, chip(page, 'Country'), 'Ungroup All'),
      (options) => !options.group && !options.groupPagingContext
    );
    await footer(page, true);
    const sorted = await exchange(
      page,
      () =>
        contextAction(
          page,
          page.locator('.dx-header-row td').filter({ hasText: /^Age$/ }),
          'Sort Descending'
        ),
      (options) =>
        !options.group &&
        options.sort?.some((sort) => sort.selector === 'age' && sort.desc) === true
    );
    expect(sorted.request.loadOptions).toMatchObject({ skip: 0, take: 3, requireTotalCount: true });
    const active = seed
      .filter((row) => row.active)
      .sort((a, b) => (b.age ?? -Infinity) - (a.age ?? -Infinity) || a.id - b.id);
    expect((sorted.response.data as Row[]).map((row) => row.id)).toEqual(
      active.slice(0, 3).map((row) => row.id)
    );
    await contextAction(
      page,
      page.locator('.dx-header-row td').filter({ hasText: /^Country$/ }),
      'Group by This Column'
    );
    await expect(headers(page)).toHaveCount(3);
    await footer(page, true);
    const complete = await exchange(page, () =>
      page.getByRole('menuitem', { name: 'Grouped Remote Customers', exact: true }).click()
    );
    expect(complete.request.loadOptions.groupPagingContext).toBeUndefined();
    expect(complete.request.loadOptions.skip).toBeUndefined();
    expect(complete.request.loadOptions.take).toBeUndefined();
    expect(complete.request.loadOptions.group).toEqual([
      { ...group[0], isExpanded: true },
      group[1],
    ]);
    expect(complete.response.data).toHaveLength(8);
    expect(
      (complete.response.data as GetGridGroupItem<Row>[]).every((node) => Array.isArray(node.items))
    ).toBe(true);
    await evidence(page, info, log);
  });
  test('nullable group keys are counted and expand to an SQL record page', async ({
    page,
  }, info) => {
    const log = capture(page);
    await initial(page);
    await exchange(
      page,
      () => contextAction(page, chip(page, 'Country'), 'Ungroup All'),
      (options) => !options.group
    );
    await expect(chip(page, 'Country')).toHaveCount(0);
    const grouped = await exchange(page, () =>
      contextAction(
        page,
        page.locator('.dx-header-row td').filter({ hasText: /^Age$/ }),
        'Group by This Column'
      )
    );
    expect(grouped.request.loadOptions.groupPagingContext!.group).toEqual([
      { selector: 'age', desc: false, isExpanded: false },
    ]);
    const nullRows = seed.filter((row) => row.age === null);
    expect(grouped.response.data[0]).toEqual({
      key: null,
      items: null,
      count: 15,
      summary: [15, null],
    });
    expect(grouped.response.groupCount).toBe(10);
    await expect(headers(page).first()).toContainText('Group customers: 15');
    const leaf = await exchange(
      page,
      () => headers(page).first().locator('.dx-command-expand').first().click(),
      (options) => !options.group
    );
    expect(leaf.request.loadOptions).toMatchObject({
      filter: ['age', '=', null],
      take: 2,
      requireTotalCount: false,
    });
    expect((leaf.response.data as Row[]).map((row) => row.id)).toEqual(
      nullRows.slice(0, 2).map((row) => row.id)
    );
    await expect.poll(() => getColumnValues(page, 'ID')).toEqual(['1', '8']);
    await evidence(page, info, log);
  });
});
