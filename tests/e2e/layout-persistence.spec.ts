import { writeFile } from 'node:fs/promises';
import {
  test as base,
  expect,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import type { Customer } from '../../examples/remote-fastapi/frontend/src/App';
import type { GetGridParams, GetGridResult } from '../../src/remote/types';
import { getColumnValues, getFilterCell, setFilterInput } from './helpers';

type Exchange = {
  stage: string;
  request: GetGridParams;
  url: string;
  status?: number;
  response?: GetGridResult<Customer>;
  error?: string;
};
type Traffic = {
  stage: string;
  exchanges: Exchange[];
  pending: Promise<void>[];
  inFlight: Set<Request>;
  failures: string[];
  checks: Array<{ stage: string; expected: number; actual: number }>;
};

const flatPath = '/#/remote-customers';
const groupedPath = '/#/group-paged-remote-customers';
const defaultCaptions = ['ID', 'Name', 'Company', 'City', 'Country', 'Active', 'Age', 'Joined On'];
const firstIds = Array.from({ length: 10 }, (_, index) => String(index + 1));
const group = [
  { selector: 'country', desc: false, isExpanded: false },
  { selector: 'company', desc: false, isExpanded: false },
];
const groupSummary = [
  { selector: 'id', summaryType: 'count' },
  { selector: 'age', summaryType: 'avg' },
];
const flatDefaults = {
  skip: 0,
  take: 10,
  requireTotalCount: true,
  totalSummary: [
    { selector: 'id', summaryType: 'count' },
    { selector: 'age', summaryType: 'avg' },
    { selector: 'age', summaryType: 'min' },
    { selector: 'age', summaryType: 'max' },
  ],
};
const groupedDefaults = {
  group: [group[0]],
  groupPagingContext: { group, filter: null },
  skip: 0,
  take: 3,
  requireGroupCount: true,
  requireTotalCount: true,
  groupSummary,
  totalSummary: groupSummary,
};

const headers = (page: Page) => page.locator('.dx-datagrid-headers .dx-header-row > td:visible');
const header = (page: Page, caption: string) =>
  headers(page).filter({ hasText: new RegExp(`^${caption}$`) });
const rows = (page: Page) => page.locator('.dx-datagrid-rowsview .dx-data-row:visible');
const groupRows = (page: Page) => page.locator('.dx-datagrid-rowsview .dx-group-row:visible');
const groupRow = (page: Page, text: string) => groupRows(page).filter({ hasText: text }).first();
const chips = (page: Page) => page.locator('.dx-group-panel-item:visible');
const chip = (page: Page, caption: string) =>
  chips(page).filter({ hasText: new RegExp(`^${caption}$`) });
const menuItem = (page: Page, text: string) =>
  page
    .locator('.dx-overlay-content:visible .dx-menu-item')
    .filter({ hasText: new RegExp(`^${text}$`) });
const pageButton = (page: Page, number: number) =>
  page.locator('.dx-pages .dx-page').filter({ hasText: new RegExp(`^${number}$`) });
const sizeButton = (page: Page, number: number) =>
  page.locator('.dx-page-sizes .dx-page-size').filter({ hasText: new RegExp(`^${number}$`) });
const chooserCheckbox = (page: Page, caption: string) =>
  page
    .locator('.dx-treeview-node')
    .filter({ hasText: new RegExp(`^${caption}$`) })
    .getByRole('checkbox');
const isGridRequest = (request: Request) =>
  request.url().endsWith('/api/customers/grid') && request.method() === 'POST';
const isLicenseMessage = (text: string) =>
  /\bW0019\b|\bW0021\b|DevExtreme.*(?:license|evaluation|trial)|license key/i.test(text);

async function screenshot(page: Page, info: TestInfo, name: string) {
  const file = info.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await info.attach(name, { path: file, contentType: 'image/png' });
}

// Each test uses Playwright's fresh page/context. Only reloads/navigation within that test share Store data.
const test = base.extend<{ traffic: Traffic }>({
  traffic: [
    async ({ page }, use, info) => {
      const traffic: Traffic = {
        stage: 'startup',
        exchanges: [],
        pending: [],
        inFlight: new Set(),
        failures: [],
        checks: [],
      };
      const byRequest = new Map<Request, Exchange>();
      page.on('pageerror', (error) => {
        if (!isLicenseMessage(error.message)) traffic.failures.push(`pageerror: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && !isLicenseMessage(message.text())) {
          traffic.failures.push(`console: ${message.text()} (${message.location().url})`);
        }
      });
      page.on('request', (request) => {
        if (!isGridRequest(request)) return;
        const entry: Exchange = {
          stage: traffic.stage,
          request: request.postDataJSON() as GetGridParams,
          url: request.url(),
        };
        traffic.exchanges.push(entry);
        byRequest.set(request, entry);
        traffic.inFlight.add(request);
      });
      page.on('requestfinished', (request) => traffic.inFlight.delete(request));
      page.on('requestfailed', (request) => {
        const error = `${request.method()} ${request.url()}: ${request.failure()?.errorText}`;
        traffic.failures.push(`resource: ${error}`);
        traffic.inFlight.delete(request);
        const entry = byRequest.get(request);
        if (entry) entry.error = error;
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          traffic.failures.push(`resource: ${response.status()} ${response.url()}`);
        }
        const entry = byRequest.get(response.request());
        if (!entry) return;
        entry.status = response.status();
        traffic.pending.push(
          response.json().then(
            (body: GetGridResult<Customer>) => {
              entry.response = body;
            },
            (error: unknown) => {
              entry.error = String(error);
              traffic.failures.push(`grid response: ${String(error)}`);
            }
          )
        );
      });
      try {
        await use(traffic);
      } finally {
        await Promise.all(traffic.pending);
        const file = info.outputPath('layout-http-and-errors.json');
        await writeFile(
          file,
          JSON.stringify(
            {
              exchanges: traffic.exchanges,
              loadCounts: traffic.checks,
              failures: traffic.failures,
            },
            null,
            2
          )
        );
        await info.attach('layout-http-and-errors', {
          path: file,
          contentType: 'application/json',
        });
        if (!page.isClosed()) await screenshot(page, info, 'final-layout');
        expect(traffic.failures, 'Unexpected browser, console, or resource errors').toEqual([]);
      }
    },
    { auto: true },
  ],
});

async function exchange(
  page: Page,
  traffic: Traffic,
  stage: string,
  action: () => Promise<unknown>,
  match: (options: GetGridParams['loadOptions']) => boolean = () => true
) {
  traffic.stage = stage;
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        isGridRequest(response.request()) &&
        match((response.request().postDataJSON() as GetGridParams).loadOptions)
    ),
    action(),
  ]);
  expect(response.status()).toBe(200);
  return {
    request: response.request().postDataJSON() as GetGridParams,
    response: (await response.json()) as GetGridResult<Customer>,
  };
}

async function settled(page: Page, traffic: Traffic) {
  await expect(page.locator('.app-error-alert')).toHaveCount(0);
  await expect(page.locator('.dx-loadpanel-content:visible')).toHaveCount(0);
  await expect.poll(() => traffic.inFlight.size).toBe(0);
  // Negative HTTP assertions need an observation window; this also exceeds the documented 200ms save debounce.
  await page.waitForTimeout(750);
  expect(traffic.inFlight.size, 'No grid request remains in flight').toBe(0);
}

function loadCount(traffic: Traffic, start: number, expected: number) {
  const actual = traffic.exchanges.length - start;
  traffic.checks.push({ stage: traffic.stage, expected, actual });
  expect(actual, `${traffic.stage}: visual state must not add HTTP loads`).toBe(expected);
}

async function visualChange(
  page: Page,
  traffic: Traffic,
  stage: string,
  action: () => Promise<unknown>
) {
  await settled(page, traffic);
  traffic.stage = stage;
  const start = traffic.exchanges.length;
  await action();
  await settled(page, traffic);
  loadCount(traffic, start, 0);
}

async function flatQueryDefaults(page: Page) {
  await expect(rows(page)).toHaveCount(10);
  await expect.poll(() => getColumnValues(page, 'ID')).toEqual(firstIds);
  await expect(pageButton(page, 1)).toHaveClass(/dx-selection/);
  await expect(sizeButton(page, 10)).toHaveClass(/dx-selection/);
  await expect(
    (await getFilterCell(page, 'Country')).locator('input.dx-texteditor-input')
  ).toHaveValue('');
  await expect(
    page.locator('.dx-datagrid-headers .dx-sort-up, .dx-datagrid-headers .dx-sort-down')
  ).toHaveCount(0);
}

async function groupedQueryDefaults(page: Page) {
  await expect(chips(page)).toHaveText(['Country', 'Company']);
  await expect(groupRows(page)).toHaveText([
    /Country: Australia/,
    /Country: Brazil/,
    /Country: Canada/,
  ]);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.dx-datagrid-rowsview .dx-datagrid-group-opened:visible')).toHaveCount(
    0
  );
  await expect(pageButton(page, 1)).toHaveClass(/dx-selection/);
  await expect(sizeButton(page, 3)).toHaveClass(/dx-selection/);
}

async function initial(page: Page, traffic: Traffic, grouped = false) {
  const start = traffic.exchanges.length;
  const first = await exchange(page, traffic, grouped ? 'clean-grouped' : 'clean-flat', () =>
    page.goto(grouped ? groupedPath : flatPath)
  );
  expect(first.request.loadOptions).toEqual(grouped ? groupedDefaults : flatDefaults);
  expect(first.response.totalCount).toBe(100);
  if (grouped) await groupedQueryDefaults(page);
  else await flatQueryDefaults(page);
  await expect(header(page, 'City')).toBeVisible();
  await settled(page, traffic);
  const count = traffic.exchanges.length - start;
  expect(count).toBeGreaterThan(0);
  for (const item of traffic.exchanges.slice(start)) {
    expect(item.request.loadOptions).toEqual(grouped ? groupedDefaults : flatDefaults);
  }
  traffic.checks.push({ stage: traffic.stage, expected: count, actual: count });
  // Compare persisted reloads with a clean reload, not React StrictMode's cold initial mount.
  await reloadDefaults(
    page,
    traffic,
    1,
    grouped ? 'clean-grouped-reload' : 'clean-flat-reload',
    grouped
  );
  return 1;
}

async function reloadDefaults(
  page: Page,
  traffic: Traffic,
  baseline: number,
  stage: string,
  grouped = false
) {
  await settled(page, traffic);
  const start = traffic.exchanges.length;
  const restored = await exchange(page, traffic, stage, () => page.reload());
  expect(restored.request.loadOptions).toEqual(grouped ? groupedDefaults : flatDefaults);
  expect(restored.response.totalCount).toBe(100);
  if (grouped) {
    expect(restored.response.groupCount).toBe(8);
    expect(restored.response.data).toEqual([
      expect.objectContaining({ key: 'Australia', items: null, count: 10 }),
      expect.objectContaining({ key: 'Brazil', items: null, count: 10 }),
      expect.objectContaining({ key: 'Canada', items: null, count: 10 }),
    ]);
    await groupedQueryDefaults(page);
  } else {
    await flatQueryDefaults(page);
  }
  await settled(page, traffic);
  loadCount(traffic, start, baseline);
  for (const item of traffic.exchanges.slice(start)) {
    expect(item.request.loadOptions).toEqual(grouped ? groupedDefaults : flatDefaults);
  }
  return restored;
}

async function openChooser(page: Page) {
  await page.locator('.dx-datagrid-column-chooser-button').click();
  await expect(page.getByRole('dialog', { name: 'Column Chooser', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Column Chooser', exact: true })).toHaveCSS(
    'opacity',
    '1'
  );
}

async function closeChooser(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Column Chooser', exact: true });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function chooseVisibility(page: Page, caption: string, visible: boolean) {
  await openChooser(page);
  const checkbox = chooserCheckbox(page, caption);
  await expect(checkbox).toHaveAttribute('aria-checked', String(!visible));
  await checkbox.locator('.dx-checkbox-icon').hover();
  await checkbox.locator('.dx-checkbox-icon').click({ delay: 100 });
  await expect(checkbox).toHaveAttribute('aria-checked', String(visible));
  await closeChooser(page);
  if (visible) await expect(header(page, caption)).toBeVisible();
  else await expect(header(page, caption)).toBeHidden();
}

async function contextAction(page: Page, target: Locator, action: string) {
  await target.click({ button: 'right' });
  await menuItem(page, action).click();
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('Visible native UI target has no bounding box');
  return bounds;
}

async function dragBefore(page: Page, source: Locator, target: Locator) {
  const from = await box(source);
  const to = await box(target);
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  try {
    await page.mouse.move(startX - 12, startY, { steps: 4 });
    await page.mouse.move(to.x + 8, to.y + to.height / 2, { steps: 24 });
    await page.waitForTimeout(200);
  } finally {
    await page.mouse.up();
  }
}

async function captions(page: Page) {
  return (await headers(page).allTextContents()).map((text) => text.trim()).filter(Boolean);
}

async function expandToLeaf(page: Page, traffic: Traffic, stage: string) {
  const parent = await exchange(
    page,
    traffic,
    `${stage}-country`,
    () => groupRow(page, 'Country: Australia').locator('.dx-command-expand').first().click(),
    (options) => options.group?.[0]?.selector === 'company'
  );
  expect(parent.request.loadOptions).toMatchObject({
    filter: ['country', '=', 'Australia'],
    requireTotalCount: false,
    groupPagingContext: { group, filter: null },
  });
  await expect(groupRow(page, 'Company: Massive Dynamic')).toBeVisible();
  const leaf = await exchange(
    page,
    traffic,
    `${stage}-company`,
    () => groupRow(page, 'Company: Massive Dynamic').locator('.dx-command-expand').last().click(),
    (options) => !options.group && options.requireTotalCount === false
  );
  expect(leaf.request.loadOptions).toMatchObject({
    filter: [['country', '=', 'Australia'], 'and', ['company', '=', 'Massive Dynamic']],
    take: 1,
    groupPagingContext: { group, filter: null },
  });
  // Native first-leaf requests may omit skip, which has the same zero-offset meaning.
  expect(leaf.request.loadOptions.skip ?? 0).toBe(0);
  // The deterministic seed assigns Australia/Massive Dynamic to IDs 6, 16, ..., 96.
  expect(leaf.response.data).toEqual([
    expect.objectContaining({ id: 6, country: 'Australia', company: 'Massive Dynamic' }),
  ]);
  await expect.poll(() => getColumnValues(page, 'ID')).toEqual(['6']);
  await settled(page, traffic);
}

test.describe('Phase 9A visual layout persistence through real FastAPI', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  test.setTimeout(60_000);

  test('native chooser hide and show each survive reload without additional loads', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    await visualChange(page, traffic, 'chooser-hide-city', () =>
      chooseVisibility(page, 'City', false)
    );
    await screenshot(page, info, 'city-hidden-before-reload');
    await reloadDefaults(page, traffic, baseline, 'reload-hidden-city');
    await expect(header(page, 'City')).toBeHidden();
    await screenshot(page, info, 'city-hidden-after-reload');

    await visualChange(page, traffic, 'chooser-show-city', () =>
      chooseVisibility(page, 'City', true)
    );
    await reloadDefaults(page, traffic, baseline, 'reload-shown-city');
    await expect(header(page, 'City')).toBeVisible();
    await expect.poll(() => captions(page)).toEqual(defaultCaptions);
    await screenshot(page, info, 'city-shown-after-reload');
  });

  test('native mouse column reorder survives reload without query changes', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    await expect.poll(() => captions(page)).toEqual(defaultCaptions);
    await visualChange(page, traffic, 'drag-company-before-name', () =>
      dragBefore(page, header(page, 'Company'), header(page, 'Name'))
    );
    const reordered = ['ID', 'Company', 'Name', 'City', 'Country', 'Active', 'Age', 'Joined On'];
    await expect.poll(() => captions(page)).toEqual(reordered);
    expect((await box(header(page, 'Company'))).x).toBeLessThan(
      (await box(header(page, 'Name'))).x
    );
    await screenshot(page, info, 'reordered-before-reload');
    await reloadDefaults(page, traffic, baseline, 'reload-reordered');
    await expect.poll(() => captions(page)).toEqual(reordered);
    expect((await box(header(page, 'Company'))).x).toBeLessThan(
      (await box(header(page, 'Name'))).x
    );
    await screenshot(page, info, 'reordered-after-reload');
  });

  test('native mouse resize restores a materially changed width with pixel tolerance', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    const original = await box(header(page, 'ID'));
    await visualChange(page, traffic, 'resize-id', async () => {
      const x = original.x + original.width - 1;
      const y = original.y + original.height / 2;
      await page.mouse.move(x, y);
      await page.waitForTimeout(100);
      await page.mouse.down();
      try {
        await page.mouse.move(x + 80, y, { steps: 24 });
      } finally {
        await page.mouse.up();
      }
      await expect
        .poll(async () => (await box(header(page, 'ID'))).width)
        .toBeGreaterThan(original.width + 30);
    });
    const resized = (await box(header(page, 'ID'))).width;
    await screenshot(page, info, 'resized-before-reload');
    await reloadDefaults(page, traffic, baseline, 'reload-resized');
    const tolerance = Math.max(4, resized * 0.04);
    await expect
      .poll(async () => Math.abs((await box(header(page, 'ID'))).width - resized))
      .toBeLessThanOrEqual(tolerance);
    const restored = (await box(header(page, 'ID'))).width;
    expect(restored).toBeGreaterThan(original.width + 30);
    const geometry = info.outputPath('resize-geometry.json');
    await writeFile(
      geometry,
      JSON.stringify({ original: original.width, resized, restored, tolerance }, null, 2)
    );
    await info.attach('resize-geometry', {
      path: geometry,
      contentType: 'application/json',
    });
    await screenshot(page, info, 'resized-after-reload');
  });

  test('native context menu fixing and unfixing survive reload', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    await visualChange(page, traffic, 'fix-company-right', async () => {
      await header(page, 'Company').click({ button: 'right' });
      await menuItem(page, 'Set Fixed Position').hover();
      await menuItem(page, 'Right').click();
      await expect(header(page, 'Company')).toHaveClass(/dx-datagrid-sticky-column-right/);
      await expect(header(page, 'Company')).toHaveCSS('position', 'sticky');
    });
    await screenshot(page, info, 'fixed-right-before-reload');
    await reloadDefaults(page, traffic, baseline, 'reload-fixed-right');
    await expect(header(page, 'Company')).toHaveClass(/dx-datagrid-sticky-column-right/);
    await expect(header(page, 'Company')).toHaveCSS('position', 'sticky');
    expect((await box(header(page, 'Company'))).x).toBeGreaterThan(
      (await box(header(page, 'Joined On'))).x
    );
    await screenshot(page, info, 'fixed-right-after-reload');
    await visualChange(page, traffic, 'unfix-company', () =>
      contextAction(page, header(page, 'Company'), 'Unfix')
    );
    await reloadDefaults(page, traffic, baseline, 'reload-unfixed');
    await expect(header(page, 'Company')).not.toHaveClass(/dx-datagrid-sticky-column/);
    await screenshot(page, info, 'unfixed-after-reload');
  });

  test('adaptive narrow hiding is not saved even during another chooser save, unlike explicit City hiding', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    await visualChange(page, traffic, 'adaptive-narrow-and-hide-age', async () => {
      // Keep the desktop sidebar: narrow the grid without opening the unrelated mobile drawer.
      await page.setViewportSize({ width: 900, height: 900 });
      await expect(header(page, 'City')).toBeHidden();
      await openChooser(page);
      await expect(chooserCheckbox(page, 'City')).toHaveAttribute('aria-checked', 'true');
      await chooserCheckbox(page, 'Age').locator('.dx-checkbox-icon').hover();
      await chooserCheckbox(page, 'Age').locator('.dx-checkbox-icon').click({ delay: 100 });
      await expect(chooserCheckbox(page, 'Age')).toHaveAttribute('aria-checked', 'false');
      await closeChooser(page);
      await expect(header(page, 'Age')).toBeHidden();
    });
    await screenshot(page, info, 'adaptive-narrow-before-reload');
    await visualChange(page, traffic, 'adaptive-wide', () =>
      page.setViewportSize({ width: 1440, height: 1000 })
    );
    await expect(header(page, 'City')).toBeVisible();
    await reloadDefaults(page, traffic, baseline, 'reload-wide-after-adaptive-hide');
    await expect(header(page, 'City')).toBeVisible();
    await expect(header(page, 'Age')).toBeHidden();
    await screenshot(page, info, 'adaptive-city-visible-after-reload');
    await visualChange(page, traffic, 'explicit-city-hide', () =>
      chooseVisibility(page, 'City', false)
    );
    await reloadDefaults(page, traffic, baseline, 'reload-wide-after-explicit-hide');
    await expect(header(page, 'City')).toBeHidden();
    await expect(header(page, 'Age')).toBeHidden();
    await screenshot(page, info, 'chooser-city-hidden-after-reload');
  });

  test('visual layout survives but Country filter, Company sort, page and page size do not', async ({
    page,
    traffic,
  }, info) => {
    const baseline = await initial(page, traffic);
    await visualChange(page, traffic, 'hide-city-before-query', () =>
      chooseVisibility(page, 'City', false)
    );
    const filtered = await exchange(page, traffic, 'country-uk', () =>
      setFilterInput(page, 'Country', 'UK')
    );
    expect(filtered.request.loadOptions.filter).toEqual(['country', '=', 'UK']);
    await expect.poll(() => getColumnValues(page, 'Country')).toEqual(Array<string>(10).fill('UK'));
    const sorted = await exchange(page, traffic, 'company-ascending', () =>
      header(page, 'Company').click()
    );
    expect(sorted.request.loadOptions).toMatchObject({
      filter: ['country', '=', 'UK'],
      sort: [{ selector: 'company', desc: false }],
    });
    await expect(header(page, 'Company').locator('.dx-sort-up')).toBeVisible();
    await settled(page, traffic);
    const resized = await exchange(page, traffic, 'five-rows', () => sizeButton(page, 5).click());
    expect(resized.request.loadOptions).toMatchObject({ skip: 0, take: 5 });
    await expect(rows(page)).toHaveCount(5);
    await expect(sizeButton(page, 5)).toHaveClass(/dx-selection/);
    const next = await exchange(page, traffic, 'page-two', () => pageButton(page, 2).click());
    expect(next.request.loadOptions).toMatchObject({
      skip: 5,
      take: 5,
      filter: ['country', '=', 'UK'],
      sort: [{ selector: 'company', desc: false }],
    });
    await expect(pageButton(page, 2)).toHaveClass(/dx-selection/);
    await expect.poll(() => getColumnValues(page, 'Country')).toEqual(Array<string>(5).fill('UK'));
    const queriedIds = (next.response.data as Customer[]).map((row) => String(row.id));
    await expect.poll(() => getColumnValues(page, 'ID')).toEqual(queriedIds);
    // Force a visual snapshot while all query options are active, not only before they were changed.
    await visualChange(page, traffic, 'hide-age-with-active-query', () =>
      chooseVisibility(page, 'Age', false)
    );
    await expect(pageButton(page, 2)).toHaveClass(/dx-selection/);
    await expect(sizeButton(page, 5)).toHaveClass(/dx-selection/);
    await expect.poll(() => getColumnValues(page, 'ID')).toEqual(queriedIds);
    await screenshot(page, info, 'query-and-layout-before-reload');
    await reloadDefaults(page, traffic, baseline, 'reload-visual-only-default-query');
    await expect(header(page, 'City')).toBeHidden();
    await expect(header(page, 'Age')).toBeHidden();
    expect(await getColumnValues(page, 'ID')).not.toEqual(queriedIds);
    await screenshot(page, info, 'visual-only-default-query-after-reload');
  });

  for (const change of ['reorder', 'ungroup'] as const) {
    test(`group-paged layout survives native ${change}; grouping, expansion and leaf cache reset`, async ({
      page,
      traffic,
    }, info) => {
      const baseline = await initial(page, traffic, true);
      await visualChange(page, traffic, 'grouped-hide-age', () =>
        chooseVisibility(page, 'Age', false)
      );
      await expandToLeaf(page, traffic, 'before-reload');
      await screenshot(page, info, 'expanded-country-company-before-change');
      if (change === 'reorder') {
        const changed = await exchange(
          page,
          traffic,
          'group-company-before-country',
          () => dragBefore(page, chip(page, 'Company'), chip(page, 'Country')),
          (options) =>
            options.group?.[0]?.selector === 'company' && options.requireTotalCount === true
        );
        expect(changed.request.loadOptions.groupPagingContext?.group).toEqual([group[1], group[0]]);
        await expect(chips(page)).toHaveText(['Company', 'Country']);
      } else {
        const changed = await exchange(
          page,
          traffic,
          'ungroup-all',
          () => contextAction(page, chip(page, 'Country'), 'Ungroup All'),
          (options) => !options.group && options.requireTotalCount === true
        );
        expect(changed.request.loadOptions.groupPagingContext).toBeUndefined();
        await expect(chips(page)).toHaveCount(0);
        await expect(rows(page)).toHaveCount(3);
      }
      // Save again with changed grouping, so excluded group indices/context cannot hide behind an older save.
      await visualChange(page, traffic, 'grouped-hide-active-after-query-change', () =>
        chooseVisibility(page, 'Active', false)
      );
      await screenshot(page, info, 'changed-grouping-before-reload');
      await reloadDefaults(page, traffic, baseline, 'reload-grouped-visual-only', true);
      await expect(header(page, 'Age')).toBeHidden();
      await expect(header(page, 'Active')).toBeHidden();
      await expect(header(page, 'City')).toBeVisible();
      await screenshot(page, info, 'default-collapsed-groups-after-reload');
      // No saved leaves are rendered/requested during restore; expanding now must fetch them anew.
      await expandToLeaf(page, traffic, 'fresh-expansion-after-reload');
      await screenshot(page, info, 'fresh-leaf-after-reload');
    });
  }

  test('flat and group-paged example keys isolate visual preferences across resource navigation', async ({
    page,
    traffic,
  }, info) => {
    const flatBaseline = await initial(page, traffic);
    await visualChange(page, traffic, 'flat-only-hide-city', () =>
      chooseVisibility(page, 'City', false)
    );
    await exchange(page, traffic, 'navigate-grouped', () =>
      page.getByRole('menuitem', { name: 'Group-Paged Remote Customers', exact: true }).click()
    );
    await groupedQueryDefaults(page);
    await expect(header(page, 'City')).toBeVisible();
    await expect(header(page, 'Age')).toBeVisible();
    await visualChange(page, traffic, 'grouped-only-hide-age', () =>
      chooseVisibility(page, 'Age', false)
    );
    await exchange(page, traffic, 'return-flat', () =>
      page.getByRole('menuitem', { name: 'Remote Customers', exact: true }).click()
    );
    await flatQueryDefaults(page);
    await expect(header(page, 'City')).toBeHidden();
    await expect(header(page, 'Age')).toBeVisible();
    await reloadDefaults(page, traffic, flatBaseline, 'reload-isolated-flat');
    await expect(header(page, 'City')).toBeHidden();
    await expect(header(page, 'Age')).toBeVisible();
    await screenshot(page, info, 'isolated-flat-layout');
    const returned = await exchange(page, traffic, 'return-grouped', () =>
      page.getByRole('menuitem', { name: 'Group-Paged Remote Customers', exact: true }).click()
    );
    expect(returned.request.loadOptions).toEqual(groupedDefaults);
    await groupedQueryDefaults(page);
    await expect(header(page, 'City')).toBeVisible();
    await expect(header(page, 'Age')).toBeHidden();
    await screenshot(page, info, 'isolated-grouped-layout');
  });
});
