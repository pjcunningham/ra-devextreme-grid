from dataclasses import dataclass
from enum import Enum
from typing import Any

from sqlalchemy.sql.elements import ColumnElement

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


CUSTOMER_GRID_FIELDS: dict[str, GridField] = {
    "id": GridField(Customer.id, GridValueType.INTEGER),
    "name": GridField(Customer.name, GridValueType.STRING),
    "company": GridField(Customer.company, GridValueType.STRING),
    "city": GridField(Customer.city, GridValueType.STRING),
    "country": GridField(Customer.country, GridValueType.STRING),
    "active": GridField(Customer.active, GridValueType.BOOLEAN),
    "age": GridField(Customer.age, GridValueType.INTEGER, nullable=True),
    "joined_on": GridField(Customer.joined_on, GridValueType.DATE),
}


def get_customer_sort_column(selector: str) -> ColumnElement:
    """Resolve a client selector string against the Customer grid field whitelist."""
    if selector not in CUSTOMER_GRID_FIELDS:
        raise GridQueryError(f"Unknown or unsupported sort selector: {selector!r}")
    field = CUSTOMER_GRID_FIELDS[selector]
    if not field.sortable:
        raise GridQueryError(f"Sorting is not supported for field {selector!r}")
    return field.expression
