from pydantic import JsonValue
from sqlalchemy import select as sqlalchemy_select
from sqlmodel import Session, func, select

from app.grid.fields import CUSTOMER_GRID_FIELDS, get_customer_sort_column
from app.grid.filtering import compile_filter_expression
from app.grid.models import GridLoadOptions
from app.grid.summaries import build_total_summary_expressions
from app.models import Customer


def execute_customer_grid_query(
    session: Session, load_options: GridLoadOptions
) -> tuple[list[Customer], int | None, list[JsonValue] | None]:
    """Filter, optionally count and summarize, sort and page customers in SQL."""
    # Validate all client-controlled structure before executing any statements.
    filter_clause = compile_filter_expression(load_options.filter, CUSTOMER_GRID_FIELDS)
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

    summary_expressions = build_total_summary_expressions(
        load_options.total_summary or [], CUSTOMER_GRID_FIELDS
    )
    statement = select(Customer)
    count_statement = select(func.count(Customer.id))
    if filter_clause is not None:
        statement = statement.where(filter_clause)
        count_statement = count_statement.where(filter_clause)

    total_count: int | None = None
    if load_options.require_total_count is True:
        total_count = session.exec(count_statement).one()

    summary: list[JsonValue] | None = None
    if summary_expressions:
        summary_statement = sqlalchemy_select(*summary_expressions).select_from(
            Customer
        )
        if filter_clause is not None:
            summary_statement = summary_statement.where(filter_clause)
        # Preserve a row even for one descriptor instead of scalarizing the result.
        row = session.execute(summary_statement).one()
        summary = list(row)

    # Filter the complete set before deterministic ordering and paging.
    statement = (
        statement.order_by(*order_by_clauses)
        .offset(load_options.skip)
        .limit(load_options.take)
    )

    records = list(session.exec(statement).all())
    return records, total_count, summary
