from pydantic import JsonValue, ValidationError
from sqlalchemy import select as sqlalchemy_select
from sqlmodel import Session, func, select

from app.grid.fields import (
    CUSTOMER_GRID_FIELDS,
    GridQueryError,
    get_customer_sort_column,
)
from app.grid.filtering import compile_filter_expression
from app.grid.grouping import assemble_group_tree, build_group_expressions
from app.grid.models import GridGroupItem, GridLoadOptions
from app.grid.summaries import build_total_summary_expressions
from app.models import Customer


def execute_customer_grid_query(
    session: Session, load_options: GridLoadOptions
) -> tuple[
    list[Customer] | list[GridGroupItem], int | None, list[JsonValue] | None, int | None
]:
    """Query in SQL, then page flat rows or assemble complete groups."""
    # Validate all client-controlled structure before executing any statements.
    if (
        load_options.group
        or load_options.group_summary
        or load_options.require_group_count is not None
    ):
        try:
            # Preserve unset paging defaults when checking model_construct callers.
            load_options = GridLoadOptions.model_validate(
                load_options.model_dump(exclude_unset=True)
            )
        except ValidationError as error:
            raise GridQueryError("Invalid grouping load options") from error
    filter_clause = compile_filter_expression(load_options.filter, CUSTOMER_GRID_FIELDS)
    group_keys, order_by_clauses = build_group_expressions(
        load_options.group or [], CUSTOMER_GRID_FIELDS
    )
    ordered_selectors = {descriptor.selector for descriptor in load_options.group or []}

    if load_options.sort:
        for descriptor in load_options.sort:
            column = get_customer_sort_column(descriptor.selector)
            if group_keys and descriptor.selector in ordered_selectors:
                continue
            ordered_selectors.add(descriptor.selector)
            if descriptor.desc:
                order_by_clauses.append(column.desc())
            else:
                order_by_clauses.append(column.asc())

    # Ensure deterministic paging with id ASC tie-breaker
    if "id" not in ordered_selectors:
        order_by_clauses.append(Customer.id.asc())

    summary_expressions = build_total_summary_expressions(
        load_options.total_summary or [], CUSTOMER_GRID_FIELDS
    )
    group_summary_expressions = build_total_summary_expressions(
        load_options.group_summary or [], CUSTOMER_GRID_FIELDS
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

    if group_keys:
        group_count: int | None = None
        if load_options.require_group_count is True:
            groups_statement = sqlalchemy_select(group_keys[0]).select_from(Customer)
            if filter_clause is not None:
                groups_statement = groups_statement.where(filter_clause)
            groups_statement = groups_statement.group_by(group_keys[0])
            group_count = session.exec(
                select(func.count()).select_from(groups_statement.subquery())
            ).one()

        group_summaries = None
        if group_summary_expressions:
            group_summaries = {}
            for depth in range(1, len(group_keys) + 1):
                prefix = group_keys[:depth]
                aggregate_statement = (
                    sqlalchemy_select(*prefix, *group_summary_expressions)
                    .select_from(Customer)
                    .group_by(*prefix)
                )
                if filter_clause is not None:
                    aggregate_statement = aggregate_statement.where(filter_clause)
                for row in session.execute(aggregate_statement):
                    group_summaries[tuple(row[:depth])] = list(row[depth:])

        grouped_statement = sqlalchemy_select(Customer, *group_keys)
        if filter_clause is not None:
            grouped_statement = grouped_statement.where(filter_clause)
        grouped_statement = grouped_statement.order_by(*order_by_clauses)
        groups = assemble_group_tree(
            session.execute(grouped_statement), len(group_keys), group_summaries
        )
        return groups, total_count, summary, group_count

    # Filter the complete set before deterministic ordering and paging.
    statement = (
        statement.order_by(*order_by_clauses)
        .offset(load_options.skip)
        .limit(load_options.take)
    )

    records = list(session.exec(statement).all())
    return records, total_count, summary, None
