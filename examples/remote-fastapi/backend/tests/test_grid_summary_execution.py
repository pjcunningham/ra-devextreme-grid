from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy import event
from sqlmodel import Session, SQLModel

from app.grid import filtering
from app.grid.fields import GridQueryError
from app.grid.models import GridLoadOptions, GridSummaryDescriptor
from app.grid.query import execute_customer_grid_query
from app.models import Customer

SUMMARY = [
    {"selector": "age", "summaryType": kind}
    for kind in ["count", "sum", "avg", "min", "max"]
]


@pytest.fixture
def summary_session(test_engine):
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        session.add_all(
            [
                Customer(
                    id=i,
                    name=f"Person {i}",
                    company="Acme",
                    city="London",
                    country="UK" if i <= 5 else "USA",
                    active=True,
                    age=age,
                    joined_on=date(2024, 1, i),
                )
                for i, age in enumerate([None, 0, 20, 30, 30, 40], 1)
            ]
        )
        session.commit()
        yield session


@contextmanager
def capture_selects(engine):
    statements = []
    executed = []

    def before_execute(_conn, clause, _multiparams, _params, _options):
        if clause.is_select:
            statements.append(clause)

    def before_cursor_execute(_conn, _cursor, statement, parameters, context, _many):
        if context.compiled is not None and context.compiled.statement.is_select:
            executed.append((statement, parameters))

    event.listen(engine, "before_execute", before_execute)
    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements, executed
    finally:
        event.remove(engine, "before_execute", before_execute)
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


@pytest.mark.parametrize(
    "count_options", [{}, {"requireTotalCount": False}, {"requireTotalCount": True}]
)
@pytest.mark.parametrize(
    "paging", [{"take": 5}, {"skip": 5, "take": 5}, {"skip": 100, "take": 5}]
)
@pytest.mark.parametrize(
    "sort",
    [
        None,
        [{"selector": "name", "desc": False}],
        [{"selector": "name", "desc": True}],
        [{"selector": "country", "desc": False}, {"selector": "age", "desc": True}],
    ],
)
def test_totals_are_independent_of_page_sort_and_requested_count(
    summary_session, count_options, paging, sort
):
    options = GridLoadOptions.model_validate(
        {"totalSummary": SUMMARY, "sort": sort, **count_options, **paging}
    )
    records, total_count, summary = execute_customer_grid_query(
        summary_session, options
    )
    assert len(records) == (5 if options.skip == 0 else 1 if options.skip == 5 else 0)
    assert total_count == (6 if options.require_total_count else None)
    assert summary == [6, 120, 24, 0, 40]


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        (["country", "=", "UK"], [5, 80, 20, 0, 30]),
        (["id", ">", 3], [3, 100, 100 / 3, 30, 40]),
        (
            [
                ["country", "=", "uk"],
                "and",
                [["age", "=", None], "or", ["age", ">=", 20]],
            ],
            [4, 80, 80 / 3, 20, 30],
        ),
        (["id", "=", 1], [1, 0, None, None, None]),
        (["id", ">", 99], [0, 0, None, None, None]),
    ],
)
def test_filtered_nullable_zero_duplicate_all_null_and_empty_semantics(
    summary_session, expression, expected
):
    records, total_count, summary = execute_customer_grid_query(
        summary_session,
        GridLoadOptions.model_validate(
            {
                "totalSummary": SUMMARY,
                "filter": expression,
                "take": 1,
                "requireTotalCount": True,
            }
        ),
    )
    assert summary == expected
    assert total_count == expected[0]
    assert len(records) == min(1, expected[0])


@pytest.mark.parametrize(
    ("items", "expected"),
    [
        ([{"summaryType": "count"}], [6]),
        ([{"selector": "age", "summaryType": "avg"}], [24]),
        (
            [
                {"selector": "age", "summaryType": "max"},
                {"selector": "id", "summaryType": "count"},
                {"selector": "age", "summaryType": "avg"},
                {"selector": "age", "summaryType": "min"},
            ],
            [40, 6, 24, 0],
        ),
        ([{"selector": "age", "summaryType": "max"}] * 2, [40, 40]),
        (
            [
                {"selector": "id", "summaryType": kind}
                for kind in ["count", "sum", "avg", "min", "max"]
            ],
            [6, 21, 3.5, 1, 6],
        ),
    ],
)
def test_single_descriptor_explicit_from_and_duplicate_out_of_order_positions(
    summary_session, items, expected
):
    _, total_count, summary = execute_customer_grid_query(
        summary_session, GridLoadOptions.model_validate({"totalSummary": items})
    )
    assert total_count is None
    assert summary == expected


@pytest.mark.parametrize("require_count", [False, True])
@pytest.mark.parametrize("items", [None, [], SUMMARY, [{"summaryType": "count"}]])
def test_executed_statement_counts_and_aggregate_shape(
    summary_session, require_count, items
):
    with capture_selects(summary_session.get_bind()) as (statements, executed):
        execute_customer_grid_query(
            summary_session,
            GridLoadOptions.model_validate(
                {
                    "totalSummary": items,
                    "requireTotalCount": require_count,
                    "take": 5,
                    "skip": 1,
                    "sort": [{"selector": "name", "desc": True}],
                }
            ),
        )
    assert len(statements) == len(executed) == 1 + int(require_count) + int(bool(items))
    if items:
        aggregate = statements[int(require_count)]
        assert len(aggregate.selected_columns) == len(items)
        assert [source.name for source in aggregate.get_final_froms()] == ["customer"]
        assert not aggregate._order_by_clauses
        assert aggregate._limit_clause is None
        assert aggregate._offset_clause is None
        sql = executed[int(require_count)][0].upper()
        assert "FROM CUSTOMER" in sql
        assert all(keyword not in sql for keyword in ["ORDER BY", "LIMIT", "OFFSET"])
    assert statements[-1]._limit_clause is not None
    assert statements[-1]._order_by_clauses


def test_filter_compiled_once_and_identical_predicate_reused_in_three_executed_queries(
    summary_session,
):
    expression = [
        ["country", "=", "UK"],
        "and",
        [["age", "=", None], "or", ["age", ">", 10]],
    ]
    with patch(
        "app.grid.query.compile_filter_expression",
        wraps=filtering.compile_filter_expression,
    ) as compiler:
        with capture_selects(summary_session.get_bind()) as (statements, executed):
            records, total_count, summary = execute_customer_grid_query(
                summary_session,
                GridLoadOptions.model_validate(
                    {
                        "filter": expression,
                        "totalSummary": SUMMARY,
                        "requireTotalCount": True,
                        "take": 1,
                    }
                ),
            )
    compiler.assert_called_once()
    assert len(statements) == len(executed) == 3
    clause = statements[0]._where_criteria[0]
    assert all(statement._where_criteria[0] is clause for statement in statements)
    assert total_count == 4
    assert summary == [4, 80, 80 / 3, 20, 30]
    assert len(records) == 1
    print("EXECUTED SUMMARY SQL:", executed[1])


@pytest.mark.parametrize(
    "invalid",
    [
        {"sort": [{"selector": "password_hash", "desc": False}]},
        {"filter": ["age", "between", [0, 20]]},
        {"filter": ["!", ["age", ">", 20]]},
        {
            "totalSummary": [
                {"selector": "age; DROP TABLE customer", "summaryType": "count"}
            ]
        },
        {"totalSummary": [{"selector": "__dict__", "summaryType": "sum"}]},
        {"totalSummary": [{"selector": "customer.age", "summaryType": "avg"}]},
        {"totalSummary": [{"selector": "country", "summaryType": "min"}]},
        {
            "totalSummary": [
                SUMMARY[0],
                {"selector": "password_hash", "summaryType": "max"},
            ]
        },
    ],
)
def test_invalid_structure_executes_zero_statements(summary_session, invalid):
    options = GridLoadOptions.model_validate(
        {"requireTotalCount": True, "totalSummary": SUMMARY, **invalid}
    )
    with capture_selects(summary_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(summary_session, options)
    assert statements == executed == []


def test_internal_malformed_summary_executes_no_queries(summary_session):
    options = GridLoadOptions.model_construct(
        require_total_count=True,
        total_summary=[
            GridSummaryDescriptor.model_construct(summary_type="custom", selector="age")
        ],
    )
    with capture_selects(summary_session.get_bind()) as (statements, executed):
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(summary_session, options)
    assert statements == executed == []


def test_seed_uk_summaries_describe_ten_rows_not_five(session):
    records, count, summary = execute_customer_grid_query(
        session,
        GridLoadOptions.model_validate(
            {
                "filter": ["country", "=", "UK"],
                "take": 5,
                "totalSummary": [
                    {"selector": "id", "summaryType": "count"},
                    *SUMMARY[1:],
                ],
                "requireTotalCount": True,
            }
        ),
    )
    assert len(records) == 5
    assert count == summary[0] == 10
    # UK IDs 8,18,...,98 have ages null,62,22,27,32,37,42,null,52,57.
    assert summary == [10, 331, 41.375, 22, 62]
    assert all(record.country == "UK" for record in records)
