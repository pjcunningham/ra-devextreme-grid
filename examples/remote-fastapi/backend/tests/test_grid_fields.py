import pytest

from app.grid.fields import (
    CUSTOMER_GRID_FIELDS,
    GridQueryError,
    get_customer_sort_column,
)


def test_customer_grid_fields_all_resolve():
    expected_fields = [
        "id",
        "name",
        "company",
        "city",
        "country",
        "active",
        "age",
        "joined_on",
    ]
    for field_name in expected_fields:
        column = get_customer_sort_column(field_name)
        assert column is not None
        assert column == CUSTOMER_GRID_FIELDS[field_name]


def test_unknown_field_rejected():
    with pytest.raises(GridQueryError, match="Unknown or unsupported sort selector"):
        get_customer_sort_column("password_hash")

    with pytest.raises(GridQueryError, match="Unknown or unsupported sort selector"):
        get_customer_sort_column("non_existent_column")


def test_sql_injection_payload_rejected():
    payloads = [
        "name; DROP TABLE customer",
        "1 OR 1=1",
        "name UNION SELECT * FROM customer",
        "id;--",
    ]
    for payload in payloads:
        with pytest.raises(
            GridQueryError, match="Unknown or unsupported sort selector"
        ):
            get_customer_sort_column(payload)


def test_dunder_selector_rejected():
    dunders = ["__class__", "__dict__", "__doc__", "__init__"]
    for dunder in dunders:
        with pytest.raises(
            GridQueryError, match="Unknown or unsupported sort selector"
        ):
            get_customer_sort_column(dunder)


def test_dotted_selector_rejected():
    dotted_selectors = ["customer.name", "company.name", "Customer.id", "self.name"]
    for dotted in dotted_selectors:
        with pytest.raises(
            GridQueryError, match="Unknown or unsupported sort selector"
        ):
            get_customer_sort_column(dotted)
