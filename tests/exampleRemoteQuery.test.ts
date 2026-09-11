import { describe, expect, it } from 'vitest';
import { queryRemoteCustomers } from '../examples/basic/remoteQuery';
import type { GetGridLoadOptions } from '../src/remote/types';

const customers = Object.freeze([
  Object.freeze({ id: 1, name: 'Alpha', company: 'Acme', country: 'USA' }),
  Object.freeze({ id: 2, name: 'beta', company: 'Acme', country: 'UK' }),
  Object.freeze({ id: 3, name: 'ALPHA', company: 'Globex', country: 'USA' }),
  Object.freeze({ id: 4, name: 'Delta', company: 'Acme', country: 'UK' }),
  Object.freeze({ id: 5, name: 'Alpha', company: 'Acme', country: 'USA' }),
]);

function query(loadOptions: GetGridLoadOptions = {}) {
  return queryRemoteCustomers(customers, 'remote-customers', { loadOptions });
}

function ids(loadOptions: GetGridLoadOptions) {
  return query(loadOptions).data.map((record) => record.id);
}

describe('example remote customer query', () => {
  it.each([
    ['=', 3, [3]],
    ['<>', 3, [1, 2, 4, 5]],
    ['>', 3, [4, 5]],
    ['>=', 3, [3, 4, 5]],
    ['<', 3, [1, 2]],
    ['<=', 3, [1, 2, 3]],
  ])('evaluates numeric %s', (operator, value, expected) => {
    expect(ids({ filter: ['id', operator, value] })).toEqual(expected);
  });

  it.each([
    ['contains', 'LP', [1, 3, 5]],
    ['notcontains', 'LP', [2, 4]],
    ['startswith', 'AL', [1, 3, 5]],
    ['endswith', 'TA', [2, 4]],
    ['=', 'alpha', [1, 3, 5]],
    ['<>', 'alpha', [2, 4]],
    ['>', 'beta', [4]],
  ])('evaluates case-insensitive string %s', (operator, value, expected) => {
    expect(ids({ filter: ['name', operator, value] })).toEqual(expected);
  });

  it('evaluates nested and/or/not and single-expression wrappers', () => {
    expect(
      ids({
        filter: [
          [['country', '=', 'UK'], 'or', ['id', '=', 3]],
          'and',
          ['!', [['name', 'startswith', 'DEL']]],
        ],
      })
    ).toEqual([2, 3]);
  });

  it('filters the full dataset, sorts, counts and then pages', () => {
    const dataset = Array.from({ length: 35 }, (_, index) => ({ id: index + 1 }));
    const result = queryRemoteCustomers(dataset, 'remote-customers', {
      loadOptions: {
        filter: ['id', '>', 10],
        sort: [{ selector: 'id', desc: true }],
        skip: 10,
        take: 5,
        requireTotalCount: true,
      },
    });
    expect(result.totalCount).toBe(25);
    expect(result.data.map((record) => record.id)).toEqual([25, 24, 23, 22, 21]);
  });

  it('honors ordered multi-sort precedence and stable complete ties', () => {
    expect(
      ids({
        sort: [
          { selector: 'country', desc: false },
          { selector: 'company', desc: true },
          { selector: 'name', desc: true },
        ],
      })
    ).toEqual([4, 2, 3, 1, 5]);
    expect(
      ids({
        sort: [
          { selector: 'company', desc: true },
          { selector: 'country', desc: false },
        ],
      })
    ).toEqual([3, 2, 4, 1, 5]);
  });

  it('does not mutate frozen dataset, records, filter, or sort descriptors', () => {
    const filter = Object.freeze(['id', '>=', 2]);
    const sort = Object.freeze([Object.freeze({ selector: 'id', desc: true })]);
    const options = Object.freeze({ filter, sort, take: 2 });
    const result = query(options as unknown as GetGridLoadOptions);
    expect(result).toEqual({ data: [customers[4], customers[3]], totalCount: 4 });
    expect(result.data[0]).toBe(customers[4]);
    expect(customers.map((record) => record.id)).toEqual([1, 2, 3, 4, 5]);
    expect(query().data).not.toBe(customers);
  });

  it('returns empty matches and counts beyond the final page', () => {
    expect(query({ filter: ['id', '>', 100] })).toEqual({ data: [], totalCount: 0 });
    expect(query({ skip: 100 })).toEqual({ data: [], totalCount: 5 });
    expect(query({ take: 0 })).toEqual({ data: [], totalCount: 5 });
    expect(ids({ skip: 3 })).toEqual([4, 5]);
  });

  it.each([{ filter: undefined }, { filter: null }, { filter: [] }])(
    'treats absent/empty filter %j as no filter',
    ({ filter }) => {
      expect(ids({ filter })).toEqual([1, 2, 3, 4, 5]);
    }
  );

  it('does not coerce numbers and strings', () => {
    expect(ids({ filter: ['id', '=', '3'] })).toEqual([]);
    expect(ids({ filter: ['id', '>', '3'] })).toEqual([]);
    expect(ids({ filter: ['id', '<>', '3'] })).toEqual([1, 2, 3, 4, 5]);
    expect(ids({ filter: ['id', 'contains', '3'] })).toEqual([]);
  });

  it('defines null equality, relational exclusion, text negation and sort position', () => {
    const dataset = [{ id: 1, name: null }, { id: 2 }, { id: 3, name: '' }, { id: 4, name: 'A' }];
    const run = (loadOptions: GetGridLoadOptions) =>
      queryRemoteCustomers(dataset, 'remote-customers', { loadOptions }).data.map(
        (record) => record.id
      );
    expect(run({ filter: ['name', '=', null] })).toEqual([1, 2]);
    expect(run({ filter: ['name', '<>', undefined] })).toEqual([3, 4]);
    expect(run({ filter: ['name', '>=', null] })).toEqual([]);
    expect(run({ filter: ['name', '<', 'A'] })).toEqual([3]);
    expect(run({ filter: ['name', 'contains', ''] })).toEqual([3, 4]);
    expect(run({ filter: ['name', 'notcontains', ''] })).toEqual([1, 2]);
    expect(run({ sort: [{ selector: 'name', desc: false }] })).toEqual([1, 2, 3, 4]);
    expect(run({ sort: [{ selector: 'name', desc: true }] })).toEqual([4, 3, 1, 2]);
  });

  it('compares Dates by epoch without parsing strings or mutating Date values', () => {
    const date = new Date('2026-01-02T00:00:00Z');
    const dataset = [
      { id: 1, name: date },
      { id: 2, name: new Date('2026-01-01T00:00:00Z') },
    ];
    const run = (loadOptions: GetGridLoadOptions) =>
      queryRemoteCustomers(dataset, 'remote-customers', { loadOptions }).data.map(
        (record) => record.id
      );
    expect(run({ filter: ['name', '=', new Date('2026-01-02T01:00:00+01:00')] })).toEqual([1]);
    expect(run({ filter: ['name', '<', date] })).toEqual([2]);
    expect(run({ filter: ['name', '=', date.toISOString()] })).toEqual([]);
    expect(run({ sort: [{ selector: 'name', desc: false }] })).toEqual([2, 1]);
    expect(date.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('defines deterministic mixed-type and Boolean ordering', () => {
    const dataset = [
      { id: 1, name: true },
      { id: 2, name: 'a' },
      { id: 3, name: new Date(0) },
      { id: 4, name: 0 },
      { id: 5, name: null },
      { id: 6, name: false },
    ];
    expect(
      queryRemoteCustomers(dataset, 'remote-customers', {
        loadOptions: { sort: [{ selector: 'name', desc: false }] },
      }).data.map((record) => record.id)
    ).toEqual([5, 4, 3, 2, 6, 1]);
  });

  it.each(['customers', 'unknown', ''])('rejects unknown resource %j', (resource) => {
    expect(() => queryRemoteCustomers(customers, resource, { loadOptions: {} })).toThrow(
      /unknown resource/
    );
  });

  it.each(['between', 'anyof', 'LIKE', 'unknown'])(
    'rejects unsupported operator %s',
    (operator) => {
      expect(() => query({ filter: ['id', operator, 1] })).toThrow(/unsupported operator/);
    }
  );

  it.each(['missing', 'name_eq', '__proto__', 'constructor', 'company.name'])(
    'rejects unknown field %s',
    (field) => {
      expect(() => query({ filter: [field, '=', 1] })).toThrow(/unknown field/);
      expect(() => query({ sort: [{ selector: field, desc: false }] })).toThrow(/unknown field/);
    }
  );

  it.each([
    ['id'],
    ['id', '='],
    ['id', '=', 1, 2],
    ['!'],
    ['!', ['id', '=', 1], 'extra'],
    [['id', '=', 1], 'and'],
    [['id', '=', 1], 'xor', ['id', '=', 2]],
    [['id', '=', 1], 'and', ['id', '=', 2], 'or', ['id', '=', 3]],
    [['id', '=', 1], 'and', []],
    [() => true, '=', 1],
    ['id', '=', {}],
    ['id', '=', () => 1],
    ['id', '=', NaN],
    ['id', '=', Infinity],
    ['name', '=', new Date('invalid')],
    ['name', 'contains', null],
    ['name', 'startswith', 1],
  ])('rejects malformed filter %j', (...filter) => {
    expect(() => query({ filter })).toThrow(/Remote customers:/);
  });

  it('validates every branch even on empty datasets or short-circuited groups', () => {
    const filter = [['id', '>', 0], 'or', ['missing', '=', 1]];
    expect(() => query({ filter })).toThrow(/unknown field/);
    expect(() => queryRemoteCustomers([], 'remote-customers', { loadOptions: { filter } })).toThrow(
      /unknown field/
    );
  });

  it('rejects cycles and excessive nesting but permits shared subexpressions', () => {
    const cyclic: unknown[] = ['!'];
    cyclic.push(cyclic);
    expect(() => query({ filter: cyclic })).toThrow(/cyclic/);
    let deep: unknown[] = ['id', '=', 1];
    for (let index = 0; index < 101; index++) deep = ['!', deep];
    expect(() => query({ filter: deep })).toThrow(/nested/);
    const shared = ['id', '=', 1];
    expect(ids({ filter: [shared, 'or', shared] })).toEqual([1]);
  });

  it.each([
    { skip: -1 },
    { take: -1 },
    { skip: 1.5 },
    { take: Infinity },
    { skip: Number.MAX_SAFE_INTEGER + 1 },
    { requireTotalCount: 'yes' },
    { filter: {} },
    { sort: {} },
    { sort: [null] },
    { sort: [{ selector: 'id', desc: 'yes' }] },
  ])('rejects malformed load options %j', (options) => {
    expect(() => query(options as unknown as GetGridLoadOptions)).toThrow(/Remote customers:/);
  });
});
