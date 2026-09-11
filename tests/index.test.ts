import { describe, it, expect } from 'vitest';
import * as pkg from '../src/index';

describe('ra-devextreme-grid public entry point', () => {
  it('exports exactly the audited intentional runtime symbols', () => {
    const exportedKeys = Object.keys(pkg).sort();
    expect(exportedKeys).toEqual([
      'DatagridDX',
      'DatagridDXPagination',
      'DatagridDXRemote',
      'defaultGetDxFilterValue',
      'defaultGetRaFilters',
      'parseRaFilterKey',
    ]);
  });

  it('exports DatagridDX component', () => {
    expect(pkg.DatagridDX).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDX);
  });

  it('exports DatagridDXPagination component', () => {
    expect(pkg.DatagridDXPagination).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDXPagination);
  });

  it('exports DatagridDXRemote component', () => {
    expect(pkg.DatagridDXRemote).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDXRemote);
  });

  it('exports filter conversion helpers', () => {
    expect(typeof pkg.defaultGetRaFilters).toBe('function');
    expect(typeof pkg.defaultGetDxFilterValue).toBe('function');
    expect(typeof pkg.parseRaFilterKey).toBe('function');
    expect(pkg.parseRaFilterKey('age_gte')).toEqual({
      field: 'age',
      operator: '>=',
      suffix: 'gte',
    });
  });

  it('does not expose internal implementation helpers', () => {
    expect(pkg).not.toHaveProperty('createGridStore');
    expect(pkg).not.toHaveProperty('normalizeLoadOptions');
    expect(pkg).not.toHaveProperty('useGridLayoutPersistence');
    expect(pkg).not.toHaveProperty('applyStoredLayout');
    expect(pkg).not.toHaveProperty('StoredGridLayoutV1');
    expect(pkg).not.toHaveProperty('isFilterValueEqual');
    expect(pkg).not.toHaveProperty('isLayoutOptionPath');
    expect(pkg).not.toHaveProperty('toDxSortOrder');
    expect(pkg).not.toHaveProperty('toRaSortOrder');
    expect(pkg).not.toHaveProperty('validateGridData');
    expect(pkg).not.toHaveProperty('validateSummaryResult');
    expect(pkg).not.toHaveProperty('validateSummaryOptions');
  });
});
