// Example transport adapter; filter grammar and non-Date values remain backend-validated.
export function normalizeDateOnlyFilter(
  filter: unknown[] | null | undefined
): unknown[] | null | undefined {
  if (filter == null || filter.length === 0) return filter;

  if (filter[0] === '!' && filter.length === 2 && Array.isArray(filter[1])) {
    return ['!', normalizeDateOnlyFilter(filter[1])];
  }
  if (Array.isArray(filter[0])) {
    return filter.map((item) => (Array.isArray(item) ? normalizeDateOnlyFilter(item) : item));
  }

  // Condition operands are opaque: do not descend into unsupported between arrays.
  if (filter[0] !== 'joined_on' || (filter.length !== 2 && filter.length !== 3)) return filter;
  const operandIndex = filter.length - 1;
  const value = filter[operandIndex];
  if (!(value instanceof Date)) return filter;

  const year = value.getFullYear();
  if (!Number.isFinite(value.getTime()) || year < 1 || year > 9999) {
    throw new RangeError(
      'joined_on Date operands must be valid calendar dates with years 0001-9999.'
    );
  }
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const result = [...filter];
  result[operandIndex] = `${String(year).padStart(4, '0')}-${month}-${day}`;
  return result;
}
