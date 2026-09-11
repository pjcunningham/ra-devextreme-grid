from datetime import date

from pydantic import JsonValue, ValidationError
from sqlalchemy import and_
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
from app.grid.paging import build_paging_scope
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
        load_options.group_paging_context is not None
        or "group_paging_context" in load_options.model_fields_set
        or load_options.sort
        or load_options.group
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
    if load_options.group_paging_context is not None:
        return execute_customer_group_page(session, load_options)
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


def execute_customer_group_page(
    session: Session, load_options: GridLoadOptions
) -> tuple[
    list[Customer] | list[GridGroupItem], int | None, list[JsonValue] | None, int | None
]:
    scope_clause = build_paging_scope(load_options, CUSTOMER_GRID_FIELDS)
    user_clause = compile_filter_expression(
        load_options.group_paging_context.filter, CUSTOMER_GRID_FIELDS
    )
    clauses = [clause for clause in (user_clause, scope_clause) if clause is not None]
    filter_clause = and_(*clauses) if clauses else None
    keys, group_order = build_group_expressions(
        load_options.group or [], CUSTOMER_GRID_FIELDS
    )
    summaries = build_total_summary_expressions(
        load_options.total_summary or [], CUSTOMER_GRID_FIELDS
    )
    group_summaries = build_total_summary_expressions(
        load_options.group_summary or [], CUSTOMER_GRID_FIELDS
    )
    record_order = []
    ordered_selectors = set()
    for descriptor in load_options.sort or []:
        column = get_customer_sort_column(descriptor.selector)
        if descriptor.selector not in ordered_selectors:
            record_order.append(column.desc() if descriptor.desc else column.asc())
            ordered_selectors.add(descriptor.selector)
    if "id" not in ordered_selectors:
        record_order.append(Customer.id.asc())

    def scoped(statement):
        return (
            statement.where(filter_clause) if filter_clause is not None else statement
        )

    # Every descriptor and both filters are validated before the first SQL execution.
    total_count = None
    if load_options.require_total_count is True:
        total_count = session.exec(
            scoped(select(func.count()).select_from(Customer))
        ).one()
    summary = None
    if summaries:
        statement = sqlalchemy_select(*summaries).select_from(Customer)
        if user_clause is not None:
            statement = statement.where(user_clause)
        summary = list(session.execute(statement).one())
    group_count = None
    if keys:
        grouped = scoped(sqlalchemy_select(keys[0]).select_from(Customer)).group_by(
            keys[0]
        )
        if load_options.require_group_count is True:
            group_count = session.exec(
                select(func.count()).select_from(grouped.subquery())
            ).one()
        statement = (
            scoped(
                sqlalchemy_select(keys[0], func.count(), *group_summaries).select_from(
                    Customer
                )
            )
            .group_by(keys[0])
            .order_by(*group_order)
            .offset(load_options.skip)
            .limit(load_options.take)
        )
        data = []
        for row in session.execute(statement):
            key = row[0].isoformat() if isinstance(row[0], date) else row[0]
            node = GridGroupItem(key=key, items=None, count=row[1])
            if group_summaries:
                node.summary = list(row[2:])
            data.append(node)
        return data, total_count, summary, group_count
    statement = (
        scoped(select(Customer))
        .order_by(*record_order)
        .offset(load_options.skip)
        .limit(load_options.take)
    )
    return list(session.exec(statement).all()), total_count, summary, None
