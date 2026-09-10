import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { Column } from 'devextreme-react/data-grid';
import {
  parseRaFilterKey,
  isFilterValueEqual,
  getManagedColumnFields,
  mergeRaFilters,
  defaultGetRaFilters,
  defaultGetDxFilterValue,
} from '../src/filterUtils';

describe('filterUtils', () => {
  describe('parseRaFilterKey', () => {
    it('parses known suffixes from the end of the key', () => {
      expect(parseRaFilterKey('name_q')).toEqual({
        field: 'name',
        suffix: 'q',
        operator: 'contains',
      });
      expect(parseRaFilterKey('country_eq')).toEqual({
        field: 'country',
        suffix: 'eq',
        operator: '=',
      });
      expect(parseRaFilterKey('status_neq')).toEqual({
        field: 'status',
        suffix: 'neq',
        operator: '<>',
      });
      expect(parseRaFilterKey('age_gt')).toEqual({
        field: 'age',
        suffix: 'gt',
        operator: '>',
      });
      expect(parseRaFilterKey('age_gte')).toEqual({
        field: 'age',
        suffix: 'gte',
        operator: '>=',
      });
      expect(parseRaFilterKey('price_lt')).toEqual({
        field: 'price',
        suffix: 'lt',
        operator: '<',
      });
      expect(parseRaFilterKey('price_lte')).toEqual({
        field: 'price',
        suffix: 'lte',
        operator: '<=',
      });
    });

    it('correctly handles field names containing underscores', () => {
      expect(parseRaFilterKey('company_name_q')).toEqual({
        field: 'company_name',
        suffix: 'q',
        operator: 'contains',
      });
      expect(parseRaFilterKey('created_at_gte')).toEqual({
        field: 'created_at',
        suffix: 'gte',
        operator: '>=',
      });
      expect(parseRaFilterKey('user_account_id_eq')).toEqual({
        field: 'user_account_id',
        suffix: 'eq',
        operator: '=',
      });
    });

    it('returns original key when no recognized suffix is present', () => {
      expect(parseRaFilterKey('country')).toEqual({ field: 'country' });
      expect(parseRaFilterKey('company_name')).toEqual({ field: 'company_name' });
      expect(parseRaFilterKey('q')).toEqual({ field: 'q' });
      expect(parseRaFilterKey('_q')).toEqual({ field: '_q' });
    });
  });

  describe('isFilterValueEqual', () => {
    it('compares identical references and primitives', () => {
      expect(isFilterValueEqual('foo', 'foo')).toBe(true);
      expect(isFilterValueEqual(123, 123)).toBe(true);
      expect(isFilterValueEqual(true, true)).toBe(true);
      expect(isFilterValueEqual('foo', 'bar')).toBe(false);
      expect(isFilterValueEqual(123, 456)).toBe(false);
    });

    it('treats null, undefined, and empty arrays as equal empty state', () => {
      expect(isFilterValueEqual(null, undefined)).toBe(true);
      expect(isFilterValueEqual(null, null)).toBe(true);
      expect(isFilterValueEqual(undefined, undefined)).toBe(true);
      expect(isFilterValueEqual([], null)).toBe(true);
      expect(isFilterValueEqual(undefined, [])).toBe(true);
      expect(isFilterValueEqual(['a'], null)).toBe(false);
    });

    it('handles Date equality', () => {
      const d1 = new Date('2026-01-01T00:00:00Z');
      const d2 = new Date('2026-01-01T00:00:00Z');
      const d3 = new Date('2026-01-02T00:00:00Z');
      expect(isFilterValueEqual(d1, d2)).toBe(true);
      expect(isFilterValueEqual(d1, d3)).toBe(false);
    });

    it('handles case-insensitive and/or operators', () => {
      expect(isFilterValueEqual('and', 'AND')).toBe(true);
      expect(isFilterValueEqual('or', 'OR')).toBe(true);
      expect(isFilterValueEqual('and', 'or')).toBe(false);
    });

    it('compares nested filter arrays recursively', () => {
      const expr1 = [['name', 'contains', 'smith'], 'and', ['age', '>=', 18]];
      const expr2 = [['name', 'contains', 'smith'], 'AND', ['age', '>=', 18]];
      const expr3 = [['name', 'contains', 'smith'], 'and', ['age', '>', 18]];
      expect(isFilterValueEqual(expr1, expr2)).toBe(true);
      expect(isFilterValueEqual(expr1, expr3)).toBe(false);
    });

    it('compares nested objects', () => {
      expect(isFilterValueEqual({ a: 1, b: 'two' }, { a: 1, b: 'two' })).toBe(true);
      expect(isFilterValueEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(isFilterValueEqual({ a: 1 }, { a: 2 })).toBe(false);
    });
  });

  describe('getManagedColumnFields', () => {
    it('extracts field names from columns array', () => {
      const columns = [
        'id',
        { dataField: 'name', allowFiltering: true },
        { dataField: 'company', allowFiltering: false },
        { dataField: 'city' },
        { caption: 'Action (no dataField)' },
      ];
      const result = getManagedColumnFields(columns);
      expect(result).toEqual(['id', 'name', 'city']);
    });

    it('extracts field names from JSX children', () => {
      const children = [
        React.createElement(Column, { key: '1', dataField: 'name' }),
        React.createElement(Column, { key: '2', dataField: 'company', allowFiltering: false }),
        React.createElement(Column, { key: '3', dataField: 'country' }),
        React.createElement('div', { key: '4' }),
      ];
      const result = getManagedColumnFields(undefined, children);
      expect(result).toEqual(['name', 'country']);
    });

    it('combines and deduplicates fields from both columns array and children', () => {
      const columns = ['name', { dataField: 'city' }];
      const children = [
        React.createElement(Column, { key: '1', dataField: 'name' }),
        React.createElement(Column, { key: '2', dataField: 'country' }),
      ];
      const result = getManagedColumnFields(columns, children);
      expect(result).toEqual(['name', 'city', 'country']);
    });
  });

  describe('mergeRaFilters', () => {
    it('preserves unrelated external React-Admin filters when updating grid filters', () => {
      const previousFilters = {
        q: 'global search',
        status_filter: 'active',
        country_eq: 'UK',
      };
      const newGridFilters = {
        country_eq: 'France',
      };
      const gridColumns = ['country', 'company'];

      const result = mergeRaFilters(previousFilters, newGridFilters, gridColumns);
      expect(result).toEqual({
        q: 'global search',
        status_filter: 'active',
        country_eq: 'France',
      });
    });

    it('clears managed column filters without removing unrelated external filters', () => {
      const previousFilters = {
        q: 'global search',
        country_eq: 'UK',
        company_name_q: 'Acme',
      };
      const newGridFilters = {
        country_eq: 'UK',
      };
      const gridColumns = ['country', 'company_name'];

      const result = mergeRaFilters(previousFilters, newGridFilters, gridColumns);
      expect(result).toEqual({
        q: 'global search',
        country_eq: 'UK',
      });
    });
  });

  describe('defaultGetRaFilters and defaultGetDxFilterValue test matrix (A-L)', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    // Test A: Contains
    it('A. Contains: [name, contains, smith] -> { name_q: "smith" }', () => {
      const result = defaultGetRaFilters(['name', 'contains', 'smith']);
      expect(result).toEqual({ name_q: 'smith' });
    });

    // Test B: Equality
    it('B. Equality: [country, =, UK] -> { country_eq: "UK" }', () => {
      const result = defaultGetRaFilters(['country', '=', 'UK']);
      expect(result).toEqual({ country_eq: 'UK' });

      // Equality with null
      const nullResult = defaultGetRaFilters(['country', '=', null]);
      expect(nullResult).toEqual({ country_eq: null });
    });

    // Test C: Not Equal
    it('C. Not Equal: [status, <>, inactive] -> { status_neq: "inactive" }', () => {
      const result = defaultGetRaFilters(['status', '<>', 'inactive']);
      expect(result).toEqual({ status_neq: 'inactive' });
    });

    // Test D: Numeric Comparisons
    it('D. Numeric Comparisons: >, >=, <, <= map to _gt, _gte, _lt, _lte', () => {
      expect(defaultGetRaFilters(['age', '>', 18])).toEqual({ age_gt: 18 });
      expect(defaultGetRaFilters(['age', '>=', 18])).toEqual({ age_gte: 18 });
      expect(defaultGetRaFilters(['price', '<', 100])).toEqual({ price_lt: 100 });
      expect(defaultGetRaFilters(['price', '<=', 100])).toEqual({ price_lte: 100 });
    });

    // Test E: Between
    it('E. Between: [price, between, [10, 50]] -> { price_gte: 10, price_lte: 50 }', () => {
      const result = defaultGetRaFilters(['price', 'between', [10, 50]]);
      expect(result).toEqual({ price_gte: 10, price_lte: 50 });
    });

    // Test F: Multiple AND Filters
    it('F. Multiple AND Filters: flattened into a single combined React-Admin filter object', () => {
      const flatAnd = [
        ['name', 'contains', 'smith'],
        'and',
        ['age', '>=', 18],
        'and',
        ['country', '=', 'UK'],
      ];
      expect(defaultGetRaFilters(flatAnd)).toEqual({
        name_q: 'smith',
        age_gte: 18,
        country_eq: 'UK',
      });

      const nestedAnd = [
        [['name', 'contains', 'smith'], 'and', ['age', '>=', 18]],
        'and',
        ['country', '=', 'UK'],
      ];
      expect(defaultGetRaFilters(nestedAnd)).toEqual({
        name_q: 'smith',
        age_gte: 18,
        country_eq: 'UK',
      });
    });

    // Test G: Underscores in Field Names
    it('G. Underscores in Field Names: company_name_q -> company_name + contains; created_at_gte -> created_at + >=', () => {
      const dxExpr = [
        ['company_name', 'contains', 'Acme'],
        'and',
        ['created_at', '>=', '2026-01-01'],
      ];
      const raFilters = defaultGetRaFilters(dxExpr);
      expect(raFilters).toEqual({
        company_name_q: 'Acme',
        created_at_gte: '2026-01-01',
      });

      const reversed = defaultGetDxFilterValue(raFilters, {
        gridColumns: ['company_name', 'created_at'],
      });
      expect(reversed).toEqual(dxExpr);
    });

    // Test H: Plain RA Fields
    it('H. Plain RA Fields: { country: "UK" } maps to [country, =, UK] when country is a valid column', () => {
      const result = defaultGetDxFilterValue(
        { country: 'UK' },
        { gridColumns: ['country', 'name'] }
      );
      expect(result).toEqual(['country', '=', 'UK']);
    });

    // Test I: Suffixed RA Fields
    it('I. Suffixed RA Fields: { age_gte: 18 } maps to [age, >=, 18]', () => {
      const result = defaultGetDxFilterValue({ age_gte: 18 }, { gridColumns: ['age'] });
      expect(result).toEqual(['age', '>=', 18]);
    });

    // Test J: Range Round-Trip
    it('J. Range Round-Trip: Combined { price_gte: 10, price_lte: 50 } maps to between expression', () => {
      const dxExpr = defaultGetDxFilterValue(
        { price_gte: 10, price_lte: 50 },
        { gridColumns: ['price'] }
      );
      expect(dxExpr).toEqual(['price', 'between', [10, 50]]);

      const raFilters = defaultGetRaFilters(dxExpr);
      expect(raFilters).toEqual({ price_gte: 10, price_lte: 50 });
    });

    // Test K: Unknown/External Fields
    it('K. Unknown/External Fields: Keys not matching any grid column are excluded from DevExtreme filter value', () => {
      const raFilters = {
        q: 'global search',
        status_filter: 'flagged',
        country_eq: 'UK',
      };
      const result = defaultGetDxFilterValue(raFilters, { gridColumns: ['country'] });
      expect(result).toEqual(['country', '=', 'UK']);
    });

    // Test L: Unsupported Operations/OR/NOT
    it('L. Unsupported Operations/OR/NOT: Fails safely, logs development warning, does not corrupt query', () => {
      // 1. Unsupported operator (startswith)
      const opResult = defaultGetRaFilters([
        ['name', 'startswith', 'sm'],
        'and',
        ['age', '>=', 18],
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported DevExtreme filter operator: "startswith"')
      );
      expect(opResult).toEqual({ age_gte: 18 });

      // 2. Unsupported OR logic
      warnSpy.mockClear();
      const orResult = defaultGetRaFilters([['age', '<', 18], 'or', ['age', '>', 65]]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported OR boolean logic'));
      expect(orResult).toEqual({});

      // 3. Unsupported NOT logic
      warnSpy.mockClear();
      const notResult = defaultGetRaFilters(['!', ['active', '=', true]]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported NOT boolean logic')
      );
      expect(notResult).toEqual({});
    });
  });
});
