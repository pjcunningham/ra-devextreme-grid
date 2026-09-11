from datetime import date

from sqlmodel import Field, SQLModel


class CustomerBase(SQLModel):
    name: str = Field(index=True)
    company: str = Field(index=True)
    city: str = Field(index=True)
    country: str = Field(index=True)
    active: bool = Field(default=True, index=True)
    age: int | None = Field(default=None)
    joined_on: date


class Customer(CustomerBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class CustomerRead(CustomerBase):
    id: int
