import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from operator import eq, ge, gt, le, lt, ne

from pydantic import JsonValue
from sqlalchemy import and_, func, literal, not_, or_
from sqlalchemy.sql.elements import ColumnElement

from app.grid.fields import GridField, GridQueryError, GridValueType

MAX_FILTER_DEPTH = 16
MAX_FILTER_NODES = 200
MAX_FILTER_STRING_LENGTH = 1024

_COMPARISONS = {"=": eq, "<>": ne, ">": gt, ">=": ge, "<": lt, "<=": le}
_SEARCH_OPERATORS = frozenset({"contains", "notcontains", "startswith", "endswith"})
_ALLOWED_OPERATORS = {
    GridValueType.STRING: frozenset({"=", "<>"}) | _SEARCH_OPERATORS,
    GridValueType.INTEGER: frozenset(_COMPARISONS),
    GridValueType.BOOLEAN: frozenset({"=", "<>"}),
    GridValueType.DATE: frozenset(_COMPARISONS),
}
_DATE_ONLY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


@dataclass(frozen=True, slots=True)
class _CompiledFilter:
    clause: ColumnElement[bool]
    nullable_selector: str | None = None


@dataclass(slots=True)
class _CompilationState:
    nodes: int = 0


def compile_filter_expression(
    expression: list[JsonValue] | None,
    fields: Mapping[str, GridField],
) -> ColumnElement[bool] | None:
    """Validate native filter data and compile it using registered SQL expressions."""
    if expression is None or (isinstance(expression, list) and not expression):
        return None
    return _compile_expression(expression, fields, 1, _CompilationState()).clause


def _compile_expression(
    expression: JsonValue,
    fields: Mapping[str, GridField],
    depth: int,
    state: _CompilationState,
) -> _CompiledFilter:
    if depth > MAX_FILTER_DEPTH:
        raise GridQueryError(
            f"Filter exceeds maximum nesting depth ({MAX_FILTER_DEPTH})"
        )
    if state.nodes >= MAX_FILTER_NODES:
        raise GridQueryError(
            f"Filter exceeds maximum expression nodes ({MAX_FILTER_NODES})"
        )
    state.nodes += 1
    if not isinstance(expression, list) or not expression:
        raise GridQueryError("Invalid filter expression: expected a nonempty array")
    if expression[0] == "!":
        return _compile_not(expression, fields, depth, state)
    if isinstance(expression[0], list):
        return _compile_group(expression, fields, depth, state)
    return _compile_condition(expression, fields)


def _compile_not(
    expression: list[JsonValue],
    fields: Mapping[str, GridField],
    depth: int,
    state: _CompilationState,
) -> _CompiledFilter:
    if len(expression) != 2:
        raise GridQueryError("Invalid unary NOT: expected exactly one expression")
    child = _compile_expression(expression[1], fields, depth + 1, state)
    if child.nullable_selector is not None:
        raise GridQueryError(
            "Unary NOT is not supported for nullable field "
            f"{child.nullable_selector!r} "
            "because DevExtreme and SQL NULL semantics differ."
        )
    return _CompiledFilter(not_(child.clause), child.nullable_selector)


def _compile_group(
    expression: list[JsonValue],
    fields: Mapping[str, GridField],
    depth: int,
    state: _CompilationState,
) -> _CompiledFilter:
    clauses: list[ColumnElement[bool]] = []
    nullable_selector = None
    connector = None
    index = 0
    while index < len(expression):
        child = _compile_expression(expression[index], fields, depth + 1, state)
        clauses.append(child.clause)
        if nullable_selector is None:
            nullable_selector = child.nullable_selector
        index += 1
        if index == len(expression):
            break
        token = expression[index]
        if isinstance(token, list):
            next_connector = "and"
        elif isinstance(token, str) and token in ("and", "or"):
            next_connector = token
            index += 1
            if index == len(expression):
                raise GridQueryError("Invalid filter group: trailing connector")
        else:
            raise GridQueryError(
                "Invalid filter group: expected 'and', 'or' or expression"
            )
        if connector is not None and connector != next_connector:
            raise GridQueryError("Mixed AND/OR filter groups must be explicitly nested")
        connector = next_connector
    clause = or_(*clauses) if connector == "or" else and_(*clauses)
    return _CompiledFilter(clause, nullable_selector)


def _compile_condition(
    expression: list[JsonValue], fields: Mapping[str, GridField]
) -> _CompiledFilter:
    if not isinstance(expression, list) or len(expression) not in (2, 3):
        raise GridQueryError("Invalid filter condition: expected two or three items")
    if len(expression) == 2:
        selector, value = expression
        operator = "="
    else:
        selector, operator, value = expression
    if not isinstance(selector, str):
        raise GridQueryError("Invalid filter selector: expected a string")
    field = fields.get(selector)
    if field is None:
        raise GridQueryError(f"Unknown filter selector: {selector!r}")
    if not field.filterable:
        raise GridQueryError(f"Filtering is not supported for field {selector!r}")
    if not isinstance(operator, str):
        raise GridQueryError("Invalid filter operator: expected a string")
    if operator not in _ALLOWED_OPERATORS[field.value_type]:
        raise GridQueryError(
            f"Operator {operator!r} is not supported for "
            f"{field.value_type.value} field {selector!r}"
        )
    if value is None:
        if not field.nullable or operator not in ("=", "<>"):
            raise GridQueryError(
                f"Null is not supported for operator {operator!r} on field {selector!r}"
            )
        clause = (
            field.expression.is_(None)
            if operator == "="
            else field.expression.is_not(None)
        )
    else:
        converted = _convert_value(value, field.value_type, selector)
        clause = _build_condition(field, operator, converted)
    return _CompiledFilter(clause, selector if field.nullable else None)


def _convert_value(
    value: JsonValue, value_type: GridValueType, selector: str
) -> str | int | bool | date:
    if isinstance(value, str) and len(value) > MAX_FILTER_STRING_LENGTH:
        raise GridQueryError(
            f"Filter value exceeds maximum string length ({MAX_FILTER_STRING_LENGTH})"
        )
    if value_type is GridValueType.STRING and type(value) is str:
        return value
    if value_type is GridValueType.INTEGER and type(value) is int:
        if not -(2**63) <= value <= 2**63 - 1:
            raise GridQueryError(
                f"Integer value is outside signed 64-bit range: {selector!r}"
            )
        return value
    if value_type is GridValueType.BOOLEAN and type(value) is bool:
        return value
    if value_type is GridValueType.DATE and isinstance(value, str):
        if _DATE_ONLY.fullmatch(value):
            try:
                return date.fromisoformat(value)
            except ValueError:
                pass
        raise GridQueryError(
            f"Invalid date for field {selector!r}: expected YYYY-MM-DD"
        )
    raise GridQueryError(f"Invalid value for {value_type.value} field {selector!r}")


def _build_condition(
    field: GridField, operator: str, value: str | int | bool | date
) -> ColumnElement[bool]:
    column = field.expression
    if operator in _SEARCH_OPERATORS:
        if operator in ("contains", "notcontains"):
            clause = column.icontains(value, autoescape=True)
            return not_(clause) if operator == "notcontains" else clause
        if operator == "startswith":
            return column.istartswith(value, autoescape=True)
        return column.iendswith(value, autoescape=True)
    bound_value = literal(value)
    if field.value_type is GridValueType.STRING:
        return _COMPARISONS[operator](func.lower(column), func.lower(bound_value))
    return _COMPARISONS[operator](column, bound_value)
