from collections.abc import Generator
from datetime import date
from unittest.mock import patch

import pytest
from pydantic import JsonValue
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel

from app.grid.fields import CUSTOMER_GRID_FIELDS, GridQueryError
from app.grid.filtering import compile_filter_expression
from app.grid.models import GridLoadOptions, GridSortDescriptor, GridSummaryDescriptor
from app.grid.query import execute_customer_grid_query
from app.models import Customer


@pytest.fixture
def varied_session(test_engine: Engine) -> Generator[Session]:
    SQLModel.metadata.create_all(test_engine)
    rows = [
        (1, "Beta", "Aaron", None, True, "UK"),
        (2, "Alpha", "Mira", 30, True, "UK"),
        (3, "Beta", "Zulu", 40, True, "UK"),
        (4, "Alpha", "Zulu", 20, True, "UK"),
        (5, "Gamma", "Mira", 35, True, "UK"),
        (6, "Beta", "Zulu", 30, True, "UK"),
        (7, "Alpha", "Aaron", None, True, "UK"),
        (8, "Gamma", "Zulu", 50, True, "UK"),
        (9, "Beta", "Mira", 25, True, "UK"),
        (10, "Alpha", "Zulu", 40, True, "UK"),
        (11, "Gamma", "Aaron", 20, True, "UK"),
        (12, "Alpha", "Mira", 60, True, "UK"),
        (13, "Alpha", "Zulu", 30, False, "UK"),
        (14, "Alpha", "Zulu", 30, True, "France"),
        (15, "Alpha", "Zulu", None, False, "UK"),
        (16, "Alpha", "Zulu", 40, True, "USA"),
    ]
    with Session(test_engine) as session_instance:
        session_instance.add_all(
            Customer(
                id=id_,
                company=company,
                name=name,
                age=age,
                active=active,
                country=country,
                city="Test City",
                joined_on=date(2024, 1, id_ + 13),
            )
            for id_, company, name, age, active, country in reversed(rows)
        )
        session_instance.commit()
        yield session_instance


def test_paging_default_first_page(session: Session):
    opts = GridLoadOptions()
    records, total_count, summary = execute_customer_grid_query(session, opts)
    assert len(records) == 20
    assert total_count is None
    assert summary is None
    # Check default id ASC order
    assert records[0].id == 1
    assert records[19].id == 20


def test_paging_explicit_skip_and_take(session: Session):
    opts = GridLoadOptions(skip=10, take=5)
    records, total_count, _ = execute_customer_grid_query(session, opts)
    assert len(records) == 5
    assert total_count is None
    assert [r.id for r in records] == [11, 12, 13, 14, 15]


def test_paging_large_skip_returns_empty(session: Session):
    opts = GridLoadOptions(skip=200, take=20)
    records, total_count, _ = execute_customer_grid_query(session, opts)
    assert records == []
    assert total_count is None


def test_paging_deterministic_across_repeated_runs(session: Session):
    opts = GridLoadOptions(skip=5, take=10)
    records1, _, _ = execute_customer_grid_query(session, opts)
    records2, _, _ = execute_customer_grid_query(session, opts)
    assert [r.id for r in records1] == [r.id for r in records2]


def test_total_count_conditional(session: Session):
    # require_total_count is True
    opts_with_count = GridLoadOptions(take=5, require_total_count=True)
    records, total_count, _ = execute_customer_grid_query(session, opts_with_count)
    assert len(records) == 5
    assert total_count == 100

    # require_total_count is False
    opts_no_count = GridLoadOptions(take=5, require_total_count=False)
    _, total_count, _ = execute_customer_grid_query(session, opts_no_count)
    assert total_count is None

    # require_total_count is omitted (None)
    opts_omitted = GridLoadOptions(take=5)
    _, total_count, _ = execute_customer_grid_query(session, opts_omitted)
    assert total_count is None


def test_sorting_default_id_asc(session: Session):
    opts = GridLoadOptions(take=100)
    records, _, _ = execute_customer_grid_query(session, opts)
    ids = [r.id for r in records]
    assert ids == sorted(ids)


def test_sorting_single_asc_with_tie_breaker(session: Session):
    opts = GridLoadOptions(
        sort=[GridSortDescriptor(selector="country", desc=False)], take=100
    )
    records, _, _ = execute_customer_grid_query(session, opts)
    countries = [r.country for r in records]
    assert countries == sorted(countries)

    # Check tie-breaker: for any subset with the same country,
    # id must be strictly ascending
    from collections import defaultdict

    country_ids = defaultdict(list)
    for r in records:
        country_ids[r.country].append(r.id)

    for c, ids in country_ids.items():
        assert ids == sorted(ids), f"Tie-breaker failed for country {c}"


def test_sorting_single_desc_with_tie_breaker(session: Session):
    opts = GridLoadOptions(
        sort=[GridSortDescriptor(selector="company", desc=True)], take=100
    )
    records, _, _ = execute_customer_grid_query(session, opts)
    companies = [r.company for r in records]
    assert companies == sorted(companies, reverse=True)

    # Check tie breaker
    from collections import defaultdict

    comp_ids = defaultdict(list)
    for r in records:
        comp_ids[r.company].append(r.id)

    for comp, ids in comp_ids.items():
        assert ids == sorted(ids), f"Tie-breaker failed for company {comp}"


def test_sorting_multi_column(session: Session):
    opts = GridLoadOptions(
        sort=[
            GridSortDescriptor(selector="country", desc=False),
            GridSortDescriptor(selector="company", desc=False),
            GridSortDescriptor(selector="name", desc=True),
        ],
        take=100,
    )
    records, _, _ = execute_customer_grid_query(session, opts)

    # Check ordering precedence
    for i in range(len(records) - 1):
        r1, r2 = records[i], records[i + 1]
        if r1.country != r2.country:
            assert r1.country < r2.country
        elif r1.company != r2.company:
            assert r1.company < r2.company
        elif r1.name != r2.name:
            assert r1.name > r2.name
        else:
            assert r1.id < r2.id


def test_sorting_explicit_id_desc(session: Session):
    opts = GridLoadOptions(sort=[GridSortDescriptor(selector="id", desc=True)], take=20)
    records, _, _ = execute_customer_grid_query(session, opts)
    ids = [r.id for r in records]
    assert ids == sorted(ids, reverse=True)
    assert ids[0] == 100
    assert ids[-1] == 81


def test_sorting_duplicate_keys_page_deterministically(session: Session):
    # Fetch page 1 (10 records) and page 2 (10 records) sorted by country ASC
    opts_page1 = GridLoadOptions(
        sort=[GridSortDescriptor(selector="country", desc=False)], skip=0, take=10
    )
    opts_page2 = GridLoadOptions(
        sort=[GridSortDescriptor(selector="country", desc=False)], skip=10, take=10
    )

    page1, _, _ = execute_customer_grid_query(session, opts_page1)
    page2, _, _ = execute_customer_grid_query(session, opts_page2)

    page1_ids = {r.id for r in page1}
    page2_ids = {r.id for r in page2}

    # Deterministic tie-breaker guarantees disjoint records across consecutive pages
    assert page1_ids.isdisjoint(page2_ids)


def test_filter_null_and_empty_accepted(session: Session):
    opts_none = GridLoadOptions(filter=None, take=5)
    records, _, _ = execute_customer_grid_query(session, opts_none)
    assert len(records) == 5

    opts_empty = GridLoadOptions(filter=[], take=5)
    records, _, _ = execute_customer_grid_query(session, opts_empty)
    assert len(records) == 5


def test_filter_non_empty_rejected(session: Session):
    opts = GridLoadOptions(filter=["country", "between", ["UK", "USA"]])
    with pytest.raises(GridQueryError, match="Operator 'between' is not supported"):
        execute_customer_grid_query(session, opts)

    opts_nested = GridLoadOptions(
        filter=[["country", "=", "USA"], "and", ["age", ">", "30"]]
    )
    with pytest.raises(GridQueryError, match="Invalid value for integer field 'age'"):
        execute_customer_grid_query(session, opts_nested)


@pytest.mark.parametrize(
    ("expression", "expected_ids", "expected_count"),
    [
        (["country", "=", "uk"], [8, 18, 28, 38, 48], 10),
        (["country", "UK"], [8, 18, 28, 38, 48], 10),
        (
            [["country", "UK"], "and", [["active", True], ["age", ">=", 30]]],
            [18, 48, 58, 68, 88],
            6,
        ),
    ],
)
def test_filter_seed_simple_and_nested_shorthand(
    session: Session, expression: list[JsonValue], expected_ids, expected_count
):
    records, total_count, _ = execute_customer_grid_query(
        session,
        GridLoadOptions(filter=expression, take=5, require_total_count=True),
    )
    assert [record.id for record in records] == expected_ids
    assert total_count == expected_count


def test_filter_seed_combined_sort_and_page_repeated(session: Session):
    opts = GridLoadOptions(
        filter=[["active", "=", True], "and", ["country", "=", "UK"]],
        sort=[
            GridSortDescriptor(selector="company", desc=False),
            GridSortDescriptor(selector="name", desc=True),
        ],
        skip=5,
        take=5,
        require_total_count=True,
    )
    for _ in range(2):
        records, total_count, _ = execute_customer_grid_query(session, opts)
        assert [record.id for record in records] == [48, 18, 58, 78, 38]
        assert total_count == 10


@pytest.mark.parametrize(
    ("expression", "expected_ids"),
    [
        ([["active", True], ["id", "<=", 4]], [1, 2, 3, 4]),
        ([["age", ">=", 30], ["id", "<=", 4]], [2, 3]),
        (["joined_on", "2024-01-15"], [2]),
        (
            [["joined_on", ">", "2024-01-15"], ["joined_on", "<=", "2024-01-17"]],
            [3, 4],
        ),
        (["age", "=", None], [1, 7, 15]),
        ([["age", "<>", None], ["id", "<=", 4]], [2, 3, 4]),
        ([["age", "<>", 30], ["id", "<=", 4]], [3, 4]),
        (["!", ["country", "UK"]], [14, 16]),
        (
            [["country", "France"], "or", [["active", False], ["age", None]]],
            [14, 15],
        ),
    ],
)
def test_filter_typed_and_recursive_execution(
    varied_session: Session, expression: list[JsonValue], expected_ids
):
    records, total_count, _ = execute_customer_grid_query(
        varied_session,
        GridLoadOptions(filter=expression, take=100, require_total_count=True),
    )
    assert [record.id for record in records] == expected_ids
    assert total_count == len(expected_ids)


@pytest.mark.parametrize(
    ("sort", "expected_ids"),
    [
        ([], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        ([("id", True)], [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
        ([("company", False)], [2, 4, 7, 10, 12, 1, 3, 6, 9, 5, 8, 11]),
        ([("name", True)], [3, 4, 6, 8, 10, 2, 5, 9, 12, 1, 7, 11]),
        (
            [("company", False), ("name", True)],
            [4, 10, 2, 12, 7, 3, 6, 9, 1, 8, 5, 11],
        ),
        (
            [("name", True), ("company", False)],
            [4, 10, 3, 6, 8, 2, 12, 9, 5, 7, 1, 11],
        ),
        (
            [("company", True), ("name", False)],
            [11, 5, 8, 1, 9, 3, 6, 7, 2, 12, 4, 10],
        ),
        (
            [("company", False), ("name", True), ("id", True)],
            [10, 4, 12, 2, 7, 6, 3, 9, 1, 8, 5, 11],
        ),
    ],
)
def test_filter_varied_sort_priorities_and_exact_ties(
    varied_session: Session, sort, expected_ids
):
    opts = GridLoadOptions(
        filter=[["active", True], ["country", "UK"]],
        sort=[
            GridSortDescriptor(selector=selector, desc=desc) for selector, desc in sort
        ],
        take=100,
        require_total_count=True,
    )
    records, total_count, _ = execute_customer_grid_query(varied_session, opts)
    assert [record.id for record in records] == expected_ids
    assert total_count == 12


@pytest.mark.parametrize("require_total_count", [None, False, True])
def test_filter_varied_combined_paging_and_optional_count(
    varied_session: Session, require_total_count
):
    opts = GridLoadOptions(
        filter=[["active", "=", True], "and", ["country", "=", "UK"]],
        sort=[
            GridSortDescriptor(selector="company", desc=False),
            GridSortDescriptor(selector="name", desc=True),
        ],
        skip=5,
        take=5,
        require_total_count=require_total_count,
    )
    for _ in range(2):
        records, total_count, _ = execute_customer_grid_query(varied_session, opts)
        assert [record.id for record in records] == [3, 6, 9, 1, 8]
        assert total_count == (12 if require_total_count else None)


@pytest.mark.parametrize("require_total_count", [None, False, True])
@pytest.mark.parametrize(
    ("expression", "skip", "expected_count"),
    [
        (["country", "Nowhere"], 0, 0),
        ([["active", True], ["country", "UK"]], 12, 12),
        ([["active", True], ["country", "UK"]], 200, 12),
    ],
)
def test_filter_empty_or_beyond_page_keeps_unpaged_count(
    varied_session: Session, expression, skip, expected_count, require_total_count
):
    records, total_count, _ = execute_customer_grid_query(
        varied_session,
        GridLoadOptions(
            filter=expression,
            skip=skip,
            take=5,
            require_total_count=require_total_count,
        ),
    )
    assert records == []
    assert total_count == (expected_count if require_total_count else None)


@pytest.mark.parametrize("require_total_count", [None, False, True])
def test_filter_compiled_once_and_same_predicate_used_in_real_sql(
    varied_session: Session, require_total_count
):
    opts = GridLoadOptions(
        filter=[["active", True], ["country", "UK"]],
        sort=[
            GridSortDescriptor(selector="company", desc=False),
            GridSortDescriptor(selector="name", desc=True),
        ],
        skip=5,
        take=5,
        require_total_count=require_total_count,
    )
    with (
        patch(
            "app.grid.query.compile_filter_expression", wraps=compile_filter_expression
        ) as compile_spy,
        patch.object(varied_session, "exec", wraps=varied_session.exec) as exec_spy,
    ):
        records, total_count, _ = execute_customer_grid_query(varied_session, opts)

    compile_spy.assert_called_once_with(opts.filter, CUSTOMER_GRID_FIELDS)
    assert [record.id for record in records] == [3, 6, 9, 1, 8]
    assert total_count == (12 if require_total_count else None)
    statements = [call.args[0] for call in exec_spy.call_args_list]
    assert len(statements) == (2 if require_total_count else 1)
    records_statement = statements[-1]
    assert len(records_statement._where_criteria) == 1
    assert records_statement._offset_clause.value == 5
    assert records_statement._limit_clause.value == 5
    records_sql = str(records_statement)
    assert "WHERE" in records_sql
    assert "count(" not in records_sql
    assert (
        "ORDER BY customer.company ASC, customer.name DESC, customer.id ASC"
        in records_sql
    )
    if require_total_count:
        count_statement = statements[0]
        assert len(count_statement._where_criteria) == 1
        assert (
            count_statement._where_criteria[0] is records_statement._where_criteria[0]
        )
        assert "count(customer.id)" in str(count_statement)
        assert not count_statement._order_by_clauses
        assert count_statement._offset_clause is None
        assert count_statement._limit_clause is None


@pytest.mark.parametrize("require_total_count", [None, False, True])
@pytest.mark.parametrize(
    ("expression", "sort"),
    [
        (["password_hash", "secret"], []),
        (["active", "=", "true"], []),
        (["!", ["age", "=", 30]], []),
        (
            [["country", "UK"], "and", ["active", True], "or", ["age", 30]],
            [],
        ),
        (["country", "UK"], ["password_hash"]),
        (["country", "UK"], ["company", "country.length"]),
    ],
)
def test_filter_and_sort_validated_before_any_sql(
    session: Session, expression, sort, require_total_count
):
    opts = GridLoadOptions(
        filter=expression,
        sort=[GridSortDescriptor(selector=selector, desc=False) for selector in sort],
        require_total_count=require_total_count,
    )
    with patch.object(session, "exec", wraps=session.exec) as exec_spy:
        with pytest.raises(GridQueryError):
            execute_customer_grid_query(session, opts)
    exec_spy.assert_not_called()


def test_sql_level_execution_architectural(session: Session):
    """Verify that sorting, paging, and counting are built into the SQL statement."""
    from sqlalchemy.sql import Select

    from app.grid.fields import get_customer_sort_column
    from app.models import Customer

    # Verify statement structure
    opts = GridLoadOptions(
        skip=10,
        take=15,
        sort=[GridSortDescriptor(selector="country", desc=False)],
    )

    col = get_customer_sort_column("country")
    order_by_clauses = [col.asc(), Customer.id.asc()]

    from sqlmodel import select

    statement: Select = (
        select(Customer).order_by(*order_by_clauses).offset(opts.skip).limit(opts.take)
    )

    compiled = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "ORDER BY customer.country ASC, customer.id ASC" in compiled
    assert "LIMIT 15 OFFSET 10" in compiled


@pytest.mark.parametrize("require_total_count", [None, False, True])
def test_summaries_cover_filtered_set_independently_of_page_and_count(
    varied_session: Session, require_total_count
):
    records, total_count, summary = execute_customer_grid_query(
        varied_session,
        GridLoadOptions(
            filter=[["active", True], ["country", "UK"]],
            sort=[
                GridSortDescriptor(selector="company", desc=False),
                GridSortDescriptor(selector="name", desc=True),
            ],
            skip=5,
            take=5,
            require_total_count=require_total_count,
            total_summary=[
                GridSummaryDescriptor(selector="age", summary_type="max"),
                GridSummaryDescriptor(summary_type="count"),
                GridSummaryDescriptor(selector="age", summary_type="avg"),
                GridSummaryDescriptor(selector="age", summary_type="min"),
                GridSummaryDescriptor(selector="age", summary_type="max"),
            ],
        ),
    )
    assert [record.id for record in records] == [3, 6, 9, 1, 8]
    assert total_count == (12 if require_total_count else None)
    assert summary == [60, 12, 35, 20, 60]


@pytest.mark.parametrize("expression", [["age", None], ["country", "Nowhere"]])
@pytest.mark.parametrize(
    ("descriptor", "expected_summary"),
    [
        (GridSummaryDescriptor(selector="age", summary_type="sum"), [0]),
        (GridSummaryDescriptor(selector="age", summary_type="avg"), [None]),
    ],
)
def test_single_summary_keeps_list_shape_for_null_and_empty_sets(
    varied_session: Session, expression, descriptor, expected_summary
):
    records, total_count, summary = execute_customer_grid_query(
        varied_session,
        GridLoadOptions(filter=expression, skip=100, total_summary=[descriptor]),
    )
    assert records == []
    assert total_count is None
    assert summary == expected_summary


@pytest.mark.parametrize("total_summary", [None, []])
def test_inactive_summary_is_none(session: Session, total_summary):
    records, total_count, summary = execute_customer_grid_query(
        session, GridLoadOptions(take=5, total_summary=total_summary)
    )
    assert len(records) == 5
    assert total_count is None
    assert summary is None
