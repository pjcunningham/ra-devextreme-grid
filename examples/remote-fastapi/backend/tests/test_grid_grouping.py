from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

from app.grid.fields import (
    CUSTOMER_GRID_FIELDS,
    GridField,
    GridQueryError,
    GridValueType,
)
from app.grid.grouping import build_group_expressions
from app.grid.models import GridGroupDescriptor, GridLoadOptions, GridResponse
from app.grid.query import execute_customer_grid_query
from app.main import create_app
from app.models import Customer

ROWS = [
    (1, "UK", "Acme", "London", True, None, 2, "Zed"),
    (2, "uk", "Acme", "london", False, 20, 1, "Amy"),
    (3, "DE", "Beta", "Berlin", True, 0, 1, "Ben"),
    (4, "UK", "Acme", "London", True, 30, 2, "Amy"),
    (5, "UK", "Beta", "York", False, None, 3, "Ben"),
    (6, "US", "Acme", "Austin", True, 40, 1, "Zed"),
    (7, "DE", "Acme", "Berlin", False, 10, 2, "Amy"),
    (8, "uk", "Beta", "York", True, None, 3, "Amy"),
    (9, "UK", "Acme", "London", False, 30, 2, "Amy"),
    (10, "US", "Acme", "Austin", False, 20, 3, "Amy"),
]
CUSTOMERS = {
    id_: {
        "id": id_,
        "country": country,
        "company": company,
        "city": city,
        "active": active,
        "age": age,
        "joined_on": f"2024-01-{day:02}",
        "name": name,
    }
    for id_, country, company, city, active, age, day, name in ROWS
}
AGE_SUMMARIES = [
    {"selector": "age", "summaryType": kind}
    for kind in ["count", "sum", "avg", "min", "max"]
]


def descriptors(*selectors, desc=False, expanded=False):
    return [
        {
            "selector": selector,
            "desc": desc,
            "isExpanded": index < len(selectors) - 1 or expanded,
        }
        for index, selector in enumerate(selectors)
    ]


def leaf(key, ids, summary=None):
    node = {"key": key, "items": [CUSTOMERS[id_] for id_ in ids]}
    if summary is not None:
        node["summary"] = summary
    return node


def parent(key, items, summary=None):
    node = {"key": key, "items": items}
    if summary is not None:
        node["summary"] = summary
    return node


@pytest.fixture
def grouped_session(test_engine):
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        session.add_all(
            Customer(
                **{**customer, "joined_on": date.fromisoformat(customer["joined_on"])}
            )
            for customer in reversed(list(CUSTOMERS.values()))
        )
        session.commit()
        yield session


def load(session, **options):
    data, total_count, summary, group_count = execute_customer_grid_query(
        session, GridLoadOptions.model_validate(options)
    )
    extras = {}
    if total_count is not None:
        extras["total_count"] = total_count
    if summary is not None:
        extras["summary"] = summary
    if group_count is not None:
        extras["group_count"] = group_count
    return GridResponse(data=data, **extras).model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )


@pytest.mark.parametrize("expanded", [False, True])
@pytest.mark.parametrize("desc", [False, True])
def test_single_level_exact_case_identity_and_fixed_ties(
    grouped_session, expanded, desc
):
    expected = [
        leaf("DE", [3, 7]),
        leaf("UK", [1, 4, 5, 9]),
        leaf("uk", [2, 8]),
        leaf("US", [6, 10]),
    ]
    if desc:
        expected = [expected[3], expected[1], expected[2], expected[0]]
    assert load(
        grouped_session, group=descriptors("country", desc=desc, expanded=expanded)
    ) == {"data": expected}


@pytest.mark.parametrize(
    "directions", [(False, False), (False, True), (True, False), (True, True)]
)
@pytest.mark.parametrize("expanded", [False, True])
def test_two_levels_exact_tree_and_ordinary_sort(grouped_session, directions, expanded):
    groups = descriptors("country", "company", expanded=expanded)
    groups[0]["desc"], groups[1]["desc"] = directions
    expected = [
        parent("DE", [leaf("Acme", [7]), leaf("Beta", [3])]),
        parent("UK", [leaf("Acme", [1, 4, 9]), leaf("Beta", [5])]),
        parent("uk", [leaf("Acme", [2]), leaf("Beta", [8])]),
        parent("US", [leaf("Acme", [6, 10])]),
    ]
    if directions[1]:
        for item in expected:
            item["items"].reverse()
    if directions[0]:
        expected = [expected[3], expected[1], expected[2], expected[0]]
    assert load(
        grouped_session,
        group=groups,
        sort=[
            {"selector": "country", "desc": not directions[0]},
            {"selector": "company", "desc": not directions[1]},
            {"selector": "name", "desc": True},
            {"selector": "name", "desc": False},
        ],
    ) == {"data": expected}


def test_four_level_exact_tree(grouped_session):
    expected = [
        parent(
            "DE",
            [
                parent("Acme", [parent(False, [leaf(10, [7])])]),
                parent("Beta", [parent(True, [leaf(0, [3])])]),
            ],
        ),
        parent(
            "UK",
            [
                parent(
                    "Acme",
                    [
                        parent(False, [leaf(30, [9])]),
                        parent(True, [leaf(None, [1]), leaf(30, [4])]),
                    ],
                ),
                parent("Beta", [parent(False, [leaf(None, [5])])]),
            ],
        ),
        parent(
            "uk",
            [
                parent("Acme", [parent(False, [leaf(20, [2])])]),
                parent("Beta", [parent(True, [leaf(None, [8])])]),
            ],
        ),
        parent(
            "US",
            [
                parent(
                    "Acme",
                    [parent(False, [leaf(20, [10])]), parent(True, [leaf(40, [6])])],
                )
            ],
        ),
    ]
    assert load(
        grouped_session, group=descriptors("country", "company", "active", "age")
    ) == {"data": expected}


@pytest.mark.parametrize(
    "selector,expected",
    [
        (
            "age",
            [
                (None, [1, 5, 8]),
                (0, [3]),
                (10, [7]),
                (20, [2, 10]),
                (30, [4, 9]),
                (40, [6]),
            ],
        ),
        ("active", [(False, [2, 5, 7, 9, 10]), (True, [1, 3, 4, 6, 8])]),
        (
            "joined_on",
            [
                ("2024-01-01", [2, 3, 6]),
                ("2024-01-02", [1, 4, 7, 9]),
                ("2024-01-03", [5, 8, 10]),
            ],
        ),
        ("id", [(i, [i]) for i in range(1, 11)]),
        ("name", [("Amy", [2, 4, 7, 8, 9, 10]), ("Ben", [3, 5]), ("Zed", [1, 6])]),
        (
            "city",
            [
                ("Austin", [6, 10]),
                ("Berlin", [3, 7]),
                ("London", [1, 4, 9]),
                ("london", [2]),
                ("York", [5, 8]),
            ],
        ),
        ("company", [("Acme", [1, 2, 4, 6, 7, 9, 10]), ("Beta", [3, 5, 8])]),
    ],
)
@pytest.mark.parametrize("desc", [False, True])
def test_all_key_types_and_explicit_null_order(
    grouped_session, selector, expected, desc
):
    if desc:
        expected = list(reversed(expected))
        if selector == "city":
            expected[1], expected[2] = expected[2], expected[1]
    response = load(
        grouped_session, group=descriptors(selector, desc=desc), requireGroupCount=True
    )
    assert response == {
        "data": [leaf(key, ids) for key, ids in expected],
        "groupCount": len(expected),
    }
    assert [type(node["key"]) for node in response["data"]] == [
        type(key) for key, _ in expected
    ]


def test_group_summary_full_paths_nulls_duplicates_and_independent_totals(
    grouped_session,
):
    summaries = [AGE_SUMMARIES[4], *AGE_SUMMARIES, AGE_SUMMARIES[4]]

    def values(count, sum_, avg, min_, max_):
        return [max_, count, sum_, avg, min_, max_, max_]

    expected = [
        parent(
            "DE",
            [
                leaf("Acme", [7], values(1, 10, 10, 10, 10)),
                leaf("Beta", [3], values(1, 0, 0, 0, 0)),
            ],
            values(2, 10, 5, 0, 10),
        ),
        parent(
            "UK",
            [
                leaf("Acme", [1, 4, 9], values(3, 60, 30, 30, 30)),
                leaf("Beta", [5], values(1, 0, None, None, None)),
            ],
            values(4, 60, 30, 30, 30),
        ),
        parent(
            "uk",
            [
                leaf("Acme", [2], values(1, 20, 20, 20, 20)),
                leaf("Beta", [8], values(1, 0, None, None, None)),
            ],
            values(2, 20, 20, 20, 20),
        ),
        parent(
            "US",
            [leaf("Acme", [6, 10], values(2, 60, 30, 20, 40))],
            values(2, 60, 30, 20, 40),
        ),
    ]
    assert load(
        grouped_session,
        group=descriptors("country", "company"),
        groupSummary=summaries,
        totalSummary=[
            {"selector": "id", "summaryType": kind}
            for kind in ["count", "sum", "avg", "min", "max"]
        ],
        requireTotalCount=True,
        requireGroupCount=True,
    ) == {
        "data": expected,
        "totalCount": 10,
        "groupCount": 4,
        "summary": [10, 55, 5.5, 1, 10],
    }


@pytest.mark.parametrize("selector", [None, *CUSTOMER_GRID_FIELDS])
def test_single_count_descriptor_all_supported_selectors(grouped_session, selector):
    descriptor = {"summaryType": "count"}
    if selector is not None:
        descriptor["selector"] = selector
    assert load(
        grouped_session, group=descriptors("active"), groupSummary=[descriptor]
    ) == {
        "data": [leaf(False, [2, 5, 7, 9, 10], [5]), leaf(True, [1, 3, 4, 6, 8], [5])]
    }


def test_filtered_counts_distinguish_top_groups_and_rows_including_null(
    grouped_session,
):
    assert load(
        grouped_session,
        group=descriptors("age"),
        filter=["active", "=", True],
        groupSummary=AGE_SUMMARIES,
        totalSummary=AGE_SUMMARIES,
        requireTotalCount=True,
        requireGroupCount=True,
    ) == {
        "data": [
            leaf(None, [1, 8], [2, 0, None, None, None]),
            leaf(0, [3], [1, 0, 0, 0, 0]),
            leaf(30, [4], [1, 30, 30, 30, 30]),
            leaf(40, [6], [1, 40, 40, 40, 40]),
        ],
        "totalCount": 5,
        "groupCount": 4,
        "summary": [5, 70, 70 / 3, 0, 40],
    }


def test_filter_remains_case_insensitive_but_groups_exact(grouped_session):
    assert load(
        grouped_session,
        group=descriptors("country"),
        filter=["country", "=", "uk"],
        requireTotalCount=True,
        requireGroupCount=True,
    ) == {
        "data": [leaf("UK", [1, 4, 5, 9]), leaf("uk", [2, 8])],
        "totalCount": 6,
        "groupCount": 2,
    }


def test_empty_filter_result_has_no_groups_and_zero_counts(grouped_session):
    assert load(
        grouped_session,
        group=descriptors("country", "company"),
        filter=["id", ">", 99],
        groupSummary=AGE_SUMMARIES,
        totalSummary=AGE_SUMMARIES,
        requireTotalCount=True,
        requireGroupCount=True,
    ) == {
        "data": [],
        "totalCount": 0,
        "groupCount": 0,
        "summary": [0, 0, None, None, None],
    }


def test_nullable_only_group_counts_as_one(grouped_session):
    assert load(
        grouped_session,
        group=descriptors("age"),
        filter=["age", "=", None],
        requireTotalCount=True,
        requireGroupCount=True,
    ) == {"data": [leaf(None, [1, 5, 8])], "totalCount": 3, "groupCount": 1}


def test_date_keys_match_full_path_summary_lookup(grouped_session):
    assert load(
        grouped_session,
        group=descriptors("joined_on", "active"),
        groupSummary=[{"summaryType": "count"}],
    ) == {
        "data": [
            parent("2024-01-01", [leaf(False, [2], [1]), leaf(True, [3, 6], [2])], [3]),
            parent(
                "2024-01-02", [leaf(False, [7, 9], [2]), leaf(True, [1, 4], [2])], [4]
            ),
            parent(
                "2024-01-03", [leaf(False, [5, 10], [2]), leaf(True, [8], [1])], [3]
            ),
        ]
    }


def test_group_registry_default_deny_and_independent_capabilities():
    assert all(field.groupable for field in CUSTOMER_GRID_FIELDS.values())
    field = GridField(CUSTOMER_GRID_FIELDS["age"].expression, GridValueType.INTEGER)
    assert field.groupable is False
    descriptor = GridGroupDescriptor(selector="age", desc=False, isExpanded=False)
    with pytest.raises(GridQueryError, match="Grouping is not supported"):
        build_group_expressions([descriptor], {"age": field})
    keys, order = build_group_expressions(
        [descriptor],
        {"age": replace(field, groupable=True, sortable=False, filterable=False)},
    )
    assert keys[0] is field.expression
    assert len(order) == 1


def test_http_grouped_tree_has_complete_records_and_omits_inactive_fields(
    grouped_session,
):
    with TestClient(create_app(grouped_session.get_bind())) as client:
        response = client.post(
            "/api/customers/grid",
            json={
                "loadOptions": {
                    "group": descriptors("country", "company"),
                    "groupSummary": [{"summaryType": "count"}],
                }
            },
        )
        assert response.status_code == 200
        assert response.json() == load(
            grouped_session,
            group=descriptors("country", "company"),
            groupSummary=[{"summaryType": "count"}],
        )
