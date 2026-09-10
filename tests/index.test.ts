import { describe, it, expect } from 'vitest';
import * as pkg from '../src/index';

describe('ra-devextreme-grid public entry point', () => {
  it('exports DatagridDX component', () => {
    expect(pkg.DatagridDX).toBeDefined();
    expect(['function', 'object']).toContain(typeof pkg.DatagridDX);
  });
});
