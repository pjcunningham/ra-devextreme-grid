from datetime import date

import pytest
from pydantic import ValidationError

from app.grid.models import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    GridLoadOptions,
    GridRequest,
    GridResponse,
    GridSortDescriptor,
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
