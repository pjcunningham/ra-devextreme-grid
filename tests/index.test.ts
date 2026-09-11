import { describe, it, expect } from 'vitest';
import * as pkg from '../src/index';

describe('ra-devextreme-grid public entry point', () => {
  it('exports DatagridDX component', () => {
    expect(pkg.DatagridDX).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDX);
  });

  it('exports DatagridDXPagination component', () => {
    expect(pkg.DatagridDXPagination).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDXPagination);
  });

  it('exports DatagridDXRemote without exposing remote internals', () => {
    expect(pkg.DatagridDXRemote).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDXRemote);
    expect(pkg).not.toHaveProperty('createGridStore');
    expect(pkg).not.toHaveProperty('normalizeLoadOptions');
  });
});
