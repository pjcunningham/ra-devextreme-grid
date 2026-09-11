from collections.abc import Iterable, Mapping, Sequence
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

from app.grid.fields import GridField, GridQueryError, GridValueType
from app.grid.models import GridGroupDescriptor, GridGroupItem, GridGroupScalar
from app.models import CustomerRead


def build_group_expressions(
    descriptors: Sequence[GridGroupDescriptor], fields: Mapping[str, GridField]
) -> tuple[list[ColumnElement[Any]], list[ColumnElement[Any]]]:
    """Resolve exact group identities and deterministic ordering without execution."""
    keys = []
    order = []
    ordered_selectors = set()
    for descriptor in descriptors:
        field = fields.get(descriptor.selector)
        if field is None:
            raise GridQueryError(
                f"Unknown or unsupported group selector: {descriptor.selector!r}"
            )
        if not field.groupable:
            raise GridQueryError(
                f"Grouping is not supported for field {descriptor.selector!r}"
            )
        is_string = field.value_type is GridValueType.STRING
        key = field.expression.collate("BINARY") if is_string else field.expression
        keys.append(key)
        if descriptor.selector in ordered_selectors:
            continue
        ordered_selectors.add(descriptor.selector)
        primary = func.lower(key) if is_string else key
        order.append(
            primary.desc().nulls_last()
            if descriptor.desc
            else primary.asc().nulls_first()
        )
        if is_string:
            # Unlike native encounter-order ties, case-equal keys always use BINARY ASC.
            order.append(key.asc())
    return keys, order


def assemble_group_tree(
    rows: Iterable[Sequence[Any]],
    depth: int,
    summaries: Mapping[tuple[Any, ...], list[GridGroupScalar]] | None,
) -> list[GridGroupItem]:
    """Assemble the SQL-ordered stream; aggregates arrive from SQL by full path."""
    roots: list[GridGroupItem] = []
    nodes: dict[tuple[Any, ...], GridGroupItem] = {}
    for row in rows:
        path = tuple(row[1:])
        for level in range(1, depth + 1):
            prefix = path[:level]
            if prefix not in nodes:
                key = prefix[-1]
                if isinstance(key, date):
                    key = key.isoformat()
                node = GridGroupItem(key=key, items=[])
                if summaries is not None:
                    node.summary = summaries[prefix]
                nodes[prefix] = node
                if level == 1:
                    roots.append(node)
                else:
                    nodes[prefix[:-1]].items.append(node)
        nodes[path].items.append(CustomerRead.model_validate(row[0]))
    return roots
