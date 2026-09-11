import { type Page, type Request, type Response, expect } from '@playwright/test';

export interface GridRequestBody {
  loadOptions: {
    skip?: number;
    take?: number;
    requireTotalCount?: boolean;
    sort?: Array<{ selector: string; desc: boolean }>;
    filter?: unknown[];
  };
}

export interface GridResponseBody {
  data: Array<Record<string, unknown>>;
  totalCount?: number;
}

/**
 * Attaches console error and unhandled exception listeners to the page.
 * Rejects unhandled page errors while allowing known DevExtreme trial/evaluation warnings.
 */
export function attachPageErrorListeners(page: Page): void {
  page.on('pageerror', (error) => {
    throw error;
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Allow known DevExtreme trial and license warnings and expected 422 HTTP errors
      if (
        text.includes('W0019') ||
        text.includes('W0021') ||
        text.includes('evaluation') ||
        text.includes('license key') ||
        text.includes('422') ||
        text.includes('Unprocessable') ||
        text.includes('Unknown filter selector')
      ) {
        return;
      }
      // Fail on unexpected client application errors
      throw new Error(`Browser console error: ${text}`);
    }
  });
}

/**
 * Triggers an action and awaits the outgoing POST /api/customers/grid request.
 */
export async function waitForGridRequest(
  page: Page,
  action: () => Promise<void>
): Promise<{ request: Request; body: GridRequestBody }> {
  const [request] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes('/api/customers/grid') && req.method() === 'POST'
    ),
    action(),
  ]);

  const rawPost = request.postData();
  const body = rawPost ? (JSON.parse(rawPost) as GridRequestBody) : { loadOptions: {} };
  return { request, body };
}

/**
 * Triggers an action and awaits the POST /api/customers/grid response.
 */
export async function waitForGridResponse(
  page: Page,
  action: () => Promise<void>
): Promise<{ response: Response; body: GridResponseBody }> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/customers/grid') && res.request().method() === 'POST'
    ),
    action(),
  ]);

  const body = (await response.json()) as GridResponseBody;
  return { response, body };
}

/**
 * Returns the column index (0-based) for a given caption.
 */
export async function getColumnIndex(page: Page, caption: string): Promise<number> {
  const headers = page.locator('.dx-datagrid-headers .dx-header-row td');
  const count = await headers.count();
  for (let i = 0; i < count; i++) {
    const text = await headers.nth(i).innerText();
    if (text.trim().toLowerCase().includes(caption.toLowerCase())) {
      return i;
    }
  }
  throw new Error(`Column with caption "${caption}" not found`);
}

/**
 * Locates the filter row cell for a column by caption.
 */
export async function getFilterCell(page: Page, caption: string) {
  const colIndex = await getColumnIndex(page, caption);
  return page.locator('.dx-datagrid-filter-row td').nth(colIndex);
}

/**
 * Fills a text/number value into the filter row input for a given column.
 */
export async function setFilterInput(
  page: Page,
  caption: string,
  value: string
): Promise<{ request: Request; body: GridRequestBody }> {
  const cell = await getFilterCell(page, caption);
  const input = cell.locator('input.dx-texteditor-input');

  return waitForGridRequest(page, async () => {
    await input.click();
    await input.fill(value);
    await input.press('Enter');
  });
}

/**
 * Selects an operation from the filter menu in the filter row cell for a given column.
 */
export async function setFilterOperation(
  page: Page,
  caption: string,
  operationText: string
): Promise<void> {
  const cell = await getFilterCell(page, caption);
  const menuButton = cell.locator('.dx-filter-menu');
  await menuButton.click();

  const menuItem = page
    .locator('.dx-overlay-content:visible .dx-menu-item')
    .filter({ hasText: new RegExp(`^\\s*${operationText}\\s*$|${operationText}`, 'i') })
    .first();

  await expect(menuItem).toBeVisible();
  await menuItem.click();
}

/**
 * Selects a boolean value from the SelectBox dropdown in the filter row cell.
 */
export async function setBooleanFilter(
  page: Page,
  caption: string,
  value: 'True' | 'False' | 'All'
): Promise<{ request: Request; body: GridRequestBody }> {
  const cell = await getFilterCell(page, caption);
  const selectBox = cell.locator('.dx-selectbox');

  return waitForGridRequest(page, async () => {
    await selectBox.click();
    const popupItem = page.getByRole('option', { name: new RegExp(`^${value}$`, 'i') }).first();
    await expect(popupItem).toBeVisible();
    await popupItem.click();
  });
}

/**
 * Sets a date value into the DateBox filter row for a given column.
 */
export async function setDateFilter(
  page: Page,
  caption: string,
  year: number,
  month: number,
  day: number
): Promise<{ request: Request; body: GridRequestBody }> {
  const cell = await getFilterCell(page, caption);
  const input = cell.locator('input.dx-texteditor-input');
  const jsDate = new Date(year, month - 1, day, 0, 0, 0, 0);

  return waitForGridRequest(page, async () => {
    const wasSet = await cell
      .locator('.dx-datebox')
      .evaluate((el: HTMLElement, isoDate: string) => {
        const win = window as unknown as {
          DevExpress?: {
            ui?: {
              dxDateBox?: {
                getInstance: (element: HTMLElement) => {
                  option: (key: string, val: unknown) => void;
                } | null;
              };
            };
          };
        };
        const dxDateBox = win.DevExpress?.ui?.dxDateBox;
        if (dxDateBox) {
          const instance = dxDateBox.getInstance(el);
          if (instance) {
            instance.option('value', new Date(isoDate));
            return true;
          }
        }
        return false;
      }, jsDate.toISOString());

    if (!wasSet) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${pad(month)}/${pad(day)}/${year}`;
      await input.click();
      await input.fill(formatted);
      await input.press('Enter');
    }
  });
}

/**
 * Clears the filter input for a given column.
 */
export async function clearFilterInput(
  page: Page,
  caption: string
): Promise<{ request: Request; body: GridRequestBody }> {
  const cell = await getFilterCell(page, caption);
  const input = cell.locator('input.dx-texteditor-input');

  return waitForGridRequest(page, async () => {
    await input.click();
    await input.fill('');
    await input.press('Enter');
  });
}

/**
 * Returns text content for a column across all visible data rows.
 */
export async function getColumnValues(page: Page, caption: string): Promise<string[]> {
  const colIndex = await getColumnIndex(page, caption);
  const rows = page.locator('.dx-datagrid-rowsview .dx-data-row:visible');
  const count = await rows.count();
  const values: string[] = [];

  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).locator('td').nth(colIndex).innerText();
    values.push(text.trim());
  }

  return values;
}
