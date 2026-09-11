from collections.abc import Mapping
from typing import Any

from pydantic import JsonValue
from sqlalchemy import and_, false, func, literal, or_
from sqlalchemy.sql.elements import ColumnElement

from app.grid.fields import GridField, GridQueryError, GridValueType
from app.grid.filtering import MAX_FILTER_DEPTH, MAX_FILTER_NODES, _convert_value
from app.grid.grouping import build_group_expressions
from app.grid.models import (
    GridGroupDescriptor,
    GridLoadOptions,
    GridPagingSortDescriptor,
)


def _conjuncts(expression: list[JsonValue] | None) -> list[list[JsonValue]]:
    """Flatten only AND groups, retaining OR/NOT subtrees and duplicate occurrences."""
    nodes = 0

    def visit(value: Any, depth: int) -> list[list[JsonValue]]:
        nonlocal nodes
        nodes += 1
        if depth > MAX_FILTER_DEPTH or nodes > MAX_FILTER_NODES:
            raise GridQueryError("Native filter exceeds complexity limits")
        if not isinstance(value, list) or not value:
            raise GridQueryError("Invalid native filter expression")
        if not isinstance(value[0], list):
            if value[0] == "!":
                if len(value) != 2:
                    raise GridQueryError("Invalid native NOT filter")
                visit(value[1], depth + 1)
            elif len(value) not in (2, 3):
                raise GridQueryError("Invalid native filter condition")
            return [value]
        children = []
        connector = None
        index = 0
        while index < len(value):
            children.extend(visit(value[index], depth + 1))
            index += 1
            if index == len(value):
                break
            token = value[index]
            if isinstance(token, list):
                next_connector = "and"
            elif isinstance(token, str) and token in ("and", "or"):
                next_connector = token
                index += 1
                if index == len(value):
                    raise GridQueryError("Trailing native filter connector")
            else:
                raise GridQueryError("Invalid native filter connector")
            if connector is not None and connector != next_connector:
                raise GridQueryError("Mixed native AND/OR must be nested")
            connector = next_connector
        return [value] if connector == "or" else children

    return [] if expression is None or expression == [] else visit(expression, 1)


def _same_json(left: JsonValue, right: JsonValue) -> bool:
    if type(left) is not type(right):
        return False
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _same_json(a, b) for a, b in zip(left, right, strict=True)
        )
    return left == right


def _native_scope(options: GridLoadOptions) -> list[list[JsonValue]]:
    native = _conjuncts(options.filter)
    for conjunct in _conjuncts(options.group_paging_context.filter):
        for index, candidate in enumerate(native):
            if _same_json(candidate, conjunct):
                del native[index]
                break
        else:
            raise GridQueryError("Native filter must include the original user filter")
    return native


def _path_clause(
    condition: list[JsonValue],
    descriptor: GridGroupDescriptor,
    key: ColumnElement[Any],
    field: GridField,
) -> ColumnElement[bool]:
    if (
        len(condition) != 3
        or condition[0] != descriptor.selector
        or condition[1] != "="
    ):
        raise GridQueryError("Native path must equal the configured group prefix")
    value = condition[2]
    if value is None:
        if not field.nullable:
            raise GridQueryError("Null path requires a nullable grouping field")
        return key.is_(None)
    return key == literal(_convert_value(value, field.value_type, descriptor.selector))


def _rank_clause(
    expression: list[JsonValue],
    descriptor: GridGroupDescriptor,
    key: ColumnElement[Any],
    field: GridField,
) -> ColumnElement[bool]:
    include_null = False
    if len(expression) == 3 and isinstance(expression[0], list):
        if (
            expression[1] != "or"
            or descriptor.desc
            or not _same_json(expression[2], [descriptor.selector, "=", None])
        ):
            raise GridQueryError("Invalid native group rank NULL predicate")
        include_null = True
        expression = expression[0]
    if (
        len(expression) != 3
        or expression[0] != descriptor.selector
        or expression[1] != (">" if descriptor.desc else "<")
    ):
        raise GridQueryError("Invalid native group rank predicate")
    value = expression[2]
    if value is None:
        if include_null or not field.nullable:
            raise GridQueryError("Invalid native group rank boundary")
        return key.is_not(None) if descriptor.desc else false()
    bound = literal(_convert_value(value, field.value_type, descriptor.selector))
    if field.value_type is GridValueType.STRING:
        primary, boundary = func.lower(key), func.lower(bound)
        comparison = primary > boundary if descriptor.desc else primary < boundary
        clause = or_(comparison, and_(primary == boundary, key < bound))
    else:
        clause = key > bound if descriptor.desc else key < bound
    return or_(clause, key.is_(None)) if include_null else clause


def build_paging_scope(
    options: GridLoadOptions,
    fields: Mapping[str, GridField],
) -> ColumnElement[bool] | None:
    """Validate native scope independently of the unchanged user-filter compiler."""
    configured = options.group_paging_context.group
    keys, _ = build_group_expressions(configured, fields)
    scope = _native_scope(options)
    depth = len(configured)
    if options.group:
        current = options.group[0]
        depth = next(
            (
                index
                for index, descriptor in enumerate(configured)
                if descriptor == current
            ),
            -1,
        )
        if depth < 0:
            raise GridQueryError("Current group must match its configured descriptor")
    if len(scope) != depth and not (options.group and len(scope) == depth + 1):
        raise GridQueryError("Native scope must be a complete configured group prefix")
    clauses = [
        _path_clause(scope[index], descriptor, keys[index], fields[descriptor.selector])
        for index, descriptor in enumerate(configured[:depth])
    ]
    if len(scope) > depth:
        if (
            options.skip != 0
            or options.take != 1
            or options.require_group_count is not True
            or options.require_total_count is not False
        ):
            raise GridQueryError("Native rank filters require a group-count probe")
        clauses.append(
            _rank_clause(
                scope[-1],
                configured[depth],
                keys[depth],
                fields[configured[depth].selector],
            )
        )
    for descriptor in options.sort or []:
        if isinstance(
            descriptor, GridPagingSortDescriptor
        ) and descriptor.selector not in {
            parent.selector for parent in configured[:depth]
        }:
            raise GridQueryError("Native group sort flags require a parent selector")
    return and_(*clauses) if clauses else None
