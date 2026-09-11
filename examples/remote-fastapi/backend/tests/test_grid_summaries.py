from dataclasses import replace

import pytest
from sqlalchemy import column, select, table

from app.grid.fields import (
    CUSTOMER_GRID_FIELDS,
    GridField,
    GridQueryError,
    GridValueType,
)
from app.grid.models import GridSummaryDescriptor
from app.grid.summaries import build_total_summary_expressions


def descriptor(summary_type, selector="age"):
    return GridSummaryDescriptor(summary_type=summary_type, selector=selector)


def test_pure_builder_uses_supplied_registry_and_fixed_ordered_expressions():
    fixture = table("fixture", column("value"))
    fields = {
        "amount": GridField(
            fixture.c.value,
            GridValueType.INTEGER,
            summary_types=frozenset({"count", "sum", "avg", "min", "max"}),
        )
    }
    items = [
        descriptor(kind, "amount")
        for kind in ["max", "count", "avg", "min", "sum", "max"]
    ]
    expressions = build_total_summary_expressions(items, fields)
    assert len(expressions) == 6
    assert [str(expr) for expr in expressions] == [
        "max(fixture.value)",
        "count(*)",
        "avg(fixture.value)",
        "min(fixture.value)",
        "coalesce(sum(fixture.value), :coalesce_1)",
        "max(fixture.value)",
    ]
    assert expressions[0] is not expressions[-1]
    assert str(select(*expressions).select_from(fixture)).count("max(") == 2


@pytest.mark.parametrize("selector", list(CUSTOMER_GRID_FIELDS))
def test_count_always_counts_rows_after_resolving_selector(selector):
    expressions = build_total_summary_expressions(
        [descriptor("count", selector)], CUSTOMER_GRID_FIELDS
    )
    assert str(expressions[0]) == "count(*)"


def test_selector_less_count_and_limit():
    item = GridSummaryDescriptor(summary_type="count")
    assert str(build_total_summary_expressions([item], {})[0]) == "count(*)"
    assert build_total_summary_expressions([], {}) == []
    assert len(build_total_summary_expressions([item] * 32, {})) == 32
    with pytest.raises(GridQueryError, match="32"):
        build_total_summary_expressions([item] * 33, {})


@pytest.mark.parametrize(
    "selector",
    ["age; DROP TABLE customer", "__dict__", "customer.age", "password_hash", " age "],
)
@pytest.mark.parametrize("summary_type", ["count", "sum", "avg", "min", "max"])
def test_hostile_or_unknown_selectors_fail_closed(selector, summary_type):
    with pytest.raises(GridQueryError, match="summary selector"):
        build_total_summary_expressions(
            [descriptor(summary_type, selector)], CUSTOMER_GRID_FIELDS
        )


@pytest.mark.parametrize(
    "selector", ["name", "company", "city", "country", "active", "joined_on"]
)
@pytest.mark.parametrize("summary_type", ["sum", "avg", "min", "max"])
def test_unsupported_field_aggregate_combinations(selector, summary_type):
    with pytest.raises(GridQueryError, match="not supported"):
        build_total_summary_expressions(
            [descriptor(summary_type, selector)], CUSTOMER_GRID_FIELDS
        )


def test_summary_capability_is_independent_and_default_deny():
    original = CUSTOMER_GRID_FIELDS["age"]
    fields = {"age": replace(original, sortable=False, filterable=False)}
    assert len(build_total_summary_expressions([descriptor("avg")], fields)) == 1
    fields["age"] = replace(original, summary_types=frozenset())
    with pytest.raises(GridQueryError, match="not supported"):
        build_total_summary_expressions([descriptor("count")], fields)


@pytest.mark.parametrize(
    "raw",
    [
        {"selector": "age", "summary_type": "custom"},
        {"selector": "age", "summary_type": "__dict__"},
        {"selector": "age", "summary_type": "sum(age)"},
        {"summary_type": "sum"},
        {"summary_type": "count", "selector": None},
        {"summary_type": "count", "selector": ""},
        {"selector": "age"},
        {"summary_type": "count", "selector": lambda: "id"},
    ],
)
def test_builder_revalidates_bypassed_model_construction(raw):
    with pytest.raises(GridQueryError, match="descriptor"):
        build_total_summary_expressions(
            [GridSummaryDescriptor.model_construct(**raw)], CUSTOMER_GRID_FIELDS
        )


@pytest.mark.parametrize("item", [None, {}, {"summaryType": "count"}, "age", 42])
def test_builder_requires_typed_descriptors(item):
    with pytest.raises(GridQueryError, match="descriptor"):
        build_total_summary_expressions([item], CUSTOMER_GRID_FIELDS)
