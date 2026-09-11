from __future__ import annotations

from typing import Annotated, Any, Literal, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    JsonValue,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

from app.models import CustomerRead

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_SUMMARY_ITEMS = 32
MAX_GROUP_LEVELS = 4

GridSummaryType = Literal["count", "sum", "avg", "min", "max"]


def validate_group_scalar(value: Any) -> Any:
    if value is not None and type(value) not in (str, bool, int, float):
        raise ValueError("Group keys and summaries must be JSON scalars")
    return value


GridGroupScalar = Annotated[
    StrictStr
    | StrictBool
    | StrictInt
    | Annotated[StrictFloat, Field(allow_inf_nan=False)]
    | None,
    BeforeValidator(validate_group_scalar),
]


class GridSortDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selector: str = Field(min_length=1)
    desc: bool


class GridGroupDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)

    selector: str = Field(min_length=1)
    desc: bool
    is_expanded: bool = Field(alias="isExpanded")

    @field_validator("selector")
    @classmethod
    def validate_selector(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("selector must be a nonblank string")
        return value


class GridSummaryDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)

    selector: str | None = None
    summary_type: GridSummaryType = Field(alias="summaryType")

    @field_validator("selector", mode="before")
    @classmethod
    def validate_supplied_selector(cls, value: Any) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("selector must be a nonblank string")
        return value

    @model_validator(mode="after")
    def require_selector_for_non_count(self) -> Self:
        if self.summary_type != "count" and "selector" not in self.model_fields_set:
            raise ValueError("selector is required for non-count summaries")
        return self


class GridLoadOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    skip: int = Field(default=0, ge=0)
    take: int = Field(default=DEFAULT_PAGE_SIZE, gt=0, le=MAX_PAGE_SIZE)
    require_total_count: bool | None = Field(default=None, alias="requireTotalCount")
    sort: list[GridSortDescriptor] | None = None
    filter: list[JsonValue] | None = None
    total_summary: list[GridSummaryDescriptor] | None = Field(
        default=None, alias="totalSummary", max_length=MAX_SUMMARY_ITEMS, strict=True
    )
    group: list[GridGroupDescriptor] | None = Field(
        default=None, max_length=MAX_GROUP_LEVELS, strict=True
    )
    group_summary: list[GridSummaryDescriptor] | None = Field(
        default=None, alias="groupSummary", max_length=MAX_SUMMARY_ITEMS, strict=True
    )
    require_group_count: StrictBool | None = Field(
        default=None, alias="requireGroupCount"
    )

    @model_validator(mode="after")
    def validate_group_relations(self) -> Self:
        if self.group:
            if {"skip", "take"} & self.model_fields_set:
                raise ValueError(
                    "Grouped requests do not support explicit skip or take"
                )
            if any(not descriptor.is_expanded for descriptor in self.group[:-1]):
                raise ValueError("Every non-final group must have isExpanded true")
        else:
            if self.group_summary:
                raise ValueError("groupSummary requires group")
            if self.require_group_count is True:
                raise ValueError("requireGroupCount true requires group")
        return self

    @field_validator("skip", mode="before")
    @classmethod
    def set_skip_default(cls, v: Any) -> Any:
        if v is None:
            return 0
        return v

    @field_validator("take", mode="before")
    @classmethod
    def set_take_default(cls, v: Any) -> Any:
        if v is None:
            return DEFAULT_PAGE_SIZE
        return v


class GridRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    load_options: GridLoadOptions = Field(alias="loadOptions")


class GridGroupItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    key: GridGroupScalar
    items: list[CustomerRead | GridGroupItem]
    summary: list[GridGroupScalar] | None = None


class GridResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data: list[CustomerRead] | list[GridGroupItem]
    total_count: int | None = Field(default=None, alias="totalCount")
    summary: list[JsonValue] | None = None
    group_count: StrictInt | None = Field(default=None, alias="groupCount", ge=0)
