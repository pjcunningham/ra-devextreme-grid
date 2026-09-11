from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

from app.grid.fields import GridField, GridQueryError
from app.grid.models import MAX_SUMMARY_ITEMS, GridSummaryDescriptor


def build_total_summary_expressions(
    descriptors: Sequence[GridSummaryDescriptor],
    fields: Mapping[str, GridField],
) -> list[ColumnElement[Any]]:
    """Validate and build positional aggregates without executing database queries."""
    if len(descriptors) > MAX_SUMMARY_ITEMS:
        raise GridQueryError(f"totalSummary supports at most {MAX_SUMMARY_ITEMS} items")
    expressions: list[ColumnElement[Any]] = []
    for descriptor in descriptors:
        if not isinstance(descriptor, GridSummaryDescriptor):
            raise GridQueryError("Invalid totalSummary descriptor")
        try:
            # Revalidate: internal callers can bypass Pydantic construction.
            validated = GridSummaryDescriptor.model_validate(
                descriptor.model_dump(exclude_unset=True)
            )
        except ValidationError as error:
            raise GridQueryError("Invalid totalSummary descriptor") from error
        selector = validated.selector
        summary_type = validated.summary_type
        field = None
        if selector is not None:
            field = fields.get(selector)
            if field is None:
                raise GridQueryError(
                    f"Unknown or unsupported summary selector: {selector!r}"
                )
            if summary_type not in field.summary_types:
                raise GridQueryError(
                    f"Summary {summary_type!r} is not supported for field {selector!r}"
                )
        if summary_type == "count":
            expressions.append(func.count())
        else:
            if field is None:
                raise GridQueryError("A summary selector is required except for count")
            if summary_type == "sum":
                expressions.append(func.coalesce(func.sum(field.expression), 0))
            elif summary_type == "avg":
                expressions.append(func.avg(field.expression))
            elif summary_type == "min":
                expressions.append(func.min(field.expression))
            elif summary_type == "max":
                expressions.append(func.max(field.expression))
    return expressions
