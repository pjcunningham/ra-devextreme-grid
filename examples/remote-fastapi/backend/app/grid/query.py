from sqlmodel import Session, func, select

from app.grid.fields import GridQueryError, get_customer_sort_column
from app.grid.models import GridLoadOptions
from app.models import Customer


def execute_customer_grid_query(
    session: Session, load_options: GridLoadOptions
) -> tuple[list[Customer], int | None]:
    """Execute customer grid query with database-side sorting, paging, and count."""
    # 1. Deliberately reject non-empty filter expressions in Phase 6
    if load_options.filter is not None and len(load_options.filter) > 0:
        raise GridQueryError(
            "Remote filtering is not implemented by the Phase 6 reference backend; "
            "Phase 7 adds the secure filter compiler."
        )

    # 2. Conditional total count query
    total_count: int | None = None
    if load_options.require_total_count is True:
        count_statement = select(func.count(Customer.id))
        total_count = session.exec(count_statement).one()

    # 3. Dynamic sorting with deterministic tie-breaker
    order_by_clauses = []
    has_id_sort = False

    if load_options.sort:
        for descriptor in load_options.sort:
            column = get_customer_sort_column(descriptor.selector)
            if descriptor.selector == "id":
                has_id_sort = True
            if descriptor.desc:
                order_by_clauses.append(column.desc())
            else:
                order_by_clauses.append(column.asc())

    # Ensure deterministic paging with id ASC tie-breaker
    if not has_id_sort:
        order_by_clauses.append(Customer.id.asc())

    # 4. Compose SQL query with OFFSET and LIMIT
    statement = (
        select(Customer)
        .order_by(*order_by_clauses)
        .offset(load_options.skip)
        .limit(load_options.take)
    )

    records = list(session.exec(statement).all())
    return records, total_count
