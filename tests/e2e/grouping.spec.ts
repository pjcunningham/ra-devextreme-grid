import { writeFile } from 'node:fs/promises';
import { test, expect, type Page, type Request, type TestInfo } from '@playwright/test';
import type { Customer } from '../../examples/remote-fastapi/frontend/src/App';
import type {
  GetGridGroupDescriptor,
  GetGridGroupItem,
  GetGridLoadOptions,
  GetGridParams,
  GetGridResult,
  GetGridSummaryDescriptor,
} from '../../src/remote/types';
import { getColumnValues, setBooleanFilter } from './helpers';

const summaries: GetGridSummaryDescriptor[] = [
  { selector: 'id', summaryType: 'count' },
  { selector: 'age', summaryType: 'avg' },
];
const twoLevels: GetGridGroupDescriptor[] = [
  { selector: 'country', desc: false, isExpanded: true },
  { selector: 'company', desc: false, isExpanded: false },
];
const countries = ['Australia', 'Brazil', 'Canada', 'France', 'Germany', 'Japan', 'UK', 'USA'];

// Independent seed.py calculation: never derive expected membership or aggregates from HTTP.
const firstNames = [
  'Alice',
  'Bob',
  'Charlie',
  'David',
  'Emma',
  'Frank',
  'Grace',
  'Henry',
  'Isabella',
  'Jack',
];
const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
];
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
const locations = [
  ['New York', 'USA'],
  ['San Francisco', 'USA'],
  ['London', 'UK'],
  ['Berlin', 'Germany'],
  ['Munich', 'Germany'],
  ['Paris', 'France'],
  ['Tokyo', 'Japan'],
  ['Toronto', 'Canada'],
  ['Sydney', 'Australia'],
  ['Sao Paulo', 'Brazil'],
];
const seed: Customer[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `${firstNames[i % 10]} ${lastNames[Math.floor(i / 10) % 10]}`,
  company: companies[(i * 3 + 1) % 10]!,
  city: locations[(i * 7 + 3) % 10]![0]!,
  country: locations[(i * 7 + 3) % 10]![1]!,
  active: i % 4 !== 0,
  age: i % 7 === 0 ? null : 22 + ((i * 5) % 45),
  joined_on: new Date(Date.UTC(2021, 0, 1 + i * 14)).toISOString().slice(0, 10),
}));

function aggregate(rows: Customer[]): number[] {
  const ages = rows.flatMap((row) => (row.age === null ? [] : [row.age]));
  return [rows.length, ages.reduce((sum, age) => sum + age, 0) / ages.length];
}

function expectedGroups(
  rows: Customer[],
  descriptors: GetGridGroupDescriptor[]
): GetGridGroupItem<Customer>[] {
  const [descriptor, ...rest] = descriptors;
  const field = descriptor!.selector as 'country' | 'company';
  const keys = [...new Set(rows.map((row) => row[field]))].sort();
  if (descriptor!.desc) keys.reverse();
  return keys.map((key) => {
    const members = rows.filter((row) => row[field] === key);
    return {
      key,
      items: rest.length ? expectedGroups(members, rest) : members,
      summary: aggregate(members),
    };
  });
}

function leafIds(groups: GetGridGroupItem<Customer>[], depth: number): number[] {
  return groups.flatMap((group) =>
    depth === 1
      ? (group.items as Customer[]).map((row) => row.id)
      : leafIds(group.items as GetGridGroupItem<Customer>[], depth - 1)
  );
}

function groupRow(page: Page, label: string) {
  return page.locator('.dx-datagrid-rowsview .dx-group-row:visible').filter({ hasText: label });
}

function chip(page: Page, caption: string) {
  return page.locator('.dx-group-panel-item').filter({ hasText: caption });
}

function sizeButton(page: Page, size: number) {
  return page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: new RegExp(`^${size}$`) });
}

function pageButton(page: Page, number: number) {
  return page.locator('.dx-pages .dx-page').filter({ hasText: new RegExp(`^${number}$`) });
}

async function contextAction(page: Page, target: ReturnType<typeof chip>, name: string) {
  await target.click({ button: 'right' });
  const item = page
    .locator('.dx-overlay-content:visible .dx-menu-item')
    .filter({ hasText: new RegExp(`^${name}$`) });
  await expect(item).toBeVisible();
  await item.click();
}

async function footer(page: Page, active = false) {
  await expect(
    page.locator('.dx-datagrid-total-footer .dx-datagrid-summary-item:visible')
  ).toHaveText([
    `Total customers: ${active ? 75 : 100}`,
    `Total average age: ${active ? '40.75' : '41.76'}`,
  ]);
  await expect(page.locator('.app-error-alert[role="alert"]')).toHaveCount(0);
  await expect(page.locator('.dx-loadpanel-content')).not.toBeVisible();
}

async function evidence(page: Page, testInfo: TestInfo, name: string, details: unknown) {
  const jsonPath = testInfo.outputPath(`${name}.json`);
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        details,
        dom: {
          groupPanel: await page.locator('.dx-group-panel-item').allInnerTexts(),
          groupRows: await page
            .locator('.dx-datagrid-rowsview .dx-group-row:visible')
            .allInnerTexts(),
          visibleIds: await getColumnValues(page, 'ID'),
          footer: await page.locator('.dx-datagrid-total-footer').innerText(),
          pager: await page.locator('.dx-datagrid-pager').innerText(),
        },
      },
      null,
      2
    )
  );
  await testInfo.attach(`${name}-http-dom`, {
    path: jsonPath,
    contentType: 'application/json',
  });
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
}

async function groupedLoad(
  page: Page,
  testInfo: TestInfo,
  name: string,
  action: () => Promise<unknown>,
  group = twoLevels,
  active = false
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/api/customers/grid') && res.request().method() === 'POST'
    ),
    action(),
  ]);
  const request = response.request().postDataJSON() as GetGridParams;
  const body = (await response.json()) as GetGridResult<Customer>;
  const options: GetGridLoadOptions = {
    group,
    groupSummary: summaries,
    totalSummary: summaries,
    ...(active ? { filter: ['active', '=', true] } : {}),
  };
  expect(response.status()).toBe(200);
  // Exact equality proves automatic requests contain neither paging nor either count flag.
  expect(request).toEqual({ loadOptions: options });
  const rows = active ? seed.filter((row) => row.active) : seed;
  const tree = expectedGroups(rows, group);
  expect(body).toEqual({ data: tree, summary: aggregate(rows) });
  expect(body.data.map((node) => node.key)).toEqual(
    group[0]!.desc ? [...countries].reverse() : countries
  );
  await expect(
    page.getByRole('heading', { name: 'Grouped Remote Customers', exact: true })
  ).toBeVisible();
  await expect(groupRow(page, `Country: ${tree[0]!.key}`)).toBeVisible();
  await footer(page, active);
  const ids = leafIds(tree, group.length).map(String);
  await expect.poll(async () => (await getColumnValues(page, 'ID'))[0]).toBe(ids[0]);
  const visibleIds = await getColumnValues(page, 'ID');
  expect(visibleIds.length).toBeGreaterThan(0);
  expect(visibleIds).toEqual(ids.slice(0, visibleIds.length));
  await evidence(page, testInfo, name, {
    traffic: 'automatic native DataGrid request',
    request: { url: response.url(), method: 'POST', body: request },
    response: { status: response.status(), body },
    independentSeed: { expectedTree: tree, summary: aggregate(rows) },
  });
  console.log(
    `[grouped evidence] ${name} ${JSON.stringify({ request, summary: body.summary, visibleIds })}`
  );
  return { url: response.url(), request, body };
}

async function localAction(
  page: Page,
  testInfo: TestInfo,
  name: string,
  action: () => Promise<unknown>,
  verify: () => Promise<unknown>
) {
  const requests: Request[] = [];
  const record = (request: Request) => {
    if (request.url().endsWith('/api/customers/grid') && request.method() === 'POST')
      requests.push(request);
  };
  page.on('request', record);
  try {
    await action();
    await verify();
    await expect(page.locator('.dx-loadpanel-content')).not.toBeVisible();
    // Observe a quiet interval after the native DOM transition, including deferred store work.
    await page.waitForTimeout(400);
    expect(
      requests.map((request) => request.postDataJSON()),
      `${name} must use native caching`
    ).toEqual([]);
    await evidence(page, testInfo, name, {
      traffic: 'local native cached interaction',
      additionalGridPosts: requests.length,
    });
  } finally {
    page.off('request', record);
  }
}

const testWithDiagnostics = test.extend<{ strictBrowser: void }>({
  strictBrowser: [
    async ({ page }, use, testInfo) => {
      const pageErrors: string[] = [];
      const unexpectedConsole: string[] = [];
      const licenseMessages: string[] = [];
      const developmentWarnings: string[] = [];
      const resourceErrors: Array<{ url: string; status: number }> = [];
      const failedRequests: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (!['error', 'warning', 'warn'].includes(message.type())) return;
        const text = message.text();
        if (/W0019|W0021|(?=.*DevExtreme)(?=.*(?:evaluation|license))/is.test(text))
          licenseMessages.push(text);
        else if (
          message.type() === 'warning' &&
          text ===
            'You are running production build of Inferno in development mode. Use dev:module entry point.'
        )
          developmentWarnings.push(text);
        else unexpectedConsole.push(`${message.type()}: ${text} (${message.location().url})`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400)
          resourceErrors.push({ url: response.url(), status: response.status() });
      });
      page.on('requestfailed', (request) =>
        failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`)
      );
      await use();
      const diagnosticsPath = testInfo.outputPath('strict-browser-diagnostics.json');
      await writeFile(
        diagnosticsPath,
        JSON.stringify(
          {
            pageErrors,
            unexpectedConsole,
            licenseMessages,
            developmentWarnings,
            resourceErrors,
            failedRequests,
          },
          null,
          2
        )
      );
      await testInfo.attach('strict-browser-diagnostics', {
        path: diagnosticsPath,
        contentType: 'application/json',
      });
      expect(pageErrors, 'no unhandled page errors').toEqual([]);
      expect(unexpectedConsole, 'no unexpected console warnings or errors').toEqual([]);
      expect(
        resourceErrors.filter((response) => response.status === 404),
        'no resource or favicon 404s'
      ).toEqual([]);
      expect(resourceErrors, 'all browser HTTP resources succeed').toEqual([]);
      expect(failedRequests, 'no failed browser requests').toEqual([]);
    },
    { auto: true },
  ],
});

testWithDiagnostics.describe('FastAPI complete native grouping', () => {
  testWithDiagnostics(
    'two-level tree, summaries and cached collapse, expand, paging and sizes',
    async ({ page }, testInfo) => {
      await groupedLoad(page, testInfo, 'two-level-initial', () =>
        page.goto('/#/grouped-remote-customers')
      );
      await expect(chip(page, 'Country')).toBeVisible();
      await expect(chip(page, 'Company')).toBeVisible();
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'data:,');
      const australia = groupRow(page, 'Country: Australia');
      const australiaRows = seed.filter((row) => row.country === 'Australia');
      await expect(australia).toContainText('Group customers: 10');
      await expect(australia).toContainText(
        `Group average age: ${aggregate(australiaRows)[1]!.toFixed(2)}`
      );
      await expect(groupRow(page, 'Company: Massive Dynamic')).toBeVisible();
      await localAction(
        page,
        testInfo,
        'collapse-australia',
        () => australia.locator('.dx-datagrid-group-opened').click(),
        async () => {
          await expect(australia.locator('.dx-datagrid-group-closed')).toBeVisible();
          await expect(groupRow(page, 'Company: Massive Dynamic')).toHaveCount(0);
          expect(await getColumnValues(page, 'ID')).not.toContain(String(australiaRows[0]!.id));
        }
      );
      await localAction(
        page,
        testInfo,
        'expand-australia',
        () => australia.locator('.dx-datagrid-group-closed').click(),
        async () => {
          await expect(groupRow(page, 'Company: Massive Dynamic')).toBeVisible();
          await expect
            .poll(async () => (await getColumnValues(page, 'ID')).slice(0, 10))
            .toEqual(australiaRows.map((row) => String(row.id)));
        }
      );
      const firstPage = await getColumnValues(page, 'ID');
      await localAction(
        page,
        testInfo,
        'cached-page-2',
        () => pageButton(page, 2).click(),
        async () => {
          await expect(page.locator('.dx-pages .dx-page.dx-selection')).toHaveText('2');
          expect(await getColumnValues(page, 'ID')).not.toEqual(firstPage);
        }
      );
      await localAction(
        page,
        testInfo,
        'cached-page-1',
        () => pageButton(page, 1).click(),
        async () => {
          await expect.poll(() => getColumnValues(page, 'ID')).toEqual(firstPage);
        }
      );
      for (const size of [50, 100, 25]) {
        await localAction(
          page,
          testInfo,
          `cached-size-${size}`,
          () => sizeButton(page, size).click(),
          async () => {
            await expect(page.locator('.dx-page-sizes .dx-page-size.dx-selection')).toHaveText(
              String(size)
            );
            await footer(page);
          }
        );
      }
    }
  );

  testWithDiagnostics(
    'Boolean filtering updates complete subgroups and totals; explicit count probe is separate',
    async ({ page }, testInfo) => {
      const initial = await groupedLoad(page, testInfo, 'before-active-filter', () =>
        page.goto('/#/grouped-remote-customers')
      );
      expect(initial.body.summary).toEqual([100, 3550 / 85]);
      await sizeButton(page, 100).click();
      await expect(groupRow(page, 'Country: Germany')).toContainText('Group customers: 20');
      await expect(groupRow(page, 'Country: Germany')).toContainText('Group average age: 42.00');
      await expect(groupRow(page, 'Company: Globex')).toContainText('Group customers: 10');
      await expect(groupRow(page, 'Company: Globex')).toContainText('Group average age: 40.13');
      await expect(groupRow(page, 'Company: Initech')).toContainText('Group average age: 41.38');
      await evidence(page, testInfo, 'unfiltered-germany-uk-visible', {
        Germany: [20, 42],
        GermanyGlobex: [10, 40.125],
        UKInitech: [10, 41.375],
      });
      const filtered = await groupedLoad(
        page,
        testInfo,
        'active-filter',
        () => setBooleanFilter(page, 'Active', 'True'),
        twoLevels,
        true
      );
      expect(filtered.body.summary).toEqual([75, 40.75]);
      await expect(groupRow(page, 'Country: Germany')).toContainText('Group customers: 15');
      await expect(groupRow(page, 'Country: Germany')).toContainText('Group average age: 40.46');
      await expect(groupRow(page, 'Company: Globex')).toContainText('Group customers: 5');
      await expect(groupRow(page, 'Company: Globex')).toContainText('Group average age: 33.25');
      await expect(groupRow(page, 'Company: Initech')).toContainText('Group customers: 10');
      await expect(groupRow(page, 'Company: Initech')).toContainText('Group average age: 41.38');
      const ids = await getColumnValues(page, 'ID');
      expect(ids).toEqual(
        leafIds(
          expectedGroups(
            seed.filter((row) => row.active),
            twoLevels
          ),
          2
        ).map(String)
      );
      const germany = (filtered.body.data as GetGridGroupItem<Customer>[]).find(
        (node) => node.key === 'Germany'
      )!;
      expect(germany.summary).toEqual([15, 40.46153846153846]);
      const globex = (germany.items as GetGridGroupItem<Customer>[]).find(
        (node) => node.key === 'Globex'
      )!;
      expect(globex.summary).toEqual([5, 33.25]);
      expect((globex.items as Customer[]).map((row) => row.id)).toEqual([11, 31, 51, 71, 91]);
      expect(
        ids.filter((id) => [8, 18, 28, 38, 48, 58, 68, 78, 88, 98].includes(Number(id)))
      ).toEqual(['8', '18', '28', '38', '48', '58', '68', '78', '88', '98']);
      for (const [name, captured, count, summary] of [
        ['unfiltered', initial, 100, [100, 3550 / 85]],
        ['active', filtered, 75, [75, 40.75]],
      ] as const) {
        const probeRequest = {
          loadOptions: {
            ...captured.request.loadOptions,
            requireTotalCount: true,
            requireGroupCount: true,
          },
        };
        const [response, result] = await Promise.all([
          page.waitForResponse(
            (res) => res.url() === captured.url && res.request().method() === 'POST'
          ),
          page.evaluate(
            async ({ url, body }) => {
              const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              return { status: response.status, body: await response.json() };
            },
            { url: captured.url, body: probeRequest }
          ),
        ]);
        expect(response.request().postDataJSON()).toEqual(probeRequest);
        expect(result.status).toBe(200);
        expect(result.body).toEqual({
          ...captured.body,
          totalCount: count,
          groupCount: 8,
          summary,
        });
        await footer(page, true);
        await evidence(page, testInfo, `explicit-${name}-count-probe`, {
          traffic: 'EXPLICIT browser fetch count probe, NOT an automatic DataGrid load',
          request: { url: captured.url, method: 'POST', body: response.request().postDataJSON() },
          response: { status: response.status(), body: await response.json() },
        });
      }
    }
  );

  testWithDiagnostics(
    'group panel direction changes descriptors and visible country order',
    async ({ page }, testInfo) => {
      await groupedLoad(page, testInfo, 'before-direction-change', () =>
        page.goto('/#/grouped-remote-customers')
      );
      await groupedLoad(page, testInfo, 'country-descending', () => chip(page, 'Country').click(), [
        { selector: 'country', desc: true, isExpanded: true },
        twoLevels[1]!,
      ]);
      await expect(page.locator('.dx-group-row:visible').first()).toContainText('Country: USA');
      await expect(groupRow(page, 'Company: Hooli')).toBeVisible();
      await groupedLoad(page, testInfo, 'country-ascending-again', () =>
        chip(page, 'Country').click()
      );
      await expect(page.locator('.dx-group-row:visible').first()).toContainText(
        'Country: Australia'
      );
    }
  );

  testWithDiagnostics(
    'native context ungroup Company, regroup, then ungroup all resumes flat paging',
    async ({ page }, testInfo) => {
      await groupedLoad(page, testInfo, 'before-native-context', () =>
        page.goto('/#/grouped-remote-customers')
      );
      await groupedLoad(
        page,
        testInfo,
        'one-level-country',
        () => contextAction(page, chip(page, 'Company'), 'Ungroup'),
        [{ selector: 'country', desc: false, isExpanded: false }]
      );
      await expect(chip(page, 'Company')).toHaveCount(0);
      await expect(groupRow(page, 'Company:')).toHaveCount(0);
      const companyHeader = page
        .locator('.dx-datagrid-headers .dx-header-row td')
        .filter({ hasText: 'Company' });
      await groupedLoad(page, testInfo, 'native-regroup-company', () =>
        contextAction(page, companyHeader, 'Group by This Column')
      );
      await expect(chip(page, 'Company')).toBeVisible();
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().endsWith('/api/customers/grid') && res.request().method() === 'POST'
        ),
        contextAction(page, chip(page, 'Country'), 'Ungroup All'),
      ]);
      const request = response.request().postDataJSON() as GetGridParams;
      const body = await response.json();
      expect(response.status()).toBe(200);
      expect(request).toEqual({
        loadOptions: { skip: 0, take: 25, requireTotalCount: true, totalSummary: summaries },
      });
      expect(body).toEqual({ data: seed.slice(0, 25), totalCount: 100, summary: [100, 3550 / 85] });
      await expect(page.locator('.dx-group-panel-item')).toHaveCount(0);
      await expect(page.locator('.dx-group-row')).toHaveCount(0);
      await expect
        .poll(() => getColumnValues(page, 'ID'))
        .toEqual(seed.slice(0, 25).map((row) => String(row.id)));
      await footer(page);
      await evidence(page, testInfo, 'native-ungroup-all-flat', {
        traffic:
          'automatic flat request after native ungroup all; inactive group:null normalized away',
        request,
        response: { status: response.status(), body },
      });
      const [nextResponse] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().endsWith('/api/customers/grid') && res.request().method() === 'POST'
        ),
        pageButton(page, 2).click(),
      ]);
      expect(nextResponse.status()).toBe(200);
      // Native caching retains total metadata; the next flat page fetches only rows.
      expect(nextResponse.request().postDataJSON()).toEqual({
        loadOptions: { skip: 25, take: 25 },
      });
      const nextBody = await nextResponse.json();
      expect(nextBody).toEqual({
        data: seed.slice(25, 50),
      });
      await expect
        .poll(() => getColumnValues(page, 'ID'))
        .toEqual(seed.slice(25, 50).map((row) => String(row.id)));
      await footer(page);
      await evidence(page, testInfo, 'flat-page-2-after-ungroup', {
        request: nextResponse.request().postDataJSON(),
        response: { status: nextResponse.status(), body: nextBody },
      });
    }
  );
});
