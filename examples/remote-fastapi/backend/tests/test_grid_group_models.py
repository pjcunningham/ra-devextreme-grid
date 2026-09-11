from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.grid.models import (
    DEFAULT_PAGE_SIZE,
    MAX_GROUP_LEVELS,
    MAX_SUMMARY_ITEMS,
    GridGroupDescriptor,
    GridGroupItem,
    GridLoadOptions,
    GridRequest,
    GridResponse,
    GridSummaryDescriptor,
)


def group(selector="country", desc=False, expanded=False):
    return {"selector": selector, "desc": desc, "isExpanded": expanded}


@pytest.mark.parametrize(
    "expanded", [[False], [True], [True, False], [True, True, False], [True] * 4]
)
def test_expansion_and_defaults_preserved(expanded):
    groups = [group(expanded=value) for value in expanded]
    request = GridRequest.model_validate({"loadOptions": {"group": groups}})
    options = request.load_options
    assert [item.is_expanded for item in options.group] == expanded
    assert options.skip == 0
    assert options.take == DEFAULT_PAGE_SIZE
    assert not {"skip", "take"} & options.model_fields_set
    assert request.model_dump(by_alias=True, exclude_unset=True) == {
        "loadOptions": {"group": groups}
    }


@pytest.mark.parametrize(
    "expanded", [[False, False], [True, False, False], [False, True]]
)
def test_nonfinal_collapsed_group_rejected(expanded):
    with pytest.raises(ValidationError, match="non-final"):
        GridLoadOptions.model_validate(
            {"group": [group(expanded=value) for value in expanded]}
        )


@pytest.mark.parametrize("key", ["isExpanded", "is_expanded"])
def test_descriptor_aliases(key):
    descriptor = GridGroupDescriptor.model_validate(
        {"selector": "age", "desc": True, key: False}
    )
    assert descriptor.model_dump(by_alias=True) == group("age", True, False)


@pytest.mark.parametrize("key", ["selector", "desc", "isExpanded"])
def test_descriptor_fields_required(key):
    descriptor = group()
    del descriptor[key]
    with pytest.raises(ValidationError):
        GridGroupDescriptor.model_validate(descriptor)


@pytest.mark.parametrize("key", ["desc", "isExpanded"])
@pytest.mark.parametrize("value", [None, 0, 1, "false", "true", [], {}, b"true"])
def test_descriptor_booleans_strict(key, value):
    with pytest.raises(ValidationError):
        GridGroupDescriptor.model_validate({**group(), key: value})


@pytest.mark.parametrize(
    "selector", [None, "", " \t\n", 1, True, b"age", [], {}, lambda: "age"]
)
def test_descriptor_selector_strict(selector):
    with pytest.raises(ValidationError):
        GridGroupDescriptor.model_validate(group(selector))


@pytest.mark.parametrize(
    "extra",
    [
        "groupInterval",
        "interval",
        "calculateGroupValue",
        "count",
        "extra",
        "is_expanded",
    ],
)
def test_descriptor_extras_forbidden(extra):
    with pytest.raises(ValidationError):
        GridGroupDescriptor.model_validate({**group(), extra: False})


@pytest.mark.parametrize(
    "groups", ["country", {}, (), (group(),), ["country"], [None], [lambda: "country"]]
)
def test_group_collection_strict(groups):
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"group": groups})


def test_depth_limit():
    assert MAX_GROUP_LEVELS == 4
    GridLoadOptions.model_validate({"group": [group(expanded=True)] * 4})
    with pytest.raises(ValidationError, match="at most 4"):
        GridLoadOptions.model_validate({"group": [group(expanded=True)] * 5})


@pytest.mark.parametrize("key", ["skip", "take"])
@pytest.mark.parametrize("value", [None, 0, 1, 20, 100])
def test_grouped_explicit_paging_rejected(key, value):
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"group": [group()], key: value})


@pytest.mark.parametrize("groups", [None, []])
@pytest.mark.parametrize(
    "extra",
    [
        {},
        {"groupSummary": []},
        {"groupSummary": None},
        {"requireGroupCount": False},
        {"requireGroupCount": None},
    ],
)
def test_inactive_groups_keep_flat_paging(groups, extra):
    options = GridLoadOptions.model_validate(
        {"group": groups, "skip": 2, "take": 3, **extra}
    )
    assert options.group == groups
    assert (options.skip, options.take) == (2, 3)


@pytest.mark.parametrize("groups", [None, []])
@pytest.mark.parametrize(
    "extra", [{"groupSummary": [{"summaryType": "count"}]}, {"requireGroupCount": True}]
)
def test_group_relations_require_active_groups(groups, extra):
    with pytest.raises(ValidationError, match="requires group"):
        GridLoadOptions.model_validate({"group": groups, **extra})


@pytest.mark.parametrize("value", [0, 1, "true", "false", [], {}])
@pytest.mark.parametrize("key", ["requireGroupCount", "require_group_count"])
def test_require_group_count_strict(key, value):
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"group": [group()], key: value})


@pytest.mark.parametrize("key", ["groupSummary", "group_summary"])
def test_group_summary_reuses_descriptor_and_bound(key):
    summaries = [
        {"selector": "age", "summaryType": kind}
        for kind in ["max", "count", "sum", "avg"]
    ] * 8
    options = GridLoadOptions.model_validate(
        {
            "group": [group()],
            key: summaries,
            "totalSummary": summaries,
            "require_group_count": True,
        }
    )
    assert len(options.group_summary) == MAX_SUMMARY_ITEMS == 32
    assert all(
        isinstance(item, GridSummaryDescriptor) for item in options.group_summary
    )
    assert options.model_dump(by_alias=True, exclude_unset=True) == {
        "group": [group()],
        "groupSummary": summaries,
        "totalSummary": summaries,
        "requireGroupCount": True,
    }
    with pytest.raises(ValidationError, match="at most 32"):
        GridLoadOptions.model_validate(
            {"group": [group()], key: [*summaries, summaries[0]]}
        )


@pytest.mark.parametrize(
    "value",
    [
        (),
        {},
        "[]",
        [{"summaryType": "custom"}],
        [{"summaryType": "sum"}],
        [{"summaryType": "count", "extra": True}],
    ],
)
def test_group_summary_grammar(value):
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"group": [group()], "groupSummary": value})


@pytest.mark.parametrize("key", [None, True, False, 0, -3, 2.5, "UK", "2024-01-01"])
def test_group_item_strict_scalar_preserves_types(key):
    item = GridGroupItem(key=key, items=[], summary=[key])
    assert type(item.key) is type(key)
    assert type(item.summary[0]) is type(key)
    assert item.model_dump(mode="json", exclude_unset=True) == {
        "key": key,
        "items": [],
        "summary": [key],
    }


@pytest.mark.parametrize(
    "value",
    [
        [],
        {},
        object(),
        date(2024, 1, 1),
        Decimal("1.1"),
        b"UK",
        float("nan"),
        float("inf"),
        float("-inf"),
    ],
)
@pytest.mark.parametrize("field", ["key", "summary"])
def test_group_item_rejects_nonscalar_and_nonfinite(field, value):
    with pytest.raises(ValidationError):
        GridGroupItem.model_validate(
            {"key": "UK", "items": [], field: [value] if field == "summary" else value}
        )


@pytest.mark.parametrize(
    "items", [None, (), {}, "[]", [None], [1], [{"key": "UK", "items": None}]]
)
def test_group_item_items_nonnull_array(items):
    with pytest.raises(ValidationError):
        GridGroupItem(key="UK", items=items)


def test_recursive_response_aliases_and_optional_omission():
    customer = {
        "id": 1,
        "name": "Alice",
        "company": "Acme",
        "city": "London",
        "country": "UK",
        "active": True,
        "age": None,
        "joined_on": "2024-01-01",
    }
    data = [
        {
            "key": "UK",
            "items": [{"key": True, "items": [customer], "summary": [1, None]}],
        }
    ]
    response = GridResponse.model_validate({"data": data, "groupCount": 1})
    assert response.model_dump(mode="json", by_alias=True, exclude_unset=True) == {
        "data": data,
        "groupCount": 1,
    }
    assert GridResponse(data=[]).model_dump(exclude_unset=True) == {"data": []}


@pytest.mark.parametrize("count", [-1, 1.5, True, "1"])
def test_group_count_response_strict(count):
    with pytest.raises(ValidationError):
        GridResponse(data=[], groupCount=count)
