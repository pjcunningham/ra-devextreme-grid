from sqlmodel import Session, func, select

from app.grid.fields import CUSTOMER_GRID_FIELDS, get_customer_sort_column
from app.grid.filtering import compile_filter_expression
from app.grid.models import GridLoadOptions
from app.models import Customer


def execute_customer_grid_query(
    session: Session, load_options: GridLoadOptions
) -> tuple[list[Customer], int | None]:
    """Filter, conditionally count, sort and page customers entirely in SQL."""
    # Validate all client-controlled structure before executing either statement.
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

    filter_clause = compile_filter_expression(load_options.filter, CUSTOMER_GRID_FIELDS)
    statement = select(Customer)
    count_statement = select(func.count(Customer.id))
    if filter_clause is not None:
        statement = statement.where(filter_clause)
        count_statement = count_statement.where(filter_clause)

    total_count: int | None = None
    if load_options.require_total_count is True:
        total_count = session.exec(count_statement).one()

    # Filter the complete set before deterministic ordering and paging.
    statement = (
        statement.order_by(*order_by_clauses)
        .offset(load_options.skip)
        .limit(load_options.take)
    )

    records = list(session.exec(statement).all())
    return records, total_count
