from datetime import date
from typing import get_args

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.grid.models import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    MAX_SUMMARY_ITEMS,
    GridLoadOptions,
    GridRequest,
    GridResponse,
    GridSortDescriptor,
    GridSummaryDescriptor,
    GridSummaryType,
)
from app.models import CustomerRead


def test_grid_request_camel_case_parsing():
    raw_payload = {
        "loadOptions": {
            "skip": 10,
            "take": 25,
            "requireTotalCount": True,
            "sort": [
                {"selector": "company", "desc": True},
                {"selector": "city", "desc": False},
            ],
            "filter": ["country", "=", "USA"],
        }
    }
    request = GridRequest.model_validate(raw_payload)
    assert request.load_options.skip == 10
    assert request.load_options.take == 25
    assert request.load_options.require_total_count is True
    assert request.load_options.sort is not None
    assert len(request.load_options.sort) == 2
    assert request.load_options.sort[0].selector == "company"
    assert request.load_options.sort[0].desc is True
    assert request.load_options.filter == ["country", "=", "USA"]


def test_grid_load_options_defaults():
    opts = GridLoadOptions.model_validate({})
    assert opts.skip == 0
    assert opts.take == DEFAULT_PAGE_SIZE
    assert opts.require_total_count is None
    assert opts.sort is None
    assert opts.filter is None
    assert opts.total_summary is None


def test_grid_load_options_none_coercion():
    opts = GridLoadOptions.model_validate({"skip": None, "take": None})
    assert opts.skip == 0
    assert opts.take == DEFAULT_PAGE_SIZE


def test_grid_load_options_invalid_skip():
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"skip": -1})


def test_grid_load_options_invalid_take():
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"take": 0})

    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"take": -5})

    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"take": MAX_PAGE_SIZE + 1})


def test_grid_request_forbids_unknown_fields():
    with pytest.raises(ValidationError):
        GridRequest.model_validate({"loadOptions": {}, "unknownField": "bad"})

    with pytest.raises(ValidationError):
        GridRequest.model_validate(
            {"loadOptions": {"group": [{"selector": "country"}]}}
        )

    with pytest.raises(ValidationError):
        GridSortDescriptor.model_validate(
            {"selector": "name", "desc": False, "extra": "invalid"}
        )


def test_grid_sort_descriptor_validation():
    with pytest.raises(ValidationError):
        GridSortDescriptor.model_validate({"selector": "", "desc": False})

    descriptor = GridSortDescriptor.model_validate({"selector": "name", "desc": True})
    assert descriptor.selector == "name"
    assert descriptor.desc is True


def test_grid_load_options_filter_types():
    # null filter
    opts_null = GridLoadOptions.model_validate({"filter": None})
    assert opts_null.filter is None

    # empty list filter
    opts_empty = GridLoadOptions.model_validate({"filter": []})
    assert opts_empty.filter == []

    # nested filter
    nested = [["country", "=", "USA"], "and", ["age", ">", 30]]
    opts_nested = GridLoadOptions.model_validate({"filter": nested})
    assert opts_nested.filter == nested


def test_grid_response_model():
    customer = CustomerRead(
        id=1,
        name="Alice Smith",
        company="Acme Corp",
        city="New York",
        country="USA",
        active=True,
        age=None,
        joined_on=date(2021, 1, 1),
    )

    # With total count
    resp_with_count = GridResponse(data=[customer], total_count=100)
    dump_with_count = resp_with_count.model_dump(by_alias=True, exclude_unset=True)
    assert dump_with_count["totalCount"] == 100
    assert len(dump_with_count["data"]) == 1
    assert dump_with_count["data"][0]["age"] is None

    # Without total count (omitted)
    resp_no_count = GridResponse(data=[customer])
    dump_no_count = resp_no_count.model_dump(by_alias=True, exclude_unset=True)
    assert "totalCount" not in dump_no_count
    assert len(dump_no_count["data"]) == 1
    assert resp_no_count.summary is None
    assert "summary" not in dump_no_count
    assert dump_no_count["data"][0]["age"] is None


SUMMARY_TYPES = ("count", "sum", "avg", "min", "max")


def test_grid_summary_type_literals():
    assert set(get_args(GridSummaryType)) == set(SUMMARY_TYPES)


@pytest.mark.parametrize("summary_type", SUMMARY_TYPES)
@pytest.mark.parametrize("key", ["summaryType", "summary_type"])
def test_grid_summary_descriptor_aliases(summary_type, key):
    descriptor = GridSummaryDescriptor.model_validate(
        {"selector": "age", key: summary_type}
    )
    assert descriptor.selector == "age"
    assert descriptor.summary_type == summary_type
    assert descriptor.model_dump(by_alias=True) == {
        "selector": "age",
        "summaryType": summary_type,
    }


def test_grid_summary_count_can_omit_selector():
    descriptor = GridSummaryDescriptor.model_validate({"summaryType": "count"})
    assert descriptor.selector is None
    assert descriptor.model_fields_set == {"summary_type"}
    assert descriptor.model_dump(by_alias=True, exclude_unset=True) == {
        "summaryType": "count"
    }


@pytest.mark.parametrize("summary_type", SUMMARY_TYPES[1:])
def test_grid_summary_non_count_requires_selector(summary_type):
    with pytest.raises(ValidationError):
        GridSummaryDescriptor.model_validate({"summaryType": summary_type})


@pytest.mark.parametrize("summary_type", SUMMARY_TYPES)
@pytest.mark.parametrize("selector", [None, "", " \t\n", 1, 1.5, True, b"age", [], {}])
def test_grid_summary_rejects_invalid_supplied_selector(summary_type, selector):
    with pytest.raises(ValidationError):
        GridSummaryDescriptor.model_validate(
            {"selector": selector, "summaryType": summary_type}
        )


def test_grid_summary_preserves_nonblank_selector():
    descriptor = GridSummaryDescriptor(selector=" age ", summary_type="sum")
    assert descriptor.selector == " age "


@pytest.mark.parametrize("summary_type", [None, "", "SUM", "average", 1, True, b"sum"])
def test_grid_summary_rejects_invalid_type(summary_type):
    with pytest.raises(ValidationError):
        GridSummaryDescriptor.model_validate(
            {"selector": "age", "summaryType": summary_type}
        )


@pytest.mark.parametrize(
    "descriptor",
    [
        {},
        {"selector": "age"},
        {"summaryType": "count", "extra": True},
        {"summaryType": "count", "desc": False},
        {"summaryType": "count", "summary_type": "sum"},
        None,
        "count",
        1,
        [],
        ["age", "sum"],
    ],
)
def test_grid_load_options_rejects_malformed_summary_descriptor(descriptor):
    with pytest.raises(ValidationError):
        GridLoadOptions.model_validate({"totalSummary": [descriptor]})


@pytest.mark.parametrize("key", ["totalSummary", "total_summary"])
def test_grid_load_options_summary_aliases(key):
    summaries = [{"summaryType": "count"}, {"selector": "age", "summaryType": "avg"}]
    request = GridRequest.model_validate({"loadOptions": {key: summaries}})
    assert request.load_options.total_summary == [
        GridSummaryDescriptor(summary_type="count"),
        GridSummaryDescriptor(selector="age", summary_type="avg"),
    ]
    assert request.model_dump(by_alias=True, exclude_unset=True) == {
        "loadOptions": {"totalSummary": summaries}
    }


@pytest.mark.parametrize("value", [None, []])
def test_grid_load_options_optional_summary(value):
    options = GridLoadOptions.model_validate({"totalSummary": value})
    assert options.total_summary == value


@pytest.mark.parametrize(
    "value",
    [{"summaryType": "count"}, (), ({"summaryType": "count"},), "[]", 1, True],
)
def test_grid_load_options_summary_requires_list(value):
    with pytest.raises(ValidationError) as exc_info:
        GridLoadOptions.model_validate({"totalSummary": value})
    assert exc_info.value.errors()[0]["type"] == "list_type"


def test_grid_load_options_summary_json_array():
    request = GridRequest.model_validate_json(
        '{"loadOptions":{"totalSummary":[{"summaryType":"count"}]}}'
    )
    assert request.load_options.total_summary == [
        GridSummaryDescriptor(summary_type="count")
    ]


def test_grid_load_options_summary_bound_preserves_duplicates_and_order():
    assert MAX_SUMMARY_ITEMS == 32
    summaries = [
        {"selector": "age", "summaryType": SUMMARY_TYPES[index % len(SUMMARY_TYPES)]}
        for index in range(MAX_SUMMARY_ITEMS)
    ]
    options = GridLoadOptions.model_validate({"totalSummary": summaries})
    assert options.model_dump(by_alias=True, exclude_unset=True) == {
        "totalSummary": summaries
    }
    with pytest.raises(ValidationError) as exc_info:
        GridLoadOptions.model_validate({"totalSummary": [*summaries, summaries[0]]})
    error = exc_info.value.errors()[0]
    assert error["type"] == "too_long"
    assert error["ctx"]["max_length"] == 32


@pytest.mark.parametrize("summary", [None, [], [0, 3.5, "2024-01-01", True, None]])
def test_grid_response_explicit_summary_retains_nulls(summary):
    response = GridResponse(data=[], total_count=None, summary=summary)
    assert response.model_dump(by_alias=True, exclude_unset=True) == {
        "data": [],
        "totalCount": None,
        "summary": summary,
    }


def test_grid_response_summary_accepts_nested_json():
    summary = [{"values": [1, None]}, [True, "value"]]
    response = GridResponse(data=[], summary=summary)
    assert response.model_dump(mode="json", exclude_unset=True) == {
        "data": [],
        "summary": summary,
    }


@pytest.mark.parametrize("summary", [[object()], [date(2024, 1, 1)], {"sum": 1}, "[]"])
def test_grid_response_summary_rejects_non_json_values(summary):
    with pytest.raises(ValidationError):
        GridResponse(data=[], summary=summary)


def test_grid_summary_openapi_schemas():
    app = FastAPI()

    @app.post("/grid", response_model=GridResponse)
    def load_grid(payload: GridRequest):
        return GridResponse(data=[])

    schemas = app.openapi()["components"]["schemas"]
    descriptor = schemas["GridSummaryDescriptor"]
    assert descriptor["additionalProperties"] is False
    assert descriptor["required"] == ["summaryType"]
    assert set(descriptor["properties"]["summaryType"]["enum"]) == set(SUMMARY_TYPES)
    options = schemas["GridLoadOptions"]
    assert "totalSummary" not in options.get("required", [])
    total_summary = options["properties"]["totalSummary"]
    array = next(item for item in total_summary["anyOf"] if item["type"] == "array")
    assert array["maxItems"] == MAX_SUMMARY_ITEMS
    assert array["items"]["$ref"].endswith("/GridSummaryDescriptor")
    assert {"type": "null"} in total_summary["anyOf"]
    response = schemas["GridResponse"]
    assert "summary" not in response["required"]
    assert {"type": "null"} in response["properties"]["summary"]["anyOf"]
    assert any(
        item.get("type") == "array"
        for item in response["properties"]["summary"]["anyOf"]
    )
