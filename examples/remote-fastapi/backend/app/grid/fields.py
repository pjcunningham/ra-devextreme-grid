from sqlalchemy.sql.elements import ColumnElement

from app.models import Customer


class GridQueryError(ValueError):
    """Raised when client grid parameters fail business or security validation."""


CUSTOMER_GRID_FIELDS: dict[str, ColumnElement] = {
    "id": Customer.id,
    "name": Customer.name,
    "company": Customer.company,
    "city": Customer.city,
    "country": Customer.country,
    "active": Customer.active,
    "age": Customer.age,
    "joined_on": Customer.joined_on,
}


def get_customer_sort_column(selector: str) -> ColumnElement:
    """Resolve a client selector string against the Customer grid field whitelist."""
    if selector not in CUSTOMER_GRID_FIELDS:
        raise GridQueryError(f"Unknown or unsupported sort selector: {selector!r}")
    return CUSTOMER_GRID_FIELDS[selector]
