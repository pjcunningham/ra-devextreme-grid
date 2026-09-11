from typing import Any

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator

from app.models import CustomerRead

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class GridSortDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selector: str = Field(min_length=1)
    desc: bool


class GridLoadOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    skip: int = Field(default=0, ge=0)
    take: int = Field(default=DEFAULT_PAGE_SIZE, gt=0, le=MAX_PAGE_SIZE)
    require_total_count: bool | None = Field(default=None, alias="requireTotalCount")
    sort: list[GridSortDescriptor] | None = None
    filter: list[JsonValue] | None = None

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
