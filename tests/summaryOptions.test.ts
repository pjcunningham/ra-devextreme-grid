import { describe, expect, it, vi } from 'vitest';
import { validateSummaryOptions } from '../src/remote/summaryOptions';

describe('remote native summary options', () => {
  it.each([
    undefined,
    null,
    {},
    { totalItems: [] },
    { totalItems: null },
    { totalItems: undefined },
  ])('allows inactive summary options %j', (value) => {
    expect(validateSummaryOptions(value)).toBeUndefined();
  });

  it.each([undefined, null, []].map((value) => [value]))(
    'allows inactive native groupItems %j',
    (groupItems) => {
      expect(
        validateSummaryOptions({
          calculateCustomSummary: null,
          groupItems,
          recalculateWhileEditing: false,
          skipEmptyValues: true,
          totalItems: [{ summaryType: 'count' }],
        })
      ).toBeUndefined();
    }
  );

  it.each(['count', 'sum', 'avg', 'min', 'max'])(
    'allows the built-in %s with a native column name',
    (summaryType) => {
      expect(
        validateSummaryOptions({
          totalItems: [{ summaryType, column: 'Age column', skipEmptyValues: true }],
        })
      ).toBeUndefined();
    }
  );

  it('allows selector-less counts, duplicates and native presentation callbacks without mutation', () => {
    const customizeText = vi.fn(() => 'Total');
    const formatter = vi.fn(() => 'formatted');
    const parser = vi.fn(() => 1);
    const item = Object.freeze({
      column: ' age ',
      summaryType: 'avg',
      name: 'average',
      displayFormat: 'Average: {0}',
      showInColumn: 'name',
      alignment: 'right',
      cssClass: 'summary',
      customizeText,
      valueFormat: Object.freeze({ formatter, parser }),
    });
    const totalItems = Object.freeze([
      item,
      item,
      Object.freeze({ summaryType: 'count', column: undefined, showInColumn: 'name' }),
      Object.freeze({ summaryType: 'sum', column: 'age', valueFormat: formatter }),
    ]);
    const options = Object.freeze({ totalItems, texts: Object.freeze({ count: 'Rows: {0}' }) });
    expect(validateSummaryOptions(options)).toBeUndefined();
    expect(options.totalItems).toBe(totalItems);
    expect(options.totalItems[0]).toBe(item);
    expect(item.column).toBe(' age ');
    expect(customizeText).not.toHaveBeenCalled();
    expect(formatter).not.toHaveBeenCalled();
    expect(parser).not.toHaveBeenCalled();
  });

  it.each(
    [false, true, 0, '', 'summary', [], new Date(), () => ({}), new Map()].map((value) => [value])
  )('rejects malformed summary options %j', (value) => {
    expect(() => validateSummaryOptions(value)).toThrow(/summary.*object/);
  });

  it.each([() => undefined, false, true, 0, '', {}])(
    'rejects active or malformed calculateCustomSummary %j without total items',
    (calculateCustomSummary) => {
      expect(() => validateSummaryOptions({ calculateCustomSummary })).toThrow(
        /calculateCustomSummary/
      );
    }
  );

  it.each(
    [[{ summaryType: 'custom' }], new Array(1), {}, false, '', () => []].map((value) => [value])
  )('rejects unsupported or malformed groupItems %j', (groupItems) => {
    expect(() => validateSummaryOptions({ groupItems })).toThrow(/groupItems/);
  });

  it.each([true, null, 0, 'false', () => false])(
    'rejects unsupported recalculateWhileEditing %j',
    (recalculateWhileEditing) => {
      expect(() => validateSummaryOptions({ recalculateWhileEditing })).toThrow(
        /recalculateWhileEditing/
      );
    }
  );

  it.each([false, null, 0, 'true', () => true])(
    'rejects unsupported skipEmptyValues %j at summary and item levels',
    (skipEmptyValues) => {
      expect(() => validateSummaryOptions({ skipEmptyValues })).toThrow(/summary.skipEmptyValues/);
      expect(() =>
        validateSummaryOptions({ totalItems: [{ summaryType: 'count', skipEmptyValues }] })
      ).toThrow(/totalItems\[0\].skipEmptyValues/);
    }
  );

  it.each([false, 1, '', {}, { summaryType: 'count' }, () => []])(
    'rejects non-array totalItems %j',
    (totalItems) => {
      expect(() => validateSummaryOptions({ totalItems })).toThrow(/totalItems.*array/);
    }
  );

  it.each(
    [null, undefined, false, 0, 'count', [], new Date(), () => ({ summaryType: 'count' })].map(
      (value) => [value]
    )
  )('rejects malformed total items %j', (item) => {
    expect(() => validateSummaryOptions({ totalItems: [item] })).toThrow(/totalItems\[0\].*object/);
  });

  it('rejects sparse totalItems rather than skipping their holes', () => {
    expect(() => validateSummaryOptions({ totalItems: new Array(1) })).toThrow(/totalItems\[0\]/);
  });

  it.each([undefined, null, 'custom', 'SUM', 'median', '', () => 'count'])(
    'requires an explicit supported summaryType, not %j',
    (summaryType) => {
      expect(() =>
        validateSummaryOptions({ totalItems: [{ summaryType, column: 'age' }] })
      ).toThrow(/summaryType.*count, sum, avg, min, max/);
    }
  );

  it.each(['sum', 'avg', 'min', 'max'])(
    'requires a native column for %s, not a load descriptor selector',
    (summaryType) => {
      expect(() =>
        validateSummaryOptions({ totalItems: [{ summaryType, selector: 'age' }] })
      ).toThrow(/totalItems\[0\].column/);
    }
  );

  it.each([null, '', ' \t\n ', 0, {}, [], () => 'age'].map((value) => [value]))(
    'rejects an invalid column %j even for count',
    (column) => {
      for (const summaryType of ['count', 'sum', 'avg', 'min', 'max']) {
        expect(() => validateSummaryOptions({ totalItems: [{ summaryType, column }] })).toThrow(
          /totalItems\[0\].column.*nonempty string/
        );
      }
    }
  );

  it('bounds totalItems at 32 including duplicates', () => {
    const item = { summaryType: 'count' };
    const totalItems = Array.from({ length: 32 }, () => item);
    expect(validateSummaryOptions({ totalItems })).toBeUndefined();
    expect(() => validateSummaryOptions({ totalItems: [...totalItems, item] })).toThrow(
      /totalItems.*32/
    );
  });

  it('supports all built-in group items and native presentation without calling formatters', () => {
    const customizeText = vi.fn(() => 'Group');
    expect(
      validateSummaryOptions({
        groupItems: [
          { summaryType: 'count', showInColumn: 'id' },
          ...['count', 'sum', 'avg', 'min', 'max'].map((summaryType) => ({
            column: 'age',
            summaryType,
            skipEmptyValues: true,
            showInGroupFooter: true,
            alignByColumn: true,
            displayFormat: '{0}',
            valueFormat: 'fixedPoint',
            customizeText,
          })),
        ],
      })
    ).toBeUndefined();
    expect(customizeText).not.toHaveBeenCalled();
  });

  it.each(
    [
      [{ summaryType: 'avg' }],
      [{ summaryType: 'count', column: () => 'age' }],
      [{ summaryType: 'count', skipEmptyValues: false }],
      Array.from({ length: 33 }, () => ({ summaryType: 'count' })),
    ].map((groupItems) => [groupItems])
  )('enforces the same group-item semantic constraints %#', (groupItems) => {
    expect(() => validateSummaryOptions({ groupItems })).toThrow(/groupItems/);
  });
});
