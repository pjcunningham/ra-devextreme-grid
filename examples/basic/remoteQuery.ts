import type { RaRecord } from 'react-admin';
import type { GetGridParams, GetGridResult } from '../../src/remote/types';

const customerFields = new Set(['id', 'name', 'company', 'city', 'country']);
const operators = new Set([
  '=',
  '<>',
  '>',
  '>=',
  '<',
  '<=',
  'contains',
  'notcontains',
  'startswith',
  'endswith',
]);

type Scalar = string | number | boolean | null | undefined | Date;
type Predicate = (record: RaRecord) => boolean;

function fieldName(value: unknown): string {
  if (typeof value !== 'string' || !customerFields.has(value)) {
    throw new Error(`Remote customers: unknown field ${String(value)}`);
  }
  return value;
}

function scalar(value: unknown): Scalar {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (value instanceof Date && Number.isFinite(value.getTime()))
  ) {
    return value;
  }
  throw new Error('Remote customers: expected null, string, finite number, boolean or valid Date');
}

function kind(value: Scalar): number {
  if (value == null) return 0;
  if (typeof value === 'number') return 1;
  if (value instanceof Date) return 2;
  if (typeof value === 'string') return 3;
  return 4;
}

// Demo semantics: null and undefined are equal; strings use lowercase UTF-16 order,
// Dates use epoch milliseconds, and types never coerce. Ascending sort orders
// null < number < Date < string < boolean; descending reverses that order.
function compare(left: Scalar, right: Scalar): number {
  const typeOrder = kind(left) - kind(right);
  if (typeOrder) return typeOrder;
  if (left == null || right == null) return 0;
  const a =
    left instanceof Date ? left.getTime() : typeof left === 'string' ? left.toLowerCase() : left;
  const b =
    right instanceof Date
      ? right.getTime()
      : typeof right === 'string'
        ? right.toLowerCase()
        : right;
  return a === b ? 0 : a < b ? -1 : 1;
}

function compileFilter(expression: unknown, ancestors = new Set<unknown>()): Predicate {
  if (!Array.isArray(expression) || expression.length === 0) {
    throw new Error('Remote customers: malformed filter expression');
  }
  if (ancestors.has(expression) || ancestors.size >= 100) {
    throw new Error('Remote customers: cyclic or excessively nested filter expression');
  }
  const path = new Set(ancestors).add(expression);
  if (expression[0] === '!') {
    if (expression.length !== 2) throw new Error('Remote customers: malformed ! expression');
    const child = compileFilter(expression[1], path);
    return (record) => !child(record);
  }
  if (typeof expression[0] === 'string') {
    if (expression.length !== 3)
      throw new Error('Remote customers: expected [field, operator, value]');
    const field = fieldName(expression[0]);
    const operator: unknown = expression[1];
    if (typeof operator !== 'string' || !operators.has(operator)) {
      throw new Error(`Remote customers: unsupported operator ${String(operator)}`);
    }
    const value = scalar(expression[2]);
    const textOperation = ['contains', 'notcontains', 'startswith', 'endswith'].includes(operator);
    if (textOperation && typeof value !== 'string') {
      throw new Error('Remote customers: text operators require a string value');
    }
    return (record) => {
      const actual = scalar(record[field]);
      if (textOperation) {
        const text = typeof actual === 'string' ? actual.toLowerCase() : null;
        const needle = (value as string).toLowerCase();
        // Non-strings never match text operators; notcontains is their negation.
        if (operator === 'notcontains') return text === null || !text.includes(needle);
        if (text === null) return false;
        if (operator === 'contains') return text.includes(needle);
        if (operator === 'startswith') return text.startsWith(needle);
        return text.endsWith(needle);
      }
      const order = compare(actual, value);
      if (operator === '=') return order === 0;
      if (operator === '<>') return order !== 0;
      // Null or unlike types do not satisfy relational filters.
      if (actual == null || value == null || kind(actual) !== kind(value)) return false;
      if (operator === '>') return order > 0;
      if (operator === '>=') return order >= 0;
      if (operator === '<') return order < 0;
      return order <= 0;
    };
  }
  if (expression.length % 2 === 0) throw new Error('Remote customers: malformed Boolean group');
  const conjunction: unknown = expression[1];
  if (expression.length > 1 && conjunction !== 'and' && conjunction !== 'or') {
    throw new Error('Remote customers: expected and/or Boolean operator');
  }
  const children: Predicate[] = [];
  for (let index = 0; index < expression.length; index += 2) {
    if (index > 0 && expression[index - 1] !== conjunction) {
      throw new Error('Remote customers: nest mixed and/or operators explicitly');
    }
    children.push(compileFilter(expression[index], path));
  }
  return (record) =>
    conjunction === 'or'
      ? children.some((child) => child(record))
      : children.every((child) => child(record));
}

export function queryRemoteCustomers<RecordType extends RaRecord>(
  dataset: readonly RecordType[],
  resource: string,
  { loadOptions }: GetGridParams
): Omit<GetGridResult<RecordType>, 'data'> & { data: RecordType[] } {
  if (resource !== 'remote-customers') {
    throw new Error(`Remote customers: unknown resource ${resource}`);
  }
  const { filter, sort = [], skip = 0, take, requireTotalCount } = loadOptions;
  if (
    !Number.isSafeInteger(skip) ||
    skip < 0 ||
    (take !== undefined && (!Number.isSafeInteger(take) || take < 0))
  ) {
    throw new Error('Remote customers: skip/take must be nonnegative safe integers');
  }
  if (requireTotalCount !== undefined && typeof requireTotalCount !== 'boolean') {
    throw new Error('Remote customers: requireTotalCount must be Boolean');
  }
  const predicate =
    filter == null || (Array.isArray(filter) && filter.length === 0)
      ? () => true
      : compileFilter(filter);
  if (!Array.isArray(sort)) throw new Error('Remote customers: sort must be an array');
  const descriptors = sort.map((descriptor) => {
    if (!descriptor || typeof descriptor.desc !== 'boolean') {
      throw new Error('Remote customers: sort requires selector and Boolean desc');
    }
    return { selector: fieldName(descriptor.selector), desc: descriptor.desc };
  });
  const filtered = dataset.filter(predicate);
  filtered.sort((left, right) => {
    for (const { selector, desc } of descriptors) {
      const order = compare(scalar(left[selector]), scalar(right[selector]));
      if (order) return desc ? -order : order;
    }
    return 0; // ES2019 stable sort preserves dataset order for complete ties.
  });
  const totalCount = filtered.length;
  return {
    data: filtered.slice(skip, take === undefined ? undefined : skip + take),
    totalCount,
  };
}
