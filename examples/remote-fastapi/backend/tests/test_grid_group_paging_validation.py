from copy import deepcopy
from dataclasses import replace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from test_grid_group_paging import collapsed, groups, load, options
from test_grid_grouping import CUSTOMERS
from test_grid_grouping import grouped_session as grouped_session
from test_grid_summary_execution import capture_selects

from app.grid.fields import CUSTOMER_GRID_FIELDS, GridQueryError
from app.grid.models import (
    GridGroupDescriptor,
    GridGroupItem,
    GridGroupPagingContext,
    GridLoadOptions,
    GridResponse,
)
from app.grid.query import execute_customer_grid_query
from app.main import create_app

INVALID_OPTIONS = [
    {"groupPagingContext": None},
    {"groupPagingContext": {}},
    {"groupPagingContext": {"group": [], "filter": None}},
    {"groupPagingContext": {"group": groups("country")}},
    {"groupPagingContext": {"group": None, "filter": None}},
    {"groupPagingContext": {"group": "country", "filter": None}},
    {"groupPagingContext": {"group": groups("country"), "filter": None, "path": []}},
    {"groupPagingContext": {"group": groups("country", "country"), "filter": None}},
    {
        "groupPagingContext": {
            "group": groups("country", "company", "city", "age", "id"),
            "filter": None,
        }
    },
    {
        "groupPagingContext": {
            "group": [{**groups("country")[0], "isExpanded": True}],
            "filter": None,
        }
    },
    {
        "groupPagingContext": {
            "group": [{**groups("country")[0], "isExpanded": 0}],
            "filter": None,
        }
    },
    {
        "groupPagingContext": {
            "group": [{**groups("country")[0], "groupInterval": "year"}],
            "filter": None,
        }
    },
    {"groupPagingContext": {"group": groups("country", "__class__"), "filter": None}},
    {"group": []},
    {"group": groups("country", "company")},
    {"group": [{**groups("country")[0], "isExpanded": True}]},
    {"group": [{**groups("country")[0], "groupInterval": "year"}]},
    {"group": groups("company")},
    {"group": groups("country", desc=True)},
    {"group": groups("unknown")},
    {"group": None},
    {"group": None, "filter": ["country", "=", "UK"]},
    {
        "group": None,
        "filter": [["country", "=", "UK"], ["company", "=", "Acme"]],
        "requireGroupCount": True,
    },
    {"group": groups("company"), "filter": ["city", "=", "London"]},
    {"group": groups("company"), "filter": ["country", "UK"]},
    {"group": groups("company"), "filter": ["country", "<>", "UK"]},
    {"group": groups("company"), "filter": ["country", "=", None]},
    {"group": groups("company"), "filter": ["country", "=", 1]},
    {"group": groups("company"), "filter": ["country", "=", True]},
    {"group": groups("company"), "filter": ["country", "=", "x" * 1025]},
    {"group": None, "filter": [["company", "=", "Acme"], ["country", "=", "UK"]]},
    {"group": None, "filter": [["country", "=", "UK"], ["country", "=", "UK"]]},
    {
        "group": groups("company"),
        "filter": [["country", "=", "UK"], ["company", "=", "Acme"]],
    },
    {"filter": ["active", "=", True]},
    {"filter": [["country", "=", "UK"], "or", ["company", "=", "Acme"]]},
    {"filter": [["country", "=", "UK"], "and"]},
    {
        "filter": [
            ["country", "=", "UK"],
            "and",
            ["active", "=", True],
            "or",
            ["active", "=", False],
        ]
    },
    {"filter": ["!", ["country", "=", "UK"]]},
    {"filter": ["country", "<", "UK"]},
    {"sort": [{"selector": "age", "desc": False, "isExpanded": False}]},
    {"sort": groups("country")},
    {"sort": [{"selector": "country", "desc": False, "isExpanded": True}]},
    {"sort": [{"selector": "id", "desc": "false"}]},
    {"sort": [{"selector": "id", "desc": 0}]},
    {"sort": [{"selector": "id"}]},
    {"sort": [{"selector": "unknown", "desc": False}]},
    {"sort": [{"selector": "id", "desc": False, "groupInterval": 1}]},
    {"groupSummary": [{"selector": "country", "summaryType": "sum"}]},
    {"groupSummary": [{"summaryType": "custom"}]},
    {"groupSummary": [{"summaryType": "count"}] * 33},
    {"totalSummary": [{"selector": "unknown", "summaryType": "count"}]},
    {"totalSummary": [{"summaryType": "sum"}]},
    {"totalSummary": [{"summaryType": "count"}] * 33},
]


@pytest.mark.parametrize("invalid", INVALID_OPTIONS)
def test_malformed_native_combinations_rejected_with_zero_sql(grouped_session, invalid):
    request = options(
        "country",
        "company",
        requireTotalCount=True,
        requireGroupCount=True,
        totalSummary=[{"summaryType": "count"}],
    )
    request.update(deepcopy(invalid))
    with TestClient(create_app(grouped_session.get_bind())) as client:
        with capture_selects(grouped_session.get_bind()) as (statements, executed):
            response = client.post("/api/customers/grid", json={"loadOptions": request})
    assert response.status_code == 422, response.text
    assert statements == executed == []


@pytest.mark.parametrize("key", ["skip", "take"])
@pytest.mark.parametrize("value", [None, True, False, "1", 1.0, -1, [], {}])
def test_explicit_paging_is_strict_before_sql(grouped_session, key, value):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(ValidationError):
            load(grouped_session, options("country", **{key: value}))
    assert statements == executed == []


@pytest.mark.parametrize("value", [0, 101, 2**63])
def test_take_bounds_before_sql(grouped_session, value):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(ValidationError):
            load(grouped_session, options("country", take=value))
    assert statements == executed == []


@pytest.mark.parametrize("key", ["requireTotalCount", "requireGroupCount"])
@pytest.mark.parametrize("value", [None, 0, 1, "true", "false"])
def test_context_count_flags_are_strict(grouped_session, key, value):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(ValidationError):
            load(grouped_session, options("country", **{key: value}))
    assert statements == executed == []


@pytest.mark.parametrize(
    "change",
    [
        {"filter": ["country", ">", "UK"]},
        {"filter": ["country", "<=", "UK"]},
        {"filter": ["company", "<", "Acme"]},
        {"filter": [["country", "<", "UK"], "or", ["company", "=", None]]},
        {"filter": [["country", "<", "UK"], "or", ["country", "=", "DE"]]},
        {"filter": [["country", "<", "UK"], "and", ["country", "=", None]]},
        {"filter": ["country", "<", None]},
        {"filter": ["country", "<", 2]},
        {"take": 2},
        {"skip": 1},
        {"requireTotalCount": True},
        {"requireGroupCount": False},
    ],
)
def test_rank_grammar_and_probe_flags_are_narrow(grouped_session, change):
    request = options(
        "country",
        filter=["country", "<", "UK"],
        take=1,
        requireTotalCount=False,
        requireGroupCount=True,
    )
    request.update(change)
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            load(grouped_session, request)
    assert statements == executed == []


@pytest.mark.parametrize(
    "selector,value",
    [
        ("joined_on", "2024-1-02"),
        ("joined_on", "2024-02-30"),
        ("joined_on", "2024-01-02T00:00:00Z"),
        ("joined_on", 20240102),
        ("age", True),
        ("age", "20"),
        ("age", 2**63),
        ("active", 1),
        ("active", "true"),
        ("active", None),
    ],
)
def test_native_bound_path_values_use_strict_registry_types(
    grouped_session, selector, value
):
    request = options(
        selector,
        "company",
        group=groups("company"),
        filter=[selector, "=", value],
        requireTotalCount=True,
    )
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            load(grouped_session, request)
    assert statements == executed == []


@pytest.mark.parametrize(
    "user_filter,native",
    [
        (["active", "=", True], None),
        (["active", "=", True], ["active", "=", 1]),
        ([["active", "=", True], ["active", "=", True]], ["active", "=", True]),
        ([["active", "=", True], "or", ["id", "=", 1]], ["active", "=", True]),
        (["country", "<", "UK"], ["country", "<", "UK"]),
        (["unknown", "=", 1], ["unknown", "=", 1]),
        (["active", "=", "true"], ["active", "=", "true"]),
    ],
)
def test_user_filter_cannot_be_dropped_coerced_or_broadened(
    grouped_session, user_filter, native
):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            load(
                grouped_session,
                options("country", user_filter=user_filter, filter=native),
            )
    assert statements == executed == []


@pytest.mark.parametrize("kind", ["depth", "nodes"])
def test_native_filter_complexity_bounded_before_sql(grouped_session, kind):
    expression = ["country", "=", "UK"]
    if kind == "depth":
        for _ in range(17):
            expression = [expression]
    else:
        expression = [expression] * 201
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError, match="complexity"):
            load(
                grouped_session,
                options(
                    "country", "company", group=groups("company"), filter=expression
                ),
            )
    assert statements == executed == []


@pytest.mark.parametrize(
    "capability,selector",
    [
        ("groupable", "company"),
        ("sortable", "age"),
        ("filterable", "active"),
    ],
)
def test_all_configured_fields_use_registry_capabilities(
    grouped_session, monkeypatch, capability, selector
):
    monkeypatch.setitem(
        CUSTOMER_GRID_FIELDS,
        selector,
        replace(CUSTOMER_GRID_FIELDS[selector], **{capability: False}),
    )
    request = options(
        "country",
        "company",
        user_filter=["active", "=", True],
        sort=[{"selector": "age", "desc": False}],
        requireTotalCount=True,
    )
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            load(grouped_session, request)
    assert statements == executed == []


@pytest.mark.parametrize(
    "invalid",
    [
        {"skip": True},
        {"take": None},
        {"take": 101},
        {"require_total_count": "true"},
        {
            "group_paging_context": GridGroupPagingContext.model_construct(
                group=[], filter=None
            )
        },
        {
            "group_paging_context": GridGroupPagingContext.model_construct(
                group=[
                    GridGroupDescriptor.model_construct(
                        selector="country", desc=False, is_expanded=True
                    )
                ],
                filter=None,
            )
        },
        {
            "group": [
                GridGroupDescriptor.model_construct(
                    selector="country", desc=False, is_expanded=True
                )
            ]
        },
        {"sort": [{"selector": "id", "desc": False, "isExpanded": False}]},
    ],
)
def test_model_construct_bypasses_are_revalidated_before_sql(grouped_session, invalid):
    values = dict(
        group_paging_context=GridGroupPagingContext.model_validate(
            {"group": groups("country"), "filter": None}
        ),
        group=[GridGroupDescriptor.model_validate(groups("country")[0])],
        skip=0,
        take=1,
        require_total_count=True,
    )
    values.update(invalid)
    request = GridLoadOptions.model_construct(**values)
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(grouped_session, request)
    assert statements == executed == []


@pytest.mark.parametrize("count", [None, True, False, -1, 1.0, "1", float("inf")])
@pytest.mark.parametrize("items", [None, []])
def test_response_count_is_optional_but_strict_when_supplied(count, items):
    with pytest.raises(ValidationError):
        GridGroupItem(key="UK", items=items, count=count)


@pytest.mark.parametrize("count", [0, 1, 100000])
def test_collapsed_and_expanded_response_count_shapes(count):
    assert GridGroupItem(key="UK", items=None, count=count).model_dump(
        exclude_unset=True
    ) == collapsed("UK", count)
    assert GridGroupItem(key="UK", items=[]).model_dump(exclude_unset=True) == {
        "key": "UK",
        "items": [],
    }
    GridGroupItem(key="UK", items=[], count=count)


@pytest.mark.parametrize(
    "data",
    [
        [{"key": "UK"}],
        [{"key": "UK", "items": None}],
        [{"key": "UK", "items": [CUSTOMERS[1], collapsed("Acme", 1)]}],
        [CUSTOMERS[1], collapsed("UK", 1)],
        [GridGroupItem.model_construct(key="UK", items=None, count=-1)],
        [GridGroupItem.model_construct(key="UK", items=None)],
    ],
)
def test_invalid_response_shapes_and_constructed_nodes(data):
    with pytest.raises(ValidationError):
        GridResponse.model_validate({"data": data})


def test_response_validation_is_request_depth_and_mode_aware():
    complete = GridLoadOptions.model_validate(
        {"group": [{**groups("country")[0], "isExpanded": True}, *groups("company")]}
    )
    lazy = GridLoadOptions.model_validate(options("country", "company"))
    leaf = GridLoadOptions.model_validate(
        options("country", group=None, filter=["country", "=", "UK"])
    )
    payload = {"data": [collapsed("UK", 4)]}
    GridResponse.model_validate(payload, context={"load_options": lazy})
    with pytest.raises(ValidationError, match="Complete-tree"):
        GridResponse.model_validate(payload, context={"load_options": complete})
    with pytest.raises(ValidationError, match="leaf depth"):
        GridResponse.model_validate(payload, context={"load_options": leaf})
    tree = {
        "data": [{"key": "UK", "items": [{"key": "Acme", "items": [CUSTOMERS[1]]}]}]
    }
    for request in [complete, lazy]:
        GridResponse.model_validate(tree, context={"load_options": request})
        with pytest.raises(ValidationError, match="configured depth"):
            GridResponse.model_validate(
                {"data": [{"key": "UK", "items": [CUSTOMERS[1]]}]},
                context={"load_options": request},
            )


def test_endpoint_rejects_lazy_result_in_complete_tree_mode(grouped_session):
    with TestClient(
        create_app(grouped_session.get_bind()), raise_server_exceptions=False
    ) as client:
        with patch(
            "app.main.execute_customer_grid_query",
            return_value=(
                [GridGroupItem(key="UK", items=None, count=4)],
                None,
                None,
                None,
            ),
        ):
            response = client.post(
                "/api/customers/grid",
                json={"loadOptions": {"group": groups("country")}},
            )
    assert response.status_code == 500


def test_missing_context_preserves_phase8b_rejections(grouped_session):
    for request in [
        {"group": groups("country"), "skip": 0, "take": 1},
        {"sort": groups("country")},
        {"groupSummary": [{"summaryType": "count"}]},
        {"filter": ["country", "<", "UK"]},
    ]:
        with capture_selects(grouped_session.get_bind()) as (statements, executed):
            with pytest.raises((GridQueryError, ValidationError)):
                load(grouped_session, request)
        assert statements == executed == []
