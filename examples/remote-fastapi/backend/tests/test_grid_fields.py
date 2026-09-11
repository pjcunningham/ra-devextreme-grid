from dataclasses import FrozenInstanceError, replace

import pytest

from app.grid.fields import (
    CUSTOMER_GRID_FIELDS,
    GridField,
    GridQueryError,
    GridValueType,
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
        assert column is CUSTOMER_GRID_FIELDS[field_name].expression


def test_registry_metadata():
    assert set(CUSTOMER_GRID_FIELDS) == {
        "id",
        "name",
        "company",
        "city",
        "country",
        "active",
        "age",
        "joined_on",
    }
    expected_types = {
        "id": GridValueType.INTEGER,
        "name": GridValueType.STRING,
        "company": GridValueType.STRING,
        "city": GridValueType.STRING,
        "country": GridValueType.STRING,
        "active": GridValueType.BOOLEAN,
        "age": GridValueType.INTEGER,
        "joined_on": GridValueType.DATE,
    }
    for selector, field in CUSTOMER_GRID_FIELDS.items():
        assert field.value_type is expected_types[selector]
        assert field.nullable is (selector == "age")
        assert field.sortable is True
        assert field.filterable is True
        assert field.summary_types == (
            frozenset({"count", "sum", "avg", "min", "max"})
            if selector in {"id", "age"}
            else frozenset({"count"})
        )
    with pytest.raises(FrozenInstanceError):
        CUSTOMER_GRID_FIELDS["age"].nullable = False


def test_summary_capabilities_default_deny_and_are_immutable():
    field = GridField(CUSTOMER_GRID_FIELDS["age"].expression, GridValueType.INTEGER)
    assert field.summary_types == frozenset()
    with pytest.raises(FrozenInstanceError):
        field.summary_types = frozenset({"count"})


def test_sort_capability_is_independent_of_filter_capability(monkeypatch):
    field = CUSTOMER_GRID_FIELDS["name"]
    monkeypatch.setitem(CUSTOMER_GRID_FIELDS, "name", replace(field, filterable=False))
    assert get_customer_sort_column("name") is field.expression
    monkeypatch.setitem(CUSTOMER_GRID_FIELDS, "name", replace(field, sortable=False))
    with pytest.raises(GridQueryError, match="Sorting is not supported"):
        get_customer_sort_column("name")


@pytest.mark.parametrize("selector", ["name_q", "age_gte", "country_eq"])
def test_managed_filter_suffix_is_not_a_sort_field(selector):
    with pytest.raises(GridQueryError, match="sort selector"):
        get_customer_sort_column(selector)


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
