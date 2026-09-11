from dataclasses import dataclass
from enum import Enum
from typing import Any

from sqlalchemy.sql.elements import ColumnElement

from app.grid.models import GridSummaryType
from app.models import Customer


class GridQueryError(ValueError):
    """Raised when client grid parameters fail business or security validation."""


class GridValueType(Enum):
    STRING = "string"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    DATE = "date"


@dataclass(frozen=True, slots=True)
class GridField:
    expression: ColumnElement[Any]
    value_type: GridValueType
    sortable: bool = True
    filterable: bool = True
    nullable: bool = False
    summary_types: frozenset[GridSummaryType] = frozenset()
    groupable: bool = False


COUNT_SUMMARY_TYPES: frozenset[GridSummaryType] = frozenset({"count"})
NUMERIC_SUMMARY_TYPES: frozenset[GridSummaryType] = frozenset(
    {"count", "sum", "avg", "min", "max"}
)

CUSTOMER_GRID_FIELDS: dict[str, GridField] = {
    "id": GridField(
        Customer.id,
        GridValueType.INTEGER,
        summary_types=NUMERIC_SUMMARY_TYPES,
        groupable=True,
    ),
    "name": GridField(
        Customer.name,
        GridValueType.STRING,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
    "company": GridField(
        Customer.company,
        GridValueType.STRING,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
    "city": GridField(
        Customer.city,
        GridValueType.STRING,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
    "country": GridField(
        Customer.country,
        GridValueType.STRING,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
    "active": GridField(
        Customer.active,
        GridValueType.BOOLEAN,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
    "age": GridField(
        Customer.age,
        GridValueType.INTEGER,
        nullable=True,
        summary_types=NUMERIC_SUMMARY_TYPES,
        groupable=True,
    ),
    "joined_on": GridField(
        Customer.joined_on,
        GridValueType.DATE,
        summary_types=COUNT_SUMMARY_TYPES,
        groupable=True,
    ),
}


def get_customer_sort_column(selector: str) -> ColumnElement:
    """Resolve a client selector string against the Customer grid field whitelist."""
    if selector not in CUSTOMER_GRID_FIELDS:
        raise GridQueryError(f"Unknown or unsupported sort selector: {selector!r}")
    field = CUSTOMER_GRID_FIELDS[selector]
    if not field.sortable:
        raise GridQueryError(f"Sorting is not supported for field {selector!r}")
    return field.expression
