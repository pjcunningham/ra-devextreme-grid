import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { normalizeDateOnlyFilter } from '../examples/remote-fastapi/dateOnlyFilter';

function calendarDate(year: number, month: number, day: number): Date {
  const value = new Date(2024, 0, 1);
  value.setFullYear(year, month - 1, day);
  return value;
}

describe('example date-only filter normalization', () => {
  it.each([{ filter: undefined }, { filter: null }, { filter: [] }])(
    'preserves an absent or empty filter: $filter',
    ({ filter }) => {
      expect(normalizeDateOnlyFilter(filter)).toEqual(filter);
    }
  );

  it.each(['=', '<>', '>', '>=', '<', '<='])('preserves the %s operator', (operation) => {
    expect(normalizeDateOnlyFilter(['joined_on', operation, new Date(2024, 0, 15)])).toEqual([
      'joined_on',
      operation,
      '2024-01-15',
    ]);
  });

  it('traverses nested groups, NOT and shorthand without adding explicit AND connectors', () => {
    const filter = [
      ['country', '='],
      [
        '!',
        [
          ['joined_on', new Date(2024, 0, 15)],
          'or',
          [
            ['active', true],
            ['!', ['joined_on', '<', new Date(2024, 0, 16)]],
          ],
        ],
      ],
    ];
    expect(normalizeDateOnlyFilter(filter)).toEqual([
      ['country', '='],
      [
        '!',
        [
          ['joined_on', '2024-01-15'],
          'or',
          [
            ['active', true],
            ['!', ['joined_on', '<', '2024-01-16']],
          ],
        ],
      ],
    ]);
  });

  it.each<[string, unknown[], unknown[]]>([
    [
      'equality',
      [
        ['joined_on', '>=', new Date(2024, 0, 15)],
        'and',
        ['joined_on', '<', new Date(2024, 0, 16)],
      ],
      [['joined_on', '>=', '2024-01-15'], 'and', ['joined_on', '<', '2024-01-16']],
    ],
    [
      'inequality',
      [['joined_on', '<', new Date(2024, 0, 15)], 'or', ['joined_on', '>=', new Date(2024, 0, 16)]],
      [['joined_on', '<', '2024-01-15'], 'or', ['joined_on', '>=', '2024-01-16']],
    ],
    [
      'between',
      [
        ['joined_on', '>=', new Date(2024, 0, 15)],
        'and',
        ['joined_on', '<', new Date(2024, 0, 18)],
      ],
      [['joined_on', '>=', '2024-01-15'], 'and', ['joined_on', '<', '2024-01-18']],
    ],
    [
      'year rollover',
      [
        ['joined_on', '>=', new Date(2024, 11, 31)],
        'and',
        ['joined_on', '<', new Date(2025, 0, 1)],
      ],
      [['joined_on', '>=', '2024-12-31'], 'and', ['joined_on', '<', '2025-01-01']],
    ],
  ])('preserves native %s day bounds exactly', (_label, filter, expected) => {
    expect(normalizeDateOnlyFilter(filter)).toEqual(expected);
  });

  it.each([
    [1, 1, 1, '0001-01-01'],
    [99, 2, 3, '0099-02-03'],
    [999, 9, 9, '0999-09-09'],
    [1000, 10, 10, '1000-10-10'],
    [2024, 2, 29, '2024-02-29'],
    [2024, 3, 1, '2024-03-01'],
    [9999, 12, 31, '9999-12-31'],
  ] as const)('formats local calendar %i-%i-%i as %s', (year, month, day, expected) => {
    expect(normalizeDateOnlyFilter(['joined_on', calendarDate(year, month, day)])).toEqual([
      'joined_on',
      expected,
    ]);
  });

  it.each([
    ['invalid Date', new Date(NaN)],
    ['year zero', calendarDate(0, 1, 1)],
    ['negative year', calendarDate(-1, 1, 1)],
    ['year 10000', calendarDate(10000, 1, 1)],
  ])('rejects %s in direct joined_on operands', (_label, value) => {
    for (const filter of [
      ['joined_on', value],
      ['joined_on', '=', value],
    ]) {
      expect(() => normalizeDateOnlyFilter(filter)).toThrow(RangeError);
      expect(() => normalizeDateOnlyFilter(filter)).toThrow(/joined_on/);
    }
  });

  it.each([
    '2024-01-15',
    '2024-02-30',
    '2024-01-15T00:00:00Z',
    '2024-01-15T23:59:59-08:00',
    ' 2024-01-15 ',
    null,
    undefined,
    30,
    true,
  ])('leaves non-Date joined_on values unchanged: %j', (value) => {
    for (const filter of [
      ['joined_on', value],
      ['joined_on', '=', value],
    ]) {
      expect(normalizeDateOnlyFilter(filter)).toEqual(filter);
    }
  });

  it.each([new Date(2024, 0, 15), new Date(NaN)])(
    'retains unrelated Date identity: %s',
    (value) => {
      for (const field of ['created_at', 'country', 'joined_on.year', 'Joined_on']) {
        const filter = [field, '=', value];
        expect(normalizeDateOnlyFilter(filter)?.[2]).toBe(value);
      }
    }
  );

  it('does not interpret arrays or objects inside condition operands as expressions', () => {
    const date = new Date(2024, 0, 15);
    const range = [date, new Date(2024, 0, 17)];
    const expressionLike = ['joined_on', date];
    const object = { joined_on: date };
    for (const filter of [
      ['joined_on', 'between', range],
      ['joined_on', expressionLike],
      ['country', '=', expressionLike],
      ['joined_on', '=', object],
    ]) {
      const result = normalizeDateOnlyFilter(filter);
      expect(result).toEqual(filter);
      expect(result?.[filter.length - 1]).toBe(filter[filter.length - 1]);
    }
    expect(range[0]).toBe(date);
    expect(expressionLike[1]).toBe(date);
  });

  it('does not repair unsupported operators, mixed groups or malformed conditions', () => {
    const date = new Date(2024, 0, 15);
    const condition = ['joined_on', '=', date];
    for (const filter of [
      ['joined_on'],
      ['joined_on', '=', date, 'extra'],
      ['!', condition, condition],
      [1, date],
    ]) {
      expect(normalizeDateOnlyFilter(filter)).toEqual(filter);
    }
    expect(normalizeDateOnlyFilter(['joined_on', 'like', date])).toEqual([
      'joined_on',
      'like',
      '2024-01-15',
    ]);
    expect(
      normalizeDateOnlyFilter([condition, 'and', ['active', true], 'or', ['country', 'UK']])
    ).toEqual([['joined_on', '=', '2024-01-15'], 'and', ['active', true], 'or', ['country', 'UK']]);
  });

  it('does not mutate frozen input arrays, Date values or unrelated operands', () => {
    const date = new Date(2024, 0, 15, 23, 59, 59, 999);
    const timestamp = date.getTime();
    const condition = ['joined_on', '>=', date];
    const unrelated = ['created_at', '=', date];
    const not = ['!', condition];
    const filter = [not, 'and', unrelated];
    for (const node of [filter, not, condition, unrelated, date]) Object.freeze(node);

    const result = normalizeDateOnlyFilter(filter);
    expect(result).toEqual([['!', ['joined_on', '>=', '2024-01-15']], 'and', unrelated]);
    expect(result).not.toBe(filter);
    expect(result?.[2]).toBe(unrelated);
    expect(filter[0]).toBe(not);
    expect(not[1]).toBe(condition);
    expect(condition[2]).toBe(date);
    expect(unrelated[2]).toBe(date);
    expect(date.getTime()).toBe(timestamp);
  });

  it('leaves earlier conditions untouched when a later Date fails validation', () => {
    const date = new Date(2024, 0, 15);
    const condition = ['joined_on', date];
    const filter = [condition, ['joined_on', new Date(NaN)]];
    expect(() => normalizeDateOnlyFilter(filter)).toThrow(RangeError);
    expect(filter[0]).toBe(condition);
    expect(condition[1]).toBe(date);
  });
});

describe('date-only filter timezone evidence in isolated Node processes', () => {
  it.each([
    ['Asia/Tokyo', -540, '2024-01-14T15:00:00.000Z', '2024-01-15T14:59:59.999Z'],
    ['America/Los_Angeles', 480, '2024-01-15T08:00:00.000Z', '2024-01-16T07:59:59.999Z'],
  ] as const)(
    'uses local calendar dates in %s, not JSON timestamp truncation',
    (zone, offset, midnight, dayEnd) => {
      const source = readFileSync(
        resolve('examples', 'remote-fastapi', 'dateOnlyFilter.ts'),
        'utf8'
      );
      const { outputText } = transpileModule(source, {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
      });
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=commonjs',
          '-e',
          `${outputText}
      const values = [new Date(2024, 0, 15), new Date(2024, 0, 15, 23, 59, 59, 999)];
      console.log(JSON.stringify({
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        probes: values.map(value => ({
          offset: value.getTimezoneOffset(),
          timestamp: JSON.parse(JSON.stringify(value)),
          normalized: exports.normalizeDateOnlyFilter(['joined_on', '=', value]),
        })),
      }));
    `,
        ],
        { env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 10000 }
      );

      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stderr).toBe('');
      expect(JSON.parse(child.stdout)).toEqual({
        zone,
        probes: [midnight, dayEnd].map((timestamp) => ({
          offset,
          timestamp,
          normalized: ['joined_on', '=', '2024-01-15'],
        })),
      });
    }
  );
});
