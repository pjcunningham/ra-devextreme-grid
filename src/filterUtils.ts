import React from 'react';

export interface ParsedRaFilterKey {
  field: string;
  suffix?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'q';
  operator?: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'contains';
}

export interface DatagridDXFilterContext {
  previousFilters?: Record<string, unknown>;
  gridColumns?: string[];
}

const SUFFIX_OPERATOR_MAP: Record<string, ParsedRaFilterKey['operator']> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  q: 'contains',
};

/**
 * Splits a React-Admin filter key from the end by known suffixes
 * (_eq, _neq, _gt, _gte, _lt, _lte, _q), safely supporting field names with underscores.
 */
export function parseRaFilterKey(key: string): ParsedRaFilterKey {
  const match = /^(.*)_(eq|neq|gt|gte|lt|lte|q)$/.exec(key);
  if (match && match[1] && match[1].length > 0) {
    const suffix = match[2] as 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'q';
    return {
      field: match[1],
      suffix,
      operator: SUFFIX_OPERATOR_MAP[suffix],
    };
  }
  return { field: key };
}

/**
 * Compares two DevExtreme filter expressions for deep semantic equality.
 * Handles nested arrays, null/undefined, Dates, primitives, and case-insensitive 'and'/'or' tokens.
 */
export function isFilterValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  // Treat null, undefined, and empty arrays as equal empty filter states
  const isAEmpty = a == null || (Array.isArray(a) && a.length === 0);
  const isBEmpty = b == null || (Array.isArray(b) && b.length === 0);
  if (isAEmpty && isBEmpty) {
    return true;
  }
  if (isAEmpty || isBEmpty) {
    return false;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (typeof a === 'string' && typeof b === 'string') {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if ((lowerA === 'and' || lowerA === 'or') && lowerA === lowerB) {
      return true;
    }
    return a === b;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!isFilterValueEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keysA = Object.keys(aObj);
    const keysB = Object.keys(bObj);
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) {
        return false;
      }
      if (!isFilterValueEqual(aObj[key], bObj[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Extracts allowable filter fields from grid column metadata and JSX children.
 * Ignores non-string fields and columns with allowFiltering === false.
 */
export function getManagedColumnFields(columns?: unknown[], children?: React.ReactNode): string[] {
  const fields = new Set<string>();

  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (typeof col === 'string') {
        const trimmed = col.trim();
        if (trimmed) fields.add(trimmed);
      } else if (col && typeof col === 'object') {
        const colObj = col as Record<string, unknown>;
        if (
          colObj.allowFiltering !== false &&
          typeof colObj.dataField === 'string' &&
          colObj.dataField.trim() !== ''
        ) {
          fields.add(colObj.dataField.trim());
        }
      }
    }
  }

  if (children) {
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.props) {
        const props = child.props as Record<string, unknown>;
        if (
          props.allowFiltering !== false &&
          typeof props.dataField === 'string' &&
          props.dataField.trim() !== ''
        ) {
          fields.add(props.dataField.trim());
        }
      }
    });
  }

  return Array.from(fields);
}

/**
 * Merges newly converted grid filters with previous React-Admin filters,
 * preserving external/unrelated filters (e.g. global `q` or backend flags)
 * and updating or clearing only filters that belong to managed grid columns.
 */
export function mergeRaFilters(
  previousFilters: Record<string, unknown> | undefined | null,
  newGridFilters: Record<string, unknown>,
  gridColumns: string[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const gridColumnSet = new Set(gridColumns);

  if (previousFilters && typeof previousFilters === 'object') {
    for (const [key, value] of Object.entries(previousFilters)) {
      if (value === undefined) continue;
      const parsed = parseRaFilterKey(key);
      if (!gridColumnSet.has(parsed.field) && !gridColumnSet.has(key)) {
        merged[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(newGridFilters)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Recursively extracts simple conditions from an AND-based DevExtreme filter expression.
 * Returns null if unsupported OR or NOT boolean logic is encountered.
 */
function extractConditions(expr: unknown): unknown[] | null {
  if (!Array.isArray(expr) || expr.length === 0) {
    return [];
  }

  if (expr[0] === '!') {
    console.warn(
      '[ra-devextreme-grid] Unsupported NOT boolean logic in filter expression. Managed mode default converter does not support NOT expressions.'
    );
    return null;
  }

  if (
    typeof expr[0] === 'string' &&
    expr[0].toLowerCase() !== 'and' &&
    expr[0].toLowerCase() !== 'or'
  ) {
    return [expr];
  }

  if (expr.length === 1 && Array.isArray(expr[0])) {
    return extractConditions(expr[0]);
  }

  const conditions: unknown[] = [];
  for (let i = 0; i < expr.length; i++) {
    const item = expr[i];
    if (typeof item === 'string') {
      const glue = item.toLowerCase();
      if (glue === 'or') {
        console.warn(
          '[ra-devextreme-grid] Unsupported OR boolean logic in filter expression. Managed mode default converter only supports AND expressions.'
        );
        return null;
      }
      if (glue !== 'and') {
        console.warn(
          `[ra-devextreme-grid] Unsupported logical operator "${item}" in filter expression.`
        );
        return null;
      }
      continue;
    }

    const sub = extractConditions(item);
    if (sub === null) {
      return null;
    }
    conditions.push(...sub);
  }

  return conditions;
}

/**
 * Transforms a DevExtreme filter expression into a React-Admin flat query object.
 * Maps DevExtreme operators (=, <>, >, >=, <, <=, contains, between) to suffixes.
 * Preserves unrelated React-Admin filters when previousFilters context is supplied.
 */
export function defaultGetRaFilters(
  dxFilter: unknown,
  context?: DatagridDXFilterContext
): Record<string, unknown> {
  const gridRaFilters: Record<string, unknown> = {};
  const gridColumns = context?.gridColumns;
  const gridColumnSet = gridColumns ? new Set(gridColumns) : null;

  const conditions = extractConditions(dxFilter);
  if (conditions && conditions.length > 0) {
    for (const cond of conditions) {
      if (!Array.isArray(cond) || cond.length < 2) continue;

      const field = cond[0];
      if (typeof field !== 'string' || field.trim() === '') continue;

      if (gridColumnSet && !gridColumnSet.has(field)) {
        continue;
      }

      let op = cond.length >= 3 ? cond[1] : '=';
      const val = cond.length >= 3 ? cond[2] : cond[1];

      if (typeof op === 'string') {
        op = op.toLowerCase();
      }

      switch (op) {
        case '=':
          gridRaFilters[`${field}_eq`] = val;
          break;
        case '<>':
          gridRaFilters[`${field}_neq`] = val;
          break;
        case '>':
          gridRaFilters[`${field}_gt`] = val;
          break;
        case '>=':
          gridRaFilters[`${field}_gte`] = val;
          break;
        case '<':
          gridRaFilters[`${field}_lt`] = val;
          break;
        case '<=':
          gridRaFilters[`${field}_lte`] = val;
          break;
        case 'contains':
          gridRaFilters[`${field}_q`] = val;
          break;
        case 'between':
          if (Array.isArray(val) && val.length >= 2) {
            if (val[0] !== undefined && val[0] !== null) {
              gridRaFilters[`${field}_gte`] = val[0];
            }
            if (val[1] !== undefined && val[1] !== null) {
              gridRaFilters[`${field}_lte`] = val[1];
            }
          }
          break;
        default:
          console.warn(
            `[ra-devextreme-grid] Unsupported DevExtreme filter operator: "${String(op)}". This filter will be omitted in managed mode.`
          );
          break;
      }
    }
  }

  if (context?.previousFilters) {
    const cols = gridColumns ?? Object.keys(gridRaFilters).map((k) => parseRaFilterKey(k).field);
    return mergeRaFilters(context.previousFilters, gridRaFilters, cols);
  }

  return gridRaFilters;
}

/**
 * Transforms a React-Admin query object into a DevExtreme nested AND filter expression.
 * Only keys corresponding to known gridColumns are translated.
 */
export function defaultGetDxFilterValue(
  raFilters: Record<string, unknown> | undefined | null,
  context?: { gridColumns?: string[] }
): unknown {
  if (!raFilters || typeof raFilters !== 'object') {
    return null;
  }

  const gridColumns = context?.gridColumns;
  const gridColumnSet = gridColumns ? new Set(gridColumns) : null;

  const fieldOpsMap = new Map<
    string,
    {
      eq?: unknown;
      neq?: unknown;
      gt?: unknown;
      gte?: unknown;
      lt?: unknown;
      lte?: unknown;
      q?: unknown;
      plain?: unknown;
    }
  >();

  for (const [key, val] of Object.entries(raFilters)) {
    if (val === undefined) continue;

    const { field, suffix } = parseRaFilterKey(key);

    if (gridColumnSet && !gridColumnSet.has(field)) {
      continue;
    }

    let fieldOps = fieldOpsMap.get(field);
    if (!fieldOps) {
      fieldOps = {};
      fieldOpsMap.set(field, fieldOps);
    }

    if (suffix) {
      fieldOps[suffix] = val;
    } else {
      fieldOps.plain = val;
    }
  }

  const conditions: unknown[] = [];

  for (const [field, ops] of fieldOpsMap.entries()) {
    if (ops.gte !== undefined && ops.lte !== undefined) {
      conditions.push([field, 'between', [ops.gte, ops.lte]]);
    } else {
      if (ops.gte !== undefined) {
        conditions.push([field, '>=', ops.gte]);
      }
      if (ops.lte !== undefined) {
        conditions.push([field, '<=', ops.lte]);
      }
    }

    if (ops.gt !== undefined) {
      conditions.push([field, '>', ops.gt]);
    }
    if (ops.lt !== undefined) {
      conditions.push([field, '<', ops.lt]);
    }
    if (ops.q !== undefined) {
      conditions.push([field, 'contains', ops.q]);
    }
    if (ops.neq !== undefined) {
      conditions.push([field, '<>', ops.neq]);
    }
    if (ops.eq !== undefined) {
      conditions.push([field, '=', ops.eq]);
    } else if (ops.plain !== undefined) {
      conditions.push([field, '=', ops.plain]);
    }
  }

  if (conditions.length === 0) {
    return null;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  const result: unknown[] = [conditions[0]];
  for (let i = 1; i < conditions.length; i++) {
    result.push('and', conditions[i]);
  }

  return result;
}
