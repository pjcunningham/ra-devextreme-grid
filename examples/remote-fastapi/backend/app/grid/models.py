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
    ValidationInfo,
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


class GridPagingSortDescriptor(GridSortDescriptor):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)

    is_expanded: StrictBool = Field(alias="isExpanded")


class GridGroupPagingContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    group: list[GridGroupDescriptor] = Field(min_length=1, max_length=MAX_GROUP_LEVELS)
    filter: list[JsonValue] | None

    @model_validator(mode="after")
    def validate_groups(self) -> Self:
        if any(descriptor.is_expanded for descriptor in self.group):
            raise ValueError("groupPagingContext groups must have isExpanded false")
        if len({descriptor.selector for descriptor in self.group}) != len(self.group):
            raise ValueError("groupPagingContext selectors must be unique")
        return self


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
    sort: list[GridSortDescriptor | GridPagingSortDescriptor] | None = None
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
    group_paging_context: GridGroupPagingContext | None = Field(
        default=None, alias="groupPagingContext"
    )

    @model_validator(mode="before")
    @classmethod
    def validate_paging_types(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        context_keys = {"groupPagingContext", "group_paging_context"} & value.keys()
        if not context_keys:
            return value
        if any(value[key] is None for key in context_keys):
            raise ValueError("groupPagingContext must be an object when supplied")
        for key in ("skip", "take"):
            if key in value and type(value[key]) is not int:
                raise ValueError(f"{key} must be a strict integer in group paging mode")
        for key in (
            "requireTotalCount",
            "require_total_count",
            "requireGroupCount",
            "require_group_count",
        ):
            if key in value and type(value[key]) is not bool:
                raise ValueError(f"{key} must be a strict boolean in group paging mode")
        sorts = value.get("sort")
        if sorts is not None:
            if type(sorts) is not list:
                raise ValueError("sort must be an array")
            for descriptor in sorts:
                if isinstance(descriptor, BaseModel):
                    descriptor = descriptor.model_dump(exclude_unset=True)
                if (
                    not isinstance(descriptor, dict)
                    or type(descriptor.get("desc")) is not bool
                    or type(descriptor.get("selector")) is not str
                    or not descriptor["selector"].strip()
                ):
                    raise ValueError("Invalid group paging sort descriptor")
        return value

    @model_validator(mode="after")
    def validate_group_relations(self) -> Self:
        if self.group_paging_context is not None:
            if "take" not in self.model_fields_set:
                object.__setattr__(self, "take", MAX_PAGE_SIZE)
            if self.group is not None and (
                len(self.group) != 1 or self.group[0].is_expanded
            ):
                raise ValueError("Group paging requires one collapsed current group")
            if not self.group and self.require_group_count is True:
                raise ValueError("requireGroupCount true requires group")
            configured = {
                descriptor.selector: descriptor
                for descriptor in self.group_paging_context.group
            }
            for descriptor in self.sort or []:
                if isinstance(descriptor, GridPagingSortDescriptor):
                    parent = configured.get(descriptor.selector)
                    if (
                        descriptor.is_expanded
                        or parent is None
                        or descriptor.desc != parent.desc
                    ):
                        raise ValueError("Invalid native parent group sort")
            return self
        if any(isinstance(item, GridPagingSortDescriptor) for item in self.sort or []):
            raise ValueError("Sort isExpanded requires groupPagingContext")
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
    model_config = ConfigDict(
        extra="forbid", strict=True, revalidate_instances="always"
    )

    key: GridGroupScalar
    items: list[CustomerRead | GridGroupItem] | None
    count: StrictInt | None = Field(default=None, ge=0)
    summary: list[GridGroupScalar] | None = None

    @model_validator(mode="after")
    def validate_items(self) -> Self:
        if "count" in self.model_fields_set and self.count is None:
            raise ValueError("count must be a nonnegative integer when supplied")
        if self.items is None and self.count is None:
            raise ValueError("Collapsed items:null requires count")
        if self.items and any(
            isinstance(item, GridGroupItem) != isinstance(self.items[0], GridGroupItem)
            for item in self.items
        ):
            raise ValueError("Group items must be homogeneous")
        return self


class GridResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data: list[CustomerRead] | list[GridGroupItem]
    total_count: int | None = Field(default=None, alias="totalCount")
    summary: list[JsonValue] | None = None
    group_count: StrictInt | None = Field(default=None, alias="groupCount", ge=0)

    @model_validator(mode="after")
    def validate_request_shape(self, info: ValidationInfo) -> Self:
        options = (info.context or {}).get("load_options")
        if options is None:
            return self
        lazy = options.group_paging_context is not None
        depth = len(options.group or [])
        if lazy and options.group:
            configured = options.group_paging_context.group
            depth = len(configured) - next(
                index
                for index, descriptor in enumerate(configured)
                if descriptor.selector == options.group[0].selector
            )

        def validate_level(items: list, remaining: int) -> None:
            for item in items:
                if not remaining:
                    if isinstance(item, GridGroupItem):
                        raise ValueError("Expected records at leaf depth")
                elif not isinstance(item, GridGroupItem):
                    raise ValueError("Expected groups at configured depth")
                elif item.items is None:
                    if not lazy:
                        raise ValueError("Complete-tree responses require items arrays")
                else:
                    validate_level(item.items, remaining - 1)

        validate_level(self.data, depth)
        return self
