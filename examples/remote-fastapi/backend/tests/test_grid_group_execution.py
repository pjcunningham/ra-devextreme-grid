from dataclasses import replace
from datetime import date
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from sqlmodel import Session, SQLModel
from test_grid_grouping import AGE_SUMMARIES, descriptors
from test_grid_summary_execution import capture_selects

from app.grid import filtering
from app.grid.fields import CUSTOMER_GRID_FIELDS, GridQueryError
from app.grid.models import GridGroupDescriptor, GridLoadOptions, GridSummaryDescriptor
from app.grid.query import execute_customer_grid_query
from app.grid.summaries import build_total_summary_expressions
from app.models import Customer


@pytest.mark.parametrize("width", [50, 100])
@pytest.mark.parametrize("depth", [1, 2])
@pytest.mark.parametrize("group_summary", [False, True])
@pytest.mark.parametrize("total_summary", [False, True])
@pytest.mark.parametrize("total_count", [False, True])
@pytest.mark.parametrize("group_count", [False, True])
def test_actual_sql_counts_are_bounded_by_depth_not_group_cardinality(
    test_engine, width, depth, group_summary, total_summary, total_count, group_count
):
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        session.add_all(
            Customer(
                id=3 * i + j + 1,
                name="Same",
                company=company,
                city="City",
                country=f"Country {i:03}",
                active=j < 2,
                age=20 if j == 0 else None,
                joined_on=date(2024, 1, 1),
            )
            for i in range(width)
            for j, company in enumerate(["A", "B", "C"])
        )
        session.commit()
        options = GridLoadOptions.model_validate(
            {
                "group": descriptors(*["country", "company"][:depth]),
                "filter": ["active", "=", True],
                **({"requireTotalCount": True} if total_count else {}),
                **({"requireGroupCount": True} if group_count else {}),
                **({"totalSummary": AGE_SUMMARIES} if total_summary else {}),
                **({"groupSummary": AGE_SUMMARIES} if group_summary else {}),
            }
        )
        with (
            patch(
                "app.grid.query.compile_filter_expression",
                wraps=filtering.compile_filter_expression,
            ) as compiler,
            patch(
                "app.grid.query.build_total_summary_expressions",
                wraps=build_total_summary_expressions,
            ) as aggregate_builder,
        ):
            with capture_selects(test_engine) as (statements, executed):
                data, count, summary, groups = execute_customer_grid_query(
                    session, options
                )
        compiler.assert_called_once_with(options.filter, CUSTOMER_GRID_FIELDS)
        assert aggregate_builder.call_count == 2
        expected_count = (
            1
            + int(total_count)
            + int(total_summary)
            + int(group_count)
            + (depth if group_summary else 0)
        )
        assert len(statements) == len(executed) == expected_count
        assert len(data) == width
        assert count == (width * 2 if total_count else None)
        assert groups == (width if group_count else None)
        assert summary == (
            [width * 2, width * 20, 20, 20, 20] if total_summary else None
        )
        assert [item.key for item in data] == [f"Country {i:03}" for i in range(width)]
        for i, item in enumerate(data):
            assert item.summary == ([2, 20, 20, 20, 20] if group_summary else None)
            if depth == 1:
                assert [row.id for row in item.items] == [3 * i + 1, 3 * i + 2]
            else:
                assert [child.key for child in item.items] == ["A", "B"]
                assert [[row.id for row in child.items] for child in item.items] == [
                    [3 * i + 1],
                    [3 * i + 2],
                ]
                assert [child.summary for child in item.items] == (
                    [[1, 20, 20, 20, 20], [1, 0, None, None, None]]
                    if group_summary
                    else [None, None]
                )
        clause = statements[-1]._where_criteria[0]
        for index, statement in enumerate(statements):
            assert statement._limit_clause is None
            assert statement._offset_clause is None
            if group_count and index == int(total_count) + int(total_summary):
                subquery = statement.get_final_froms()[0].element
                assert subquery._where_criteria[0] is clause
                assert len(subquery._group_by_clauses) == 1
                assert not subquery._order_by_clauses
                assert "COUNT(DISTINCT" not in executed[index][0].upper()
            else:
                assert statement._where_criteria[0] is clause
            if index < len(statements) - 1:
                assert not statement._order_by_clauses
            assert "LIMIT" not in executed[index][0].upper()
            assert "OFFSET" not in executed[index][0].upper()
        aggregates = [
            statement for statement in statements if statement._group_by_clauses
        ]
        assert [len(statement._group_by_clauses) for statement in aggregates] == (
            list(range(1, depth + 1)) if group_summary else []
        )
        for prefix_depth, statement in enumerate(aggregates, 1):
            assert len(statement.selected_columns) == prefix_depth + len(AGE_SUMMARIES)
            assert 'COLLATE "BINARY"' in str(statement)
        print(
            f"GROUP SQL width={width} depth={depth} totalCount={total_count} "
            f"groupCount={group_count} totalSummary={total_summary} "
            f"groupSummary={group_summary}: {len(executed)} statements"
        )


@pytest.mark.parametrize(
    "invalid",
    [
        {"group": descriptors("password_hash")},
        {"group": descriptors("country", "customer.age")},
        {"group": descriptors("__dict__")},
        {"group": descriptors("country; DROP TABLE customer")},
        {"group": descriptors("lower(country)")},
        {"group": descriptors("country", "age OR 1=1")},
        {"group": descriptors("country_eq")},
        {"groupSummary": [{"selector": "country", "summaryType": "min"}]},
        {"groupSummary": [{"selector": "joined_on", "summaryType": "max"}]},
        {"groupSummary": [{"selector": "active", "summaryType": "sum"}]},
        {
            "groupSummary": [
                *AGE_SUMMARIES,
                {"selector": "password_hash", "summaryType": "count"},
            ]
        },
        {
            "groupSummary": [
                {"selector": "age; DROP TABLE customer", "summaryType": "sum"}
            ]
        },
        {"totalSummary": [{"selector": "__class__", "summaryType": "count"}]},
        {
            "sort": [
                {"selector": "country", "desc": False},
                {"selector": "customer.id", "desc": True},
            ]
        },
        {"filter": ["active", "=", "true"]},
    ],
)
def test_invalid_group_sort_filter_and_either_summary_execute_zero_sql(
    session, invalid
):
    options = GridLoadOptions.model_validate(
        {
            "group": descriptors("country", "company"),
            "groupSummary": AGE_SUMMARIES,
            "totalSummary": AGE_SUMMARIES,
            "requireTotalCount": True,
            "requireGroupCount": True,
            **invalid,
        }
    )
    with capture_selects(session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(session, options)
    assert statements == executed == []


@pytest.mark.parametrize(
    "invalid",
    [
        {
            "group": [
                {
                    "selector": "country",
                    "desc": False,
                    "isExpanded": False,
                    "groupInterval": "year",
                }
            ]
        },
        {"group": [{"selector": "country", "desc": False}]},
        {"group": [{"selector": None, "desc": False, "isExpanded": False}]},
        {"group": [{"selector": "country", "desc": 0, "isExpanded": False}]},
        {"group": descriptors("country", "company")[:1] * 5},
        {"group": [{"selector": "country", "desc": False, "isExpanded": False}] * 2},
        {"skip": 0},
        {"take": 20},
        {"skip": None},
        {"take": None},
        {"groupSummary": [{"summaryType": "custom"}]},
        {"groupSummary": [{"summaryType": "count"}] * 33},
        {"group": [], "groupSummary": [{"summaryType": "count"}]},
        {"group": None, "requireGroupCount": True},
        {"requireGroupCount": "true"},
    ],
)
def test_http_shape_rejections_execute_zero_sql(client, test_engine, invalid):
    with capture_selects(test_engine) as (statements, executed):
        response = client.post(
            "/api/customers/grid",
            json={"loadOptions": {"group": descriptors("country"), **invalid}},
        )
    assert response.status_code == 422
    assert statements == executed == []


@pytest.mark.parametrize(
    "changes",
    [
        {
            "group": [
                GridGroupDescriptor.model_construct(
                    selector="country", desc="false", is_expanded=False
                )
            ]
        },
        {
            "group": [
                GridGroupDescriptor.model_construct(
                    selector="country", desc=False, is_expanded=False
                )
            ]
            * 2
        },
        {"skip": 0},
        {"take": None},
        {
            "group_summary": [
                GridSummaryDescriptor.model_construct(summary_type="custom")
            ]
        },
        {"group_summary": [GridSummaryDescriptor(summaryType="count")] * 33},
        {"group": None, "require_group_count": True},
    ],
)
def test_internal_grouping_validation_cannot_bypass_no_sql_guarantee(session, changes):
    options = (
        GridLoadOptions.model_construct(
            group=[
                GridGroupDescriptor(selector="country", desc=False, isExpanded=False)
            ],
            require_total_count=True,
            **changes,
        )
        if "group" not in changes
        else GridLoadOptions.model_construct(require_total_count=True, **changes)
    )
    with capture_selects(session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(session, options)
    assert statements == executed == []


def test_ignored_group_sort_still_checks_sort_capability(session, monkeypatch):
    monkeypatch.setitem(
        CUSTOMER_GRID_FIELDS,
        "country",
        replace(CUSTOMER_GRID_FIELDS["country"], sortable=False),
    )
    options = GridLoadOptions.model_validate(
        {
            "group": descriptors("country"),
            "sort": [{"selector": "country", "desc": True}],
            "requireTotalCount": True,
        }
    )
    with capture_selects(session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError, match="Sorting is not supported"):
            execute_customer_grid_query(session, options)
    assert statements == executed == []


def test_ungroupable_registry_field_rejected_before_count(session, monkeypatch):
    monkeypatch.setitem(
        CUSTOMER_GRID_FIELDS,
        "country",
        replace(CUSTOMER_GRID_FIELDS["country"], groupable=False),
    )
    with capture_selects(session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError, match="Grouping is not supported"):
            execute_customer_grid_query(
                session,
                GridLoadOptions.model_validate(
                    {"group": descriptors("country"), "requireTotalCount": True}
                ),
            )
    assert statements == executed == []


@pytest.mark.parametrize("id_group", [False, True])
@pytest.mark.parametrize("explicit_id", [False, True])
def test_order_by_has_no_conflicting_or_duplicate_clauses(
    session, id_group, explicit_id
):
    groups = (
        descriptors("country", "country", "id")
        if id_group
        else descriptors("country", "company")
    )
    sorts = [
        {"selector": "country", "desc": True},
        {"selector": "name", "desc": True},
        {"selector": "name", "desc": False},
    ]
    if explicit_id:
        sorts.extend(
            [{"selector": "id", "desc": True}, {"selector": "id", "desc": False}]
        )
    with capture_selects(session.get_bind()) as (statements, executed):
        execute_customer_grid_query(
            session, GridLoadOptions.model_validate({"group": groups, "sort": sorts})
        )
    assert len(statements) == len(executed) == 1
    clauses = [str(clause) for clause in statements[0]._order_by_clauses]
    expected = [
        'lower(customer.country COLLATE "BINARY") ASC NULLS FIRST',
        'customer.country COLLATE "BINARY" ASC',
    ]
    if id_group:
        expected.append("customer.id ASC NULLS FIRST")
    else:
        expected.extend(
            [
                'lower(customer.company COLLATE "BINARY") ASC NULLS FIRST',
                'customer.company COLLATE "BINARY" ASC',
            ]
        )
    expected.append("customer.name DESC")
    if not id_group:
        expected.append("customer.id DESC" if explicit_id else "customer.id ASC")
    assert clauses == expected


def test_function_selector_rejection_is_before_any_sql(session):
    with capture_selects(session.get_bind()) as (statements, executed):
        with pytest.raises(ValidationError):
            options = GridLoadOptions.model_validate(
                {
                    "group": [
                        {
                            "selector": lambda: "country",
                            "desc": False,
                            "isExpanded": False,
                        }
                    ]
                }
            )
            execute_customer_grid_query(session, options)
    assert statements == executed == []
