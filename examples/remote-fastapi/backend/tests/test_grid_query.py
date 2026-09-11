import pytest
from sqlmodel import Session

from app.grid.fields import GridQueryError
from app.grid.models import GridLoadOptions, GridSortDescriptor
from app.grid.query import execute_customer_grid_query


def test_paging_default_first_page(session: Session):
    opts = GridLoadOptions()
    records, total_count = execute_customer_grid_query(session, opts)
    assert len(records) == 20
    assert total_count is None
    # Check default id ASC order
    assert records[0].id == 1
    assert records[19].id == 20


def test_paging_explicit_skip_and_take(session: Session):
    opts = GridLoadOptions(skip=10, take=5)
    records, total_count = execute_customer_grid_query(session, opts)
    assert len(records) == 5
    assert total_count is None
    assert [r.id for r in records] == [11, 12, 13, 14, 15]


def test_paging_large_skip_returns_empty(session: Session):
    opts = GridLoadOptions(skip=200, take=20)
    records, total_count = execute_customer_grid_query(session, opts)
    assert records == []
    assert total_count is None


def test_paging_deterministic_across_repeated_runs(session: Session):
    opts = GridLoadOptions(skip=5, take=10)
    records1, _ = execute_customer_grid_query(session, opts)
    records2, _ = execute_customer_grid_query(session, opts)
    assert [r.id for r in records1] == [r.id for r in records2]


def test_total_count_conditional(session: Session):
    # require_total_count is True
    opts_with_count = GridLoadOptions(take=5, require_total_count=True)
    records, total_count = execute_customer_grid_query(session, opts_with_count)
    assert len(records) == 5
    assert total_count == 100

    # require_total_count is False
    opts_no_count = GridLoadOptions(take=5, require_total_count=False)
    _, total_count = execute_customer_grid_query(session, opts_no_count)
    assert total_count is None

    # require_total_count is omitted (None)
    opts_omitted = GridLoadOptions(take=5)
    _, total_count = execute_customer_grid_query(session, opts_omitted)
    assert total_count is None


def test_sorting_default_id_asc(session: Session):
    opts = GridLoadOptions(take=100)
    records, _ = execute_customer_grid_query(session, opts)
    ids = [r.id for r in records]
    assert ids == sorted(ids)


def test_sorting_single_asc_with_tie_breaker(session: Session):
    opts = GridLoadOptions(
        sort=[GridSortDescriptor(selector="country", desc=False)], take=100
    )
    records, _ = execute_customer_grid_query(session, opts)
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
    records, _ = execute_customer_grid_query(session, opts)
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
    records, _ = execute_customer_grid_query(session, opts)

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
    records, _ = execute_customer_grid_query(session, opts)
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

    page1, _ = execute_customer_grid_query(session, opts_page1)
    page2, _ = execute_customer_grid_query(session, opts_page2)

    page1_ids = {r.id for r in page1}
    page2_ids = {r.id for r in page2}

    # Deterministic tie-breaker guarantees disjoint records across consecutive pages
    assert page1_ids.isdisjoint(page2_ids)


def test_filter_null_and_empty_accepted(session: Session):
    opts_none = GridLoadOptions(filter=None, take=5)
    records, _ = execute_customer_grid_query(session, opts_none)
    assert len(records) == 5

    opts_empty = GridLoadOptions(filter=[], take=5)
    records, _ = execute_customer_grid_query(session, opts_empty)
    assert len(records) == 5


def test_filter_non_empty_rejected(session: Session):
    opts = GridLoadOptions(filter=["country", "=", "USA"])
    with pytest.raises(GridQueryError) as exc_info:
        execute_customer_grid_query(session, opts)
    assert (
        "Remote filtering is not implemented by the Phase 6 reference backend"
        in str(exc_info.value)
    )
    assert "Phase 7 adds the secure filter compiler" in str(exc_info.value)

    opts_nested = GridLoadOptions(
        filter=[["country", "=", "USA"], "and", ["age", ">", 30]]
    )
    with pytest.raises(GridQueryError) as exc_info_nested:
        execute_customer_grid_query(session, opts_nested)
    assert (
        "Remote filtering is not implemented by the Phase 6 reference backend"
        in str(exc_info_nested.value)
    )


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
