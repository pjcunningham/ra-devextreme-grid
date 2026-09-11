from copy import deepcopy
from dataclasses import replace
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import case
from sqlmodel import Session, SQLModel
from test_grid_grouping import AGE_SUMMARIES, CUSTOMERS
from test_grid_grouping import grouped_session as grouped_session
from test_grid_summary_execution import capture_selects

from app.grid import filtering
from app.grid.fields import CUSTOMER_GRID_FIELDS
from app.grid.models import GridLoadOptions, GridResponse
from app.grid.query import execute_customer_grid_query
from app.main import create_app
from app.models import Customer


def groups(*selectors, desc=False):
    return [
        {"selector": selector, "desc": desc, "isExpanded": False}
        for selector in selectors
    ]


def options(*selectors, user_filter=None, **native):
    return {
        "groupPagingContext": {"group": groups(*selectors), "filter": user_filter},
        "filter": deepcopy(user_filter),
        "group": groups(selectors[0]),
        "skip": 0,
        "take": 2,
        **native,
    }


def load(session, request):
    data, count, summary, group_count = execute_customer_grid_query(
        session, GridLoadOptions.model_validate(request)
    )
    response = {"data": data}
    if count is not None:
        response["totalCount"] = count
    if summary is not None:
        response["summary"] = summary
    if group_count is not None:
        response["groupCount"] = group_count
    return GridResponse.model_validate(response).model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )


def collapsed(key, count, summary=None):
    node = {"key": key, "items": None, "count": count}
    if summary is not None:
        node["summary"] = summary
    return node


def test_root_sql_page_counts_summaries_and_serialized_null(grouped_session):
    request = options(
        "country",
        "company",
        skip=1,
        take=2,
        requireTotalCount=True,
        requireGroupCount=True,
        groupSummary=AGE_SUMMARIES,
        totalSummary=AGE_SUMMARIES,
    )
    expected = {
        "data": [
            collapsed("UK", 4, [4, 60, 30, 30, 30]),
            collapsed("uk", 2, [2, 20, 20, 20, 20]),
        ],
        "totalCount": 10,
        "groupCount": 4,
        "summary": [10, 150, 150 / 7, 0, 40],
    }
    with TestClient(create_app(grouped_session.get_bind())) as client:
        with capture_selects(grouped_session.get_bind()) as (statements, executed):
            response = client.post("/api/customers/grid", json={"loadOptions": request})
        assert response.status_code == 200, response.text
        assert response.json() == expected
    assert len(statements) == len(executed) == 4


def test_seed_complete_tree_vs_initial_root_page_response_size(session):
    summaries = [
        {"selector": "id", "summaryType": "count"},
        {"selector": "age", "summaryType": "sum"},
    ]
    shared = {
        "requireTotalCount": True,
        "requireGroupCount": True,
        "groupSummary": summaries,
        "totalSummary": summaries,
    }
    complete_request = {
        **shared,
        "group": [
            {"selector": "country", "desc": False, "isExpanded": True},
            {"selector": "company", "desc": False, "isExpanded": False},
        ],
    }
    lazy_request = options("country", "company", skip=0, take=3, **shared)
    with TestClient(create_app(session.get_bind())) as client:
        with capture_selects(session.get_bind()) as (complete_statements, complete_sql):
            complete_response = client.post(
                "/api/customers/grid", json={"loadOptions": complete_request}
            )
        with capture_selects(session.get_bind()) as (lazy_statements, lazy_sql):
            lazy_response = client.post(
                "/api/customers/grid", json={"loadOptions": lazy_request}
            )
    assert complete_response.status_code == 200, complete_response.text
    assert lazy_response.status_code == 200, lazy_response.text
    complete = complete_response.json()
    lazy = lazy_response.json()
    assert complete["totalCount"] == lazy["totalCount"] == 100
    assert complete["groupCount"] == lazy["groupCount"] == 8
    assert [node["key"] for node in complete["data"]] == [
        "Australia",
        "Brazil",
        "Canada",
        "France",
        "Germany",
        "Japan",
        "UK",
        "USA",
    ]
    records = [
        record
        for country in complete["data"]
        for company in country["items"]
        for record in company["items"]
    ]
    assert len(records) == 100
    assert sorted(record["id"] for record in records) == list(range(1, 101))
    assert (
        complete["summary"]
        == lazy["summary"]
        == [
            100,
            sum(record["age"] or 0 for record in records),
        ]
    )
    assert lazy["data"] == [
        collapsed(node["key"], 10, node["summary"]) for node in complete["data"][:3]
    ]
    assert len(lazy["data"]) == 3
    assert all(node["items"] is None and "id" not in node for node in lazy["data"])
    assert sum(node["count"] for node in lazy["data"]) == 30
    assert len(complete_statements) == len(complete_sql) == 6
    assert len(lazy_statements) == len(lazy_sql) == 4
    complete_bytes = len(complete_response.content)
    lazy_bytes = len(lazy_response.content)
    assert complete_response.content.decode("utf-8") == complete_response.text
    assert lazy_response.content.decode("utf-8") == lazy_response.text
    assert lazy_bytes < complete_bytes
    print(
        f"\n100-customer seed, country/company, id count + age sum: "
        f"complete-tree JSON UTF8 bytes={complete_bytes}, "
        f"returned roots={len(complete['data'])}, groupCount={complete['groupCount']}, "
        f"record nodes={len(records)}, totalCount={complete['totalCount']}, "
        f"SELECTs={len(complete_sql)}; "
        f"initial lazy take3 JSON UTF8 bytes={lazy_bytes}, "
        f"returned roots={len(lazy['data'])}, groupCount={lazy['groupCount']}, "
        f"record nodes=0, totalCount={lazy['totalCount']}, "
        f"represented records={sum(node['count'] for node in lazy['data'])}, "
        f"SELECTs={len(lazy_sql)}"
    )


def test_child_count_probe_and_missing_take(grouped_session):
    request = options(
        "country",
        "company",
        group=groups("company"),
        filter=["country", "=", "UK"],
        requireTotalCount=False,
        requireGroupCount=True,
        take=1,
    )
    assert load(grouped_session, request) == {
        "data": [collapsed("Acme", 3)],
        "groupCount": 2,
    }
    del request["take"]
    assert GridLoadOptions.model_validate(request).take == 100
    assert load(grouped_session, request) == {
        "data": [collapsed("Acme", 3), collapsed("Beta", 1)],
        "groupCount": 2,
    }


def test_leaf_native_sort_copied_summaries_and_scoped_count(grouped_session):
    request = options(
        "country",
        "company",
        user_filter=["active", "=", True],
        group=None,
        filter=[
            ["country", "=", "UK"],
            "and",
            ["company", "=", "Acme"],
            "and",
            ["active", "=", True],
        ],
        sort=[*groups("country", "company"), {"selector": "age", "desc": True}],
        groupSummary=AGE_SUMMARIES,
        totalSummary=AGE_SUMMARIES,
        requireGroupCount=False,
        requireTotalCount=False,
        take=1,
    )
    del request["skip"]
    original = deepcopy(request)
    assert load(grouped_session, request) == {
        "data": [CUSTOMERS[4]],
        "summary": [5, 70, 70 / 3, 0, 40],
    }
    assert request == original
    request.update(skip=0, take=1, requireTotalCount=True)
    assert load(grouped_session, request)["totalCount"] == 2


@pytest.mark.parametrize("descending,expected", [(False, "DE"), (True, "US")])
def test_native_rank_probe(grouped_session, descending, expected):
    request = options(
        "country",
        user_filter=["active", "=", True],
        group=groups("country", desc=descending),
        filter=[
            (
                ["country", ">", "UK"]
                if descending
                else [["country", "<", "UK"], "or", ["country", "=", None]]
            ),
            "and",
            ["active", "=", True],
        ],
        take=1,
        requireTotalCount=False,
        requireGroupCount=True,
    )
    request["groupPagingContext"]["group"] = groups("country", desc=descending)
    assert load(grouped_session, request) == {
        "data": [collapsed(expected, 1)],
        "groupCount": 1,
    }


@pytest.mark.parametrize(
    "user_filter,native,expected_summary",
    [
        (
            ["country", "=", "UK"],
            [["country", "=", "UK"], "and", ["country", "=", "UK"]],
            [6, 80, 80 / 3, 20, 30],
        ),
        (
            [["country", "=", "UK"], "and", ["active", "=", True]],
            [["country", "=", "UK"], ["active", "=", True], ["country", "=", "UK"]],
            [3, 30, 30, 30, 30],
        ),
        (
            [[["active", "=", True]], "and", ["active", "=", True]],
            [
                ["country", "=", "UK"],
                "and",
                [["active", "=", True], "and", ["active", "=", True]],
            ],
            [5, 70, 70 / 3, 0, 40],
        ),
        (
            [["active", "=", True], "or", ["id", "=", 1]],
            [
                [["active", "=", True], "or", ["id", "=", 1]],
                "and",
                ["country", "=", "UK"],
            ],
            [5, 70, 70 / 3, 0, 40],
        ),
    ],
)
def test_strip_known_conjuncts_without_mutation_and_compile_once(
    grouped_session,
    user_filter,
    native,
    expected_summary,
):
    request = options(
        "country",
        user_filter=user_filter,
        group=None,
        filter=native,
        take=100,
        requireTotalCount=True,
        totalSummary=AGE_SUMMARIES,
    )
    original = deepcopy(request)
    with patch(
        "app.grid.query.compile_filter_expression",
        wraps=filtering.compile_filter_expression,
    ) as compiler:
        response = load(grouped_session, request)
    compiler.assert_called_once_with(user_filter, CUSTOMER_GRID_FIELDS)
    assert request == original
    ids = [1, 4, 5, 9] if user_filter == ["country", "=", "UK"] else [1, 4]
    assert response["data"] == [CUSTOMERS[id_] for id_ in ids]
    assert response["totalCount"] == len(ids)
    assert response["summary"] == expected_summary


def test_ambiguous_native_leaf_count_is_resolved_by_configured_context(grouped_session):
    grouped_session.add(
        Customer(
            id=11,
            name="Lower",
            country="UK",
            company="acme",
            city="London",
            active=True,
            age=5,
            joined_on=date(2024, 1, 2),
        )
    )
    grouped_session.commit()
    native = dict(
        group=None,
        filter=[["country", "=", "UK"], "and", ["company", "=", "Acme"]],
        skip=0,
        take=1,
        requireTotalCount=True,
        requireGroupCount=False,
    )
    single = load(
        grouped_session,
        options("country", user_filter=["company", "=", "Acme"], **native),
    )
    nested = load(grouped_session, options("country", "company", **native))
    assert single["totalCount"] == 4
    assert nested["totalCount"] == 3
    assert single["data"] == nested["data"] == [CUSTOMERS[1]]


@pytest.mark.parametrize(
    "descending,boundary,expected,count",
    [
        (False, "UK", "DE", 1),
        (False, "uk", "DE", 2),
        (True, "UK", "US", 1),
        (True, "uk", "US", 2),
    ],
)
def test_rank_uses_lowercase_order_and_binary_ascending_ties(
    grouped_session,
    monkeypatch,
    descending,
    boundary,
    expected,
    count,
):
    field = CUSTOMER_GRID_FIELDS["country"]
    monkeypatch.setitem(
        CUSTOMER_GRID_FIELDS,
        "country",
        replace(field, expression=field.expression.collate("NOCASE")),
    )
    request = options(
        "country",
        group=groups("country", desc=descending),
        take=1,
        filter=["country", ">" if descending else "<", boundary],
        requireTotalCount=False,
        requireGroupCount=True,
    )
    request["groupPagingContext"]["group"] = groups("country", desc=descending)
    assert load(grouped_session, request) == {
        "data": [collapsed(expected, 2)],
        "groupCount": count,
    }


def test_child_rank_and_exact_case_scope(grouped_session):
    request = options(
        "country",
        "company",
        group=groups("company"),
        take=1,
        filter=[
            ["country", "=", "UK"],
            "and",
            [["company", "<", "Beta"], "or", ["company", "=", None]],
        ],
        requireTotalCount=False,
        requireGroupCount=True,
    )
    assert load(grouped_session, request) == {
        "data": [collapsed("Acme", 3)],
        "groupCount": 1,
    }
    request["filter"][0][2] = "uk"
    assert load(grouped_session, request) == {
        "data": [collapsed("Acme", 1)],
        "groupCount": 1,
    }


@pytest.mark.parametrize("depth", [0, 1, 2, 3, 4])
def test_null_scope_at_every_level_including_leaf(grouped_session, monkeypatch, depth):
    selectors = ["age", "country", "company", "joined_on"]
    for selector in selectors[1:]:
        field = CUSTOMER_GRID_FIELDS[selector]
        monkeypatch.setitem(
            CUSTOMER_GRID_FIELDS,
            selector,
            replace(
                field,
                expression=case((Customer.age.is_(None), None), else_=field.expression),
                nullable=True,
            ),
        )
    path = [[selector, "=", None] for selector in selectors[:depth]]
    request = options(
        *selectors,
        group=groups(selectors[depth]) if depth < 4 else None,
        filter=path or None,
        requireGroupCount=depth < 4,
        requireTotalCount=True,
        groupSummary=AGE_SUMMARIES,
        take=1,
    )
    response = load(grouped_session, request)
    assert response["totalCount"] == (10 if depth == 0 else 3)
    if depth == 4:
        assert response["data"] == [CUSTOMERS[1]]
        assert "groupCount" not in response
    else:
        assert response["data"] == [collapsed(None, 3, [3, 0, None, None, None])]
        assert response["groupCount"] == (6 if depth == 0 else 1)


@pytest.mark.parametrize(
    "descending,boundary,expected_count,expected",
    [
        (False, 20, 3, None),
        (True, 20, 2, 40),
        (False, None, 0, "empty"),
        (True, None, 5, 40),
    ],
)
def test_null_rank_order(
    grouped_session, descending, boundary, expected_count, expected
):
    rank = ["age", ">" if descending else "<", boundary]
    if boundary is not None and not descending:
        rank = [rank, "or", ["age", "=", None]]
    request = options(
        "age",
        group=groups("age", desc=descending),
        filter=rank,
        skip=0,
        take=1,
        requireTotalCount=False,
        requireGroupCount=True,
    )
    request["groupPagingContext"]["group"] = groups("age", desc=descending)
    response = load(grouped_session, request)
    assert response["groupCount"] == expected_count
    assert response["data"] == (
        []
        if expected == "empty"
        else [collapsed(expected, 3 if expected is None else 1)]
    )


def test_date_groups_paths_and_rank_are_bound_date_values(grouped_session):
    root = options("joined_on", "country", take=1, skip=1, requireGroupCount=True)
    assert load(grouped_session, root) == {
        "data": [collapsed("2024-01-02", 4)],
        "groupCount": 3,
    }
    child = options(
        "joined_on",
        "country",
        group=groups("country"),
        take=100,
        filter=["joined_on", "=", "2024-01-02"],
        requireGroupCount=True,
    )
    assert load(grouped_session, child) == {
        "data": [collapsed("DE", 1), collapsed("UK", 3)],
        "groupCount": 2,
    }
    leaf = options(
        "joined_on",
        "country",
        group=None,
        take=100,
        filter=[["joined_on", "=", "2024-01-02"], ["country", "=", "UK"]],
    )
    assert load(grouped_session, leaf) == {"data": [CUSTOMERS[i] for i in [1, 4, 9]]}
    rank = options(
        "joined_on",
        take=1,
        requireTotalCount=False,
        requireGroupCount=True,
        filter=["joined_on", "<", "2024-01-02"],
    )
    with capture_selects(grouped_session.get_bind()) as (_, executed):
        assert load(grouped_session, rank) == {
            "data": [collapsed("2024-01-01", 3)],
            "groupCount": 1,
        }
    assert all(
        "2024-01-02" not in sql and "2024-01-02" in params for sql, params in executed
    )


@pytest.mark.parametrize("scope", ["root", "child", "leaf", "rank"])
def test_original_filter_compiler_once_in_every_native_scope(grouped_session, scope):
    user_filter = [["active", "=", True], "and", ["id", ">", 0]]
    native = {
        "root": {},
        "child": {
            "group": groups("company"),
            "filter": [["country", "=", "UK"], "and", user_filter],
        },
        "leaf": {
            "group": None,
            "requireGroupCount": False,
            "filter": [["country", "=", "UK"], ["company", "=", "Acme"], user_filter],
        },
        "rank": {
            "requireTotalCount": False,
            "filter": [
                [["country", "<", "UK"], "or", ["country", "=", None]],
                "and",
                user_filter,
            ],
        },
    }[scope]
    request = options(
        "country",
        "company",
        user_filter=user_filter,
        take=1,
        requireTotalCount=True,
        requireGroupCount=True,
        totalSummary=AGE_SUMMARIES,
        groupSummary=AGE_SUMMARIES,
    )
    request.update(native)
    with patch(
        "app.grid.query.compile_filter_expression",
        wraps=filtering.compile_filter_expression,
    ) as compiler:
        load(grouped_session, request)
    compiler.assert_called_once_with(user_filter, CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("width", [3, 125])
@pytest.mark.parametrize("total_count", [False, True])
@pytest.mark.parametrize("group_count", [False, True])
@pytest.mark.parametrize("total_summary", [False, True])
@pytest.mark.parametrize("group_summary", [False, True])
def test_group_sql_budget_columns_predicate_and_page_independent_of_cardinality(
    test_engine,
    width,
    total_count,
    group_count,
    total_summary,
    group_summary,
):
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        session.add_all(
            Customer(
                name=f"Person {i}",
                country="Scope",
                company=f"C{i:03}",
                city="City",
                active=True,
                age=10,
                joined_on=date(2024, 1, 1),
            )
            for i in range(width)
            for _ in range(i % 3 + 1)
        )
        session.commit()
        request = options(
            "country",
            "company",
            user_filter=["active", "=", True],
            group=groups("company"),
            skip=1,
            take=2,
            filter=[["country", "=", "Scope"], "and", ["active", "=", True]],
            requireTotalCount=total_count,
            requireGroupCount=group_count,
            totalSummary=AGE_SUMMARIES if total_summary else [],
            groupSummary=AGE_SUMMARIES if group_summary else [],
        )
        with capture_selects(test_engine) as (statements, executed):
            response = load(session, request)
        assert (
            len(statements)
            == len(executed)
            == 1 + total_count + group_count + total_summary
        )
        assert response["data"] == [
            collapsed("C001", 2, [2, 20, 10, 10, 10] if group_summary else None),
            collapsed("C002", 3, [3, 30, 10, 10, 10] if group_summary else None),
        ]
        if total_count:
            assert response["totalCount"] == sum(i % 3 + 1 for i in range(width))
        if group_count:
            assert response["groupCount"] == width
        data = statements[-1]
        assert len(data.selected_columns) == 2 + (5 if group_summary else 0)
        assert len(data._group_by_clauses) == 1
        assert len(data._order_by_clauses) == 2
        assert data._offset_clause.value == 1
        assert data._limit_clause.value == 2
        assert "Scope" not in executed[-1][0] and "Scope" in executed[-1][1]
        assert 'country COLLATE "BINARY"' in executed[-1][0]
        assert 'company COLLATE "BINARY"' in executed[-1][0]
        assert "customer.active" in executed[-1][0]
        assert "LIMIT ? OFFSET ?" in executed[-1][0]
        assert executed[-1][1][-2:] == (2, 1)
        assert "customer.name" not in executed[-1][0]
        if group_count:
            grouped = statements[-2].get_final_froms()[0].element
            assert len(grouped._group_by_clauses) == 1
            assert grouped._where_criteria[0] is data._where_criteria[0]
        if total_summary:
            global_statement = statements[int(total_count)]
            assert "country" not in str(global_statement)
        if total_count:
            assert statements[0]._where_criteria[0] is data._where_criteria[0]


def test_leaf_sql_page_order_budget_and_global_summary(grouped_session):
    request = options(
        "country",
        "company",
        user_filter=["country", "=", "uk"],
        group=None,
        skip=1,
        take=1,
        requireTotalCount=True,
        requireGroupCount=False,
        groupSummary=AGE_SUMMARIES,
        totalSummary=AGE_SUMMARIES,
        sort=[*groups("country", "company"), {"selector": "name", "desc": False}],
        filter=[
            ["country", "=", "UK"],
            ["company", "=", "Acme"],
            ["country", "=", "uk"],
        ],
    )
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        assert load(grouped_session, request) == {
            "data": [CUSTOMERS[9]],
            "totalCount": 3,
            "summary": [6, 80, 80 / 3, 20, 30],
        }
    assert len(statements) == len(executed) == 3
    assert list(statements[-1].selected_columns.keys()) == [
        "name",
        "company",
        "city",
        "country",
        "active",
        "age",
        "joined_on",
        "id",
    ]
    assert statements[-1]._where_criteria[0] is statements[0]._where_criteria[0]
    assert [str(clause) for clause in statements[-1]._order_by_clauses] == [
        "customer.country ASC",
        "customer.company ASC",
        "customer.name ASC",
        "customer.id ASC",
    ]
    assert executed[-1][1][-2:] == (1, 1)
    assert "LIMIT ? OFFSET ?" in executed[-1][0]
    assert "company" not in str(statements[1])


@pytest.mark.parametrize("scope", ["root", "child", "leaf"])
def test_empty_and_past_end_pages_keep_scope_counts_and_global_totals(
    grouped_session, scope
):
    request = options(
        "country",
        "company",
        skip=99,
        take=2,
        requireTotalCount=True,
        requireGroupCount=scope != "leaf",
        totalSummary=AGE_SUMMARIES,
    )
    if scope != "root":
        request.update(
            group=groups("company") if scope == "child" else None,
            filter=[["country", "=", "UK"]],
        )
    if scope == "leaf":
        request["filter"].append(["company", "=", "Acme"])
    response = load(grouped_session, request)
    assert response["data"] == []
    assert response["totalCount"] == {"root": 10, "child": 4, "leaf": 3}[scope]
    assert response["summary"] == [10, 150, 150 / 7, 0, 40]
    if scope != "leaf":
        assert response["groupCount"] == (4 if scope == "root" else 2)
    user_filter = ["id", ">", 99]
    request["groupPagingContext"]["filter"] = user_filter
    request["filter"] = (
        [request["filter"], "and", user_filter] if request["filter"] else user_filter
    )
    response = load(grouped_session, request)
    assert response["data"] == []
    assert response["totalCount"] == 0
    assert response["summary"] == [0, 0, None, None, None]
    if scope != "leaf":
        assert response["groupCount"] == 0


def test_omitted_child_take_is_bounded_in_sql(test_engine):
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        session.add_all(
            Customer(
                name=f"Person {i}",
                country="Scope",
                company=f"C{i:03}",
                city="City",
                active=True,
                age=10,
                joined_on=date(2024, 1, 1),
            )
            for i in range(125)
        )
        session.commit()
        request = options(
            "country",
            "company",
            group=groups("company"),
            filter=["country", "=", "Scope"],
            requireGroupCount=True,
            requireTotalCount=False,
        )
        del request["take"]
        with capture_selects(test_engine) as (statements, executed):
            response = load(session, request)
        assert response == {
            "data": [collapsed(f"C{i:03}", 1) for i in range(100)],
            "groupCount": 125,
        }
        assert len(statements) == len(executed) == 2
        assert executed[-1][1][-2:] == (100, 0)


def test_leaf_group_and_skip_can_be_omitted(grouped_session):
    request = options(
        "country",
        filter=["country", "=", "UK"],
        requireGroupCount=False,
        requireTotalCount=False,
    )
    del request["group"]
    del request["skip"]
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        assert load(grouped_session, request) == {"data": [CUSTOMERS[1], CUSTOMERS[4]]}
    assert len(statements) == len(executed) == 1
    assert executed[-1][1][-2:] == (2, 0)


@pytest.mark.parametrize(
    "descending,expected",
    [
        (False, ["DE", "UK", "uk", "US"]),
        (True, ["US", "UK", "uk", "DE"]),
    ],
)
def test_group_order_is_stable_across_root_pages(grouped_session, descending, expected):
    request = options(
        "country",
        group=groups("country", desc=descending),
        take=1,
        requireGroupCount=True,
    )
    request["groupPagingContext"]["group"] = groups("country", desc=descending)
    for index, key in enumerate(expected):
        request["skip"] = index
        assert load(grouped_session, request) == {
            "data": [collapsed(key, 4 if key == "UK" else 2)],
            "groupCount": 4,
        }


def test_exact_path_is_bound_even_for_sql_metacharacters(grouped_session):
    request = options(
        "country",
        group=None,
        filter=["country", "=", "UK' OR 1=1 --"],
        requireTotalCount=True,
    )
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        assert load(grouped_session, request) == {"data": [], "totalCount": 0}
    assert len(statements) == len(executed) == 2
    assert all(
        "OR 1=1" not in sql and "UK' OR 1=1 --" in params for sql, params in executed
    )
