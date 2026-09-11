import { describe, expect, it, vi } from 'vitest';
import DataGrid, { type Properties } from 'devextreme/ui/data_grid';
import CustomStore from 'devextreme/data/custom_store';
import type { LoadOptions } from 'devextreme/data';
import { waitFor } from '@testing-library/react';
import {
  areGridLayoutsEqual,
  captureGridLayout,
  getLayoutColumnKey,
  isLayoutOptionPath,
  isLayoutWidth,
  normalizeGridLayout,
  restoreGridLayout,
} from '../src/persistence/layoutState';

describe('layout schema', () => {
  it.each([
    undefined,
    null,
    false,
    1,
    'layout',
    [],
    {},
    { version: '1', columns: [] },
    { version: 2, columns: [] },
    { version: 1 },
    { version: 1, columns: {} },
  ])('rejects invalid roots: %j', (value) => {
    expect(normalizeGridLayout(value)).toBeUndefined();
  });

  it.each([0, 1, 100.5, '0', '123', '1.5', '.5', '1.', '0px', '12.5px', '0%', '33.3%', 'auto'])(
    'accepts explicit width %j',
    (width) => {
      expect(isLayoutWidth(width)).toBe(true);
      expect(normalizeGridLayout({ version: 1, columns: [{ key: 'a', width }] })?.columns).toEqual([
        { key: 'a', width },
      ]);
    }
  );

  it.each([
    undefined,
    null,
    true,
    false,
    -1,
    NaN,
    Infinity,
    -Infinity,
    '',
    ' ',
    '-1',
    '-1px',
    '+1',
    '1e3',
    'Infinity',
    '1em',
    'calc(100% - 2px)',
    '12 px',
    ' 12',
    '12 ',
    'AUTO',
    '1PX',
    '0x10',
    '.',
    {},
    [],
    '9'.repeat(400),
  ])('rejects invalid width %j', (width) => {
    expect(isLayoutWidth(width)).toBe(false);
    expect(normalizeGridLayout({ version: 1, columns: [{ key: 'a', width }] })?.columns).toEqual([
      { key: 'a' },
    ]);
  });

  it.each(['left', 'right', 'sticky'])('accepts fixed position %s', (fixedPosition) => {
    expect(
      normalizeGridLayout({ version: 1, columns: [{ key: 'a', fixedPosition }] })?.columns
    ).toEqual([{ key: 'a', fixedPosition }]);
  });

  it.each([null, true, 0, 'center', 'LEFT', ''])(
    'drops invalid fixed position %j',
    (fixedPosition) => {
      expect(
        normalizeGridLayout({ version: 1, columns: [{ key: 'a', fixedPosition }] })?.columns
      ).toEqual([{ key: 'a' }]);
    }
  );

  it.each([-1, 0.5, NaN, Infinity, '1', null, true, {}])(
    'drops invalid indices %j',
    (visibleIndex) => {
      expect(
        normalizeGridLayout({
          version: 1,
          columns: [{ key: 'a', visibleIndex, visible: false, width: 20 }],
        })?.columns
      ).toEqual([{ key: 'a', visible: false, width: 20 }]);
    }
  );

  it.each([undefined, null, 0, 1, 'true', 'false', {}, []])('drops invalid flags %j', (flag) => {
    expect(
      normalizeGridLayout({
        version: 1,
        columns: [{ key: 'a', visible: flag, fixed: flag, visibleIndex: 0 }],
      })?.columns
    ).toEqual([{ key: 'a', visibleIndex: 0 }]);
  });

  it('keeps every valid visual property and discards query, semantic and internal fields', () => {
    const column = {
      key: 'a',
      visible: false,
      visibleIndex: 2,
      width: '30%',
      fixed: true,
      fixedPosition: 'sticky',
    };
    expect(
      normalizeGridLayout({
        version: 1,
        filterValue: ['secret', '=', 1],
        pageIndex: 8,
        selectedRowKeys: [1],
        columns: [
          {
            ...column,
            sortOrder: 'desc',
            sortIndex: 0,
            groupIndex: 1,
            filterValue: 'x',
            dataField: 'other',
            hidingPriority: 1,
            adaptiveHidden: true,
            visibleWidth: 1,
            bestFitWidth: 2,
            calculateCellValue: () => 1,
          },
        ],
      })
    ).toEqual({ version: 1, columns: [column] });
  });

  it('skips malformed identities and every occurrence of duplicate keys', () => {
    const warn = vi.fn();
    expect(
      normalizeGridLayout(
        {
          version: 1,
          columns: [
            null,
            [],
            1,
            {},
            { key: '' },
            { key: '  ' },
            { key: 1 },
            { key: 'dup', width: 20 },
            { key: 'z', visible: true },
            { key: 'dup', visible: false },
            { key: 'a', fixed: false },
          ],
        },
        warn
      )
    ).toEqual({
      version: 1,
      columns: [
        { key: 'a', fixed: false },
        { key: 'z', visible: true },
      ],
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith('dup');
  });

  it('sorts keys deterministically without mutating input and compares semantic schemas', () => {
    const input = {
      version: 1,
      columns: [
        { key: 'z', width: 20 },
        { key: 'A', visible: false },
        { key: '__proto__', fixed: false },
      ],
    };
    const snapshot = structuredClone(input);
    const normalized = normalizeGridLayout(input);
    expect(normalized?.columns.map((column) => column.key)).toEqual(['A', '__proto__', 'z']);
    expect(input).toEqual(snapshot);
    expect(
      areGridLayoutsEqual(input, {
        columns: [...input.columns].reverse(),
        version: 1,
        searchText: 'ignored',
      })
    ).toBe(true);
    expect(areGridLayoutsEqual(input, { version: 1, columns: [{ key: 'z', width: '20' }] })).toBe(
      false
    );
    expect(areGridLayoutsEqual(input, undefined)).toBe(false);
    expect(areGridLayoutsEqual(undefined, { version: 2, columns: [] })).toBe(true);
    expect(normalizeGridLayout(normalized)).toEqual(normalized);
  });

  it.each([
    [{ name: 'alias', dataField: 'field' }, 'alias'],
    [{ dataField: 'field' }, 'field'],
    [{ name: '', dataField: 'field' }, 'field'],
    [{ name: '  ', dataField: 'field' }, 'field'],
    [{ name: 'action', type: 'buttons' }, undefined],
    [{ name: 'select', type: 'selection' }, undefined],
    [{ caption: 'Calculated', calculateCellValue: () => 1 }, undefined],
    [null, undefined],
    [{ dataField: 1 }, undefined],
  ])('resolves stable identity for %j', (value, expected) => {
    expect(getLayoutColumnKey(value)).toBe(expected);
  });

  it.each(['visible', 'visibleIndex', 'width', 'fixed', 'fixedPosition'])(
    'recognizes exact visual path %s',
    (option) => {
      expect(isLayoutOptionPath(`columns[12].${option}`)).toBe(true);
    }
  );

  it.each([
    'columns',
    'columns[0]',
    'columns[0].sortOrder',
    'columns[0].groupIndex',
    'columns[0].filterValue',
    'columns[0].hidingPriority',
    'columns[0].adaptiveHidden',
    'columns[0].visibleWidth',
    'columns[0].bestFitWidth',
    'columns[0].width.extra',
    'columns[0].columns[1].width',
    'xcolumns[0].width',
    'columns[-1].width',
    'columns[a].width',
    'pageIndex',
    'filterValue',
  ])('rejects nonvisual path %s', (path) => {
    expect(isLayoutOptionPath(path)).toBe(false);
  });
});

describe('native layout projection and restore', () => {
  function withGrid(
    columns: Properties<unknown, unknown>['columns'],
    run: (grid: DataGrid<unknown, unknown>) => void
  ) {
    const host = document.createElement('div');
    document.body.append(host);
    const grid = new DataGrid<unknown, unknown>(host, {
      dataSource: [],
      columns,
      columnFixing: { enabled: true },
    });
    try {
      run(grid);
    } finally {
      grid.dispose();
      host.remove();
    }
  }

  it('captures only explicit public widths, identity and visual properties', () => {
    withGrid(
      [
        { dataField: 'id' },
        { name: 'alias', dataField: 'field', width: 123 },
        { name: 'command', type: 'buttons' },
        { caption: 'Anonymous', calculateCellValue: () => '' },
      ],
      (grid) => {
        const layout = captureGridLayout(grid);
        expect(layout.columns.map((column) => column.key)).toEqual(['alias', 'id']);
        expect(layout.columns.find((column) => column.key === 'id')).not.toHaveProperty('width');
        expect(layout.columns.find((column) => column.key === 'alias')).toHaveProperty(
          'width',
          123
        );
      }
    );
  });

  it('skips duplicate identities in capture and restore without ambiguous native lookup', () => {
    withGrid(
      [{ name: 'same', dataField: 'a' }, { name: 'same', dataField: 'b' }, { dataField: 'c' }],
      (grid) => {
        const warn = vi.fn();
        expect(captureGridLayout(grid, warn).columns.map((column) => column.key)).toEqual(['c']);
        restoreGridLayout(
          grid,
          { version: 1, columns: [{ key: 'same', width: 200 }] },
          undefined,
          warn
        );
        expect(grid.columnOption(0, 'width')).toBeUndefined();
        expect(grid.columnOption(1, 'width')).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(2);
      }
    );
  });

  it('resolves name/dataField collisions by numeric handles, not identifier lookup', () => {
    withGrid(
      [
        { name: 'alias', dataField: 'a' },
        { dataField: 'alias', name: 'other' },
      ],
      (grid) => {
        restoreGridLayout(grid, {
          version: 1,
          columns: [
            { key: 'alias', width: 201 },
            { key: 'other', width: 102 },
          ],
        });
        expect(grid.columnOption(0, 'width')).toBe(201);
        expect(grid.columnOption(1, 'width')).toBe(102);
      }
    );
  });

  it('merges stored order into default slots while preserving additions and anonymous columns', () => {
    withGrid(
      [
        { dataField: 'a' },
        { dataField: 'new' },
        { caption: 'Anonymous', calculateCellValue: () => '' },
        { dataField: 'c' },
        { dataField: 'renamed' },
      ],
      (grid) => {
        const defaults = captureGridLayout(grid);
        const saved = normalizeGridLayout({
          version: 1,
          columns: [
            { key: 'a', visibleIndex: 3 },
            { key: 'c', visibleIndex: 0 },
            { key: 'removed', visibleIndex: 1 },
          ],
        })!;
        restoreGridLayout(grid, saved, defaults);
        expect([0, 1, 2, 3, 4].map((index) => grid.columnOption(index, 'visibleIndex'))).toEqual([
          3, 1, 2, 0, 4,
        ]);
        expect(captureGridLayout(grid).columns.map((column) => column.key)).toEqual([
          'a',
          'c',
          'new',
          'renamed',
        ]);
        restoreGridLayout(grid, saved, defaults);
        expect([0, 1, 2, 3, 4].map((index) => grid.columnOption(index, 'visibleIndex'))).toEqual([
          3, 1, 2, 0, 4,
        ]);
      }
    );
  });

  it('preserves new and anonymous slots for every three-column permutation', () => {
    for (const order of [
      ['a', 'b', 'c'],
      ['a', 'c', 'b'],
      ['b', 'a', 'c'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
      ['c', 'b', 'a'],
    ]) {
      withGrid(
        [
          { dataField: 'a' },
          { dataField: 'new' },
          { dataField: 'b' },
          { caption: 'Anonymous', calculateCellValue: () => '' },
          { dataField: 'c' },
        ],
        (grid) => {
          const defaults = captureGridLayout(grid);
          restoreGridLayout(
            grid,
            { version: 1, columns: order.map((key, visibleIndex) => ({ key, visibleIndex })) },
            defaults
          );
          const expected = [order[0], 'new', order[1], undefined, order[2]];
          const actual = [0, 1, 2, 3, 4]
            .map((index) => ({
              key: grid.columnOption(index, 'name'),
              order: grid.columnOption(index, 'visibleIndex'),
            }))
            .sort((a, b) => a.order - b.order)
            .map((column) => column.key);
          expect(actual, order.join(',')).toEqual(expected);
        }
      );
    }
  });

  it.each(['content ready', 'live'])(
    'preserves grouped summaries during %s restore without loading',
    async (boundary) => {
      const records = [
        { id: 1, company: 'Acme', country: 'UK', city: 'London' },
        { id: 2, company: 'Beta', country: 'UK', city: 'York' },
      ];
      const load = vi.fn(async (options: LoadOptions) => ({
        data: options.group ? [{ key: 'UK', items: null, count: 2, summary: [2] }] : records,
        ...(options.requireTotalCount ? { totalCount: 2 } : {}),
        ...(options.requireGroupCount ? { groupCount: 1 } : {}),
        ...(options.totalSummary ? { summary: [2] } : {}),
      }));
      const layout = normalizeGridLayout({
        version: 1,
        columns: [
          {
            key: 'company',
            visible: false,
            width: 240,
            fixed: true,
            fixedPosition: 'right',
            visibleIndex: 1,
          },
          { key: 'country', visible: false, visibleIndex: 2 },
          { key: 'city', visibleIndex: 0 },
          { key: 'id', visibleIndex: 3 },
        ],
      })!;
      const host = document.createElement('div');
      document.body.append(host);
      let restored = false;
      const grid = new DataGrid(host, {
        dataSource: new CustomStore({ key: 'id', load }),
        remoteOperations: {
          groupPaging: true,
          grouping: true,
          paging: true,
          filtering: true,
          sorting: true,
          summary: true,
        },
        grouping: { autoExpandAll: false },
        paging: { pageSize: 5 },
        columns: [
          { dataField: 'id', dataType: 'number', autoExpandGroup: false },
          { dataField: 'company', dataType: 'string', autoExpandGroup: false },
          { dataField: 'country', dataType: 'string', groupIndex: 0, autoExpandGroup: false },
          { dataField: 'city', dataType: 'string', autoExpandGroup: false },
        ],
        summary: {
          totalItems: [{ name: 'count', column: 'id', summaryType: 'count' }],
          groupItems: [{ column: 'id', summaryType: 'count' }],
        },
        onContentReady: ({ component }) => {
          if (boundary === 'content ready' && !restored && component.getVisibleRows().length) {
            restored = true;
            restoreGridLayout(component, layout);
          }
        },
      });
      try {
        await waitFor(() => expect(grid.getVisibleRows()).toHaveLength(1));
        if (boundary === 'live') restoreGridLayout(grid, layout);
        await waitFor(() =>
          expect(host.querySelector('.dx-group-row')?.textContent).toContain('Count: 2')
        );
        expect(grid.getTotalSummaryValue('count')).toBe(2);
        expect(host.querySelector('.dx-datagrid-total-footer')?.textContent).toContain('Count: 2');
        expect(grid.columnOption('company', 'width')).toBe(240);
        expect(grid.columnOption('company', 'visible')).toBe(false);
        expect(grid.columnOption('company', 'fixedPosition')).toBe('right');
        expect(grid.columnOption('country', 'groupIndex')).toBe(0);
        expect(grid.columnOption('country', 'visible')).toBe(false);
        expect(grid.columnOption('city', 'visibleIndex')).toBeLessThan(
          grid.columnOption('id', 'visibleIndex')
        );
        expect(load).toHaveBeenCalledOnce();
        await grid.expandRow(['UK']);
        await waitFor(() =>
          expect(grid.getVisibleRows().filter((row) => row.rowType === 'data')).toHaveLength(2)
        );
        expect(host.querySelector('.dx-group-row')?.textContent).toContain('Count: 2');
        expect(grid.getTotalSummaryValue('count')).toBe(2);
      } finally {
        grid.dispose();
        host.remove();
      }
    }
  );

  it('isolates widths before structural metadata and order, and ends failed batches', () => {
    const writes: string[] = [];
    const grid = {
      columnCount: () => 1,
      columnOption: (_index: number, option?: string) => {
        if (!option) return { dataField: 'a', visibleIndex: 0 };
        writes.push(option);
      },
      beginUpdate: vi.fn(() => {
        writes.push('begin');
      }),
      endUpdate: vi.fn(() => {
        writes.push('end');
      }),
    };
    restoreGridLayout(grid, {
      version: 1,
      columns: [
        {
          key: 'a',
          visible: false,
          width: 200,
          fixed: true,
          fixedPosition: 'left',
          visibleIndex: 1,
        },
      ],
    });
    expect(writes).toEqual([
      'begin',
      'width',
      'end',
      'begin',
      'visible',
      'fixed',
      'fixedPosition',
      'visibleIndex',
      'end',
    ]);
    expect(grid.beginUpdate).toHaveBeenCalledTimes(2);
    expect(grid.endUpdate).toHaveBeenCalledTimes(2);
    const error = new Error('native programming error');
    const failingGrid = {
      ...grid,
      columnOption: (_index: number, option?: string) => {
        if (option) throw error;
        return { dataField: 'a' };
      },
    };
    expect(() =>
      restoreGridLayout(failingGrid, { version: 1, columns: [{ key: 'a', width: 20 }] })
    ).toThrow(error);
    expect(grid.endUpdate).toHaveBeenCalledTimes(3);
    expect(() =>
      restoreGridLayout(failingGrid, { version: 1, columns: [{ key: 'a', visible: false }] })
    ).toThrow(error);
    expect(grid.endUpdate).toHaveBeenCalledTimes(5);
  });
});
