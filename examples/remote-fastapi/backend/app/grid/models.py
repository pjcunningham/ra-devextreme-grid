from typing import Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from app.models import CustomerRead

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_SUMMARY_ITEMS = 32

GridSummaryType = Literal["count", "sum", "avg", "min", "max"]


class GridSortDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selector: str = Field(min_length=1)
    desc: bool


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


class GridResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data: list[CustomerRead]
    total_count: int | None = Field(default=None, alias="totalCount")
    summary: list[JsonValue] | None = None
